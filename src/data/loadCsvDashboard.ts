import {
  buildSampleProbeDashboard,
  buildSampleProbeDashboardMulti,
  csvScrdifIsAllZero,
  resolveSafeStepMultiple,
  type BuildSampleProbeDashboardOptions,
  type SampleProbeSeries,
} from '@/data/buildSampleProbeDashboard';
import type { FluidSeries } from '@/types/fluid';
import type { ScourSeries, PierDefinitionMeta } from '@/types/terrain';
import { throwIfAborted } from '@/utils/csvParseAbort';
import {
  countSampleProbeTimeBlocks,
  DEFAULT_T_INTERVAL_SECONDS,
  isSampleProbeCsv,
  parseSampleProbeCsvFile,
  type SampleProbeColumns,
  type SampleProbeDataset,
} from '@/utils/parseSampleProbeCsv';

export interface CsvLoadProgress {
  phase: 'classify' | 'count' | 'parse' | 'build';
  message: string;
  fileName: string;
  fileIndex: number;
  fileCount: number;
  bytesRead: number;
  fileSize: number;
  rowsParsed?: number;
  totalRows?: number;
  timeBlocksParsed?: number;
  totalTimeBlocks?: number;
}

export interface CsvDashboardLoadResult {
  scour: ScourSeries;
  probeSeries: SampleProbeSeries;
  /** t 블록 행 데이터로 만든 3D 유체 필드(유속 화살표·추적 입자·수면 색용). */
  fluid: FluidSeries | null;
  /** 프리뷰용 평면 열(모든 t 블록 공간 행 연결). */
  columns: SampleProbeColumns;
  /** t 블록 Dataset. */
  dataset: SampleProbeDataset;
  /** CSV에서 추정·배치된 교각 정의. */
  piers: PierDefinitionMeta[];
  /** 실제 적용된 시간 블록 stride. */
  stepMultiple: number;
  /** 사용자가 요청한 stride. */
  requestedStepMultiple: number;
  /** 한도 때문에 stride 가 올라갔는지. */
  autoAdjusted: boolean;
  /** CSV scrdif 가 전부 0 이면(실측 신호 없음) 세굴도 표시되지 않는다. */
  csvScrdifAllZero: boolean;
}

export interface LoadCsvDashboardOptions extends BuildSampleProbeDashboardOptions {
  defaultCellSize?: number;
  defaultIntervalSeconds?: number;
  stepMultiple?: number;
  onProgress?: (progress: CsvLoadProgress) => void;
  signal?: AbortSignal;
}

/**
 * sampledata.csv 양식 CSV 업로드 로더.
 * C열 t 마커 순서 = 시간(0, 30, 60, …초). 각 t 블록의 공간장이 한 프레임.
 * 파일을 여러 개(교각 1개당 CSV 1개) 선택하면 교각별 실측 세굴로 조립한다.
 */
