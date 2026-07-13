import { FLUME } from '@/constants/experiment';
import type { FluidSeries } from '@/types/fluid';
import type { ScourSeries } from '@/types/terrain';
import { buildSeriesFromFlow3dVariables } from '@/data/buildSeriesFromFlow3dCsv';
import type { Flow3dGridMeta } from '@/data/buildSeriesFromFlow3dCsv';
import {
  buildScourSeriesFromScrdifColumns,
  buildSeriesFromScrdifColumns,
} from '@/data/buildSeriesFromScrdifCsv';
import { loadScourFromCsvFiles, type CsvLoadProgress, type CsvScourMeta } from '@/data/loadScourFromCsvFiles';
import type { ParsedFlow3dVariable } from '@/utils/parseFlow3dVariableCsv';
import { isFlow3dVariableCsv, parseFlow3dVariableCsv } from '@/utils/parseFlow3dVariableCsv';
import { isFlow3dFlsconCsv, parseFlow3dFlsconCsv } from '@/utils/parseFlow3dFlsconCsv';
import {
  isFlow3dScrdifCsv,
  parseFlow3dScrdifCsvFile,
  type Flow3dScrdifColumns,
} from '@/utils/parseFlow3dScrdifCsv';
import { isFlow3dXyzCsv, parseFlow3dXyzCsv } from '@/utils/parseFlow3dXyzCsv';
import { throwIfAborted } from '@/utils/csvParseAbort';
import { readUploadFileText } from '@/utils/readUploadFile';

export interface CsvDashboardLoadResult {
  scour: ScourSeries | null;
  fluid: FluidSeries | null;
  variables: ParsedFlow3dVariable[];
  /** x·y·z·u·v·w·scrdif 원본 행 (해당 형식일 때만). */
  scrdifColumns?: Flow3dScrdifColumns | null;
}

