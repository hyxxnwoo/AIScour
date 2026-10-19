/** 목업 — 3번 CSV 파이프라인 파일·단계 로그 */
import { PIPELINE_QA_QC_STAGE_LABEL } from '@/constants/fieldLabels';

export type PipelineResultKey = 'ok' | 'warn' | 'err' | 'run' | 'wait';

export interface PipelineStageLog {
  stage: string;
  time: string;
  state: 'ok' | 'err' | 'wait' | 'run';
  detail: string;
}

export interface MockPipelineFile {
  id: string;
  fileName: string;
  caseId: string;
  uploadedAt: string;
  sizeLabel: string;
  /** 0~5 완료 단계 수 */
  stageProgress: number;
  result: PipelineResultKey;
  summary: string;
  logs: PipelineStageLog[];
}

const STAGE_NAMES = [
  '업로드',
  '파싱',
  '경량화 · 변환',
  PIPELINE_QA_QC_STAGE_LABEL,
  '서비스 반영',
] as const;

function logsForFile(
  result: PipelineResultKey,
  stageProgress: number,
  detailSeed: string,
): PipelineStageLog[] {
  return STAGE_NAMES.map((stage, i) => {
    const idx = i + 1;
    if (idx < stageProgress) {
      return { stage, time: '09:0' + (i % 5), state: 'ok', detail: `${stage} 완료` };
    }
    if (idx === stageProgress) {
      if (result === 'run') {
        return { stage, time: '—', state: 'run', detail: detailSeed };
      }
      if (result === 'err' && stage === PIPELINE_QA_QC_STAGE_LABEL) {
        return { stage, time: '09:42', state: 'err', detail: detailSeed };
      }
      if (result === 'warn' && stage === PIPELINE_QA_QC_STAGE_LABEL) {
        return { stage, time: '09:37', state: 'err', detail: detailSeed };
      }
      if (result === 'wait' && stage === '업로드') {
        return { stage, time: '—', state: 'wait', detail: detailSeed };
      }
      return { stage, time: '—', state: 'wait', detail: '대기' };
    }
    return { stage, time: '—', state: 'wait', detail: '대기' };
  });
}

/** 목록·퍼널 KPI용 총 파일 수 (목업 DB) */
export const MOCK_PIPELINE_FILE_COUNT = 32;

