import { groupHistoryByDay, kindDotColor, type ParsedHistoryRow } from '@/viz/eventTimelineHelpers';

export function renderEventTimeline(rows: ParsedHistoryRow[]): string {
  const byDay = groupHistoryByDay(rows);
  const days = [...byDay.keys()].sort((a, b) => (a < b ? 1 : -1));
  let html = '<div class="viz-event-timeline">';
  for (const day of days) {
    const items = byDay.get(day) ?? [];
    html += `<div class="viz-event-timeline__day"><div class="viz-event-timeline__day-label">${day}</div><div class="viz-event-timeline__rail">`;
    for (const item of items) {
      const dot = kindDotColor(item.kind);
      const icon = item.who === '시스템' ? '⚙' : '👤';
      html += `<div class="viz-event-timeline__item viz-event-timeline__item--${item.kind}">
        <span class="viz-event-timeline__dot" style="background:${dot}"></span>
        <span class="viz-event-timeline__icon" aria-hidden="true">${icon}</span>
        <div class="viz-event-timeline__body">
          <span class="viz-event-timeline__at">${item.at.split(' ')[1] ?? item.at}</span>
          <span class="viz-event-timeline__who">${item.who}</span>
          <span class="viz-event-timeline__text">${item.text}</span>
        </div>
      </div>`;
    }
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

/** Grade ladder: 4 steps, highlight current */
export function renderGradeLadder(currentKey: string, pulse = true): string {
  const keys = ['a1', 'a2', 'a3', 'a4'];
  const names = ['관심', '주의', '경계', '심각'];
  const colors = ['#2E7DD1', '#E8B21A', '#E8791A', '#D02B2B'];
  return `<div class="viz-grade-ladder">${keys
    .map((k, i) => {
      const on = k === currentKey;
      return `<div class="viz-grade-ladder__step ${on && pulse ? 'viz-grade-ladder__step--pulse' : ''} ${on ? 'is-on' : ''}" style="--step-color:${colors[i]}">
        <span class="viz-grade-ladder__bar"></span><span class="viz-grade-ladder__name">${names[i]}</span>
      </div>`;
    })
    .join('')}</div>`;
}

/** 14-day alert heat strip */
export function renderHeatStrip(
  cells: Array<{ label: string; color: string; count: number }>,
): string {
  return `<div class="viz-heat-strip">${cells
    .map(
      (c) =>
        `<span class="viz-heat-strip__cell" style="background:${c.color}${c.count ? '' : '33'}" data-tip="${c.label}: ${c.count}건" title="${c.label}"></span>`,
    )
    .join('')}</div>`;
}
