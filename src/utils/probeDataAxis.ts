/** 같은 측정면으로 볼 좌표 오차 = 축 전체 길이 × 이 비율. */
export const COORD_MERGE_RATIO = 1e-4;

/** CSV 한 축에 실제로 존재하는 좌표값 목록. */
export interface DataAxis {
  /** 오름차순 유일 좌표값. */
  values: Float64Array;
  min: number;
  span: number;
  /** 측정점 대표 간격(중앙값). 측정면이 1개면 0. */
  spacing: number;
}

export function medianOfSorted(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function buildDataAxis(source: Float32Array, count: number): DataAxis {
  if (count <= 0) {
    return { values: Float64Array.of(0), min: 0, span: 0, spacing: 0 };
  }

  const sorted = Float64Array.from(source.subarray(0, count)).sort();
  const min = sorted[0]!;
  const max = sorted[count - 1]!;
  const tolerance = Math.max(1e-9, (max - min) * COORD_MERGE_RATIO);

  const unique: number[] = [min];
  for (let i = 1; i < count; i += 1) {
    const v = sorted[i]!;
    if (v - unique[unique.length - 1]! > tolerance) unique.push(v);
  }

  const gaps: number[] = [];
  for (let i = 1; i < unique.length; i += 1) {
    gaps.push(unique[i]! - unique[i - 1]!);
  }
  gaps.sort((a, b) => a - b);

  return {
    values: Float64Array.from(unique),
    min,
    span: max - min,
    spacing: medianOfSorted(gaps),
  };
}

/** 오름차순 배열에서 v 에 가장 가까운 인덱스. */
export function nearestIndex(values: Float64Array, v: number): number {
  let lo = 0;
  let hi = values.length - 1;
  if (hi <= 0 || v <= values[0]!) return 0;
  if (v >= values[hi]!) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (values[mid]! <= v) lo = mid;
    else hi = mid;
  }
  return v - values[lo]! <= values[hi]! - v ? lo : hi;
}
