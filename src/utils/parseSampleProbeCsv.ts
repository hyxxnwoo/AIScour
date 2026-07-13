import { throwIfAborted } from '@/utils/csvParseAbort';
import { readUploadFilePrefix, readUploadFileText, uploadFileByteStream } from '@/utils/readUploadFile';
import { yieldToMain } from '@/utils/yieldToMain';

/** sampledata.csv 열 이름. */
export const SAMPLE_PROBE_FIELDS = ['x', 'y', 'z', 'u', 'v', 'w', 'scrdif'] as const;

export type SampleProbeField = (typeof SAMPLE_PROBE_FIELDS)[number];

export interface SampleProbeParseStats {
  fileLineCount: number;
  /** 파일 내 유효 데이터 행 수( stride 적용 전). */
  dataRowCount: number;
  skippedLinesAfterHeader: number;
  /** 파싱 시 적용한 stride(1이면 전 행 저장). */
  parseStepMultiple: number;
}

/** 열 단위 Float32Array. 모든 배열 길이는 count 와 같다. */
export interface SampleProbeColumns {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  u: Float32Array;
  v: Float32Array;
  w: Float32Array;
  scrdif: Float32Array;
  count: number;
  stats?: SampleProbeParseStats;
}

export interface ParseSampleProbeOptions {
  signal?: AbortSignal;
  /** 1이면 모든 행 저장. N이면 0-based 데이터 행 인덱스 % N === 0 인 행만 저장. */
  stepMultiple?: number;
  onProgress?: (progress: {
    rowsParsed: number;
    totalDataRows?: number;
    bytesRead: number;
    fileSize: number;
  }) => void;
}

type ColumnIndexMap = Record<SampleProbeField, number>;

const STREAM_PARSE_MIN_BYTES = 128 * 1024;
const YIELD_EVERY_LINES = 64;
const INITIAL_COLUMN_CAPACITY = 4096;
const MAX_COLUMN_BYTES = 64 * 1024 * 1024;
const MIN_BYTES_PER_ROW = 32;
const DETECT_PREFIX_BYTES = 256 * 1024;

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function maxColumnCapacity(sourceBytes: number, stepMultiple: number): number {
  const fromSource = Math.ceil(sourceBytes / MIN_BYTES_PER_ROW) + INITIAL_COLUMN_CAPACITY;
  const absoluteMax = Math.floor(
    MAX_COLUMN_BYTES / (SAMPLE_PROBE_FIELDS.length * Float32Array.BYTES_PER_ELEMENT),
  );
  const fullCap = Math.max(INITIAL_COLUMN_CAPACITY, Math.min(fromSource, absoluteMax));
  const stride = Math.max(1, Math.floor(stepMultiple));
  return Math.max(INITIAL_COLUMN_CAPACITY, Math.ceil(fullCap / stride));
}

function isSkippableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length === 0 || /^#/.test(trimmed);
}

