import { throwIfAborted } from '@/utils/csvParseAbort';
import { readUploadFilePrefix, uploadFileByteStream } from '@/utils/readUploadFile';
import { detectFlow3dFlsconCsv } from '@/utils/parseFlow3dFlsconCsv';
import {
  discoverXyzCsvLayout,
  inferXyzLayoutFromDataRow,
  isIntegerCoord,
  parseXyzCsvHeader,
  stripBom,
  type XyzCsvColumnLayout,
} from '@/utils/flow3dXyzColumns';
import { tokenizeGridLine } from '@/utils/gridCsvTokens';
import { isSkippableCsvLine } from '@/utils/streamGridCsv';
import { yieldToMain } from '@/utils/yieldToMain';
import type { ParsedFlow3dVariable } from '@/utils/parseFlow3dVariableCsv';
import { FLOW3D_VARIABLE_DEFS } from '@/data/flow3dVariableDefs';
import { fluidIndex } from '@/types/fluid';
import type { Flow3dGridMeta } from '@/data/buildSeriesFromFlow3dCsv';

const YIELD_EVERY_LINES = 64;

export interface Flow3dXyzCsvProgress {
  bytesRead: number;
  fileSize: number;
  rowsParsed: number;
  totalRows: number;
}

export interface Flow3dXyzGridMeta extends Flow3dGridMeta {
  originX?: number;
  originY?: number;
  originZ?: number;
}

export interface ParseFlow3dXyzCsvOptions {
  signal?: AbortSignal;
  onProgress?: (p: Flow3dXyzCsvProgress) => void;
  meta?: Flow3dXyzGridMeta;
}

interface XyzProbeState {
  layout: XyzCsvColumnLayout;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  rowCount: number;
  integerCoords: boolean;
}

type CoordMode = 'index' | 'world';

interface ResolvedXyzGrid {
  width: number;
  height: number;
  depth: number;
  coordMode: CoordMode;
}

function resolveGridFromProbe(probe: XyzProbeState, meta: Flow3dXyzGridMeta): ResolvedXyzGrid {
  if (probe.integerCoords) {
    return {
      width: meta.width ?? Math.round(probe.maxX) + 1,
      height: meta.height ?? Math.round(probe.maxY) + 1,
      depth: meta.depth ?? Math.round(probe.maxZ) + 1,
      coordMode: 'index',
    };
  }

  if (meta.width !== undefined && meta.height !== undefined) {
    return {
      width: meta.width,
      height: meta.height,
      depth: meta.depth ?? 1,
      coordMode: 'world',
    };
  }

  const cs = meta.cellSize ?? 1;
  return {
    width: Math.max(1, Math.round((probe.maxX - probe.minX) / cs) + 1),
    height: Math.max(1, Math.round((probe.maxY - probe.minY) / cs) + 1),
    depth: Math.max(1, Math.round((probe.maxZ - probe.minZ) / cs) + 1),
    coordMode: 'world',
  };
}

function coordsToCell(
  x: number,
  y: number,
  z: number,
  grid: ResolvedXyzGrid,
  meta: Flow3dXyzGridMeta,
  bounds: Pick<XyzProbeState, 'minX' | 'minY' | 'minZ'>,
): number | null {
  let ix: number;
  let iy: number;
  let iz: number;

  if (grid.coordMode === 'index') {
    ix = Math.round(x);
    iy = Math.round(y);
    iz = Math.round(z);
  } else {
    const cs = meta.cellSize ?? 1;
    const ox = meta.originX ?? bounds.minX;
    const oy = meta.originY ?? bounds.minY;
    const oz = meta.originZ ?? bounds.minZ;
    ix = Math.round((x - ox) / cs);
    iy = Math.round((y - oy) / cs);
    iz = Math.round((z - oz) / cs);
  }

  if (ix < 0 || ix >= grid.width || iy < 0 || iy >= grid.height || iz < 0 || iz >= grid.depth) {
    return null;
  }
  return fluidIndex(
    { width: grid.width, height: grid.height, depth: grid.depth, cellSize: meta.cellSize ?? 1 },
    ix,
    iy,
    iz,
  );
}

function parseRowCoords(
  tokens: string[],
  layout: XyzCsvColumnLayout,
): { x: number; y: number; z: number } | null {
  const x = Number(tokens[layout.xCol]);
  const y = Number(tokens[layout.yCol]);
  const z = Number(tokens[layout.zCol]);
  if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) return null;
  return { x, y, z };
}

function updateProbe(probe: XyzProbeState, x: number, y: number, z: number): void {
  probe.rowCount += 1;
  probe.minX = Math.min(probe.minX, x);
  probe.minY = Math.min(probe.minY, y);
  probe.minZ = Math.min(probe.minZ, z);
  probe.maxX = Math.max(probe.maxX, x);
  probe.maxY = Math.max(probe.maxY, y);
  probe.maxZ = Math.max(probe.maxZ, z);
  if (!isIntegerCoord(x) || !isIntegerCoord(y) || !isIntegerCoord(z)) {
    probe.integerCoords = false;
  }
}

