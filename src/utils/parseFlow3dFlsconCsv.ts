import type { Flow3dGridMeta } from '@/data/buildSeriesFromFlow3dCsv';
import {
  FLOW3D_VARIABLE_DEFS,
  normalizeFlow3dVariableId,
} from '@/data/flow3dVariableDefs';
import { throwIfAborted } from '@/utils/csvParseAbort';
import { readUploadFilePrefix, uploadFileByteStream } from '@/utils/readUploadFile';
import { isColumnarDataRow, isMatrixDataRow, tokenizeGridLine } from '@/utils/gridCsvTokens';
import type { ParsedFlow3dVariable } from '@/utils/parseFlow3dVariableCsv';
import { isSkippableCsvLine } from '@/utils/streamGridCsv';
import { yieldToMain } from '@/utils/yieldToMain';

const YIELD_EVERY_LINES = 64;
const DETECT_PREFIX_BYTES = 64 * 1024;

const PRINTING_LINE_RE =
  /printing\s+(.+?)\s+t=([\d.eE+-]+)\s+ix=(\d+)\s+to\s+(\d+)\s+jy=(\d+)\s+to\s+(\d+)\s+kz=(\d+)\s+to\s+(\d+)/i;

const GRID_RANGE_RE =
  /\bt=([\d.eE+-]+)\s+ix=(\d+)\s+to\s+(\d+)\s+jy=(\d+)\s+to\s+(\d+)\s+kz=(\d+)\s+to\s+(\d+)/i;

export interface Flow3dFlsconCsvProgress {
  bytesRead: number;
  fileSize: number;
  valuesParsed: number;
  /** 예상 셀(행) 수 — ix×jy×kz. */
  totalCells?: number;
  /** valuesParsed 를 변수 열 수로 나눈 값. */
  rowsParsed?: number;
  currentVariable: string;
}

export interface ParseFlow3dFlsconCsvOptions {
  signal?: AbortSignal;
  onProgress?: (p: Flow3dFlsconCsvProgress) => void;
}

export interface Flow3dFlsconParseResult {
  variables: ParsedFlow3dVariable[];
  gridMeta: Flow3dGridMeta;
}

interface PrintingInfo {
  variableIds: string[];
  timestampSeconds: number;
  width: number;
  height: number;
  depth: number;
}

interface VariableBuilder {
  id: string;
  label: string;
  unit: string;
  values: Float32Array;
  writeIndex: number;
}

type ColumnarMode = 'none' | 'rotate' | 'section';

function stripBom(token: string): string {
  return token.replace(/^\ufeff/, '');
}

function startBuilder(id: string, capacity: number): VariableBuilder {
  const def = FLOW3D_VARIABLE_DEFS[id];
  return {
    id,
    label: def?.label ?? id,
    unit: def?.defaultUnit ?? '',
    values: new Float32Array(capacity),
    writeIndex: 0,
  };
}

/** Excel CSV 등에서 쪼개진 flscon 행을 한 줄 텍스트로 되돌린다. */
export function normalizeFlsconLine(rawLine: string): string {
  const trimmed = rawLine.trim();
  if (!trimmed) return '';

  const tokens = tokenizeGridLine(trimmed);
  if (trimmed.includes(',') && tokens.length >= 2 && tokens.length <= 8) {
    const joined = tokens.join(' ');
    if (/flscon|printing|mesh\s*block|flow-3d/i.test(joined)) {
      return joined.replace(/\s+/g, ' ').trim();
    }
  }

  return trimmed;
}

/** 텍스트 샘플이 FLOW-3D flscon 출력인지 판별한다. */
export function detectFlow3dFlsconCsv(sample: string): boolean {
  const lines = sample.split(/\r?\n/).slice(0, 120);
  for (const raw of lines) {
    const line = normalizeFlsconLine(raw);
    if (!line) continue;
    if (/flscon\s*:/i.test(line)) return true;
    const normalized = line.replace(/\s+/g, ' ');
    if (PRINTING_LINE_RE.test(normalized)) return true;
    if (GRID_RANGE_RE.test(normalized)) return true;
  }
  return false;
}

async function readTextPrefix(file: File, maxBytes: number): Promise<string> {
  return readUploadFilePrefix(file, maxBytes);
}

/** 첫 수 KB 를 읽어 FLOW-3D flscon CSV 인지 판별한다. */
export async function isFlow3dFlsconCsv(file: File): Promise<boolean> {
  const sample = await readTextPrefix(file, DETECT_PREFIX_BYTES);
  return detectFlow3dFlsconCsv(sample);
}