function tokenizeLine(line: string): string[] {
  return stripBom(line)
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function matchHeader(tokens: string[]): ColumnIndexMap | null {
  const indexOfField = (field: SampleProbeField): number =>
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
      'parseSampleProbeCsv: CSV 행 수가 브라우저 메모리 한도를 초과했습니다.',
    );
  }
  const next = Math.min(
    Math.max(buf.capacity * 2, buf.capacity + INITIAL_COLUMN_CAPACITY),
    maxCapacity,
  );
  if (next <= buf.capacity) {
    throw new Error(
      'parseSampleProbeCsv: CSV 행 수가 브라우저 메모리 한도를 초과했습니다.',
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

function canReadRow(tokens: string[], columns: ColumnIndexMap): boolean {
  for (const field of SAMPLE_PROBE_FIELDS) {
    const col = columns[field];
    if (col < 0) continue;
    const raw = tokens[col];
    if (raw === undefined || !isNumericToken(raw)) return false;
  }
  return true;
}

function readRow(
  buf: ColumnBuffers,
  tokens: string[],
  columns: ColumnIndexMap,
  maxCapacity: number,
): void {
  const values: Partial<Record<SampleProbeField, number>> = {};

  for (const field of SAMPLE_PROBE_FIELDS) {
    const col = columns[field];
    if (col < 0) {
      values[field] = 0;
      continue;
    }
    const raw = tokens[col];
    if (raw === undefined || !isNumericToken(raw)) return;
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
}

interface ParseState {
  columns: ColumnIndexMap | null;
  fileLineCount: number;
  skippedLinesAfterHeader: number;
  totalDataRowsInFile: number;
}

function createParseState(): ParseState {
  return {
    columns: null,
    fileLineCount: 0,
    skippedLinesAfterHeader: 0,
    totalDataRowsInFile: 0,
  };
}

function toColumns(
  buf: ColumnBuffers,
  state: ParseState,
  parseStepMultiple: number,
): SampleProbeColumns {
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
      dataRowCount: state.totalDataRowsInFile,
      skippedLinesAfterHeader: state.skippedLinesAfterHeader,
      parseStepMultiple,
    },
  };
}

function countDataLine(
  state: ParseState,
  rawLine: string,
): void {
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  state.fileLineCount += 1;

  if (isSkippableLine(line)) return;

  const tokens = tokenizeLine(line);
  if (tokens.length === 0) return;

  if (!state.columns) {
    const header = matchHeader(tokens);
    if (header) state.columns = header;
    return;
  }

  if (!canReadRow(tokens, state.columns)) return;

  state.totalDataRowsInFile += 1;
}

/** 텍스트에서 유효 데이터 행 수만 센다(열 버퍼 없음). */
export function countSampleProbeDataRowsText(text: string): number {
  const state = createParseState();
  for (const rawLine of text.split(/\r?\n/)) {
    countDataLine(state, rawLine);
  }
  if (!state.columns) {
    throw new Error(
      'parseSampleProbeCsv: "x y z u v w scrdif" 헤더 행을 찾을 수 없습니다.',
    );
  }
  return state.totalDataRowsInFile;
}

export interface CountSampleProbeRowsOptions {
  signal?: AbortSignal;
  onProgress?: (progress: {
    totalDataRows: number;
    bytesRead: number;
    fileSize: number;
  }) => void;
}

/** File 에서 유효 데이터 행 수만 스트리밍으로 센다(열 버퍼 없음). */
export async function countSampleProbeDataRows(
  file: File,
  options: CountSampleProbeRowsOptions = {},
): Promise<number> {
  if (file.size <= STREAM_PARSE_MIN_BYTES) {
    const text = await readUploadFileText(file);
    const count = countSampleProbeDataRowsText(text);
    options.onProgress?.({
      totalDataRows: count,
      bytesRead: text.length,
      fileSize: file.size,
    });
    return count;
  }

  const state = createParseState();
  const { signal } = options;
  let bytesRead = 0;
  const fileSize = file.size;
  let linesSinceYield = 0;

  const report = (): void => {
    options.onProgress?.({
      totalDataRows: state.totalDataRowsInFile,
      bytesRead,
      fileSize,
    });
  };

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
        const line = buffer.slice(0, newlineIdx);
        countDataLine(state, line);
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

    if (buffer.length > 0) {
      countDataLine(state, buffer);
    }
  } finally {
    reader.releaseLock();
  }

  report();

  if (!state.columns) {
    throw new Error(
      'parseSampleProbeCsv: "x y z u v w scrdif" 헤더 행을 찾을 수 없습니다.',
    );
  }
  return state.totalDataRowsInFile;
}

function processLine(
  acc: ColumnBuffers,
  state: ParseState,
  rawLine: string,
  maxCapacity: number,
  stepMultiple: number,
): void {
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  state.fileLineCount += 1;

  if (isSkippableLine(line)) {
    if (state.columns !== null) state.skippedLinesAfterHeader += 1;
    return;
  }

  const tokens = tokenizeLine(line);
  if (tokens.length === 0) {
    if (state.columns !== null) state.skippedLinesAfterHeader += 1;
    return;
  }

  if (!state.columns) {
    const header = matchHeader(tokens);
    if (header) state.columns = header;
    return;
  }

  if (!canReadRow(tokens, state.columns)) {
    state.skippedLinesAfterHeader += 1;
    return;
  }

  const dataRowIndex = state.totalDataRowsInFile;
  state.totalDataRowsInFile += 1;
  if (dataRowIndex % stepMultiple !== 0) return;

  readRow(acc, tokens, state.columns, maxCapacity);
}

