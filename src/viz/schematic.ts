import type { SimParams } from '@/types/simParams';

/** 조건 설정용 단면 스키매틱 (교각·수심·근입) */
export function renderCrossSectionSchematic(params: SimParams): string {
  const W = 220;
  const H = 100;
  const waterY = 28;
  const bedY = 72;
  const fd = params.foundationDepth;
  const pierR = Math.min(14, params.pierDiameter * 6);
  const n = Math.min(5, Math.max(1, params.pierCount));
  const spacing = (W - 40) / Math.max(n - 1, 1);
  let piers = '';
  for (let i = 0; i < n; i++) {
    const cx = 20 + i * spacing;
    piers += `<rect x="${cx - pierR / 2}" y="${waterY}" width="${pierR}" height="${bedY - waterY + fd * 4}" fill="#8FA4B8" opacity="0.7" rx="2"/>
      <line x1="${cx}" y1="${bedY}" x2="${cx}" y2="${bedY + fd * 4}" stroke="#3987e5" stroke-width="2" stroke-dasharray="3 2"/>`;
  }
  return `<svg class="viz-schematic" viewBox="0 0 ${W} ${H + fd * 4}" width="100%" height="120">
    <line x1="8" y1="${waterY}" x2="${W - 8}" y2="${waterY}" stroke="#46a8c8" stroke-width="2"/>
    <text x="10" y="${waterY - 4}" fill="#7ec8e3" font-size="11">수심 ${params.waterDepth.toFixed(2)} m</text>
    <line x1="8" y1="${bedY}" x2="${W - 8}" y2="${bedY}" stroke="#C4A574" stroke-width="1.5"/>
    ${piers}
    <text x="10" y="${bedY + fd * 4 + 10}" fill="#6B8299" font-size="11">근입 ${fd.toFixed(2)} m · 교각 ${n} · D=${params.pierDiameter.toFixed(2)} m</text>
  </svg>`;
}
