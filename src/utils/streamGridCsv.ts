/**
 * 대용량 grid CSV 를 메모리에 통째로 올리지 않고 스트리밍으로 파싱한다.
 *
 * 지원 레이아웃:
 * - matrix   : 각 행이 x 방향 격자 (기본)
 * - columnar : A열에 값이 세로로 나열 (y*width+x 순서로 reshape)
 */

import { throwIfAborted } from '@/utils/csvParseAbort';
import { readUploadFilePrefix, uploadFileByteStream } from '@/utils/readUploadFile';
import {
  firstColumnToken,
  isColumnarDataRow,
  isMatrixDataRow,
  isNumericDataRow,
  normalizeRowTokens,
  tokenizeGridLine,
} from '@/utils/gridCsvTokens';
import { yieldToMain } from '@/utils/yieldToMain';

/** 이 줄 수마다 메인 스레드를 양보한다. */
const YIELD_EVERY_LINES = 64;

export type GridCsvLayout = 'matrix' | 'columnar';

export interface GridCsvProgress {
  rowsParsed: number;
  totalRows: number;
  bytesRead: number;
  fileSize: number;
}

export interface GridCsvDimensions {
  width: number;
  height: number;
}

export interface GridCsvProbeResult {
  layout: GridCsvLayout;
  valueCount: number;
  matrixWidth: number;
  matrixHeight: number;
}

export interface StreamGridCsvOptions {
  onProgress?: (progress: GridCsvProgress) => void;
  signal?: AbortSignal;
  layout?: GridCsvLayout;
}

export interface ColumnarGridMeta {
  width?: number;
  height?: number;
}

function parseRow(tokens: string[], width: number, row: number, out: Float32Array): void {
  const normalized = normalizeRowTokens(tokens, row, width);
  for (let col = 0; col < width; col += 1) {
    const v = Number(normalized[col]);
    if (Number.isNaN(v)) {
      throw new Error(
        `parseGridCsv: row ${row} col ${col} 의 값이 숫자가 아닙니다: "${normalized[col]}"`,
      );
    }
    out[row * width + col] = v;
  }
}

export function isSkippableCsvLine(line: string): boolean {
  const trimmed = line.trim();
  return !trimmed || trimmed.startsWith('#');
}

function classifyTokens(tokens: string[]): 'skip' | 'columnar' | 'matrix' {
  if (isColumnarDataRow(tokens)) return 'columnar';
  if (isMatrixDataRow(tokens)) return 'matrix';
  if (isNumericDataRow(tokens)) return 'matrix';
  return 'skip';
}

function pushMatrixLine(
  rawLine: string,
  width: number,
  height: number,
  out: Float32Array | null,
  row: number,
  maxWidth: number,
): { row: number; width: number; maxWidth: number } {
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  if (isSkippableCsvLine(line)) {
    return { row, width, maxWidth };
  }
  if (row >= height && out !== null) {
    return { row, width, maxWidth };
  }

  const tokens = tokenizeGridLine(line);
  if (classifyTokens(tokens) === 'skip') {
    return { row, width, maxWidth };
  }

  const tokenWidth = normalizeRowTokens(tokens, row, Math.max(width, tokens.length)).length;
  const nextMaxWidth = Math.max(maxWidth, tokenWidth, tokens.length);
  const nextWidth = width > 0 ? width : nextMaxWidth;

  if (out !== null) {
    if (tokens.length > nextWidth + 1) {
      throw new Error(
        `parseGridCsv: row ${row} 의 열 수가 너무 많습니다. expected ${nextWidth}, got ${tokens.length}`,
      );
    }
    parseRow(tokens, nextWidth, row, out);
  }

  return { row: row + 1, width: nextWidth, maxWidth: nextMaxWidth };
}

function pushColumnarLine(
  rawLine: string,
  out: Float32Array | null,
  cellIndex: number,
  totalCells: number,
): number {
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  if (isSkippableCsvLine(line)) {
    return cellIndex;
  }

  const tokens = tokenizeGridLine(line);
  if (!isColumnarDataRow(tokens)) {
    return cellIndex;
  }

  const token = firstColumnToken(tokens);
  if (token === null) {
    return cellIndex;
  }

  if (out !== null) {
    if (cellIndex >= totalCells) {
      return cellIndex;
    }
    const v = Number(token);
    if (Number.isNaN(v)) {
      throw new Error(`parseGridCsv: 셀 ${cellIndex} 의 값이 숫자가 아닙니다: "${token}"`);
    }
    out[cellIndex] = v;
  }

  return cellIndex + 1;
}

