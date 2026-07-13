import type { ScourSeries, TerrainMetadata } from '@/types/terrain';
import { throwIfAborted } from '@/utils/csvParseAbort';
import { readUploadFileText } from '@/utils/readUploadFile';
import {
  type GridCsvLayout,
  parseGridCsvFromFile,
  probeGridCsv,
  resolveColumnarGridSize,
} from '@/utils/streamGridCsv';
import { yieldToMain } from '@/utils/yieldToMain';

export interface CsvScourMeta {
  width?: number;
  height?: number;
  depth?: number;
  cellSize?: number;
  intervalSeconds?: number;
  metadata?: TerrainMetadata;
}

export interface CsvLoadProgress {
  phase: 'classify' | 'meta' | 'terrain' | 'frame';
  message: string;
  fileName: string;
  fileIndex: number;
  fileCount: number;
  bytesRead: number;
  fileSize: number;
  rowsParsed?: number;
  totalRows?: number;
}

export interface LoadScourFromCsvOptions {
  meta?: CsvScourMeta;
  defaultCellSize?: number;
  defaultIntervalSeconds?: number;
  onProgress?: (progress: CsvLoadProgress) => void;
  signal?: AbortSignal;
}

interface ClassifiedCsvFiles {
  metaFile: File | null;
  terrainFile: File;
  frameFiles: File[];
}

