import { describeDonutSegment } from '@/viz/svg';

export interface DonutSegment {
  id: string;
  value: number;
  color: string;
  label: string;
}

export interface DonutChartOptions {
  segments: DonutSegment[];
  size?: number;
  innerRatio?: number;
  centerHtml?: string;
}

export function renderDonutChart(opts: DonutChartOptions): string {
  const size = opts.size ?? 100;
  const cx = size / 2;
  const cy = size / 2;
  const ro = size * 0.46;
  const ri = ro * (opts.innerRatio ?? 0.58);
  const total = opts.segments.reduce((s, x) => s + x.value, 0) || 1;
  let angle = -Math.PI / 2;
  let paths = '';
  for (const seg of opts.segments) {
    if (seg.value <= 0) continue;
    const sweep = (seg.value / total) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    paths += `<path class="viz-donut-seg viz-donut-seg--hit" data-donut-id="${seg.id}" tabindex="-1" d="${describeDonutSegment(cx, cy, ro, ri, a0, a1)}" fill="${seg.color}" stroke="#0C2034" stroke-width="0.6">
      <title>${seg.label}: ${seg.value}</title>
    </path>`;
  }
  const center =
    opts.centerHtml ??
    `<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">${total}</text>`;
  return `<svg class="viz-donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${paths}${center}</svg>`;
}
