import type { PierDefinition } from '@/modules/PierMarker';
import type { ScourSeries } from '@/types/terrain';
import { GRADES, gradeDepthThresholds, gradeIndex, gradeOf } from '@/constants/grade';
import { scalePierScourDepthM } from '@/utils/pierScourDisplayScale';
import { pierScourDepths } from '@/utils/pierScourSample';

export interface PierDepthSeries {
  pierId: string;
  times: number[];
  depths: number[];
}

export interface PierReachTimes {
  pierId: string;
  caution: number | null;
  boundary: number | null;
  serious: number | null;
  finalDepthM: number;
}

const PIER_SERIES_COLORS: Record<string, string> = {
  P1: '#7FD4E8',
  P2: '#C792EA',
  P3: '#9FE07A',
};

export function pierSeriesColor(pierId: string): string {
  return PIER_SERIES_COLORS[pierId] ?? '#7ec8e3';
}

/** 프레임마다 교각 세굴심 시계열 (목업 tsChart 입력) */
export function buildPierDepthSeries(
  series: ScourSeries,
  piers: PierDefinition[],
  foundationDepthM: number,
): PierDepthSeries[] {
  const { frames } = series;
  if (frames.length === 0) {
    return piers.map((p) => ({ pierId: p.id, times: [0], depths: [0] }));
  }
  const durationSeconds = frames[frames.length - 1]?.timestampSeconds ?? 0;
  return piers.map((pier) => {
    const times: number[] = [];
    const depths: number[] = [];
    for (const frame of frames) {
      times.push(frame.timestampSeconds);
      const raw = pierScourDepths(series, [pier], frame.timestampSeconds)[0]?.scourDepthM ?? 0;
      depths.push(
        scalePierScourDepthM(
          raw,
          pier.id,
          foundationDepthM,
          frame.timestampSeconds,
          durationSeconds,
        ),
      );
    }
    return { pierId: pier.id, times, depths };
  });
}

export function firstTimeDepthReached(
  times: number[],
  depths: number[],
  thresholdDepthM: number,
): number | null {
  for (let i = 0; i < depths.length; i++) {
    if ((depths[i] ?? 0) >= thresholdDepthM - 1e-9) return times[i] ?? null;
  }
  return null;
}

/** 시계열에서 t(s) 시점 세굴심 — 선형 보간 */
export function depthAtTime(pierSeries: PierDepthSeries, timeSeconds: number): number {
  const { times, depths } = pierSeries;
  if (times.length === 0) return 0;
  if (timeSeconds <= (times[0] ?? 0)) return depths[0] ?? 0;
  const last = times.length - 1;
  if (timeSeconds >= (times[last] ?? 0)) return depths[last] ?? 0;
  for (let i = 0; i < last; i++) {
    const t0 = times[i] ?? 0;
    const t1 = times[i + 1] ?? t0;
    if (timeSeconds >= t0 && timeSeconds <= t1) {
      const d0 = depths[i] ?? 0;
      const d1 = depths[i + 1] ?? d0;
      const u = t1 === t0 ? 0 : (timeSeconds - t0) / (t1 - t0);
      return d0 + (d1 - d0) * u;
    }
  }
  return depths[last] ?? 0;
}

export function firstTimeDepthReachedAfter(
  pierSeries: PierDepthSeries,
  afterTimeSeconds: number,
  thresholdDepthM: number,
): number | null {
  const { times, depths } = pierSeries;
  for (let i = 0; i < depths.length; i++) {
    if ((times[i] ?? 0) < afterTimeSeconds - 1e-9) continue;
    if ((depths[i] ?? 0) >= thresholdDepthM - 1e-9) return times[i] ?? null;
  }
  return null;
}

/** 최근 windowSeconds 동안 세굴심 증가량(m) */
export function scourProgressRate(
  pierSeries: PierDepthSeries,
  currentTimeSeconds: number,
  windowSeconds = 300,
): number {
  const t0 = Math.max(0, currentTimeSeconds - windowSeconds);
  return depthAtTime(pierSeries, currentTimeSeconds) - depthAtTime(pierSeries, t0);
}

/** 다음 등급 도달 예상 문구 (해석 시계열 기준) */
export function describeNextGradeEta(
  pierSeries: PierDepthSeries,
  currentTimeSeconds: number,
  currentDepthM: number,
  foundationDepthM: number,
): string {
  const g = gradeOf(currentDepthM, foundationDepthM);
  const gi = gradeIndex(g);
  if (gi >= GRADES.length - 1) return '최고 등급';
  const thresholds = gradeDepthThresholds(foundationDepthM);
  const nextThreshold = thresholds.find((x) => x > currentDepthM + 1e-9);
  if (nextThreshold == null) return '최고 등급';
  const nextG = GRADES[gi + 1];
  const rt = firstTimeDepthReachedAfter(pierSeries, currentTimeSeconds, nextThreshold);
  if (rt == null) return `${nextG.name} 도달 안 함`;
  return `${nextG.name} 약 ${Math.round(rt - currentTimeSeconds)} s 후`;
}

/** 등급 경계(주의·경계·심각) 최초 도달 시각 */
export function computePierReachTimes(
  pierSeries: PierDepthSeries,
  foundationDepthM: number,
): PierReachTimes {
  const [tCaution, tBoundary, tSerious] = gradeDepthThresholds(foundationDepthM);
  const { times, depths, pierId } = pierSeries;
  const finalDepthM = depths.length > 0 ? Math.max(...depths) : 0;
  return {
    pierId,
    caution: firstTimeDepthReached(times, depths, tCaution),
    boundary: firstTimeDepthReached(times, depths, tBoundary),
    serious: firstTimeDepthReached(times, depths, tSerious),
    finalDepthM,
  };
}