export async function loadCsvDashboard(
  files: FileList | File[],
  options: LoadCsvDashboardOptions = {},
): Promise<CsvDashboardLoadResult> {
  throwIfAborted(options.signal);
  const fileArray = Array.from(files);
  const csvFiles = fileArray.filter((f) => /\.csv$/i.test(f.name));
  if (csvFiles.length === 0) {
    throw new Error('sampledata.csv 양식의 CSV 파일을 선택해 주세요.');
  }

  if (csvFiles.length > 1) {
    return loadMultiPierCsvDashboard(csvFiles, options);
  }

  const primary = csvFiles[0]!;
  const requestedStepMultiple = Math.max(1, Math.floor(options.stepMultiple ?? 1));
  const baseIntervalSeconds = options.defaultIntervalSeconds ?? DEFAULT_T_INTERVAL_SECONDS;

  options.onProgress?.({
    phase: 'classify',
    message: 'sampledata.csv 양식 확인 중…',
    fileName: primary.name,
    fileIndex: 0,
    fileCount: 1,
    bytesRead: 0,
    fileSize: primary.size,
  });

  if (!(await isSampleProbeCsv(primary))) {
    throw new Error(
      '지원하지 않는 CSV 형식입니다. x y z u v w scrdif 헤더가 있는 sampledata.csv 양식만 업로드할 수 있습니다.',
    );
  }

  options.onProgress?.({
    phase: 'count',
    message: 't 블록 수 확인 중…',
    fileName: primary.name,
    fileIndex: 0,
    fileCount: 1,
    bytesRead: 0,
    fileSize: primary.size,
  });

  const countOpts: Parameters<typeof countSampleProbeTimeBlocks>[1] = {
    onProgress: (p) => {
      const progress: CsvLoadProgress = {
        phase: 'count',
        message: 't 블록 수 확인 중…',
        fileName: primary.name,
        fileIndex: 0,
        fileCount: 1,
        bytesRead: p.bytesRead,
        fileSize: p.fileSize,
        totalRows: p.totalDataRows,
      };
      if (p.timeBlockCount !== undefined) progress.totalTimeBlocks = p.timeBlockCount;
      options.onProgress?.(progress);
    },
  };
  if (options.signal) countOpts.signal = options.signal;

  const totalTimeBlocks = await countSampleProbeTimeBlocks(primary, countOpts);
  const effectiveStep = resolveSafeStepMultiple(requestedStepMultiple, totalTimeBlocks);
  const autoAdjusted = effectiveStep > requestedStepMultiple;

  options.onProgress?.({
    phase: 'parse',
    message: autoAdjusted
      ? `재생 간격 자동 조정(stride ${effectiveStep}) · CSV 파싱 중…`
      : 'CSV t 블록 파싱 중…',
    fileName: primary.name,
    fileIndex: 0,
    fileCount: 1,
    bytesRead: 0,
    fileSize: primary.size,
    totalTimeBlocks,
  });

  const parseOpts: Parameters<typeof parseSampleProbeCsvFile>[1] = {
    stepMultiple: 1,
    baseIntervalSeconds,
    onProgress: (p) => {
      const progress: CsvLoadProgress = {
        phase: 'parse',
        message: 'CSV t 블록 파싱 중…',
        fileName: primary.name,
        fileIndex: 0,
        fileCount: 1,
        bytesRead: p.bytesRead,
        fileSize: p.fileSize,
        rowsParsed: p.rowsParsed,
      };
      if (p.timeBlocksParsed !== undefined) progress.timeBlocksParsed = p.timeBlocksParsed;
      if (p.totalDataRows !== undefined) progress.totalRows = p.totalDataRows;
      options.onProgress?.(progress);
    },
  };
  if (options.signal) parseOpts.signal = options.signal;

  const dataset = await parseSampleProbeCsvFile(primary, parseOpts);

  options.onProgress?.({
    phase: 'build',
    message: '세굴·프로브 시리즈 조립 중…',
    fileName: primary.name,
    fileIndex: 0,
    fileCount: 1,
    bytesRead: primary.size,
    fileSize: primary.size,
    rowsParsed: dataset.flatColumns.count,
    totalRows: dataset.stats.dataRowCount,
    timeBlocksParsed: dataset.blocks.length,
    totalTimeBlocks: dataset.stats.timeBlockCount,
  });

  const buildOptions: BuildSampleProbeDashboardOptions = {
    baseIntervalSeconds,
    stepMultiple: effectiveStep,
  };
  if (options.pierX !== undefined) buildOptions.pierX = options.pierX;
  if (options.pierZ !== undefined) buildOptions.pierZ = options.pierZ;
  if (options.pierCount !== undefined) buildOptions.pierCount = options.pierCount;
  if (options.pierArrangement !== undefined) buildOptions.pierArrangement = options.pierArrangement;
  if (options.pierDiameter !== undefined) buildOptions.pierDiameter = options.pierDiameter;
  if (options.scourRate !== undefined) buildOptions.scourRate = options.scourRate;
  if (options.sandGrainSizeMm !== undefined) buildOptions.sandGrainSizeMm = options.sandGrainSizeMm;
  if (options.permeable !== undefined) buildOptions.permeable = options.permeable;
  if (options.inflowSpeed !== undefined) buildOptions.inflowSpeed = options.inflowSpeed;
  if (options.tankHeightY !== undefined) buildOptions.tankHeightY = options.tankHeightY;

  const built = buildSampleProbeDashboard(dataset, buildOptions);

  return {
    scour: built.scour,
    probeSeries: built.probeSeries,
    fluid: built.fluid,
    columns: dataset.flatColumns,
    dataset,
    piers: built.scour.baseTerrain.metadata?.piers ?? [],
    stepMultiple: effectiveStep,
    requestedStepMultiple,
    autoAdjusted,
    csvScrdifAllZero: csvScrdifIsAllZero(built.probeSeries.bounds),
  };
}

/**
 * 교각 1개당 CSV 1개(업로드 순서 = P1, P2, P3…)를 파싱해 교각별 실측 세굴 대시보드를 만든다.
 */
