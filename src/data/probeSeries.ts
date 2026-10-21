/** 시간별 하상 변화 요약(프로브) 시리즈 — 재생 시각에 맞는 평균 scrdif·범위 조회용. */

export interface SampleProbeBounds {
  minDataX: number;
  maxDataX: number;
  minDataY: number;
  maxDataY: number;
  minDataZ: number;
  maxDataZ: number;
  centerDataX: number;
  centerDataY: number;
  centerDataZ: number;
  /** worldX = dataX - originDataX (수조 입구 기준 X). */
  originDataX: number;
  /** worldZ = dataY - originDataY (횡단 중심 기준 Z). */
  originDataY: number;
  minScrdif: number;
  maxScrdif: number;
}

export interface SampleProbeSample {
  t: number;
  /** 시간 블록 인덱스(0-based). */
  timeIndex: number;
  /** @deprecated timeIndex 와 동일. UI 호환용. */
  rowIndex: number;
  dataX: number;
  dataY: number;
  dataZ: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  u: number;
  v: number;
  w: number;
  scrdif: number;
}

export interface SampleProbeSeries {
  samples: SampleProbeSample[];
  /** 전체 시간 블록 수(stride 적용 전). */
  rowCount: number;
  baseIntervalSeconds: number;
  stepMultiple: number;
  durationSeconds: number;
  bounds: SampleProbeBounds;
}

export function probeDurationSeconds(timeBlockCount: number, intervalSeconds = 30): number {
  if (timeBlockCount <= 0) return 0;
  return (timeBlockCount - 1) * intervalSeconds;
}

export function timeIndexAtTime(
  timeBlockCount: number,
  timeSeconds: number,
  intervalSeconds = 30,
): number {
  if (timeBlockCount <= 0) return 0;
  return Math.min(timeBlockCount - 1, Math.max(0, Math.floor(timeSeconds / intervalSeconds)));
}

/** 시각 t 에 맞는 프로브 샘플(보간 없음, stride 정렬). */
export function probeAtTime(
  series: SampleProbeSeries,
  timeSeconds: number,
): SampleProbeSample | null {
  const { samples, baseIntervalSeconds, stepMultiple, rowCount } = series;
  if (samples.length === 0 || rowCount <= 0) return null;

  let timeIndex = timeIndexAtTime(rowCount, timeSeconds, baseIntervalSeconds);
  timeIndex -= timeIndex % stepMultiple;

  let sample = samples[0];
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (s.timeIndex <= timeIndex) sample = s;
    else break;
  }

  return sample;
}

/**
 * 프로브 시계열에서 u/v/w/scrdif 중 하나의 min/max 를 구한다 (수면 색·범례·차트 범위 계산용).
 * scrdif 는 샘플(프레임별 대표값)이 아니라 CSV 전체 min/max(bounds)를 쓴다.
 */
export function probeSeriesValueRange(
  series: SampleProbeSeries,
  key: 'u' | 'v' | 'w' | 'scrdif',
): { min: number; max: number } {
  if (key === 'scrdif') {
    const { minScrdif, maxScrdif } = series.bounds;
    if (Number.isFinite(minScrdif) && Number.isFinite(maxScrdif) && minScrdif !== maxScrdif) {
      return { min: minScrdif, max: maxScrdif };
    }
  }
  let min = Infinity;
  let max = -Infinity;
  for (const s of series.samples) {
    const v = s[key];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!isFinite(min) || !isFinite(max) || min === max) {
    return { min: 0, max: 1 };
  }
  return { min, max };
}