/** 첫 수 KB 를 읽어 x·y·z 좌표 + 유체량 열 CSV 인지 판별한다. */
export async function isFlow3dXyzCsv(file: File): Promise<boolean> {
  const sample = await readUploadFilePrefix(file, 256 * 1024);
  if (detectFlow3dFlsconCsv(sample)) return false;
  return discoverXyzCsvLayout(sample.split(/\r?\n/)) !== null;
}

async function findHeaderLayout(
  file: File,
  signal?: AbortSignal,
): Promise<XyzCsvColumnLayout> {
  const maxScan = Math.min(file.size, 2 * 1024 * 1024);
  const sample = await readUploadFilePrefix(file, maxScan);
  throwIfAborted(signal);

  const layout = discoverXyzCsvLayout(sample.split(/\r?\n/));
  if (layout) return layout;

  if (file.size > maxScan) {
    const layoutFromStream = await findHeaderLayoutStreaming(file, signal);
    if (layoutFromStream) return layoutFromStream;
  }

  throw new Error(
    'parseFlow3dXyzCsv: x·y·z 좌표 헤더 행을 찾을 수 없습니다. ' +
      '첫 줄에 x,y,z 열 이름(또는 X좌표,Y좌표,Z좌표)과 유체량 열이 있어야 합니다.',
  );
}

/** 앞부분 2MB 에 없으면 스트리밍으로 헤더를 더 찾는다. */
async function findHeaderLayoutStreaming(
  file: File,
  signal?: AbortSignal,
): Promise<XyzCsvColumnLayout | null> {
  const reader = uploadFileByteStream(file).pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let lineBudget = 5000;

  try {
    while (lineBudget > 0) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;

      let newlineIdx = buffer.indexOf('\n');
      while (newlineIdx !== -1 && lineBudget > 0) {
        const raw = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        newlineIdx = buffer.indexOf('\n');
        lineBudget -= 1;

        if (isSkippableCsvLine(raw)) continue;
        const tokens = tokenizeGridLine(stripBom(raw.trim()));
        if (tokens.length === 0) continue;

        const header = parseXyzCsvHeader(tokens);
        if (header) return header;

        const inferred = inferXyzLayoutFromDataRow(tokens);
        if (inferred) return inferred;
      }
    }
  } finally {
    void reader.cancel();
    reader.releaseLock();
  }

  return null;
}