async function consumeMatrixCsvStream(
  stream: ReadableStream<Uint8Array>,
  height: number,
  knownWidth: number,
  fileSize: number,
  options: StreamGridCsvOptions | undefined,
  out: Float32Array | null,
): Promise<{ width: number; height: number }> {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  const signal = options?.signal;
  let buffer = '';
  let row = 0;
  let width = knownWidth;
  let maxWidth = knownWidth;
  let bytesRead = 0;
  let linesSinceYield = 0;

  const onAbort = (): void => {
    void reader.cancel();
  };
  signal?.addEventListener('abort', onAbort);

  const report = (): void => {
    options?.onProgress?.({
      rowsParsed: row,
      totalRows: height > 0 ? height : row,
      bytesRead,
      fileSize,
    });
  };

  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      throwIfAborted(signal);
      if (done) break;
      bytesRead += value.length;
      buffer += value;

      let newlineIdx = buffer.indexOf('\n');
      while (newlineIdx !== -1) {
        throwIfAborted(signal);
        const rawLine = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        const next = pushMatrixLine(rawLine, width, height, out, row, maxWidth);
        width = next.width;
        maxWidth = next.maxWidth;
        row = next.row;
        newlineIdx = buffer.indexOf('\n');

        linesSinceYield += 1;
        if (linesSinceYield >= YIELD_EVERY_LINES) {
          linesSinceYield = 0;
          report();
          await yieldToMain();
        }
      }

      report();
      await yieldToMain();
    }

    throwIfAborted(signal);

    if (buffer.length > 0) {
      const next = pushMatrixLine(buffer, width, height, out, row, maxWidth);
      width = next.width;
      maxWidth = next.maxWidth;
      row = next.row;
    }

    if (out === null) {
      if (row === 0) {
        throw new Error('parseGridCsv: 유효한 데이터 행이 없습니다.');
      }
      report();
      return { width: Math.max(width, maxWidth), height: row };
    }

    if (row < height) {
      throw new Error(`parseGridCsv: 행 수가 부족합니다. expected ${height}, got ${row}`);
    }
    report();
    return { width, height };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

async function consumeColumnarCsvStream(
  stream: ReadableStream<Uint8Array>,
  totalCells: number,
  fileSize: number,
  options: StreamGridCsvOptions | undefined,
  out: Float32Array | null,
): Promise<number> {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  const signal = options?.signal;
  let buffer = '';
  let cellIndex = 0;
  let bytesRead = 0;
  let linesSinceYield = 0;

  const onAbort = (): void => {
    void reader.cancel();
  };
  signal?.addEventListener('abort', onAbort);

  const report = (): void => {
    options?.onProgress?.({
      rowsParsed: cellIndex,
      totalRows: totalCells > 0 ? totalCells : cellIndex,
      bytesRead,
      fileSize,
    });
  };

  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      throwIfAborted(signal);
      if (done) break;
      bytesRead += value.length;
      buffer += value;

      let newlineIdx = buffer.indexOf('\n');
      while (newlineIdx !== -1) {
        throwIfAborted(signal);
        const rawLine = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        cellIndex = pushColumnarLine(rawLine, out, cellIndex, totalCells);
        newlineIdx = buffer.indexOf('\n');

        linesSinceYield += 1;
        if (linesSinceYield >= YIELD_EVERY_LINES) {
          linesSinceYield = 0;
          report();
          await yieldToMain();
        }
      }

      report();
      await yieldToMain();
    }

    throwIfAborted(signal);

    if (buffer.length > 0) {
      cellIndex = pushColumnarLine(buffer, out, cellIndex, totalCells);
    }

    if (out === null) {
      if (cellIndex === 0) {
        throw new Error('parseGridCsv: 유효한 데이터 행이 없습니다.');
      }
      report();
      return cellIndex;
    }

    if (cellIndex < totalCells) {
      throw new Error(
        `parseGridCsv: A열 값 개수가 부족합니다. expected ${totalCells}, got ${cellIndex}`,
      );
    }
    report();
    return cellIndex;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

