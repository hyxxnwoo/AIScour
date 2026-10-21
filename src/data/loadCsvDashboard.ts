import { scenarioFromCaseName, type FlowScenario } from '@/constants/scenarios';
import { buildScrdifDashboard } from '@/data/buildScrdifDashboard';
import type { SampleProbeSeries } from '@/data/probeSeries';
import type { FluidSeries } from '@/types/fluid';
import type { ScourSeries, PierDefinitionMeta } from '@/types/terrain';
import { throwIfAborted } from '@/utils/csvParseAbort';
import {
  isScrdifTimeCsv,
  parseScrdifTimeCsvFile,
  type ScrdifTimeDataset,
} from '@/utils/parseScrdifTimeCsv';

export interface CsvLoadProgress {
  phase: 'classify' | 'parse' | 'build';
  message: string;
  fileName: string;
  fileIndex: number;
  fileCount: number;
  bytesRead: number;
  fileSize: number;
  rowsParsed?: number;
  totalRows?: number;
}

/** 프리뷰 표에 쓰는 평면 열(마지막 시간 열의 scrdif). */
export interface ScrdifPreviewColumns {
  x: Float32Array;
  y: Float32Array;
  scrdif: Float32Array;
  count: number;
  /** CSV 시간 열 개수. */
  timeColumnCount: number;
}

/** 한 번에 올릴 수 있는 케이스(CSV) 최대 개수. 케이스당 약 7 MB 를 메모리에 보관한다. */
export const MAX_CSV_CASES = 5;

/** `s01_all_timesteps.csv` → `s01`. 확장자와 `_all_timesteps` 꼬리를 뗀다. */
export function caseNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\\/g, '/').split('/').pop() ?? fileName;
  const stem = base.replace(/\.csv$/i, '').replace(/[_-]all[_-]timesteps$/i, '');
  return stem.length > 0 ? stem : base;
}

export interface CsvDashboardLoadResult {
  /** 파일명에서 뽑은 케이스 이름(예: s01). */
  caseName: string;
  /** 케이스 이름에 해당하는 FLOW-3D 시나리오(s01 → S01). 이름이 규칙에 맞지 않으면 null. */
  scenario: FlowScenario | null;
  /** 시나리오와 CSV가 어긋날 때의 안내 문구. */
  warnings: string[];
  scour: ScourSeries;
  probeSeries: SampleProbeSeries;
  /** 경량화 CSV 에는 유속 데이터가 없어 항상 null. */
  fluid: FluidSeries | null;
  /** 프리뷰용 평면 열. */
  columns: ScrdifPreviewColumns;
  dataset: ScrdifTimeDataset;
  /** CSV 의 0 셀(구조물 점유 영역)에서 검출한 교각. */
  piers: PierDefinitionMeta[];
  /** 실제 적용된 시간 열 stride. */
  stepMultiple: number;
  /** 사용자가 요청한 stride. */
  requestedStepMultiple: number;
  /** 한도 때문에 stride 가 올라갔는지. */
  autoAdjusted: boolean;
  /** CSV scrdif 가 전부 0 이면(실측 신호 없음) 세굴도 표시되지 않는다. */
  csvScrdifAllZero: boolean;
}

export interface LoadCsvDashboardOptions {
  stepMultiple?: number;
  onProgress?: (progress: CsvLoadProgress) => void;
  signal?: AbortSignal;
}

/**
 * 경량화 CFD 결과 CSV(`x_m,y_m,t0000s…`) 업로드 로더. 첫 번째 CSV 한 개만 읽는다.
 * 파일 1개에 구조물이 여러 개 포함될 수 있다(교각은 CSV 의 0 셀에서 검출).
 */
export async function loadCsvDashboard(
  files: FileList | File[],
  options: LoadCsvDashboardOptions = {},
): Promise<CsvDashboardLoadResult> {
  const csvFiles = pickCsvFiles(files);
  return loadOneCase(csvFiles[0], 0, 1, options);
}

/** CSV 여러 개를 차례로 읽어 케이스마다 결과 하나를 만든다(최대 {@link MAX_CSV_CASES} 개). */
export async function loadCsvDashboards(
  files: FileList | File[],
  options: LoadCsvDashboardOptions = {},
): Promise<CsvDashboardLoadResult[]> {
  const csvFiles = pickCsvFiles(files);
  if (csvFiles.length > MAX_CSV_CASES) {
    throw new Error(`CSV 는 한 번에 최대 ${MAX_CSV_CASES}개까지 올릴 수 있습니다.`);
  }
  const results: CsvDashboardLoadResult[] = [];
  for (let i = 0; i < csvFiles.length; i += 1) {
    results.push(await loadOneCase(csvFiles[i], i, csvFiles.length, options));
  }
  return results;
}

function pickCsvFiles(files: FileList | File[]): File[] {
  const csvFiles = Array.from(files).filter((f) => /\.csv$/i.test(f.name));
  if (csvFiles.length === 0) {
    throw new Error('x_m, y_m, t0000s… 양식의 CSV 파일을 선택해 주세요.');
  }
  return csvFiles;
}

async function loadOneCase(
  file: File,
  fileIndex: number,
  fileCount: number,
  options: LoadCsvDashboardOptions,
): Promise<CsvDashboardLoadResult> {
  throwIfAborted(options.signal);
  const requestedStepMultiple = Math.max(1, Math.floor(options.stepMultiple ?? 1));
  const base = { fileName: file.name, fileIndex, fileCount, fileSize: file.size };

  options.onProgress?.({
    ...base,
    phase: 'classify',
    message: 'CSV 양식 확인 중…',
    bytesRead: 0,
  });
  if (!(await isScrdifTimeCsv(file))) {
    throw new Error(
      '지원하지 않는 CSV 형식입니다. x_m, y_m, t0000s… 헤더가 있는 경량화 CSV만 업로드할 수 있습니다.',
    );
  }

  const dataset = await parseScrdifTimeCsvFile(file, {
    ...(options.signal ? { signal: options.signal } : {}),
    onProgress: (p) =>
      options.onProgress?.({
        ...base,
        phase: 'parse',
        message: 'CSV 파싱 중…',
        bytesRead: p.bytesRead,
        fileSize: p.fileSize,
        rowsParsed: p.rowsParsed,
      }),
  });
  throwIfAborted(options.signal);

  options.onProgress?.({
    ...base,
    phase: 'build',
    message: '세굴 시리즈 조립 중…',
    bytesRead: file.size,
    rowsParsed: dataset.count,
    totalRows: dataset.count,
  });
  const caseName = caseNameFromFileName(file.name);
  const scenario = scenarioFromCaseName(caseName);
  const built = buildScrdifDashboard(dataset, { stepMultiple: requestedStepMultiple, scenario });

  return {
    caseName,
    scenario,
    warnings: built.warnings,
    scour: built.scour,
    probeSeries: built.probeSeries,
    fluid: null,
    columns: {
      x: dataset.x,
      y: dataset.y,
      scrdif: dataset.frames[dataset.frames.length - 1],
      count: dataset.count,
      timeColumnCount: dataset.times.length,
    },
    dataset,
    piers: built.piers,
    stepMultiple: built.stepMultiple,
    requestedStepMultiple,
    autoAdjusted: built.stepMultiple > requestedStepMultiple,
    csvScrdifAllZero: built.scrdifAllZero,
  };
}
