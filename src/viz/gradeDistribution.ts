import { GRADES, gradeOf } from '@/constants/grade';

/** Stacked horizontal bar of grade counts */
export function renderGradeDistribution(
  scourDepths: Array<number | null>,
  foundationDepthM: number,
): string {
  const counts = [0, 0, 0, 0];
  for (const d of scourDepths) {
    if (d == null) continue;
    const gi = GRADES.findIndex((g) => g.key === gradeOf(d, foundationDepthM).key);
    if (gi >= 0) counts[gi] += 1;
  }
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  let segs = '';
  counts.forEach((c, i) => {
    if (c <= 0) return;
    const pct = (c / total) * 100;
    segs += `<span class="viz-grade-dist__seg" style="width:${pct}%;background:${GRADES[i].color}" data-tip="${GRADES[i].name} ${c}건"></span>`;
  });
  return `<div class="viz-grade-dist">${segs || '<span class="viz-grade-dist__empty">—</span>'}</div>`;
}