export interface LoadCsvDashboardOptions {
  meta?: CsvScourMeta & Flow3dGridMeta;
  defaultCellSize?: number;
  defaultIntervalSeconds?: number;
  /** 퇴적물 표면 위 초기 수심(m). 기본 FLUME.waterDepthM(0.15). */
  defaultWaterDepth?: number;
  onProgress?: (progress: CsvLoadProgress) => void;
  signal?: AbortSignal;
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

const SCRDIF_MEMORY_LIMIT_MESSAGE =
  '파일이 너무 커서 브라우저 메모리 한도를 초과했습니다. 더 작은 CSV로 나누거나 flscon/격자 형식을 사용해 주세요.';

function rethrowScrdifBuildMemoryError(err: unknown): never {
  if (err instanceof RangeError) {
    throw new Error(SCRDIF_MEMORY_LIMIT_MESSAGE);
  }
  if (err instanceof Error && /out of memory|allocation failed|Array buffer allocation/i.test(err.message)) {
    throw new Error(SCRDIF_MEMORY_LIMIT_MESSAGE);
  }
  throw err;
}

function buildScrdifDashboardSeries(
  scrdifColumns: Flow3dScrdifColumns,
  meta: Flow3dGridMeta & CsvScourMeta,
): {
  built: ReturnType<typeof buildSeriesFromScrdifColumns>;
  scour: ScourSeries | null;
} {
  try {
    const built = buildSeriesFromScrdifColumns(scrdifColumns, meta);
    const scour = buildScourSeriesFromScrdifColumns(scrdifColumns, meta) ?? built.scour;
    return { built, scour };
  } catch (err: unknown) {
    rethrowScrdifBuildMemoryError(err);
  }
}

interface ClassifiedCsvPrimary {
  primary: File;
  isScrdif: boolean;
  isFlscon: boolean;
  isXyz: boolean;
  isFlow3d: boolean;
}

/** 여러 CSV 중 scrdif·flscon·x·y·z·다변수 형식 파일을 우선 선택한다. */
async function classifyPrimaryCsv(csvFiles: File[]): Promise<ClassifiedCsvPrimary> {
  for (const file of csvFiles) {
    if (await isFlow3dScrdifCsv(file)) {
      return { primary: file, isScrdif: true, isFlscon: false, isXyz: false, isFlow3d: false };
    }
  }
  for (const file of csvFiles) {
    if (await isFlow3dFlsconCsv(file)) {
      return { primary: file, isScrdif: false, isFlscon: true, isXyz: false, isFlow3d: false };
    }
  }
  for (const file of csvFiles) {
    if (await isFlow3dXyzCsv(file)) {
      return { primary: file, isScrdif: false, isFlscon: false, isXyz: true, isFlow3d: false };
    }
  }
  for (const file of csvFiles) {
    if (await isFlow3dVariableCsv(file)) {
      return { primary: file, isScrdif: false, isFlscon: false, isXyz: false, isFlow3d: true };
    }
  }
  return { primary: csvFiles[0], isScrdif: false, isFlscon: false, isXyz: false, isFlow3d: false };
}

/**
 * CSV 업로드 통합 로더.
 * FLOW-3D flscon·다변수·x·y·z 형식이면 해당 파서, 아니면 terrain/frame 격자 파싱.
 */
export async function loadCsvDashboard(
  files: FileList | File[],
  options: LoadCsvDashboardOptions = {},
): Promise<CsvDashboardLoadResult> {
  throwIfAborted(options.signal);
  const fileArray = Array.from(files);
  const csvFiles = fileArray.filter((f) => /\.csv$/i.test(f.name));
  if (csvFiles.length === 0) {
    throw new Error('CSV 파일(.csv)을 하나 이상 선택해 주세요.');
  }

  const { primary, isScrdif, isFlscon, isXyz, isFlow3d } = await classifyPrimaryCsv(csvFiles);
  options.onProgress?.({
    phase: 'classify',
    message: isScrdif
      ? 'x·y·z·u·v·w·scrdif CSV 확인됨…'
      : 'CSV 형식 확인 중…',
    fileName: primary.name,
    fileIndex: 0,
    fileCount: 1,
    bytesRead: 0,
    fileSize: primary.size,
  });

  let meta: Flow3dGridMeta & CsvScourMeta = {
    cellSize: options.defaultCellSize ?? FLUME.fluidCellSize,
    waterDepth: options.defaultWaterDepth ?? FLUME.waterDepthM,
    ...options.meta,
  };
  const metaFile = fileArray.find((f) => /meta\.json$/i.test(basename(f.name)));
  if (metaFile) {
    try {
      const text = await readUploadFileText(metaFile);
      meta = { ...JSON.parse(text), ...meta };
    } catch {
      throw new Error(`meta.json 파싱 실패: ${metaFile.name}`);
    }
  }

  if (isScrdif) {
    options.onProgress?.({
      phase: 'terrain',
      message: 'x·y·z·u·v·w·scrdif 원본 행 파싱 중…',
      fileName: primary.name,
      fileIndex: 0,
      fileCount: 1,
      bytesRead: 0,
      fileSize: primary.size,
    });

    const scrdifParseOpts: Parameters<typeof parseFlow3dScrdifCsvFile>[1] = {
      onProgress: (p) => {
        options.onProgress?.({
          phase: 'terrain',
          message: 'x·y·z·u·v·w·scrdif 원본 행 파싱 중…',
          fileName: primary.name,
          fileIndex: 0,
          fileCount: 1,
          bytesRead: p.bytesRead,
          fileSize: p.fileSize,
          rowsParsed: p.rowsParsed,
        });
      },
    };
    if (options.signal) scrdifParseOpts.signal = options.signal;

    const scrdifColumns = await parseFlow3dScrdifCsvFile(primary, scrdifParseOpts);
    options.onProgress?.({
      phase: 'terrain',
      message: '원본 행 파싱 완료 · 격자 조립 중…',
      fileName: primary.name,
      fileIndex: 0,
      fileCount: 1,
      bytesRead: primary.size,
      fileSize: primary.size,
      rowsParsed: scrdifColumns.count,
      totalRows: scrdifColumns.count,
    });

    const { built, scour } = buildScrdifDashboardSeries(scrdifColumns, meta);
    if (built.fluid) {
      built.fluid.metadata = {
        ...built.fluid.metadata,
        simulationId: 'flow3d-scrdif-csv',
      };
    }
    return {
      scour,
      fluid: built.fluid,
      variables: built.variables,
      scrdifColumns,
    };
  }

  if (isXyz) {
    options.onProgress?.({
      phase: 'terrain',
      message: 'x·y·z 좌표 CSV 파싱 중…',
      fileName: primary.name,
      fileIndex: 0,
      fileCount: 1,
      bytesRead: 0,
      fileSize: primary.size,
    });

    const xyzParseOpts: Parameters<typeof parseFlow3dXyzCsv>[1] = {
      meta,
      onProgress: (p) => {
        options.onProgress?.({
          phase: 'terrain',
          message: 'x·y·z 좌표 유체량 파싱 중…',
          fileName: primary.name,
          fileIndex: 0,
          fileCount: 1,
          bytesRead: p.bytesRead,
          fileSize: p.fileSize,
          rowsParsed: p.rowsParsed,
          totalRows: p.totalRows,
        });
      },
    };
    if (options.signal) xyzParseOpts.signal = options.signal;

    const { variables, resolvedMeta } = await parseFlow3dXyzCsv(primary, xyzParseOpts);
    const built = buildSeriesFromFlow3dVariables(variables, resolvedMeta);
    if (built.fluid) {
      built.fluid.metadata = {
        ...built.fluid.metadata,
        simulationId: 'flow3d-xyz-csv',
      };
    }
    return {
      scour: built.scour,
      fluid: built.fluid,
      variables: built.variables,
    };
  }

  if (isFlscon) {
    options.onProgress?.({
      phase: 'terrain',
      message: 'FLOW-3D flscon CSV 파싱 중…',
      fileName: primary.name,
      fileIndex: 0,
      fileCount: 1,
      bytesRead: 0,
      fileSize: primary.size,
    });

    const flsconParseOpts: Parameters<typeof parseFlow3dFlsconCsv>[1] = {
      onProgress: (p) => {
        options.onProgress?.({
          phase: 'terrain',
          message: `flscon 파싱 중… (${p.currentVariable || '—'})`,
          fileName: primary.name,
          fileIndex: 0,
          fileCount: 1,
          bytesRead: p.bytesRead,
          fileSize: p.fileSize,
          rowsParsed: p.rowsParsed ?? p.valuesParsed,
          ...(p.totalCells !== undefined ? { totalRows: p.totalCells } : {}),
        });
      },
    };
    if (options.signal) flsconParseOpts.signal = options.signal;

    const { variables, gridMeta } = await parseFlow3dFlsconCsv(primary, flsconParseOpts);
    meta = { ...gridMeta, ...meta };
    const built = buildSeriesFromFlow3dVariables(variables, meta);
    if (built.fluid) {
      built.fluid.metadata = {
        ...built.fluid.metadata,
        simulationId: 'flow3d-flscon-csv',
      };
    }
    return {
      scour: built.scour,
      fluid: built.fluid,
      variables: built.variables,
    };
  }

  if (isFlow3d) {
    options.onProgress?.({
      phase: 'terrain',
      message: 'FLOW-3D 변수 CSV 파싱 중…',
      fileName: primary.name,
      fileIndex: 0,
      fileCount: 1,
      bytesRead: 0,
      fileSize: primary.size,
    });

    const cellCount =
      meta.width !== undefined && meta.height !== undefined
        ? meta.width * meta.height * (meta.depth ?? 1)
        : undefined;

    const parseOpts: Parameters<typeof parseFlow3dVariableCsv>[1] = {
      onProgress: (p) => {
        options.onProgress?.({
          phase: 'terrain',
          message: `변수 파싱 중… (${p.currentVariable || '—'})`,
          fileName: primary.name,
          fileIndex: 0,
          fileCount: 1,
          bytesRead: p.bytesRead,
          fileSize: p.fileSize,
          rowsParsed: p.valuesParsed,
          ...(cellCount !== undefined ? { totalRows: cellCount } : {}),
        });
      },
    };
    if (options.signal) parseOpts.signal = options.signal;
    if (cellCount !== undefined) parseOpts.expectedCellCount = cellCount;

    const variables = await parseFlow3dVariableCsv(primary, parseOpts);
    const built = buildSeriesFromFlow3dVariables(variables, meta);
    return {
      scour: built.scour,
      fluid: built.fluid,
      variables: built.variables,
    };
  }

  const scour = await loadScourFromCsvFiles(fileArray, options);
  return { scour, fluid: null, variables: [] };
}