/** CSV 레이아웃과 값 개수를 분석한다. */
export async function probeGridCsv(
  file: File,
  options?: StreamGridCsvOptions,
): Promise<GridCsvProbeResult> {
  throwIfAborted(options?.signal);

  let columnarCount = 0;
  let matrixRowCount = 0;
  let matrixMaxWidth = 0;
  let matrixHeight = 0;

  const reader = uploadFileByteStream(file).pipeThrough(new TextDecoderStream()).getReader();
  const signal = options?.signal;
  let buffer = '';
  let bytesRead = 0;
  let linesSinceYield = 0;

  const onAbort = (): void => {
    void reader.cancel();
  };
  signal?.addEventListener('abort', onAbort);

  const report = (): void => {
    options?.onProgress?.({
      rowsParsed: columnarCount + matrixRowCount,
      totalRows: 0,
      bytesRead,
      fileSize: file.size,
    });
  };

  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      throwIfAborted(signal);
      if (done) break;
      bytesRead += value.length;
      buffer += value;

      let newlineIdx = buffer.indexOf('\n');
      while (newlineIdx !== -1) {
        const rawLine = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
        if (!isSkippableCsvLine(line)) {
          const kind = classifyTokens(tokenizeGridLine(line));
          if (kind === 'columnar') {
            columnarCount += 1;
          } else if (kind === 'matrix') {
            matrixRowCount += 1;
            matrixHeight += 1;
            const significant = tokenizeGridLine(line).filter((t) => t !== '');
            matrixMaxWidth = Math.max(matrixMaxWidth, significant.length);
          }
        }
        newlineIdx = buffer.indexOf('\n');

        linesSinceYield += 1;
        if (linesSinceYield >= YIELD_EVERY_LINES) {
          linesSinceYield = 0;
          report();
          await yieldToMain();
        }
      }

      report();
      await yieldToMain();
    }

    if (buffer.length > 0 && !isSkippableCsvLine(buffer)) {
      const kind = classifyTokens(tokenizeGridLine(buffer));
      if (kind === 'columnar') columnarCount += 1;
      else if (kind === 'matrix') {
        matrixRowCount += 1;
        matrixHeight += 1;
        const significant = tokenizeGridLine(buffer).filter((t) => t !== '');
        matrixMaxWidth = Math.max(matrixMaxWidth, significant.length);
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }

  const layout: GridCsvLayout =
    matrixRowCount > 0 && matrixMaxWidth > 1 ? 'matrix' : 'columnar';
  const valueCount = layout === 'columnar' ? columnarCount : matrixHeight * matrixMaxWidth;

  return {
    layout,
    valueCount: layout === 'columnar' ? columnarCount : matrixHeight * matrixMaxWidth,
    matrixWidth: matrixMaxWidth,
    matrixHeight,
  };
}

/** A열 단일 컬럼 CSV 의 width×height 를 결정한다. */
export function resolveColumnarGridSize(
  valueCount: number,
  meta: ColumnarGridMeta,
): GridCsvDimensions {
  if (meta.width !== undefined && meta.height !== undefined) {
    if (meta.width * meta.height !== valueCount) {
      throw new Error(
        `parseGridCsv: A열 값 ${valueCount}개와 meta 격자(${meta.width}×${meta.height}=${meta.width * meta.height})가 일치하지 않습니다.`,
      );
    }
    return { width: meta.width, height: meta.height };
  }

  if (meta.width !== undefined) {
    if (valueCount % meta.width !== 0) {
      throw new Error(
        `parseGridCsv: A열 값 ${valueCount}개를 meta.width=${meta.width} 로 나눌 수 없습니다.`,
      );
    }
    return { width: meta.width, height: valueCount / meta.width };
  }

  if (meta.height !== undefined) {
    if (valueCount % meta.height !== 0) {
      throw new Error(
        `parseGridCsv: A열 값 ${valueCount}개를 meta.height=${meta.height} 로 나눌 수 없습니다.`,
      );
    }
    return { width: valueCount / meta.height, height: meta.height };
  }

  const side = Math.sqrt(valueCount);
  if (Number.isInteger(side)) {
    return { width: side, height: side };
  }

  throw new Error(
    `parseGridCsv: A열 단일 컬럼 CSV(${valueCount}개 값)는 meta.json에 width·height가 필요합니다.`,
  );
}

/** 파일을 한 번 훑어 격자 크기(width × height)를 추정한다. (matrix 전용 하위 호환) */
export async function probeGridCsvDimensions(
  file: File,
  options?: StreamGridCsvOptions,
): Promise<GridCsvDimensions> {
  const probe = await probeGridCsv(file, options);
  if (probe.layout === 'columnar') {
    return resolveColumnarGridSize(probe.valueCount, {});
  }
  return { width: probe.matrixWidth, height: probe.matrixHeight };
}

export async function parseGridCsvFromFile(
  file: File,
  width: number,
  height: number,
  options?: StreamGridCsvOptions,
): Promise<Float32Array> {
  throwIfAborted(options?.signal);
  const out = new Float32Array(width * height);
  const layout = options?.layout ?? (await probeGridCsv(file, { signal: options?.signal })).layout;

  if (layout === 'columnar') {
    await consumeColumnarCsvStream(uploadFileByteStream(file), width * height, file.size, options, out);
    return out;
  }

  await consumeMatrixCsvStream(uploadFileByteStream(file), height, width, file.size, options, out);
  return out;
}
