import { GRADES, gradeOf } from '@/constants/grade';

export interface GradeBarOptions {
  scourDepthM: number;
  foundationDepthM: number;
  width?: number;
  height?: number;
}

/** Inline scour depth bar with 30/60/80% remain ticks */
export function renderGradeBar(opts: GradeBarOptions): string {
  const w = opts.width ?? 72;
  const fd = Math.max(opts.foundationDepthM, 1e-9);
  const depth = Math.max(0, opts.scourDepthM);
  const pct = Math.min(100, (depth / fd) * 100);
  const g = gradeOf(depth, fd);
  const zones: Array<[number, number, string]> = [
    [0, 30, GRADES[0].color],
    [30, 60, GRADES[1].color],
    [60, 80, GRADES[2].color],
    [80, 100, GRADES[3].color],
  ];
  let zhtml = '';
  for (const [lo, hi, c] of zones) {
    zhtml += `<span class="viz-grade-bar__zone" style="left:${lo}%;width:${hi - lo}%;background:${c}"></span>`;
  }
  const tip = `세굴 ${depth.toFixed(2)} m / 근입 ${fd.toFixed(2)} m · ${g.name}`;
  return `<span class="viz-grade-bar" data-tip="${tip}" style="width:${w}px">
    <span class="viz-grade-bar__track">${zhtml}
      <span class="viz-grade-bar__fill" style="width:${pct}%;background:${g.color}"></span>
      <span class="viz-grade-bar__knob" style="left:${pct}%;background:${g.color}"></span>
    </span>
  </span>`;
}