async function loadMultiPierCsvDashboard(
  csvFiles: File[],
  options: LoadCsvDashboardOptions,
): Promise<CsvDashboardLoadResult> {
  const requestedStepMultiple = Math.max(1, Math.floor(options.stepMultiple ?? 1));
  const baseIntervalSeconds = options.defaultIntervalSeconds ?? DEFAULT_T_INTERVAL_SECONDS;
  const fileCount = csvFiles.length;
  const datasets: SampleProbeDataset[] = [];

  for (let i = 0; i < fileCount; i += 1) {
    const file = csvFiles[i]!;
    throwIfAborted(options.signal);

    options.onProgress?.({
      phase: 'classify',
      message: 'sampledata.csv 양식 확인 중…',
      fileName: file.name,
      fileIndex: i,
      fileCount,
      bytesRead: 0,
      fileSize: file.size,
    });

    if (!(await isSampleProbeCsv(file))) {
      throw new Error(
        `${file.name}: 지원하지 않는 CSV 형식입니다. x y z u v w scrdif 헤더가 있는 sampledata.csv 양식만 업로드할 수 있습니다.`,
      );
    }

    const parseOpts: Parameters<typeof parseSampleProbeCsvFile>[1] = {
      stepMultiple: 1,
      baseIntervalSeconds,
      onProgress: (p) => {
        const progress: CsvLoadProgress = {
          phase: 'parse',
          message: '교각별 CSV 파싱 중…',
          fileName: file.name,
          fileIndex: i,
          fileCount,
          bytesRead: p.bytesRead,
          fileSize: p.fileSize,
          rowsParsed: p.rowsParsed,
        };
        if (p.timeBlocksParsed !== undefined) progress.timeBlocksParsed = p.timeBlocksParsed;
        if (p.totalDataRows !== undefined) progress.totalRows = p.totalDataRows;
        options.onProgress?.(progress);
      },
    };
    if (options.signal) parseOpts.signal = options.signal;

    datasets.push(await parseSampleProbeCsvFile(file, parseOpts));
  }

  options.onProgress?.({
    phase: 'build',
    message: '교각별 세굴·프로브 시리즈 조립 중…',
    fileName: csvFiles[fileCount - 1]!.name,
    fileIndex: fileCount - 1,
    fileCount,
    bytesRead: 0,
    fileSize: 0,
  });

  const buildOptions: BuildSampleProbeDashboardOptions = {
    baseIntervalSeconds,
    stepMultiple: requestedStepMultiple,
    pierCount: fileCount,
  };
  if (options.pierArrangement !== undefined) buildOptions.pierArrangement = options.pierArrangement;
  if (options.pierDiameter !== undefined) buildOptions.pierDiameter = options.pierDiameter;
  if (options.scourRate !== undefined) buildOptions.scourRate = options.scourRate;
  if (options.sandGrainSizeMm !== undefined) buildOptions.sandGrainSizeMm = options.sandGrainSizeMm;
  if (options.permeable !== undefined) buildOptions.permeable = options.permeable;
  if (options.inflowSpeed !== undefined) buildOptions.inflowSpeed = options.inflowSpeed;
  if (options.tankHeightY !== undefined) buildOptions.tankHeightY = options.tankHeightY;

  const built = buildSampleProbeDashboardMulti(datasets, buildOptions);
  const primaryDataset = datasets[0]!;

  return {
    scour: built.scour,
    probeSeries: built.probeSeries,
    fluid: built.fluid,
    columns: primaryDataset.flatColumns,
    dataset: primaryDataset,
    piers: built.scour.baseTerrain.metadata?.piers ?? [],
    stepMultiple: requestedStepMultiple,
    requestedStepMultiple,
    autoAdjusted: false,
    csvScrdifAllZero: csvScrdifIsAllZero(built.probeSeries.bounds),
  };
}

/** 파싱된 Dataset 과 시간 블록 stride 로 대시보드 결과만 재조립한다(간격 변경용). */
export function rebuildCsvDashboard(
  dataset: SampleProbeDataset | SampleProbeColumns,
  stepMultiple: number,
  baseIntervalSeconds = DEFAULT_T_INTERVAL_SECONDS,
  buildOptions: BuildSampleProbeDashboardOptions = {},
): CsvDashboardLoadResult {
  const requested = Math.max(1, Math.floor(stepMultiple));
  const ds =
    'blocks' in dataset
      ? dataset
      : ({
          blocks: [
            {
              timeIndex: 0,
              timestampSeconds: 0,
              rawT: null,
              columns: dataset,
            },
          ],
          flatColumns: dataset,
          stats: dataset.stats ?? {
            fileLineCount: dataset.count + 1,
            dataRowCount: dataset.count,
            timeBlockCount: 1,
            skippedLinesAfterHeader: 0,
            parseStepMultiple: 1,
          },
          baseIntervalSeconds,
        } satisfies SampleProbeDataset);

  const totalBlocks = ds.blocks.length;
  const effectiveStep = resolveSafeStepMultiple(requested, totalBlocks);
  const autoAdjusted = effectiveStep > requested;
  const built = buildSampleProbeDashboard(ds, {
    baseIntervalSeconds: ds.baseIntervalSeconds || baseIntervalSeconds,
    ...buildOptions,
    stepMultiple: effectiveStep,
  });
  return {
    scour: built.scour,
    probeSeries: built.probeSeries,
    fluid: built.fluid,
    columns: ds.flatColumns,
    dataset: ds,
    piers: built.scour.baseTerrain.metadata?.piers ?? [],
    stepMultiple: effectiveStep,
    requestedStepMultiple: requested,
    autoAdjusted,
    csvScrdifAllZero: csvScrdifIsAllZero(built.probeSeries.bounds),
  };
}