const SEED_PIPELINE_FILES: MockPipelineFile[] = [
  {
    id: 'f-a032',
    fileName: 'A-032_scour_t1780.csv',
    caseId: 'A-032',
    uploadedAt: '10-02 08:58',
    sizeLabel: '482 MB',
    stageProgress: 5,
    result: 'ok',
    summary: '서비스 반영 완료 · glTF 5.8 MB · 60 프레임',
    logs: [
      { stage: '업로드', time: '08:58', state: 'ok', detail: '482 MB 수신' },
      { stage: '파싱', time: '08:59', state: 'ok', detail: '1,102,400 행 · 7 열' },
      { stage: '경량화 · 변환', time: '09:02', state: 'ok', detail: '60 프레임 · glTF 5.8 MB' },
      { stage: PIPELINE_QA_QC_STAGE_LABEL, time: '09:04', state: 'ok', detail: '물리 제약 통과' },
      { stage: '서비스 반영', time: '09:05', state: 'ok', detail: '케이스 A-032 검증완료' },
    ],
  },
  {
    id: 'f-a041',
    fileName: 'A-041_flow3d_out.csv',
    caseId: 'A-041',
    uploadedAt: '10-02 09:12',
    sizeLabel: '455 MB',
    stageProgress: 5,
    result: 'ok',
    summary: '서비스 반영 완료 · glTF 4.2 MB · 60 프레임',
    logs: [
      { stage: '업로드', time: '09:12', state: 'ok', detail: '455 MB 수신' },
      { stage: '파싱', time: '09:13', state: 'ok', detail: '998,200 행 · 7 열' },
      { stage: '경량화 · 변환', time: '09:16', state: 'ok', detail: '60 프레임 · glTF 4.2 MB' },
      { stage: PIPELINE_QA_QC_STAGE_LABEL, time: '09:18', state: 'ok', detail: '통과' },
      { stage: '서비스 반영', time: '09:20', state: 'ok', detail: '케이스 A-041 검증완료' },
    ],
  },
  {
    id: 'f-b012',
    fileName: 'B-012_run02.csv',
    caseId: 'B-012',
    uploadedAt: '10-02 09:30',
    sizeLabel: '390 MB',
    stageProgress: 3,
    result: 'warn',
    summary: 'QA 경고 — 교각 주변 셀 수 12 (권장 20 이상)',
    logs: [
      { stage: '업로드', time: '09:30', state: 'ok', detail: '390 MB 수신' },
      { stage: '파싱', time: '09:31', state: 'ok', detail: '920,000 행 · 7 열' },
      { stage: '경량화 · 변환', time: '09:35', state: 'ok', detail: '60 프레임 · glTF 5.1 MB' },
      {
        stage: PIPELINE_QA_QC_STAGE_LABEL,
        time: '09:37',
        state: 'err',
        detail: '경고 — 교각 주변 셀 수 12',
      },
      { stage: '서비스 반영', time: '—', state: 'wait', detail: 'QA 승인 대기' },
    ],
  },
  {
    id: 'f-b015',
    fileName: 'B-015_run01.csv',
    caseId: 'B-015',
    uploadedAt: '10-02 09:35',
    sizeLabel: '512 MB',
    stageProgress: 3,
    result: 'err',
    summary: 'QA 오류 — 상대세굴심 ds/D 3.03 (설정 상한 3.0 초과)',
    logs: [
      { stage: '업로드', time: '09:35', state: 'ok', detail: '512 MB 수신' },
      { stage: '파싱', time: '09:36', state: 'ok', detail: '1,284,000 행 · 7 열' },
      { stage: '경량화 · 변환', time: '09:40', state: 'ok', detail: '60 프레임 · glTF 6.1 MB' },
      {
        stage: PIPELINE_QA_QC_STAGE_LABEL,
        time: '09:42',
        state: 'err',
        detail: '물리 제약 위반 — ds/D 상한 초과',
      },
      { stage: '서비스 반영', time: '—', state: 'wait', detail: '보류' },
    ],
  },
  {
    id: 'f-sample',
    fileName: 'sampledata.csv',
    caseId: '미지정',
    uploadedAt: '10-02 10:02',
    sizeLabel: '12 MB',
    stageProgress: 1,
    result: 'run',
    summary: '파싱 중 — 콤마 구분자 없음, 자동 변환 규칙 적용',
    logs: [
      { stage: '업로드', time: '10:02', state: 'ok', detail: '12 MB 수신' },
      { stage: '파싱', time: '10:03', state: 'run', detail: '구분자 자동 감지 중…' },
      { stage: '경량화 · 변환', time: '—', state: 'wait', detail: '대기' },
      { stage: PIPELINE_QA_QC_STAGE_LABEL, time: '—', state: 'wait', detail: '대기' },
      { stage: '서비스 반영', time: '—', state: 'wait', detail: '대기' },
    ],
  },
  {
    id: 'f-c008',
    fileName: 'C-008_input.csv',
    caseId: 'C-008',
    uploadedAt: '10-02 10:10',
    sizeLabel: '468 MB',
    stageProgress: 0,
    result: 'wait',
    summary: '대기열 2번째',
    logs: [
      { stage: '업로드', time: '—', state: 'wait', detail: '대기열 2번째' },
      { stage: '파싱', time: '—', state: 'wait', detail: '대기' },
      { stage: '경량화 · 변환', time: '—', state: 'wait', detail: '대기' },
      { stage: PIPELINE_QA_QC_STAGE_LABEL, time: '—', state: 'wait', detail: '대기' },
      { stage: '서비스 반영', time: '—', state: 'wait', detail: '대기' },
    ],
  },
];

