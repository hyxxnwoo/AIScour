import { stripBom } from '@/utils/flow3dXyzColumns';
import { readUploadFilePrefix, readUploadFileText, uploadFileByteStream } from '@/utils/readUploadFile';
import { throwIfAborted } from '@/utils/csvParseAbort';
import { isSkippableCsvLine } from '@/utils/streamGridCsv';
import { yieldToMain } from '@/utils/yieldToMain';

/** 추출 대상 필드 (public/data/sampledata.csv 의 열 이름). */
export const FLOW3D_SCRDIF_FIELDS = ['x', 'y', 'z', 'u', 'v', 'w', 'scrdif'] as const;

export type Flow3dScrdifField = (typeof FLOW3D_SCRDIF_FIELDS)[number];

/** 한 격자점의 좌표(x·y·z), 유속(u·v·w), 세굴 변화량(scrdif). */
export interface Flow3dScrdifPoint {
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
  w: number;
  scrdif: number;
}

/** CSV 전체에 u·v·w 유속이 threshold 이상인 행이 하나라도 있는지. */
export function scrdifColumnsHaveFlow(
  columns: Flow3dScrdifColumns,
  threshold = 0.012,
): boolean {
  for (let i = 0; i < columns.count; i += 1) {
    const speed = Math.hypot(columns.u[i]!, columns.v[i]!, columns.w[i]!);
    if (speed >= threshold) return true;
  }
  return false;
}

/** CSV 파싱 통계 (미리보기·진행률 표시용). */
export interface Flow3dScrdifParseStats {
  /** 파일의 전체 줄 수 (빈 줄 포함). */
  fileLineCount: number;
  /** x·y·z·u·v·w·scrdif 헤더 이후 파싱에 성공한 데이터 행 수 (= count). */
  dataRowCount: number;
  /** 헤더 이후 데이터로 인식되지 않아 건너뛴 줄 수. */
  skippedLinesAfterHeader: number;
  /** printing 줄 ix/jy/kz 범위로 추정한 격자 셀 수 (없으면 null). */
  expectedPrintingCells: number | null;
  /** 대용량 스트리밍: 두 번째 printing 블록에서 파싱 중단. */
  truncatedAtSecondBlock: boolean;
}

/** 열 단위 Float32Array (대용량에 유리). 모든 배열 길이는 count 와 같다. */
export interface Flow3dScrdifColumns {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  u: Float32Array;
  v: Float32Array;
  w: Float32Array;
  scrdif: Float32Array;
  count: number;
  stats?: Flow3dScrdifParseStats;
}

export interface ParseFlow3dScrdifOptions {
  signal?: AbortSignal;
  onProgress?: (progress: {
    rowsParsed: number;
    bytesRead: number;
    fileSize: number;
  }) => void;
}

type ColumnIndexMap = Record<Flow3dScrdifField, number>;

/** 128KB 초과 File 은 스트리밍 파서만 사용한다. */
const STREAM_PARSE_MIN_BYTES = 128 * 1024;
const YIELD_EVERY_LINES = 64;
const INITIAL_COLUMN_CAPACITY = 4096;
/** 열 7개 Float32Array 합산 메모리 상한 (~64MB). */
const MAX_COLUMN_BYTES = 64 * 1024 * 1024;
const MIN_BYTES_PER_ROW = 32;

function maxColumnCapacity(sourceBytes: number): number {
  const fromSource = Math.ceil(sourceBytes / MIN_BYTES_PER_ROW) + INITIAL_COLUMN_CAPACITY;
  const absoluteMax = Math.floor(
    MAX_COLUMN_BYTES / (FLOW3D_SCRDIF_FIELDS.length * Float32Array.BYTES_PER_ELEMENT),
  );
  return Math.max(INITIAL_COLUMN_CAPACITY, Math.min(fromSource, absoluteMax));
}

