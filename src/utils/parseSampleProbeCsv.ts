import { throwIfAborted } from '@/utils/csvParseAbort';
import { readUploadFilePrefix, readUploadFileText, uploadFileByteStream } from '@/utils/readUploadFile';
import { yieldToMain } from '@/utils/yieldToMain';

/** sampledata.csv 열 이름. */
export const SAMPLE_PROBE_FIELDS = ['x', 'y', 'z', 'u', 'v', 'w', 'scrdif'] as const;

/** t 마커 등장 순서에 부여하는 기본 시간 간격(초). 1번째=0, 2번째=30, … */
export const DEFAULT_T_INTERVAL_SECONDS = 30;

export type SampleProbeField = (typeof SAMPLE_PROBE_FIELDS)[number];

export interface SampleProbeParseStats {
  fileLineCount: number;
  /** 파일 내 유효 데이터 행 수(공간점, stride 적용 전). */
  dataRowCount: number;
  /** 발견된 t 마커(시간 블록) 수. */
  timeBlockCount: number;
  skippedLinesAfterHeader: number;
  /** 파싱 시 적용한 공간 stride(1이면 전 행 저장). */
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

/** CSV 내 한 시점(t 마커)의 공간장. */
export interface SampleProbeTimeBlock {
  /** 0-based t 마커 등장 순서. */
  timeIndex: number;
  /** 부여된 시뮬레이션 시각(초): timeIndex * intervalSeconds. */
  timestampSeconds: number;
  /** CSV C열에서 읽은 raw t 값(없으면 null). */
  rawT: number | null;
  columns: SampleProbeColumns;
}

/** t 블록으로 구분된 sampledata 양식 파싱 결과. */
export interface SampleProbeDataset {
  blocks: SampleProbeTimeBlock[];
  /** 프리뷰용 전체 공간 행(블록 연결). */
  flatColumns: SampleProbeColumns;
  stats: SampleProbeParseStats;
  baseIntervalSeconds: number;
}

export interface ParseSampleProbeOptions {
  signal?: AbortSignal;
  /** 1이면 모든 공간 행 저장. N이면 블록 내 0-based 행 인덱스 % N === 0 만 저장. */
  stepMultiple?: number;
  /** t 마커 순서에 부여할 간격(초). 기본 30. */
  baseIntervalSeconds?: number;
  onProgress?: (progress: {
    rowsParsed: number;
    totalDataRows?: number;
    timeBlocksParsed?: number;
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

const T_MARKER_RE = /\bt\s*=\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/i;

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

/**
 * CSV C열(0-based index 2)에서 t=… 마커를 찾는다.
 * FLOW-3D 출력의 `printing … t=0.0 …` 줄이 이 형식이다.
 */
export function extractTimeMarkerFromLine(line: string): number | null {
  const cols = stripBom(line).split(',');
  if (cols.length >= 3) {
    const colC = cols[2] ?? '';
    const m = colC.match(T_MARKER_RE);
    if (m) {
      const value = Number(m[1]);
      return Number.isFinite(value) ? value : null;
    }
  }
  return null;
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

function freezeColumns(buf: ColumnBuffers): SampleProbeColumns {
  return {
    x: buf.x.slice(0, buf.length),
    y: buf.y.slice(0, buf.length),
    z: buf.z.slice(0, buf.length),
    u: buf.u.slice(0, buf.length),
    v: buf.v.slice(0, buf.length),
    w: buf.w.slice(0, buf.length),
    scrdif: buf.scrdif.slice(0, buf.length),
    count: buf.length,
  };
}

function concatColumns(parts: SampleProbeColumns[]): SampleProbeColumns {
  const count = parts.reduce((sum, p) => sum + p.count, 0);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const u = new Float32Array(count);
  const v = new Float32Array(count);
  const w = new Float32Array(count);
  const scrdif = new Float32Array(count);
  let offset = 0;
  for (const p of parts) {
    x.set(p.x.subarray(0, p.count), offset);
    y.set(p.y.subarray(0, p.count), offset);
    z.set(p.z.subarray(0, p.count), offset);
    u.set(p.u.subarray(0, p.count), offset);
    v.set(p.v.subarray(0, p.count), offset);
    w.set(p.w.subarray(0, p.count), offset);
    scrdif.set(p.scrdif.subarray(0, p.count), offset);
    offset += p.count;
  }
  return { x, y, z, u, v, w, scrdif, count };
}

interface ParseState {
  columns: ColumnIndexMap | null;
  fileLineCount: number;
  skippedLinesAfterHeader: number;
  totalDataRowsInFile: number;
  /** 현재 블록 내(헤더 이후) 공간 행 카운트 — stride 용. */
  blockDataRowIndex: number;
  currentRawT: number | null;
  hasOpenBlock: boolean;
  blocks: SampleProbeTimeBlock[];
}

function createParseState(): ParseState {
  return {
    columns: null,
    fileLineCount: 0,
    skippedLinesAfterHeader: 0,
    totalDataRowsInFile: 0,
    blockDataRowIndex: 0,
    currentRawT: null,
    hasOpenBlock: false,
    blocks: [],
  };
}

function resolveStepMultiple(options: ParseSampleProbeOptions): number {
  return Math.max(1, Math.floor(options.stepMultiple ?? 1));
}

function resolveInterval(options: ParseSampleProbeOptions): number {
  return Math.max(1, options.baseIntervalSeconds ?? DEFAULT_T_INTERVAL_SECONDS);
}

function finalizeOpenBlock(
  state: ParseState,
  buf: ColumnBuffers,
  maxCapacity: number,
  baseIntervalSeconds: number,
): ColumnBuffers {
  if (!state.hasOpenBlock && buf.length === 0) {
    return buf;
  }
  const timeIndex = state.blocks.length;
  state.blocks.push({
    timeIndex,
    timestampSeconds: timeIndex * baseIntervalSeconds,
    rawT: state.currentRawT,
    columns: freezeColumns(buf),
  });
  state.hasOpenBlock = false;
  state.currentRawT = null;
  state.blockDataRowIndex = 0;
  state.columns = null;
  return createColumnBuffers(INITIAL_COLUMN_CAPACITY, maxCapacity);
}

function openBlock(state: ParseState, rawT: number | null): void {
  state.hasOpenBlock = true;
  state.currentRawT = rawT;
  state.blockDataRowIndex = 0;
  state.columns = null;
}

function ensureOpenBlock(state: ParseState): void {
  if (!state.hasOpenBlock) {
    openBlock(state, null);
  }
}

function processLine(
  bufRef: { buf: ColumnBuffers },
  state: ParseState,
  rawLine: string,
  maxCapacity: number,
  stepMultiple: number,
  baseIntervalSeconds: number,
): void {
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  state.fileLineCount += 1;

  if (isSkippableLine(line)) {
    if (state.columns !== null) state.skippedLinesAfterHeader += 1;
    return;
  }

  const rawT = extractTimeMarkerFromLine(line);
  if (rawT !== null) {
    bufRef.buf = finalizeOpenBlock(state, bufRef.buf, maxCapacity, baseIntervalSeconds);
    openBlock(state, rawT);
    return;
  }

  const tokens = tokenizeLine(line);
  if (tokens.length === 0) {
    if (state.columns !== null) state.skippedLinesAfterHeader += 1;
    return;
  }

  const header = matchHeader(tokens);
  if (header) {
    ensureOpenBlock(state);
    state.columns = header;
    return;
  }

  if (!state.columns) {
    state.skippedLinesAfterHeader += 1;
    return;
  }

  if (!canReadRow(tokens, state.columns)) {
    state.skippedLinesAfterHeader += 1;
    return;
  }

  ensureOpenBlock(state);
  const dataRowIndex = state.blockDataRowIndex;
  state.blockDataRowIndex += 1;
  state.totalDataRowsInFile += 1;
  if (dataRowIndex % stepMultiple !== 0) return;

  readRow(bufRef.buf, tokens, state.columns, maxCapacity);
}

function countDataLine(state: ParseState, rawLine: string): void {
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  state.fileLineCount += 1;

  if (isSkippableLine(line)) return;

  const rawT = extractTimeMarkerFromLine(line);
  if (rawT !== null) {
    // blocks.length 를 t 마커 카운터로 재사용한다.
    state.blocks.push({
      timeIndex: state.blocks.length,
      timestampSeconds: 0,
      rawT,
      columns: {
        x: new Float32Array(0),
        y: new Float32Array(0),
        z: new Float32Array(0),
        u: new Float32Array(0),
        v: new Float32Array(0),
        w: new Float32Array(0),
        scrdif: new Float32Array(0),
        count: 0,
      },
    });
    state.hasOpenBlock = true;
    state.currentRawT = rawT;
    state.columns = null;
    state.blockDataRowIndex = 0;
    return;
  }

  const tokens = tokenizeLine(line);
  if (tokens.length === 0) return;

  if (!state.columns) {
    const header = matchHeader(tokens);
    if (header) {
      state.hasOpenBlock = true;
      state.columns = header;
    }
    return;
  }

  if (!canReadRow(tokens, state.columns)) return;
  state.totalDataRowsInFile += 1;
}

function finalizeCountState(state: ParseState): number {
  // t 마커가 있으면 그 수, 없으면 데이터/헤더가 있을 때 1블록.
  if (state.blocks.length > 0) return state.blocks.length;
  if (state.hasOpenBlock || state.totalDataRowsInFile > 0) return 1;
  return 0;
}

function buildDataset(
  state: ParseState,
  buf: ColumnBuffers,
  maxCapacity: number,
  parseStepMultiple: number,
  baseIntervalSeconds: number,
): SampleProbeDataset {
  if (!state.columns && state.blocks.length === 0 && buf.length === 0) {
    throw new Error(
      'parseSampleProbeCsv: "x y z u v w scrdif" 헤더 행을 찾을 수 없습니다.',
    );
  }

  finalizeOpenBlock(state, buf, maxCapacity, baseIntervalSeconds);

  // t 마커 없이 헤더+데이터만 있으면 finalizeOpenBlock 이 ensure 경로로 블록을 만들었을 수 있음.
  // 데이터가 있는데 블록이 비면 오류.
  const nonEmpty = state.blocks.filter((b) => b.columns.count > 0);
  if (nonEmpty.length === 0) {
    throw new Error('parseSampleProbeCsv: 유효한 데이터 행이 없습니다.');
  }

  // 빈 블록(연속 t 마커 등) 제거 후 timeIndex/timestamp 재부여
  const blocks = nonEmpty.map((block, timeIndex) => ({
    ...block,
    timeIndex,
    timestampSeconds: timeIndex * baseIntervalSeconds,
  }));

  const stats: SampleProbeParseStats = {
    fileLineCount: state.fileLineCount,
    dataRowCount: state.totalDataRowsInFile,
    timeBlockCount: blocks.length,
    skippedLinesAfterHeader: state.skippedLinesAfterHeader,
    parseStepMultiple,
  };

  const flatColumns = concatColumns(blocks.map((b) => b.columns));
  flatColumns.stats = stats;

  return {
    blocks,
    flatColumns,
    stats,
    baseIntervalSeconds,
  };
}

/** 텍스트에서 유효 데이터 행 수만 센다(열 버퍼 없음). */
export function countSampleProbeDataRowsText(text: string): number {
  const state = createParseState();
  for (const rawLine of text.split(/\r?\n/)) {
    countDataLine(state, rawLine);
  }
  if (!state.columns && state.totalDataRowsInFile === 0) {
    throw new Error(
      'parseSampleProbeCsv: "x y z u v w scrdif" 헤더 행을 찾을 수 없습니다.',
    );
  }
  return state.totalDataRowsInFile;
}

/** 텍스트에서 t 시간 블록 수를 센다. */
export function countSampleProbeTimeBlocksText(text: string): number {
  const state = createParseState();
  for (const rawLine of text.split(/\r?\n/)) {
    countDataLine(state, rawLine);
  }
  if (!state.columns && state.totalDataRowsInFile === 0 && state.blocks.length === 0) {
    throw new Error(
      'parseSampleProbeCsv: "x y z u v w scrdif" 헤더 행을 찾을 수 없습니다.',
    );
  }
  return finalizeCountState(state);
}

export interface CountSampleProbeRowsOptions {
  signal?: AbortSignal;
  onProgress?: (progress: {
    totalDataRows: number;
    timeBlockCount?: number;
    bytesRead: number;
    fileSize: number;
  }) => void;
}

async function streamCount(
  file: File,
  options: CountSampleProbeRowsOptions,
): Promise<ParseState> {
  const state = createParseState();
  const { signal } = options;
  let bytesRead = 0;
  const fileSize = file.size;
  let linesSinceYield = 0;

  const report = (): void => {
    options.onProgress?.({
      totalDataRows: state.totalDataRowsInFile,
      timeBlockCount: finalizeCountState(state),
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
  return state;
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
      timeBlockCount: countSampleProbeTimeBlocksText(text),
      bytesRead: text.length,
      fileSize: file.size,
    });
    return count;
  }

  const state = await streamCount(file, options);
  if (!state.columns && state.totalDataRowsInFile === 0) {
    throw new Error(
      'parseSampleProbeCsv: "x y z u v w scrdif" 헤더 행을 찾을 수 없습니다.',
    );
  }
  return state.totalDataRowsInFile;
}

/** File 에서 t 시간 블록 수를 센다. */
export async function countSampleProbeTimeBlocks(
  file: File,
  options: CountSampleProbeRowsOptions = {},
): Promise<number> {
  if (file.size <= STREAM_PARSE_MIN_BYTES) {
    const text = await readUploadFileText(file);
    const count = countSampleProbeTimeBlocksText(text);
    options.onProgress?.({
      totalDataRows: countSampleProbeDataRowsText(text),
      timeBlockCount: count,
      bytesRead: text.length,
      fileSize: file.size,
    });
    return count;
  }

  const state = await streamCount(file, options);
  if (!state.columns && state.totalDataRowsInFile === 0 && state.blocks.length === 0) {
    throw new Error(
      'parseSampleProbeCsv: "x y z u v w scrdif" 헤더 행을 찾을 수 없습니다.',
    );
  }
  return finalizeCountState(state);
}

/** sampledata.csv 텍스트에서 t 블록·x·y·z·u·v·w·scrdif 를 추출한다. */
export function parseSampleProbeCsvText(
  text: string,
  options: ParseSampleProbeOptions = {},
): SampleProbeDataset {
  const stepMultiple = resolveStepMultiple(options);
  const baseIntervalSeconds = resolveInterval(options);
  const maxCapacity = maxColumnCapacity(text.length, stepMultiple);
  const bufRef = { buf: createColumnBuffers(INITIAL_COLUMN_CAPACITY, maxCapacity) };
  const state = createParseState();

  for (const rawLine of text.split(/\r?\n/)) {
    processLine(bufRef, state, rawLine, maxCapacity, stepMultiple, baseIntervalSeconds);
  }

  const dataset = buildDataset(state, bufRef.buf, maxCapacity, stepMultiple, baseIntervalSeconds);

  options.onProgress?.({
    rowsParsed: dataset.flatColumns.count,
    totalDataRows: dataset.stats.dataRowCount,
    timeBlocksParsed: dataset.blocks.length,
    bytesRead: text.length,
    fileSize: text.length,
  });

  return dataset;
}

async function parseSampleProbeCsvStream(
  file: File,
  options: ParseSampleProbeOptions = {},
): Promise<SampleProbeDataset> {
  const stepMultiple = resolveStepMultiple(options);
  const baseIntervalSeconds = resolveInterval(options);
  const maxCapacity = maxColumnCapacity(file.size, stepMultiple);
  const bufRef = { buf: createColumnBuffers(INITIAL_COLUMN_CAPACITY, maxCapacity) };
  const state = createParseState();
  const { signal } = options;
  let bytesRead = 0;
  const fileSize = file.size;
  let linesSinceYield = 0;

  const report = (): void => {
    options.onProgress?.({
      rowsParsed: bufRef.buf.length + state.blocks.reduce((s, b) => s + b.columns.count, 0),
      totalDataRows: state.totalDataRowsInFile,
      timeBlocksParsed: state.blocks.length + (state.hasOpenBlock ? 1 : 0),
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
        processLine(bufRef, state, line, maxCapacity, stepMultiple, baseIntervalSeconds);
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
      processLine(bufRef, state, buffer, maxCapacity, stepMultiple, baseIntervalSeconds);
    }
  } finally {
    reader.releaseLock();
  }

  report();
  return buildDataset(state, bufRef.buf, maxCapacity, stepMultiple, baseIntervalSeconds);
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

/** File 을 읽어 sampledata 양식 t 블록·열을 추출한다. */
export async function parseSampleProbeCsvFile(
  file: File,
  options: ParseSampleProbeOptions = {},
): Promise<SampleProbeDataset> {
  if (file.size > STREAM_PARSE_MIN_BYTES) {
    return parseSampleProbeCsvStream(file, options);
  }
  const text = await readUploadFileText(file);
  return parseSampleProbeCsvText(text, options);
}

/** 테스트·폴백용: 단일 시점 블록으로 Dataset 을 만든다. */
export function datasetFromColumns(
  columns: SampleProbeColumns,
  options: { baseIntervalSeconds?: number; timestampSeconds?: number; rawT?: number | null } = {},
): SampleProbeDataset {
  const baseIntervalSeconds = Math.max(
    1,
    options.baseIntervalSeconds ?? DEFAULT_T_INTERVAL_SECONDS,
  );
  const stats: SampleProbeParseStats = columns.stats ?? {
    fileLineCount: columns.count + 1,
    dataRowCount: columns.count,
    timeBlockCount: 1,
    skippedLinesAfterHeader: 0,
    parseStepMultiple: 1,
  };
  const withStats: SampleProbeColumns = { ...columns, stats: { ...stats, timeBlockCount: 1 } };
  return {
    blocks: [
      {
        timeIndex: 0,
        timestampSeconds: options.timestampSeconds ?? 0,
        rawT: options.rawT ?? null,
        columns: withStats,
      },
    ],
    flatColumns: withStats,
    stats: { ...stats, timeBlockCount: 1 },
    baseIntervalSeconds,
  };
}

/** 여러 시점 블록으로 Dataset 을 만든다(테스트용). */
export function datasetFromTimeBlocks(
  blockColumns: SampleProbeColumns[],
  options: { baseIntervalSeconds?: number } = {},
): SampleProbeDataset {
  const baseIntervalSeconds = Math.max(
    1,
    options.baseIntervalSeconds ?? DEFAULT_T_INTERVAL_SECONDS,
  );
  if (blockColumns.length === 0) {
    throw new Error('datasetFromTimeBlocks: 최소 1개의 블록이 필요합니다.');
  }
  const blocks: SampleProbeTimeBlock[] = blockColumns.map((columns, timeIndex) => ({
    timeIndex,
    timestampSeconds: timeIndex * baseIntervalSeconds,
    rawT: timeIndex * baseIntervalSeconds,
    columns,
  }));
  const flatColumns = concatColumns(blocks.map((b) => b.columns));
  const stats: SampleProbeParseStats = {
    fileLineCount: flatColumns.count + blocks.length * 2,
    dataRowCount: flatColumns.count,
    timeBlockCount: blocks.length,
    skippedLinesAfterHeader: 0,
    parseStepMultiple: 1,
  };
  flatColumns.stats = stats;
  return { blocks, flatColumns, stats, baseIntervalSeconds };
}