const SERIES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
const SUFFIX = ['scour_out', 'flow3d', 'run01', 'run02', 'probe'] as const;

function resultForSlot(slot: number): PipelineResultKey {
  const r = slot % 17;
  if (r === 0 || r === 8) return 'err';
  if (r === 3 || r === 11) return 'warn';
  if (r === 5 || r === 13) return 'run';
  if (r === 7 || r === 14) return 'wait';
  return 'ok';
}

function stageProgressFor(result: PipelineResultKey, slot: number): number {
  switch (result) {
    case 'ok':
      return 5;
    case 'warn':
      return 4;
    case 'err':
      return slot % 2 === 0 ? 2 : 4;
    case 'run':
      return 1 + (slot % 3);
    case 'wait':
      return 0;
    default:
      return 0;
  }
}

function summaryFor(result: PipelineResultKey, caseId: string, progress: number): string {
  switch (result) {
    case 'ok':
      return `서비스 반영 완료 · ${caseId} · 60 프레임`;
    case 'warn':
      return 'QA 경고 — 메시 해상도 또는 교각 주변 셀 수 검토';
    case 'err':
      return progress <= 2
        ? '파싱 오류 — 열 이름 불일치 (x,y,z,t)'
        : 'QA 오류 — 물리 제약 또는 NRMSE 기준 미달';
    case 'run':
      return progress <= 1 ? '업로드 완료 · 파싱 큐 처리 중' : '경량화 · glTF 변환 중';
    case 'wait':
      return `대기열 ${(slotHash(caseId) % 4) + 1}번째`;
    default:
      return '—';
  }
}

function slotHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function sizeLabelFor(slot: number): string {
  const mb = 280 + (slot % 19) * 14;
  return `${mb} MB`;
}

function uploadedAtFor(slot: number): string {
  const day = 25 + (slot % 8);
  const hour = 7 + (slot % 12);
  const min = (slot * 11) % 60;
  return `10-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function buildGeneratedPipelineFile(slot: number): MockPipelineFile {
  const series = SERIES[slot % SERIES.length];
  const num = String(10 + (slot % 90)).padStart(3, '0');
  const caseId = `${series}-${num}`;
  const suffix = SUFFIX[slot % SUFFIX.length];
  const fileName = `${caseId}_${suffix}.csv`;
  const result = resultForSlot(slot);
  const stageProgress = stageProgressFor(result, slot);
  const summary = summaryFor(result, caseId, stageProgress);
  const detailSeed =
    result === 'run'
      ? '워커 #2에서 처리 중…'
      : result === 'wait'
        ? `대기열 ${(slot % 4) + 1}번째`
        : summary.slice(0, 48);
  return {
    id: `f-gen-${slot}`,
    fileName,
    caseId,
    uploadedAt: uploadedAtFor(slot),
    sizeLabel: sizeLabelFor(slot),
    stageProgress,
    result,
    summary,
    logs: logsForFile(result, stageProgress, detailSeed),
  };
}

function buildMockPipelineFiles(total: number): MockPipelineFile[] {
  const rows = SEED_PIPELINE_FILES.map((f) => ({ ...f, logs: f.logs.map((l) => ({ ...l })) }));
  const usedNames = new Set(rows.map((f) => f.fileName));
  let slot = 0;
  while (rows.length < total) {
    const row = buildGeneratedPipelineFile(slot);
    slot += 1;
    if (usedNames.has(row.fileName)) continue;
    usedNames.add(row.fileName);
    rows.push(row);
  }
  return rows;
}

export const MOCK_PIPELINE_FILES: MockPipelineFile[] =
  buildMockPipelineFiles(MOCK_PIPELINE_FILE_COUNT);
