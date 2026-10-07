/** 잔여 여유율 등급 경계(%). 잠정값 — 3차년도 확정 예정. */
export const REMAIN_PCT_THRESHOLDS = {
  attention: 70,
  caution: 40,
  boundary: 20,
} as const;

/** 화면에 '잠정' 표시용 */
export const IS_THRESHOLD_PROVISIONAL = true;

/** 실교량 목업 케이스 기본 기초 근입 (m) */
export const DEFAULT_FOUNDATION_DEPTH_M = 5.2;

export type GradeKey = 'a1' | 'a2' | 'a3' | 'a4';

export interface Grade {
  key: GradeKey;
  name: string;
  en: string;
  minRemainPct: number;
  color: string;
  action: string;
}

export const GRADES: readonly Grade[] = [
  {
    key: 'a1',
    name: '관심',
    en: 'Blue',
    minRemainPct: REMAIN_PCT_THRESHOLDS.attention,
    color: '#2E7DD1',
    action: '정상 모니터링 유지',
  },
  {
    key: 'a2',
    name: '주의',
    en: 'Yellow',
    minRemainPct: REMAIN_PCT_THRESHOLDS.caution,
    color: '#E8B21A',
    action: '점검 주기 단축',
  },
  {
    key: 'a3',
    name: '경계',
    en: 'Orange',
    minRemainPct: REMAIN_PCT_THRESHOLDS.boundary,
    color: '#E8791A',
    action: '현장 긴급 점검 실시',
  },
  {
    key: 'a4',
    name: '심각',
    en: 'Red',
    minRemainPct: Number.NEGATIVE_INFINITY,
    color: '#D02B2B',
    action: '통행 제한 및 긴급 보강 검토',
  },
] as const;

/** 잔여 여유율(%) = (기초 근입 − 세굴심) / 기초 근입 × 100, 하한 0 */
export function remainPct(scourDepthM: number, foundationDepthM: number): number {
  const fd = Math.max(foundationDepthM, 1e-9);
  return Math.max(0, ((fd - scourDepthM) / fd) * 100);
}

/** 세굴심(m)과 기초 근입으로 4단계 등급 판정 */
export function gradeOf(scourDepthM: number, foundationDepthM: number): Grade {
  const pct = remainPct(scourDepthM, foundationDepthM);
  const found = GRADES.find((g) => pct >= g.minRemainPct);
  return found ?? GRADES[GRADES.length - 1];
}

export function gradeIndex(g: Grade): number {
  return GRADES.indexOf(g);
}

/** 잔여 여유율(%)에 해당하는 세굴심(m) */
export function depthAtRemainPct(pct: number, foundationDepthM: number): number {
  return foundationDepthM * (1 - pct / 100);
}

/** 주의·경계·심각 경계에 해당하는 세굴심(m) — 70/40/20 % */
export function gradeDepthThresholds(foundationDepthM: number): [number, number, number] {
  return [
    depthAtRemainPct(REMAIN_PCT_THRESHOLDS.attention, foundationDepthM),
    depthAtRemainPct(REMAIN_PCT_THRESHOLDS.caution, foundationDepthM),
    depthAtRemainPct(REMAIN_PCT_THRESHOLDS.boundary, foundationDepthM),
  ];
}

export interface PierDepthReading {
  pierId: string;
  scourDepthM: number;
}

/** 현재 시점 최대 세굴심 교각 */
export function worstPierByDepth(readings: PierDepthReading[]): PierDepthReading | null {
  if (readings.length === 0) return null;
  return readings.reduce((a, b) => (b.scourDepthM > a.scourDepthM ? b : a));
}
