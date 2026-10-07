/** 목업 — 3번 CSV 파이프라인 파일·단계 로그 */
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

export const MOCK_PIPELINE_FILES: MockPipelineFile[] = [
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
      { stage: 'QA / QC', time: '09:04', state: 'ok', detail: '물리 제약 통과' },
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
      { stage: 'QA / QC', time: '09:18', state: 'ok', detail: '통과' },
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
      { stage: 'QA / QC', time: '09:37', state: 'err', detail: '경고 — 교각 주변 셀 수 12' },
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
      { stage: 'QA / QC', time: '09:42', state: 'err', detail: '물리 제약 위반 — ds/D 상한 초과' },
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
      { stage: 'QA / QC', time: '—', state: 'wait', detail: '대기' },
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
      { stage: 'QA / QC', time: '—', state: 'wait', detail: '대기' },
      { stage: '서비스 반영', time: '—', state: 'wait', detail: '대기' },
    ],
  },
];
