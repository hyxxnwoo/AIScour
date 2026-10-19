/** SVG path / scale helpers for viz renderers */

export function linearScale(
  domain: [number, number],
  range: [number, number],
): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function pathFrom(pts: Array<[number, number]>): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
}

/** Donut arc from startAngle to endAngle (radians, 0 = east, CCW positive in math; SVG uses CW so we negate) */
export function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function describeDonutSegment(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
): string {
  if (endAngle - startAngle >= Math.PI * 2 - 1e-6) {
    endAngle = startAngle + Math.PI * 2 - 1e-4;
  }
  const outer = describeArc(cx, cy, rOuter, startAngle, endAngle);
  const x2 = cx + rInner * Math.cos(endAngle);
  const y2 = cy + rInner * Math.sin(endAngle);
  const x1 = cx + rInner * Math.cos(startAngle);
  const y1 = cy + rInner * Math.sin(startAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  const inner = `L ${x2.toFixed(2)} ${y2.toFixed(2)} A ${rInner} ${rInner} 0 ${large} 0 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
  return `${outer} ${inner}`;
}

/** Semi-circle gauge band (top half: angles from PI to 0) */
export function semiGaugeNeedleAngle(percent0to100: number): number {
  const p = clamp(percent0to100, 0, 100) / 100;
  return Math.PI * (1 - p);
}

export function polar(cx: number, cy: number, r: number, angleRad: number): [number, number] {
  return [cx + r * Math.cos(angleRad), cy - r * Math.sin(angleRad)];
}
