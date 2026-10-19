/** Bin numeric samples for histogram overlay */

export interface HistogramBin {
  lo: number;
  hi: number;
  count: number;
}

export function binValues(
  values: number[],
  binCount: number,
  domain?: [number, number],
): HistogramBin[] {
  if (values.length === 0 || binCount < 1) return [];
  const lo = domain?.[0] ?? Math.min(...values);
  let hi = domain?.[1] ?? Math.max(...values);
  if (hi === lo) hi = lo + 1;
  const step = (hi - lo) / binCount;
  const bins: HistogramBin[] = [];
  for (let i = 0; i < binCount; i++) {
    bins.push({ lo: lo + i * step, hi: lo + (i + 1) * step, count: 0 });
  }
  for (const v of values) {
    let idx = Math.floor(((v - lo) / (hi - lo)) * binCount);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count += 1;
  }
  return bins;
}

export function binMaxCount(bins: HistogramBin[]): number {
  return bins.reduce((m, b) => Math.max(m, b.count), 0);
}
