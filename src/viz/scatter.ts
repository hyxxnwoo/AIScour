import { linearScale } from '@/viz/svg';

export interface ScatterPoint {
  id: string;
  x: number;
  y: number;
  r: number;
  color: string;
  selected?: boolean;
}

export interface ScatterPlotOptions {
  points: ScatterPoint[];
  xDomain: [number, number];
  yDomain: [number, number];
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
}

export function renderScatterPlot(opts: ScatterPlotOptions): string {
  const w = opts.width ?? 280;
  const h = opts.height ?? 140;
  const pad = { l: 36, r: 12, t: 8, b: 22 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const sx = linearScale(opts.xDomain, [pad.l, pad.l + iw]);
  const sy = linearScale(opts.yDomain, [pad.t + ih, pad.t]);
  let dots = '';
  for (const p of opts.points) {
    const cx = sx(p.x);
    const cy = sy(p.y);
    const stroke = p.selected ? '#00D4B0' : 'transparent';
    dots += `<circle class="viz-scatter-dot" data-scatter-id="${p.id}" cx="${cx}" cy="${cy}" r="${p.r}" fill="${p.color}" stroke="${stroke}" stroke-width="2" opacity="0.9"/>`;
  }
  const grid = `<line x1="${pad.l}" y1="${pad.t + ih}" x2="${pad.l + iw}" y2="${pad.t + ih}" stroke="#1C3650"/>
    <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ih}" stroke="#1C3650"/>`;
  const xl = opts.xLabel ?? '';
  const yl = opts.yLabel ?? '';
  return `<svg class="viz-scatter" viewBox="0 0 ${w} ${h}" width="100%" height="${h}">
    ${grid}${dots}
    <text x="${pad.l + iw / 2}" y="${h - 4}" fill="#6B8299" font-size="12" text-anchor="middle">${xl}</text>
    <text x="8" y="${pad.t + ih / 2}" fill="#6B8299" font-size="12" transform="rotate(-90 8 ${pad.t + ih / 2})">${yl}</text>
  </svg>`;
}
