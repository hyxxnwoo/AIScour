import {
  buildSampleProbeDashboard,
  buildSampleProbeDashboardMulti,
  csvScrdifIsAllZero,
  resolveSafeStepMultiple,
  type BuildSampleProbeDashboardOptions,
  type SampleProbeSeries,
} from '@/data/buildSampleProbeDashboard';
import type { ScourSeries } from '@/types/terrain';
import { throwIfAborted } from '@/utils/csvParseAbort';
import {
  countSampleProbeDataRows,
  isSampleProbeCsv,
  parseSampleProbeCsvFile,
  type SampleProbeColumns,
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
}

export interface CsvDashboardLoadResult {
  scour: ScourSeries;
  probeSeries: SampleProbeSeries;
  columns: SampleProbeColumns;
  /** 실제 적용된 stride(자동 조정 반영). */
  stepMultiple: number;
  /** 사용자가 요청한 stride. */
  requestedStepMultiple: number;
  /** 한도 때문에 stride 가 올라갔는지. */
  autoAdjusted: boolean;
  /** CSV scrdif 가 전부 0 이면 합성 세굴로 표시한다. */
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
 * 1행 = 30초 간격 프로브 시점.
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
  const baseIntervalSeconds = options.defaultIntervalSeconds ?? 30;

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
    message: '행 수 확인 중…',
    fileName: primary.name,
    fileIndex: 0,
    fileCount: 1,
    bytesRead: 0,
    fileSize: primary.size,
  });

  const countOpts: Parameters<typeof countSampleProbeDataRows>[1] = {
    onProgress: (p) => {
      options.onProgress?.({
        phase: 'count',
        message: '행 수 확인 중…',
        fileName: primary.name,
        fileIndex: 0,
        fileCount: 1,
        bytesRead: p.bytesRead,
        fileSize: p.fileSize,
        totalRows: p.totalDataRows,
      });
    },
  };
  if (options.signal) countOpts.signal = options.signal;

  const totalDataRows = await countSampleProbeDataRows(primary, countOpts);
  const effectiveStep = resolveSafeStepMultiple(requestedStepMultiple, totalDataRows);
  const autoAdjusted = effectiveStep > requestedStepMultiple;

  options.onProgress?.({
    phase: 'parse',
    message: autoAdjusted
      ? `재생 간격 자동 조정(stride ${effectiveStep}) · CSV 행 파싱 중…`
      : 'CSV 행 파싱 중…',
    fileName: primary.name,
    fileIndex: 0,
    fileCount: 1,
    bytesRead: 0,
    fileSize: primary.size,
    totalRows: totalDataRows,
  });

  const parseOpts: Parameters<typeof parseSampleProbeCsvFile>[1] = {
    stepMultiple: effectiveStep,
    onProgress: (p) => {
      const progress: CsvLoadProgress = {
        phase: 'parse',
        message: 'CSV 행 파싱 중…',
        fileName: primary.name,
        fileIndex: 0,
        fileCount: 1,
        bytesRead: p.bytesRead,
        fileSize: p.fileSize,
        rowsParsed: p.rowsParsed,
      };
      if (p.totalDataRows !== undefined) progress.totalRows = p.totalDataRows;
      options.onProgress?.(progress);
    },
  };
  if (options.signal) parseOpts.signal = options.signal;

  const columns = await parseSampleProbeCsvFile(primary, parseOpts);

  options.onProgress?.({
    phase: 'build',
    message: '세굴·프로브 시리즈 조립 중…',
    fileName: primary.name,
    fileIndex: 0,
    fileCount: 1,
    bytesRead: primary.size,
    fileSize: primary.size,
    rowsParsed: columns.count,
    totalRows: columns.stats?.dataRowCount ?? columns.count,
  });

  const buildOptions: BuildSampleProbeDashboardOptions = {
    baseIntervalSeconds,
    stepMultiple: 1,
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

  const built = buildSampleProbeDashboard(columns, buildOptions);

  return {
    scour: built.scour,
    probeSeries: built.probeSeries,
    columns,
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
  const baseIntervalSeconds = options.defaultIntervalSeconds ?? 30;
  const fileCount = csvFiles.length;
  const columnsList: SampleProbeColumns[] = [];

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
        if (p.totalDataRows !== undefined) progress.totalRows = p.totalDataRows;
        options.onProgress?.(progress);
      },
    };
    if (options.signal) parseOpts.signal = options.signal;

    columnsList.push(await parseSampleProbeCsvFile(file, parseOpts));
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

  const built = buildSampleProbeDashboardMulti(columnsList, buildOptions);
  const primaryColumns = columnsList[0]!;

  return {
    scour: built.scour,
    probeSeries: built.probeSeries,
    columns: primaryColumns,
    stepMultiple: requestedStepMultiple,
    requestedStepMultiple,
    autoAdjusted: false,
    csvScrdifAllZero: csvScrdifIsAllZero(built.probeSeries.bounds),
  };
}

/** 파싱된 열과 stride 로 대시보드 결과만 재조립한다(간격 변경용). */
export function rebuildCsvDashboard(
  columns: SampleProbeColumns,
  stepMultiple: number,
  baseIntervalSeconds = 30,
  buildOptions: BuildSampleProbeDashboardOptions = {},
): CsvDashboardLoadResult {
  const requested = Math.max(1, Math.floor(stepMultiple));
  const totalRows = columns.stats?.dataRowCount ?? columns.count;
  const effectiveStep = resolveSafeStepMultiple(requested, totalRows);
  const autoAdjusted = effectiveStep > requested;
  const built = buildSampleProbeDashboard(columns, {
    baseIntervalSeconds,
    stepMultiple: effectiveStep,
    ...buildOptions,
  });
  return {
    scour: built.scour,
    probeSeries: built.probeSeries,
    columns,
    stepMultiple: effectiveStep,
    requestedStepMultiple: requested,
    autoAdjusted,
    csvScrdifAllZero: csvScrdifIsAllZero(built.probeSeries.bounds),
  };
}
