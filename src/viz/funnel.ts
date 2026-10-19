export interface FunnelStep {
  id: string;
  label: string;
  count: number;
  total: number;
  tone: 'ok' | 'warn';
}

export function renderFunnel(steps: FunnelStep[], maxWidth = 480): string {
  const maxCount = Math.max(...steps.map((s) => s.total), 1);
  let html = '<div class="viz-funnel">';
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const pct = (s.count / maxCount) * 100;
    const w = Math.max(18, (pct / 100) * maxWidth);
    const col = s.tone === 'ok' ? '#2EA36B' : '#E8B21A';
    const drop = i > 0 ? steps[i - 1].count - s.count : 0;
    const dropHtml =
      drop > 0 && i > 0
        ? `<span class="viz-funnel__drop" title="이탈 ${drop}">−${drop}</span>`
        : '';
    const shimmer = s.count < s.total && s.count > 0 ? ' viz-funnel__step--shimmer' : '';
    html += `${dropHtml}<button type="button" class="viz-funnel__step${shimmer}" data-funnel-id="${s.id}" style="width:${w}px;border-color:${col}55">
      <span class="viz-funnel__step-label">${i + 1}. ${s.label}</span>
      <span class="viz-funnel__step-val" style="color:${col}">${s.count} / ${s.total}</span>
      <span class="viz-funnel__step-bar"><i style="width:${s.total > 0 ? (s.count / s.total) * 100 : 0}%;background:${col}"></i></span>
    </button>`;
  }
  html += '</div>';
  return html;
}
