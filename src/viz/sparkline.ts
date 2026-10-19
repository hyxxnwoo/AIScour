import { pathFrom } from '@/viz/svg';

export interface SparklineOptions {
  values: number[];
  times?: number[];
  currentIndex?: number;
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  showArea?: boolean;
}

export function renderSparkline(opts: SparklineOptions): string {
  const w = opts.width ?? 120;
  const h = opts.height ?? 36;
  const pad = 2;
  const vals = opts.values;
  if (vals.length === 0) {
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"></svg>`;
  }
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const span = mx - mn || 1;
  const pts: Array<[number, number]> = vals.map((v, i) => [
    pad + (i / Math.max(vals.length - 1, 1)) * (w - pad * 2),
    pad + (1 - (v - mn) / span) * (h - pad * 2),
  ]);
  const stroke = opts.stroke ?? '#7ec8e3';
  const fill = opts.fill ?? `${stroke}33`;
  const ci = opts.currentIndex ?? vals.length - 1;
  const split = Math.min(ci, pts.length - 1);
  const past = pts.slice(0, split + 1);
  const future = pts.slice(split);
  let svg = `<svg class="viz-sparkline" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
  if (opts.showArea !== false && past.length > 1) {
    const area = `${pathFrom(past)} L ${past[past.length - 1][0].toFixed(2)} ${h - pad} L ${past[0][0].toFixed(2)} ${h - pad} Z`;
    svg += `<path d="${area}" fill="${fill}"/>`;
  }
  if (past.length > 1) {
    svg += `<path d="${pathFrom(past)}" fill="none" stroke="${stroke}" stroke-width="1.8"/>`;
  }
  if (future.length > 1) {
    svg += `<path d="${pathFrom(future)}" fill="none" stroke="${stroke}" stroke-width="1.2" opacity="0.35" stroke-dasharray="3 3"/>`;
  }
  const last = pts[split];
  if (last) {
    svg += `<circle cx="${last[0]}" cy="${last[1]}" r="2.5" fill="#00D4B0"/>`;
  }
  svg += '</svg>';
  return svg;
}

/** Signed bar: negative scour left (red), positive deposit right (blue) */
export function renderSignedBar(value: number, maxAbs: number, width = 160, height = 14): string {
  const mid = width / 2;
  const scale = (mid - 4) / (maxAbs || 1);
  const x0 = value < 0 ? mid + value * scale : mid;
  const x1 = value < 0 ? mid : mid + value * scale;
  const w = Math.abs(x1 - x0);
  const color = value < 0 ? '#E8791A' : '#2E7DD1';
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="viz-signed-bar">
    <line x1="${mid}" y1="1" x2="${mid}" y2="${height - 1}" stroke="#4E6F8C"/>
    <rect x="${Math.min(x0, x1)}" y="2" width="${Math.max(w, 1)}" height="${height - 4}" rx="2" fill="${color}"/>
  </svg>`;
}