function parsePrintingVariables(raw: string): string[] {
  const tokens = raw.trim().split(/\s+/);
  const ids: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.toLowerCase() === 'and' && i + 1 < tokens.length) {
      const nextId = normalizeFlow3dVariableId(tokens[i + 1]);
      if (nextId) {
        ids.push(nextId);
        i += 1;
        continue;
      }
    }
    const id = normalizeFlow3dVariableId(token);
    if (id) ids.push(id);
  }

  return ids;
}

function parseGridRangeLine(line: string): PrintingInfo | null {
  const normalized = line.replace(/\s+/g, ' ');
  const match = GRID_RANGE_RE.exec(normalized);
  if (!match) return null;

  const [, timeStr, ixMin, ixMax, jyMin, jyMax, kzMin, kzMax] = match;
  const beforeT = normalized.slice(0, match.index).replace(/^printing\s+/i, '').trim();
  const variableIds = beforeT ? parsePrintingVariables(beforeT) : [];

  return {
    variableIds,
    timestampSeconds: Number(timeStr),
    width: Number(ixMax) - Number(ixMin) + 1,
    height: Number(jyMax) - Number(jyMin) + 1,
    depth: Number(kzMax) - Number(kzMin) + 1,
  };
}

function parsePrintingLine(line: string): PrintingInfo | null {
  const normalized = line.replace(/\s+/g, ' ');
  const match = PRINTING_LINE_RE.exec(normalized);
  if (match) {
    const [, varPart, timeStr, ixMin, ixMax, jyMin, jyMax, kzMin, kzMax] = match;
    const variableIds = parsePrintingVariables(varPart);
    return {
      variableIds,
      timestampSeconds: Number(timeStr),
      width: Number(ixMax) - Number(ixMin) + 1,
      height: Number(jyMax) - Number(jyMin) + 1,
      depth: Number(kzMax) - Number(kzMin) + 1,
    };
  }

  return parseGridRangeLine(normalized);
}

function isPrintingFragment(line: string): boolean {
  return /printing\b|^u$|^v$|^w\b|w and scrdif/i.test(line.replace(/\s+/g, ' '));
}

function isVariableHeaderRow(tokens: string[]): string[] | null {
  const cleaned = expandFlsconTokens(tokens)
    .map((token) => stripBom(token.trim()))
    .filter((t) => t !== '');
  const ids = cleaned
    .map((token) => normalizeFlow3dVariableId(token))
    .filter((id): id is string => id !== null);
  if (ids.length < 2 || ids.length !== cleaned.length) {
    return null;
  }
  return ids;
}

function significantNumericValues(tokens: string[]): number[] {
  return expandFlsconTokens(tokens)
    .filter((token) => token !== '')
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value));
}

/** Excel 이 한 셀에 공백 구분 다값/다변수명을 넣은 경우 토큰을 펼친다. */
export function expandFlsconTokens(tokens: string[]): string[] {
  const expanded: string[] = [];

  for (const token of tokens) {
    if (token === '') {
      expanded.push('');
      continue;
    }

    const trimmed = stripBom(token.trim());
    const parts = trimmed.split(/[\s\t]+/).filter((part) => part.length > 0);

    if (parts.length > 1) {
      if (parts.every((part) => Number.isFinite(Number(part)))) {
        expanded.push(...parts);
        continue;
      }

      const varIds = parts.map((part) => normalizeFlow3dVariableId(part));
      if (varIds.every((id) => id !== null) && varIds.length >= 2) {
        expanded.push(...parts);
        continue;
      }
    }

    expanded.push(trimmed);
  }

  return expanded;
}

function isFlsconMetaNumericLine(tokens: string[]): boolean {
  if (tokens.length < 8) return false;
  return tokens.every((token) => Number.isFinite(Number(token)));
}

/**
 * FLOW-3D flscon 원본 출력 CSV 파서.
 * printing u v w and scrdif … ix/jy/kz 범위 + 와이드 데이터 행을 읽는다.
 */
