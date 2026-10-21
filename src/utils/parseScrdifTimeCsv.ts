import { throwIfAborted } from '@/utils/csvParseAbort';
import { readUploadFilePrefix, uploadFileByteStream } from '@/utils/readUploadFile';
import { yieldToMain } from '@/utils/yieldToMain';

/**
 * 경량화 CFD 결과 CSV(`x_m,y_m,t0000s,t0030s,…`) 파서.
 * 한 행 = 하상 격자점 1개, 시간 열 = 해당 시각의 scrdif(Δ표고, m).
 */

const X_HEADER = 'x_m';
const Y_HEADER = 'y_m';
const TIME_HEADER = /^t(\d+(?:\.\d+)?)s$/i;
const YIELD_EVERY_LINES = 4000;
const DETECT_PREFIX_BYTES = 4096;
const INITIAL_ROW_CAPACITY = 4096;

export interface ScrdifTimeDataset {
  /** 격자점 수. */
  count: number;
  x: Float32Array;
  y: Float32Array;
  /** 시간 열의 시각(초), 헤더 순서. */
  times: number[];
  /** 시간 열마다 길이 count 의 scrdif 배열. frames[t][row]. */
  frames: Float32Array[];
}

export interface ScrdifParseProgress {
  rowsParsed: number;
  bytesRead: number;
  fileSize: number;
}

export interface ParseScrdifTimeCsvOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ScrdifParseProgress) => void;
}

interface TimeColumn {
  csvIndex: number;
  seconds: number;
}

interface ParseState {
  header: { xIndex: number; yIndex: number; times: TimeColumn[] } | null;
  rowCapacity: number;
  count: number;
  x: Float32Array;
  y: Float32Array;
  /** row-major: values[row * timeCount + t] */
  values: Float32Array;
}

function createState(): ParseState {
  return {
    header: null,
    rowCapacity: 0,
    count: 0,
    x: new Float32Array(0),
    y: new Float32Array(0),
    values: new Float32Array(0),
  };
}

function stripBom(line: string): string {
  return line.charCodeAt(0) === 0xfeff ? line.slice(1) : line;
}

function tokenize(line: string): string[] {
  return stripBom(line).replace(/\r$/, '').split(',');
}

function matchHeader(tokens: string[]): ParseState['header'] {
  const names = tokens.map((t) => t.trim().toLowerCase());
  const xIndex = names.indexOf(X_HEADER);
  const yIndex = names.indexOf(Y_HEADER);
  if (xIndex < 0 || yIndex < 0) return null;
  const times: TimeColumn[] = [];
  names.forEach((name, csvIndex) => {
    const m = TIME_HEADER.exec(name);
    if (m) times.push({ csvIndex, seconds: Number(m[1]) });
  });
  if (times.length === 0) return null;
  return { xIndex, yIndex, times };
}

/** 텍스트 앞부분에 `x_m,y_m,tNNNNs…` 헤더가 있는지 판별한다. */
export function detectScrdifTimeCsv(sample: string): boolean {
  for (const raw of sample.split(/\r?\n/).slice(0, 20)) {
    if (raw.trim().length === 0) continue;
    return matchHeader(tokenize(raw)) !== null;
  }
  return false;
}

export async function isScrdifTimeCsv(file: File): Promise<boolean> {
  const prefix = await readUploadFilePrefix(file, Math.min(file.size, DETECT_PREFIX_BYTES));
  return detectScrdifTimeCsv(prefix);
}

function growRows(state: ParseState, timeCount: number): void {
  const nextCap = Math.max(INITIAL_ROW_CAPACITY, state.rowCapacity * 2);
  const x = new Float32Array(nextCap);
  const y = new Float32Array(nextCap);
  const values = new Float32Array(nextCap * timeCount);
  x.set(state.x.subarray(0, state.count));
  y.set(state.y.subarray(0, state.count));
  values.set(state.values.subarray(0, state.count * timeCount));
  state.x = x;
  state.y = y;
  state.values = values;
  state.rowCapacity = nextCap;
}

function processLine(state: ParseState, rawLine: string): void {
  if (rawLine.trim().length === 0) return;
  const tokens = tokenize(rawLine);

  if (!state.header) {
    const header = matchHeader(tokens);
    if (!header) {
      throw new Error('지원하지 않는 CSV 형식입니다. x_m, y_m, t0000s… 헤더가 필요합니다.');
    }
    state.header = header;
    return;
  }

  const { xIndex, yIndex, times } = state.header;
  const x = Number(tokens[xIndex]);
  const y = Number(tokens[yIndex]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  if (state.count >= state.rowCapacity) growRows(state, times.length);
  const row = state.count;
  state.x[row] = x;
  state.y[row] = y;
  const base = row * times.length;
  for (let t = 0; t < times.length; t += 1) {
    const v = Number(tokens[times[t].csvIndex]);
    state.values[base + t] = Number.isFinite(v) ? v : 0;
  }
  state.count += 1;
}

function finalize(state: ParseState): ScrdifTimeDataset {
  if (!state.header) {
    throw new Error('지원하지 않는 CSV 형식입니다. x_m, y_m, t0000s… 헤더가 필요합니다.');
  }
  if (state.count === 0) {
    throw new Error('CSV에 데이터 행이 없습니다.');
  }
  const { times } = state.header;
  const { count } = state;
  const frames = times.map(() => new Float32Array(count));
  for (let row = 0; row < count; row += 1) {
    const base = row * times.length;
    for (let t = 0; t < times.length; t += 1) {
      frames[t][row] = state.values[base + t];
    }
  }
  return {
    count,
    x: state.x.slice(0, count),
    y: state.y.slice(0, count),
    times: times.map((c) => c.seconds),
    frames,
  };
}

export function parseScrdifTimeCsvText(text: string): ScrdifTimeDataset {
  const state = createState();
  for (const line of text.split('\n')) processLine(state, line);
  return finalize(state);
}

/** File 을 스트리밍으로 읽어 파싱한다(진행률·중지 지원). */
export async function parseScrdifTimeCsvFile(
  file: File,
  options: ParseScrdifTimeCsvOptions = {},
): Promise<ScrdifTimeDataset> {
  const { signal, onProgress } = options;
  const state = createState();
  const fileSize = file.size;
  let bytesRead = 0;
  let linesSinceYield = 0;

  const report = (): void => onProgress?.({ rowsParsed: state.count, bytesRead, fileSize });

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
        processLine(state, buffer.slice(0, newlineIdx));
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
    if (buffer.length > 0) processLine(state, buffer);
  } finally {
    reader.releaseLock();
  }

  bytesRead = fileSize;
  report();
  return finalize(state);
}
