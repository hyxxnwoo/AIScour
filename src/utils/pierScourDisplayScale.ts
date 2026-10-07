import type { PierScourDepth } from '@/utils/pierScourSample';

/**
 * 물리 Δ(특히 플룸·CSV)는 기초 근입 대비 세굴심이 작게 나와 등급이 전부 「관심」에 머무는 경우가 많다.
 * 모니터·교각색·위험 UI 가독용 배율 (지형/CSV 원값은 변경하지 않음).
 */
export const PIER_SCOUR_DISPLAY = {
  /** 기본 배율 */
  gain: 5.2,
  /** 교각별 상대 강도 (P2 중앙 교각이 가장 깊게) */
  pierBias: { P1: 0.9, P2: 1.28, P3: 0.82 } as Record<string, number>,
  /** t=0 근처 최소 비율 */
  progressFloor: 0.1,
  progressExponent: 0.78,
  /** 기초 근입 대비 표시 상한 */
  maxFractionOfFoundation: 0.985,
} as const;

function simProgress(timeSeconds: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  const u = Math.min(1, Math.max(0, timeSeconds / durationSeconds));
  const { progressFloor, progressExponent } = PIER_SCOUR_DISPLAY;
  return progressFloor + (1 - progressFloor) * Math.pow(u, progressExponent);
}

export function scalePierScourDepthM(
  rawDepthM: number,
  pierId: string,
  foundationDepthM: number,
  timeSeconds: number,
  durationSeconds: number,
): number {
  const fd = Math.max(foundationDepthM, 1e-9);
  const bias = PIER_SCOUR_DISPLAY.pierBias[pierId] ?? 1;
  const progress = simProgress(timeSeconds, durationSeconds);
  const scaled = Math.max(0, rawDepthM) * PIER_SCOUR_DISPLAY.gain * bias * progress;
  const cap = fd * PIER_SCOUR_DISPLAY.maxFractionOfFoundation;
  return Math.min(cap, scaled);
}

export function scalePierScourReadings(
  readings: PierScourDepth[],
  foundationDepthM: number,
  timeSeconds: number,
  durationSeconds: number,
): PierScourDepth[] {
  return readings.map((r) => ({
    pierId: r.pierId,
    scourDepthM: scalePierScourDepthM(
      r.scourDepthM,
      r.pierId,
      foundationDepthM,
      timeSeconds,
      durationSeconds,
    ),
  }));
}