export async function parseFlow3dFlsconCsv(
  file: File,
  options: ParseFlow3dFlsconCsvOptions = {},
): Promise<Flow3dFlsconParseResult> {
  throwIfAborted(options.signal);

  let printing: PrintingInfo | null = null;
  let wideColumns: string[] | null = null;
  let expectHeader = false;
  let pendingMerge = '';
  let expectedCellCount = 0;
  let columnarMode: ColumnarMode = 'none';
  let rotateColumnIndex = 0;
  let activeSectionId: string | null = null;
  const builders = new Map<string, VariableBuilder>();

  let bytesRead = 0;
  let linesSinceYield = 0;
  let valuesParsed = 0;

  const signal = options.signal;

  const onAbort = (): void => {
    // no-op: line iterator checks signal between lines
  };
  signal?.addEventListener('abort', onAbort);

  const report = (): void => {
    const columnCount = wideColumns?.length ?? printing?.variableIds.length ?? 0;
    options.onProgress?.({
      bytesRead,
      fileSize: file.size,
      valuesParsed,
      ...(expectedCellCount > 0 ? { totalCells: expectedCellCount } : {}),
      ...(columnCount > 0
        ? { rowsParsed: Math.floor(valuesParsed / columnCount) }
        : {}),
      currentVariable: wideColumns?.[0] ?? printing?.variableIds[0] ?? '',
    });
  };

  const ensureBuilders = (columnIds: string[]): void => {
    wideColumns = columnIds;
    const capacity =
      expectedCellCount > 0
        ? expectedCellCount
        : printing
          ? printing.width * printing.height * printing.depth
          : 0;
    if (capacity > 0) {
      expectedCellCount = capacity;
    }
    for (const id of columnIds) {
      if (builders.has(id) || capacity <= 0) continue;
      builders.set(id, startBuilder(id, capacity));
    }
  };

  const setPrintingInfo = (info: PrintingInfo): void => {
    printing = info;
    expectedCellCount = info.width * info.height * info.depth;
    expectHeader = true;
    if (wideColumns) {
      ensureBuilders(wideColumns);
    } else if (info.variableIds.length > 0) {
      ensureBuilders(info.variableIds);
    }
    report();
  };

  const appendScalar = (id: string, value: number): void => {
    const builder = builders.get(id);
    if (!builder || builder.writeIndex >= builder.values.length) return;
    builder.values[builder.writeIndex] = value;
    builder.writeIndex += 1;
    valuesParsed += 1;
  };

  const appendWideRow = (tokens: string[]): void => {
    if (!wideColumns) return;
    wideColumns.forEach((id, index) => {
      const value = Number(tokens[index]);
      if (Number.isNaN(value)) return;
      appendScalar(id, value);
    });
  };

  const appendRotatingValue = (value: number): void => {
    if (!wideColumns || wideColumns.length === 0) return;
    columnarMode = 'rotate';
    const id = wideColumns[rotateColumnIndex % wideColumns.length]!;
    appendScalar(id, value);
    rotateColumnIndex += 1;
  };

  const tryAppendDataTokens = (rawLine: string, tokens: string[]): void => {
    if (!printing) return;
    if (!wideColumns && printing.variableIds.length > 0) {
      ensureBuilders(printing.variableIds);
    }
    if (!wideColumns || expectedCellCount <= 0) return;
    ensureBuilders(wideColumns);

    const expanded = expandFlsconTokens(tokens);
    const significant = expanded.map((t) => stripBom(t.trim())).filter((t) => t !== '');

    if (significant.length === 1 && !rawLine.includes(',')) {
      const lone = significant[0]!;
      const varId = normalizeFlow3dVariableId(lone);
      if (varId && wideColumns.includes(varId) && !expectHeader) {
        columnarMode = 'section';
        activeSectionId = varId;
        return;
      }
    }

    const numericValues = significantNumericValues(expanded);
    if (numericValues.length === 0) return;

    if (
      numericValues.length >= 2 &&
      numericValues.length === wideColumns.length &&
      isMatrixDataRow(expanded)
    ) {
      columnarMode = 'none';
      activeSectionId = null;
      appendWideRow(expanded);
      return;
    }

    if (numericValues.length === 1 && isColumnarDataRow(expanded)) {
      const value = numericValues[0]!;
      const colIndex = expanded.findIndex((t) => t.trim() !== '' && Number.isFinite(Number(t)));
      const hasEmptyCsvCells = expanded.length > 1 && expanded.some((t) => t === '');

      if (hasEmptyCsvCells && colIndex >= 0 && colIndex < wideColumns.length) {
        appendScalar(wideColumns[colIndex]!, value);
        return;
      }

      if (columnarMode === 'section' && activeSectionId) {
        appendScalar(activeSectionId, value);
        return;
      }

      appendRotatingValue(value);
      return;
    }

    if (numericValues.length > 1 && numericValues.length < wideColumns.length) {
      const padded = [...expanded];
      while (padded.filter((t) => t !== '').length < wideColumns.length) {
        padded.push('0');
      }
      appendWideRow(padded);
    }
  };

  const resolveMergedLine = (rawLine: string): string | null => {
    const line = normalizeFlsconLine(rawLine);
    if (!line) return null;

    const normalized = line.replace(/\s+/g, ' ');
    const hasGrid = GRID_RANGE_RE.test(normalized);

    if (isPrintingFragment(normalized) && !hasGrid) {
      pendingMerge = pendingMerge ? `${pendingMerge} ${normalized}` : normalized;
      if (GRID_RANGE_RE.test(pendingMerge)) {
        const merged = pendingMerge;
        pendingMerge = '';
        return merged;
      }
      return null;
    }

    if (hasGrid && pendingMerge) {
      const merged = `${pendingMerge} ${normalized}`;
      pendingMerge = '';
      return merged;
    }

    pendingMerge = '';
    return normalized;
  };

  const processLine = (rawLine: string): void => {
    const merged = resolveMergedLine(rawLine);
    if (!merged) return;
    if (isSkippableCsvLine(merged)) return;

    if (!printing) {
      const printingInfo = parsePrintingLine(merged);
      if (printingInfo) {
        setPrintingInfo(printingInfo);
        return;
      }
    }

    const tokens = expandFlsconTokens(tokenizeGridLine(merged));
    if (tokens.length === 0) return;

    if (expectHeader) {
      if (isFlsconMetaNumericLine(tokens)) {
        return;
      }

      const headerIds = isVariableHeaderRow(tokens);
      if (headerIds) {
        ensureBuilders(headerIds);
        expectHeader = false;
        columnarMode = 'none';
        activeSectionId = null;
        return;
      }
    }

    if (!wideColumns && printing) {
      const headerIds = isVariableHeaderRow(tokens);
      if (headerIds) {
        ensureBuilders(headerIds);
        expectHeader = false;
        columnarMode = 'none';
        activeSectionId = null;
        return;
      }
    }

    if (!wideColumns && printing && printing.variableIds.length > 0) {
      ensureBuilders(printing.variableIds);
    }

    tryAppendDataTokens(merged, tokens);
  };

  const processRawLine = (rawLine: string): boolean => {
    processLine(rawLine);
    linesSinceYield += 1;
    if (linesSinceYield >= YIELD_EVERY_LINES) {
      linesSinceYield = 0;
      report();
      return true;
    }
    return false;
  };

  try {
    report();

    const reader = uploadFileByteStream(file).pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
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
          if (processRawLine(buffer.slice(0, newlineIdx))) {
            await yieldToMain();
          }
          buffer = buffer.slice(newlineIdx + 1);
          newlineIdx = buffer.indexOf('\n');
        }
        report();
        await yieldToMain();
      }
      if (buffer.length > 0) {
        if (processRawLine(buffer)) {
          await yieldToMain();
        }
      }
    } finally {
      reader.releaseLock();
    }

    report();

    if (printing === null) {
      throw new Error(
        'parseFlow3dFlsconCsv: ix/jy/kz 격자 범위 행을 찾을 수 없습니다. printing … ix=… jy=… kz=… 형식을 확인해 주세요.',
      );
    }

    const resolvedPrinting = printing as PrintingInfo;

    if (!wideColumns) {
      if (resolvedPrinting.variableIds.length > 0) {
        ensureBuilders(resolvedPrinting.variableIds);
      } else {
        throw new Error(
          'parseFlow3dFlsconCsv: u v w scrdif 변수 헤더 행을 찾을 수 없습니다.',
        );
      }
    }

    const cellCount = resolvedPrinting.width * resolvedPrinting.height * resolvedPrinting.depth;
    const result: ParsedFlow3dVariable[] = [];

    for (const builder of builders.values()) {
      if (builder.writeIndex === 0) continue;
      if (builder.writeIndex !== cellCount) {
        throw new Error(
          `parseFlow3dFlsconCsv: ${builder.id} 값 개수(${builder.writeIndex})가 격자 셀 수(${cellCount})와 일치하지 않습니다.`,
        );
      }
      result.push({
        id: builder.id,
        label: builder.label,
        unit: builder.unit,
        values: builder.values,
      });
    }

    if (result.length === 0) {
      throw new Error(
        `parseFlow3dFlsconCsv: 인식된 FLOW-3D 변수가 없습니다. ` +
          `(값 ${valuesParsed}개 파싱, 헤더 ${(wideColumns ?? []).join('/') || '—'}, ` +
          `격자 ${cellCount}셀, 모드 ${columnarMode})`,
      );
    }

    result.sort((a, b) => a.id.localeCompare(b.id));

    return {
      variables: result,
      gridMeta: {
        width: resolvedPrinting.width,
        height: resolvedPrinting.height,
        depth: resolvedPrinting.depth,
        intervalSeconds: resolvedPrinting.timestampSeconds,
      },
    };
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