function finalizeParse(
  acc: ColumnBuffers,
  state: ParseState,
  parseStepMultiple: number,
): SampleProbeColumns {
  if (!state.columns) {
    throw new Error(
      'parseSampleProbeCsv: "x y z u v w scrdif" 헤더 행을 찾을 수 없습니다.',
    );
  }
  if (acc.length === 0) {
    throw new Error('parseSampleProbeCsv: 유효한 데이터 행이 없습니다.');
  }
  return toColumns(acc, state, parseStepMultiple);
}

function resolveStepMultiple(options: ParseSampleProbeOptions): number {
  return Math.max(1, Math.floor(options.stepMultiple ?? 1));
}

/** sampledata.csv 텍스트에서 x·y·z·u·v·w·scrdif 열을 추출한다. */
export function parseSampleProbeCsvText(
  text: string,
  options: ParseSampleProbeOptions = {},
): SampleProbeColumns {
  const stepMultiple = resolveStepMultiple(options);
  const maxCapacity = maxColumnCapacity(text.length, stepMultiple);
  const acc = createColumnBuffers(INITIAL_COLUMN_CAPACITY, maxCapacity);
  const state = createParseState();

  for (const rawLine of text.split(/\r?\n/)) {
    processLine(acc, state, rawLine, maxCapacity, stepMultiple);
  }

  options.onProgress?.({
    rowsParsed: acc.length,
    totalDataRows: state.totalDataRowsInFile,
    bytesRead: text.length,
    fileSize: text.length,
  });

  return finalizeParse(acc, state, stepMultiple);
}

async function parseSampleProbeCsvStream(
  file: File,
  options: ParseSampleProbeOptions = {},
): Promise<SampleProbeColumns> {
  const stepMultiple = resolveStepMultiple(options);
  const maxCapacity = maxColumnCapacity(file.size, stepMultiple);
  const acc = createColumnBuffers(INITIAL_COLUMN_CAPACITY, maxCapacity);
  const state = createParseState();
  const { signal } = options;
  let bytesRead = 0;
  const fileSize = file.size;
  let linesSinceYield = 0;

  const report = (): void => {
    options.onProgress?.({
      rowsParsed: acc.length,
      totalDataRows: state.totalDataRowsInFile,
      bytesRead,
      fileSize,
    });
  };

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
        const line = buffer.slice(0, newlineIdx);
        processLine(acc, state, line, maxCapacity, stepMultiple);
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

    if (buffer.length > 0) {
      processLine(acc, state, buffer, maxCapacity, stepMultiple);
    }
  } finally {
    reader.releaseLock();
  }

  report();
  return finalizeParse(acc, state, stepMultiple);
}

/** 텍스트 샘플에 x·y·z·u·v·w·scrdif 헤더 행이 있는지 판별한다. */
export function detectSampleProbeCsv(sample: string): boolean {
  for (const rawLine of sample.split(/\r?\n/).slice(0, 500)) {
    if (isSkippableLine(rawLine)) continue;
    if (matchHeader(tokenizeLine(rawLine))) return true;
  }
  return false;
}

/** File 앞부분을 읽어 sampledata 양식인지 판별한다. */
export async function isSampleProbeCsv(file: File): Promise<boolean> {
  const maxBytes = Math.min(file.size, DETECT_PREFIX_BYTES);
  const prefix = await readUploadFilePrefix(file, maxBytes);
  return detectSampleProbeCsv(prefix);
}

/** File 을 읽어 sampledata 양식 열을 추출한다. */
export async function parseSampleProbeCsvFile(
  file: File,
  options: ParseSampleProbeOptions = {},
): Promise<SampleProbeColumns> {
  if (file.size > STREAM_PARSE_MIN_BYTES) {
    return parseSampleProbeCsvStream(file, options);
  }
  const text = await readUploadFileText(file);
  return parseSampleProbeCsvText(text, options);
}
