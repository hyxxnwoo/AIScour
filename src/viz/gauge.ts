import { GRADES, REMAIN_PCT_THRESHOLDS } from '@/constants/grade';
import { describeDonutSegment, polar, semiGaugeNeedleAngle } from '@/viz/svg';

export interface SemiGaugeOptions {
  valuePct: number;
  size?: number;
  showLabel?: boolean;
  label?: string;
  accent?: string;
  /** 70/40/20 % 잠정 경계 눈금 */
  showGradeTicks?: boolean;
  pulse?: boolean;
}

/** Remain-% semi gauge with 4 grade bands (top half) */
export function renderSemiRemainGauge(opts: SemiGaugeOptions): string {
  const size = opts.size ?? 120;
  const cx = size / 2;
  const cy = size * 0.58;
  const ro = size * 0.42;
  const ri = size * 0.28;
  const bands: Array<[number, number, string]> = [
    [0, REMAIN_PCT_THRESHOLDS.boundary, GRADES[3].color],
    [REMAIN_PCT_THRESHOLDS.boundary, REMAIN_PCT_THRESHOLDS.caution, GRADES[2].color],
    [REMAIN_PCT_THRESHOLDS.caution, REMAIN_PCT_THRESHOLDS.attention, GRADES[1].color],
    [REMAIN_PCT_THRESHOLDS.attention, 100, GRADES[0].color],
  ];
  let arcs = '';
  for (const [lo, hi, color] of bands) {
    const a0 = Math.PI * (1 - hi / 100);
    const a1 = Math.PI * (1 - lo / 100);
    // describeArc 는 SVG 좌표(y 아래로 증가)로 각도를 해석해 양의 각도가 아래쪽 반원이 된다.
    // 바늘·눈금(polar)은 위쪽 반원이므로, 색 띠도 각도를 뒤집어 같은 위쪽 반원에 그린다.
    arcs += `<path d="${describeDonutSegment(cx, cy, ro, ri, -a1, -a0)}" fill="${color}" opacity="0.35"/>`;
  }
  const needleA = semiGaugeNeedleAngle(opts.valuePct);
  const [nx, ny] = polar(cx, cy, ro - 4, needleA);
  const accent = opts.accent ?? '#00D4B0';
  const label =
    opts.showLabel !== false
      ? `<text x="${cx}" y="${cy + 8}" text-anchor="middle" fill="#fff" font-size="16" font-weight="800">${Math.round(opts.valuePct)}%</text>`
      : '';
  const sub = opts.label
    ? `<text x="${cx}" y="${cy + 22}" text-anchor="middle" fill="#9FB6C8" font-size="12">${opts.label}</text>`
    : '';
  let ticks = '';
  if (opts.showGradeTicks) {
    for (const pct of [
      REMAIN_PCT_THRESHOLDS.attention,
      REMAIN_PCT_THRESHOLDS.caution,
      REMAIN_PCT_THRESHOLDS.boundary,
    ]) {
      const a = semiGaugeNeedleAngle(pct);
      const [x0, y0] = polar(cx, cy, ri - 2, a);
      const [x1, y1] = polar(cx, cy, ro + 2, a);
      ticks += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="rgba(255,255,255,0.45)" stroke-width="1"/>`;
    }
  }
  const pulseCls = opts.pulse ? ' viz-semi-gauge--pulse' : '';
  // 보조 라벨(cy+22)이 있으면 글자 아래쪽까지 들어가도록 높이를 늘린다(기본 높이로는 라벨이 잘린다).
  const height = opts.label ? Math.max(size * 0.72, cy + 28) : size * 0.72;
  return `<svg class="viz-semi-gauge${pulseCls}" viewBox="0 0 ${size} ${height}" width="${size}" height="${height}" aria-hidden="true">
    ${arcs}${ticks}
    <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="4" fill="${accent}"/>
    ${label}${sub}
  </svg>`;
}

export interface RingGaugeOptions {
  value: number;
  max: number;
  size?: number;
  color?: string;
  track?: string;
  label?: string;
}

export function renderRingGauge(opts: RingGaugeOptions): string {
  const size = opts.size ?? 44;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const stroke = size * 0.12;
  const pct = Math.min(1, Math.max(0, opts.value / (opts.max || 1)));
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  const color = opts.color ?? '#2EA36B';
  const track = opts.track ?? '#1E3A57';
  const label = opts.label
    ? `<text x="${cx}" y="${cy + 3}" text-anchor="middle" fill="#fff" font-size="11" font-weight="700">${opts.label}</text>`
    : '';
  return `<svg class="viz-ring-gauge" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"/>
    ${label}
  </svg>`;
}

export function renderEmptyRingPlaceholder(size = 48, label = '—'): string {
  return renderRingGauge({ value: 0, max: 1, size, color: '#4E6F8C', label });
}