async function probeXyzCsv(
  file: File,
  layout: XyzCsvColumnLayout,
  options: ParseFlow3dXyzCsvOptions,
): Promise<XyzProbeState> {
  const probe: XyzProbeState = {
    layout,
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
    rowCount: 0,
    integerCoords: true,
  };

  const reader = uploadFileByteStream(file).pipeThrough(new TextDecoderStream()).getReader();
  const signal = options.signal;
  let buffer = '';
  let bytesRead = 0;
  let headerPassed = layout.headerless === true;
  let linesSinceYield = 0;

  const onAbort = (): void => {
    void reader.cancel();
  };
  signal?.addEventListener('abort', onAbort);

  const report = (): void => {
    options.onProgress?.({
      bytesRead,
      fileSize: file.size,
      rowsParsed: probe.rowCount,
      totalRows: probe.rowCount,
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

        if (!headerPassed) {
          const tokens = tokenizeGridLine(stripBom(line));
          if (parseXyzCsvHeader(tokens)) {
            headerPassed = true;
            newlineIdx = buffer.indexOf('\n');
            continue;
          }
          newlineIdx = buffer.indexOf('\n');
          continue;
        }

        if (!isSkippableCsvLine(line)) {
          const coords = parseRowCoords(tokenizeGridLine(line), layout);
          if (coords) updateProbe(probe, coords.x, coords.y, coords.z);
        }

        linesSinceYield += 1;
        if (linesSinceYield >= YIELD_EVERY_LINES) {
          linesSinceYield = 0;
          report();
          await yieldToMain();
        }
        newlineIdx = buffer.indexOf('\n');
      }
      report();
      await yieldToMain();
    }

    if (headerPassed && buffer.length > 0 && !isSkippableCsvLine(buffer)) {
      const coords = parseRowCoords(tokenizeGridLine(buffer), layout);
      if (coords) updateProbe(probe, coords.x, coords.y, coords.z);
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }

  if (probe.rowCount === 0) {
    throw new Error('parseFlow3dXyzCsv: 유효한 x·y·z 데이터 행이 없습니다.');
  }

  return probe;
}

function estimateCellSize(probe: XyzProbeState, grid: ResolvedXyzGrid): number {
  if (probe.integerCoords) return 1;
  const spanX = grid.width > 1 ? (probe.maxX - probe.minX) / (grid.width - 1) : 1;
  const spanY = grid.height > 1 ? (probe.maxY - probe.minY) / (grid.height - 1) : 1;
  const spanZ = grid.depth > 1 ? (probe.maxZ - probe.minZ) / (grid.depth - 1) : 1;
  const span = Math.min(spanX, spanY, spanZ);
  return Number.isFinite(span) && span > 0 ? span : 1;
}

function buildResolvedMeta(
  probe: XyzProbeState,
  grid: ResolvedXyzGrid,
  meta: Flow3dXyzGridMeta,
): Flow3dXyzGridMeta & {
  width: number;
  height: number;
  depth: number;
  cellSize: number;
} {
  const cellSize = meta.cellSize ?? estimateCellSize(probe, grid);
  const originX = meta.originX ?? (grid.coordMode === 'index' ? 0 : probe.minX);
  const originY = meta.originY ?? (grid.coordMode === 'index' ? 0 : probe.minY);
  const originZ = meta.originZ ?? (grid.coordMode === 'index' ? 0 : probe.minZ);
  return {
    ...meta,
    width: grid.width,
    height: grid.height,
    depth: grid.depth,
    cellSize,
    originX,
    originY,
    originZ,
  };
}

export interface Flow3dXyzParseResult {
  variables: ParsedFlow3dVariable[];
  resolvedMeta: Flow3dXyzGridMeta & {
    width: number;
    height: number;
    depth: number;
    cellSize: number;
  };
}

/**
 * x·y·z 좌표 + 유체량 열 CSV 를 3D 격자 변수로 파싱한다.
 * 각 행: x, y, z, ux, vy, vz, …
 */
export async function parseFlow3dXyzCsv(
  file: File,
  options: ParseFlow3dXyzCsvOptions = {},
): Promise<Flow3dXyzParseResult> {
  throwIfAborted(options.signal);
  const meta = options.meta ?? {};
  const layout = await findHeaderLayout(file, options.signal);
  const probe = await probeXyzCsv(file, layout, options);
  const grid = resolveGridFromProbe(probe, meta);
  const cellCount = grid.width * grid.height * grid.depth;

  const buffers = new Map<string, Float32Array>();
  const labels = new Map<string, string>();
  for (const col of layout.variableCols) {
    buffers.set(col.id, new Float32Array(cellCount));
    labels.set(col.id, col.label);
  }

  const reader = uploadFileByteStream(file).pipeThrough(new TextDecoderStream()).getReader();
  const signal = options.signal;
  let buffer = '';
  let bytesRead = 0;
  let headerPassed = false;
  let rowsParsed = 0;
  let linesSinceYield = 0;

  const onAbort = (): void => {
    void reader.cancel();
  };
  signal?.addEventListener('abort', onAbort);

  const report = (): void => {
    options.onProgress?.({
      bytesRead,
      fileSize: file.size,
      rowsParsed,
      totalRows: probe.rowCount,
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

        if (!headerPassed) {
          const tokens = tokenizeGridLine(stripBom(line));
          if (parseXyzCsvHeader(tokens)) {
            headerPassed = true;
            newlineIdx = buffer.indexOf('\n');
            continue;
          }
          newlineIdx = buffer.indexOf('\n');
          continue;
        }

        if (!isSkippableCsvLine(line)) {
          const tokens = tokenizeGridLine(line);
          const coords = parseRowCoords(tokens, layout);
          if (coords) {
            const cell = coordsToCell(coords.x, coords.y, coords.z, grid, meta, probe);
            if (cell !== null) {
              for (const col of layout.variableCols) {
                const v = Number(tokens[col.col]);
                if (!Number.isNaN(v)) {
                  buffers.get(col.id)![cell] = v;
                }
              }
            }
            rowsParsed += 1;
          }
        }

        linesSinceYield += 1;
        if (linesSinceYield >= YIELD_EVERY_LINES) {
          linesSinceYield = 0;
          report();
          await yieldToMain();
        }
        newlineIdx = buffer.indexOf('\n');
      }
      report();
      await yieldToMain();
    }

    if (headerPassed && buffer.length > 0 && !isSkippableCsvLine(buffer)) {
      const line = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
      const tokens = tokenizeGridLine(line);
      const coords = parseRowCoords(tokens, layout);
      if (coords) {
        const cell = coordsToCell(coords.x, coords.y, coords.z, grid, meta, probe);
        if (cell !== null) {
          for (const col of layout.variableCols) {
            const v = Number(tokens[col.col]);
            if (!Number.isNaN(v)) {
              buffers.get(col.id)![cell] = v;
            }
          }
        }
        rowsParsed += 1;
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }

  const result: ParsedFlow3dVariable[] = [];
  for (const [id, values] of buffers) {
    result.push({
      id,
      label: labels.get(id) ?? id,
      unit: FLOW3D_VARIABLE_DEFS[id]?.defaultUnit ?? '',
      values,
    });
  }

  if (result.length === 0) {
    throw new Error('parseFlow3dXyzCsv: 인식된 유체량 열이 없습니다.');
  }

  result.sort((a, b) => a.id.localeCompare(b.id));
  const resolvedMeta = buildResolvedMeta(probe, grid, meta);
  return { variables: result, resolvedMeta };
}