function estimateRowCountFromPrintingLine(line: string): number | null {
  if (!/printing\b/i.test(line)) return null;
  const m = line.match(
    /ix=\s*(\d+)\s+to\s+(\d+).*jy=\s*(\d+)\s+to\s+(\d+).*kz=\s*(\d+)\s+to\s+(\d+)/i,
  );
  if (!m) return null;
  const w = Number(m[2]) - Number(m[1]) + 1;
  const h = Number(m[4]) - Number(m[3]) + 1;
  const d = Number(m[6]) - Number(m[5]) + 1;
  if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(d)) return null;
  if (w <= 0 || h <= 0 || d <= 0) return null;
  const product = w * h * d;
  if (!Number.isSafeInteger(product) || product <= 0) return null;
  return product;
}

/**
 * FLOW-3D flscon 한 줄을 토큰으로 분리한다.
 * 값은 공백 구분이며 Excel 로 저장 시 붙는 후행 쉼표(",,")를 함께 처리한다.
 */
function tokenizeScrdifLine(line: string): string[] {
  return stripBom(line)
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/**
 * 헤더 행(x y z u v w scrdif)에서 각 필드의 열 인덱스를 찾는다.
 * x·y·z 와 scrdif 가 모두 있어야 헤더로 인정한다.
 */
function matchHeader(tokens: string[]): ColumnIndexMap | null {
  const indexOfField = (field: Flow3dScrdifField): number =>
    tokens.findIndex((token) => token.toLowerCase() === field);

  const map = {
    x: indexOfField('x'),
    y: indexOfField('y'),
    z: indexOfField('z'),
    u: indexOfField('u'),
    v: indexOfField('v'),
    w: indexOfField('w'),
    scrdif: indexOfField('scrdif'),
  } satisfies ColumnIndexMap;

  if (map.x < 0 || map.y < 0 || map.z < 0 || map.scrdif < 0) return null;
  return map;
}

function isNumericToken(token: string): boolean {
  return token.length > 0 && Number.isFinite(Number(token));
}

interface ColumnBuffers {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  u: Float32Array;
  v: Float32Array;
  w: Float32Array;
  scrdif: Float32Array;
  length: number;
  capacity: number;
}

function createColumnBuffers(capacity: number, maxCapacity: number): ColumnBuffers {
  const safeCapacity = Math.min(Math.max(4, capacity), maxCapacity);
  return {
    x: new Float32Array(safeCapacity),
    y: new Float32Array(safeCapacity),
    z: new Float32Array(safeCapacity),
    u: new Float32Array(safeCapacity),
    v: new Float32Array(safeCapacity),
    w: new Float32Array(safeCapacity),
    scrdif: new Float32Array(safeCapacity),
    length: 0,
    capacity: safeCapacity,
  };
}

function growColumnBuffers(buf: ColumnBuffers, maxCapacity: number): void {
  if (buf.length >= maxCapacity) {
    throw new Error(
      'parseFlow3dScrdifCsv: CSV 행 수가 브라우저 메모리 한도를 초과했습니다. 더 작은 파일이나 단일 시각 블록만 포함된 CSV를 사용해 주세요.',
    );
  }
  const next = Math.min(
    Math.max(buf.capacity * 2, buf.capacity + INITIAL_COLUMN_CAPACITY),
    maxCapacity,
  );
  if (next <= buf.capacity) {
    throw new Error(
      'parseFlow3dScrdifCsv: CSV 행 수가 브라우저 메모리 한도를 초과했습니다. 더 작은 파일이나 단일 시각 블록만 포함된 CSV를 사용해 주세요.',
    );
  }
  const x = new Float32Array(next);
  const y = new Float32Array(next);
  const z = new Float32Array(next);
  const u = new Float32Array(next);
  const v = new Float32Array(next);
  const w = new Float32Array(next);
  const scrdif = new Float32Array(next);
  x.set(buf.x);
  y.set(buf.y);
  z.set(buf.z);
  u.set(buf.u);
  v.set(buf.v);
  w.set(buf.w);
  scrdif.set(buf.scrdif);
  buf.x = x;
  buf.y = y;
  buf.z = z;
  buf.u = u;
  buf.v = v;
  buf.w = w;
  buf.scrdif = scrdif;
  buf.capacity = next;
}

function readRow(
  buf: ColumnBuffers,
  tokens: string[],
  columns: ColumnIndexMap,
  maxCapacity: number,
): boolean {
  const values: Partial<Record<Flow3dScrdifField, number>> = {};

  for (const field of FLOW3D_SCRDIF_FIELDS) {
    const col = columns[field];
    if (col < 0) {
      values[field] = 0;
      continue;
    }
    const raw = tokens[col];
    if (raw === undefined || !isNumericToken(raw)) return false;
    values[field] = Number(raw);
  }

  if (buf.length >= buf.capacity) {
    growColumnBuffers(buf, maxCapacity);
  }
  const i = buf.length++;
  buf.x[i] = values.x!;
  buf.y[i] = values.y!;
  buf.z[i] = values.z!;
  buf.u[i] = values.u!;
  buf.v[i] = values.v!;
  buf.w[i] = values.w!;
  buf.scrdif[i] = values.scrdif!;
  return true;
}

interface ScrdifParseState {
  columns: ColumnIndexMap | null;
  fileLineCount: number;
  skippedLinesAfterHeader: number;
  expectedPrintingCells: number | null;
  truncatedAtSecondBlock: boolean;
}

function createParseState(): ScrdifParseState {
  return {
    columns: null,
    fileLineCount: 0,
    skippedLinesAfterHeader: 0,
    expectedPrintingCells: null,
    truncatedAtSecondBlock: false,
  };
}

function notePrintingEstimate(state: ScrdifParseState, line: string): void {
  if (state.expectedPrintingCells !== null) return;
  const estimate = estimateRowCountFromPrintingLine(line);
  if (estimate !== null) state.expectedPrintingCells = estimate;
}

function toColumns(buf: ColumnBuffers, state: ScrdifParseState): Flow3dScrdifColumns {
  return {
    x: buf.x.subarray(0, buf.length),
    y: buf.y.subarray(0, buf.length),
    z: buf.z.subarray(0, buf.length),
    u: buf.u.subarray(0, buf.length),
    v: buf.v.subarray(0, buf.length),
    w: buf.w.subarray(0, buf.length),
    scrdif: buf.scrdif.subarray(0, buf.length),
    count: buf.length,
    stats: {
      fileLineCount: state.fileLineCount,
      dataRowCount: buf.length,
      skippedLinesAfterHeader: state.skippedLinesAfterHeader,
      expectedPrintingCells: state.expectedPrintingCells,
      truncatedAtSecondBlock: state.truncatedAtSecondBlock,
    },
  };
}

function processScrdifLine(
  acc: ColumnBuffers,
  state: ScrdifParseState,
  rawLine: string,
  maxCapacity: number,
): void {
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  state.fileLineCount += 1;
  notePrintingEstimate(state, line);

  if (isSkippableCsvLine(line)) {
    if (state.columns !== null) state.skippedLinesAfterHeader += 1;
    return;
  }

  const tokens = tokenizeScrdifLine(line);
  if (tokens.length === 0) {
    if (state.columns !== null) state.skippedLinesAfterHeader += 1;
    return;
  }

  if (!state.columns) {
    const header = matchHeader(tokens);
    if (header) {
      state.columns = header;
    }
    return;
  }

  if (!readRow(acc, tokens, state.columns, maxCapacity)) {
    state.skippedLinesAfterHeader += 1;
  }
}

function finalizeScrdifParse(acc: ColumnBuffers, state: ScrdifParseState): Flow3dScrdifColumns {
  if (!state.columns) {
    throw new Error(
      'parseFlow3dScrdifCsv: "x y z u v w scrdif" 헤더 행을 찾을 수 없습니다.',
    );
  }
  if (acc.length === 0) {
    throw new Error('parseFlow3dScrdifCsv: 유효한 x·y·z·u·v·w·scrdif 데이터 행이 없습니다.');
  }
  return toColumns(acc, state);
}

/**
 * FLOW-3D flscon 텍스트(예: public/data/sampledata.csv)에서
 * x·y·z·u·v·w·scrdif 열을 추출한다.
 */
export function parseFlow3dScrdifCsvText(text: string): Flow3dScrdifColumns {
  const maxCapacity = maxColumnCapacity(text.length);
  const acc = createColumnBuffers(INITIAL_COLUMN_CAPACITY, maxCapacity);
  const state = createParseState();

  for (const rawLine of text.split(/\r?\n/)) {
    processScrdifLine(acc, state, rawLine, maxCapacity);
  }

  return finalizeScrdifParse(acc, state);
}

/** File 을 줄 단위 스트리밍으로 파싱한다 (대용량 CSV). */
async function parseFlow3dScrdifCsvStream(
  file: File,
  options: ParseFlow3dScrdifOptions = {},
): Promise<Flow3dScrdifColumns> {
  const maxCapacity = maxColumnCapacity(file.size);
  const acc = createColumnBuffers(INITIAL_COLUMN_CAPACITY, maxCapacity);
  const state = createParseState();
  const { signal } = options;
  let bytesRead = 0;
  const fileSize = file.size;
  let linesSinceYield = 0;
  let stopAfterFirstBlock = false;

  const report = (): void => {
    options.onProgress?.({
      rowsParsed: acc.length,
      bytesRead,
      fileSize,
    });
  };

  const reader = uploadFileByteStream(file).pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  try {
    outer: while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      throwIfAborted(signal);
      if (done) break;
      bytesRead += value.length;
      buffer += value;

      let newlineIdx = buffer.indexOf('\n');
      while (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx);
        if (
          state.columns !== null &&
          acc.length > 0 &&
          estimateRowCountFromPrintingLine(line) !== null
        ) {
          stopAfterFirstBlock = true;
          state.truncatedAtSecondBlock = true;
          break outer;
        }
        processScrdifLine(acc, state, line, maxCapacity);
        buffer = buffer.slice(newlineIdx + 1);
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

    if (!stopAfterFirstBlock && buffer.length > 0) {
      processScrdifLine(acc, state, buffer, maxCapacity);
    }
  } finally {
    reader.releaseLock();
  }

  report();
  return finalizeScrdifParse(acc, state);
}

/** 열 배열을 포인트 객체 배열로 변환한다 (작은 파일·미리보기용). */
export function toFlow3dScrdifPoints(columns: Flow3dScrdifColumns): Flow3dScrdifPoint[] {
  const points: Flow3dScrdifPoint[] = new Array(columns.count);
  for (let i = 0; i < columns.count; i += 1) {
    points[i] = {
      x: columns.x[i]!,
      y: columns.y[i]!,
      z: columns.z[i]!,
      u: columns.u[i]!,
      v: columns.v[i]!,
      w: columns.w[i]!,
      scrdif: columns.scrdif[i]!,
    };
  }
  return points;
}

const DETECT_PREFIX_BYTES = 256 * 1024;

/** 텍스트 샘플에 x·y·z·u·v·w·scrdif 헤더 행이 있는지 판별한다. */
export function detectFlow3dScrdifCsv(sample: string): boolean {
  for (const rawLine of sample.split(/\r?\n/).slice(0, 500)) {
    if (isSkippableCsvLine(rawLine)) continue;
    if (matchHeader(tokenizeScrdifLine(rawLine))) return true;
  }
  return false;
}

/** File 앞부분을 읽어 x·y·z·u·v·w·scrdif CSV 인지 판별한다. */
export async function isFlow3dScrdifCsv(file: File): Promise<boolean> {
  const maxBytes = Math.min(file.size, DETECT_PREFIX_BYTES);
  const prefix = await readUploadFilePrefix(file, maxBytes);
  return detectFlow3dScrdifCsv(prefix);
}

/** File 을 읽어 x·y·z·u·v·w·scrdif 열을 추출한다. */
export async function parseFlow3dScrdifCsvFile(
  file: File,
  options: ParseFlow3dScrdifOptions = {},
): Promise<Flow3dScrdifColumns> {
  if (file.size > STREAM_PARSE_MIN_BYTES) {
    return parseFlow3dScrdifCsvStream(file, options);
  }

  const text = await readUploadFileText(file);
  return parseFlow3dScrdifCsvText(text);
}
