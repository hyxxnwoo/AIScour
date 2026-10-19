/** 화면에 보이는 한글 라벨 — 코드·CSV 필드명(d50 등)과 분리 */

/** 하상·퇴적물 대표 입경 (d50, mm) */
export const BED_MATERIAL_GRAIN_LABEL = '하상·퇴적물 입경';

export const BED_MATERIAL_GRAIN_HINT = 'd50 · 중값 입경';

export function formatBedMaterialGrainMm(value: string | number): string {
  const s = typeof value === 'number' ? value.toFixed(value >= 1 ? 1 : 2) : value;
  return `${s} mm`;
}

/**
 * 기초 근입 대비 남은 비율 — 등급(관심·주의·경계·심각) 판정과 동일.
 * 막대 100% = 근입 한계까지 세굴(소진), 배지는 그 반대인 **여유율**.
 */
export const REMAIN_MARGIN_PCT_LABEL = '잔여 여유율';

/** 막대 축: 근입 깊이 대비 세굴 심도 (100% = 한계) */
export const SCOUR_OF_FOUNDATION_PCT_LABEL = '근입 대비 세굴';

/** 표·뱃지 — 막대와 짝: “얼마나 여유가 남았는지” */
export function formatRemainMarginPctShort(remainPct: number): string {
  return `여유 ${Math.max(0, remainPct).toFixed(0)}%`;
}

/** QA 지표 — 약어 병기 */
export const QA_NRMSE_LABEL = '지형 맞춤 오차 (NRMSE)';

export const QA_TENSOR_QUALITY_LABEL = '텐서 품질 점수';

export const QA_PHYSICS_PASS_LABEL = '물리 제약 통과율';

export const QA_AUTOMATION_LABEL = '자동화율';

/** 파이프라인 4단계 — 영문 QA/QC 대신 화면용 한글명 */
export const PIPELINE_QA_QC_STAGE_LABEL = '품질 검증';

/** 품질 검증 단계·KPI 패널 안내 (QA·QC 풀이) */
export const PIPELINE_QA_QC_EXPLAIN =
  'QA(품질 보증)·QC(품질 관리) — 업로드 데이터가 수치·물리 기준을 자동으로 통과했는지 점검하는 단계입니다.';

export const PIPELINE_KPI_SECTION_TITLE = '품질 검증 지표';