const DEFAULT_CELL_SIZE = 1;
const DEFAULT_INTERVAL_SECONDS = 1;
/** terrain 파일 probe 단계가 같은 파일 parse 진행률에 차지하는 비율 */
const TERRAIN_PROBE_PROGRESS_WEIGHT = 0.25;

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function frameSortKey(name: string): number {
  const base = basename(name).replace(/\.csv$/i, '');
  const match = base.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

function isTerrainCsv(name: string): boolean {
  return /terrain/i.test(basename(name));
}

function isFrameCsv(name: string): boolean {
  return /frame/i.test(basename(name));
}

function classifyCsvFiles(files: File[]): ClassifiedCsvFiles {
  const csvFiles = files.filter((f) => /\.csv$/i.test(f.name));
  if (csvFiles.length === 0) {
    throw new Error('CSV 파일(.csv)을 하나 이상 선택해 주세요.');
  }

  const metaFile = files.find((f) => /meta\.json$/i.test(basename(f.name))) ?? null;
  const terrainCandidates = csvFiles.filter((f) => isTerrainCsv(f.name));
  const frameFiles = csvFiles
    .filter((f) => isFrameCsv(f.name))
    .sort((a, b) => frameSortKey(a.name) - frameSortKey(b.name) || a.name.localeCompare(b.name));

  let terrainFile: File | undefined;
  if (terrainCandidates.length > 0) {
    terrainFile = terrainCandidates[0];
  } else if (frameFiles.length > 0) {
    const frameSet = new Set(frameFiles);
    terrainFile = csvFiles.find((f) => !frameSet.has(f));
  } else {
    terrainFile = csvFiles[0];
  }

  if (!terrainFile) {
    throw new Error('terrain CSV 파일을 찾을 수 없습니다.');
  }

  const terrainSet = new Set([terrainFile]);
  const remainingFrames = csvFiles
    .filter((f) => !terrainSet.has(f) && !isTerrainCsv(f.name))
    .sort((a, b) => frameSortKey(a.name) - frameSortKey(b.name) || a.name.localeCompare(b.name));

  const mergedFrames = frameFiles.length > 0 ? frameFiles : remainingFrames;

  return { metaFile, terrainFile, frameFiles: mergedFrames };
}

async function readJsonFile<T>(file: File): Promise<T> {
  const text = await readUploadFileText(file);
  return JSON.parse(text) as T;
}

async function resolveGridFromFile(
  file: File,
  meta: CsvScourMeta,
  options: LoadScourFromCsvOptions,
  fileIndex: number,
  fileCount: number,
): Promise<{ width: number; height: number; layout: GridCsvLayout }> {
  throwIfAborted(options.signal);

  onProgressSafe(options, {
    phase: 'terrain',
    message: 'CSV 형식 분석 중…',
    fileName: file.name,
    fileIndex,
    fileCount,
    bytesRead: 0,
    fileSize: file.size,
  });

  const probeOpts: Parameters<typeof probeGridCsv>[1] = {
    onProgress: ({ bytesRead, fileSize }) => {
      onProgressSafe(options, {
        phase: 'terrain',
        message: 'CSV 형식 분석 중…',
        fileName: file.name,
        fileIndex,
        fileCount,
        bytesRead: bytesRead * TERRAIN_PROBE_PROGRESS_WEIGHT,
        fileSize,
      });
    },
  };
  if (options.signal) {
    probeOpts.signal = options.signal;
  }

  const probe = await probeGridCsv(file, probeOpts);

  if (probe.layout === 'columnar') {
    const dims = resolveColumnarGridSize(probe.valueCount, meta);
    return { ...dims, layout: 'columnar' };
  }

  return {
    width: meta.width ?? probe.matrixWidth,
    height: meta.height ?? probe.matrixHeight,
    layout: 'matrix',
  };
}

async function parseGridFile(
  file: File,
  width: number,
  height: number,
  layout: GridCsvLayout,
  phase: CsvLoadProgress['phase'],
  fileIndex: number,
  fileCount: number,
  options: LoadScourFromCsvOptions,
  probeWeighted = false,
): Promise<Float32Array> {
  throwIfAborted(options.signal);
  const parseOpts: Parameters<typeof parseGridCsvFromFile>[3] = {
    layout,
    onProgress: (p) => {
      const weightedBytes = probeWeighted
        ? p.fileSize * TERRAIN_PROBE_PROGRESS_WEIGHT +
          p.bytesRead * (1 - TERRAIN_PROBE_PROGRESS_WEIGHT)
        : p.bytesRead;
      onProgressSafe(options, {
        phase,
        message: `${basename(file.name)} 파싱 중…`,
        fileName: file.name,
        fileIndex,
        fileCount,
        bytesRead: weightedBytes,
        fileSize: p.fileSize,
        rowsParsed: p.rowsParsed,
        totalRows: p.totalRows,
      });
    },
  };
  if (options.signal) {
    parseOpts.signal = options.signal;
  }
  return parseGridCsvFromFile(file, width, height, parseOpts);
}

/**
 * terrain.csv + frames/*.csv (+ 선택적 meta.json) 업로드를 ScourSeries 로 변환한다.
 * 각 CSV 는 스트리밍 파싱되어 원문 문자열을 메모리에 적재하지 않는다.
 */
export async function loadScourFromCsvFiles(
  files: FileList | File[],
  options: LoadScourFromCsvOptions = {},
): Promise<ScourSeries> {
  throwIfAborted(options.signal);

  const fileArray = Array.from(files);
  onProgressSafe(options, {
    phase: 'classify',
    message: '파일 분류 중…',
    fileName: '',
    fileIndex: 0,
    fileCount: fileArray.length,
    bytesRead: 0,
    fileSize: 0,
  });

  const classified = classifyCsvFiles(fileArray);
  let meta: CsvScourMeta = { ...options.meta };

  if (classified.metaFile) {
    throwIfAborted(options.signal);
    onProgressSafe(options, {
      phase: 'meta',
      message: 'meta.json 읽는 중…',
      fileName: classified.metaFile.name,
      fileIndex: 0,
      fileCount: 1,
      bytesRead: 0,
      fileSize: classified.metaFile.size,
    });
    const parsed = await readJsonFile<CsvScourMeta>(classified.metaFile);
    throwIfAborted(options.signal);
    meta = { ...parsed, ...meta };
  }

  const totalFiles = 1 + classified.frameFiles.length;
  const grid = await resolveGridFromFile(
    classified.terrainFile,
    meta,
    options,
    0,
    totalFiles,
  );
  const { width, height, layout } = grid;
  const cellSize = meta.cellSize ?? options.defaultCellSize ?? DEFAULT_CELL_SIZE;
  const intervalSeconds =
    meta.intervalSeconds ?? options.defaultIntervalSeconds ?? DEFAULT_INTERVAL_SECONDS;

  const elevations = await parseGridFile(
    classified.terrainFile,
    width,
    height,
    layout,
    'terrain',
    0,
    totalFiles,
    options,
    true,
  );

  await yieldToMain();

  const frames = [];
  for (let i = 0; i < classified.frameFiles.length; i += 1) {
    throwIfAborted(options.signal);
    await yieldToMain();
    const frameFile = classified.frameFiles[i];
    const deltaElevations = await parseGridFile(
      frameFile,
      width,
      height,
      layout,
      'frame',
      i + 1,
      totalFiles,
      options,
    );
    frames.push({
      timestampSeconds: i * intervalSeconds,
      deltaElevations,
    });
  }

  return {
    baseTerrain: {
      width,
      height,
      cellSize,
      elevations,
      ...(meta.metadata ? { metadata: meta.metadata } : {}),
    },
    frames,
  };
}

function onProgressSafe(
  options: LoadScourFromCsvOptions,
  progress: CsvLoadProgress,
): void {
  options.onProgress?.(progress);
}
