import { GRADES, gradeOf, gradeDepthThresholds } from '@/constants/grade';
import { MOCK_CASE_STATUS, type MockCaseRow } from '@/data/mockCases';
import type { CaseStatusChip } from '@/utils/caseListFilter';
import { renderDonutChart } from '@/viz/donut';
import { linearScale } from '@/viz/svg';
import { countUpText } from '@/viz/tween';

export interface CaseBiStripOptions {
  allCases: MockCaseRow[];
  filtered: MockCaseRow[];
  foundationDepthM: number;
  statusChip: CaseStatusChip;
  gradeFilter: string;
}

const BI_DONUT_SIZE = 92;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function escAttr(s: string): string {
  return esc(s).replace(/'/g, '&#39;');
}

function gradeCounts(cases: MockCaseRow[], fd: number): number[] {
  const counts = [0, 0, 0, 0];
  for (const c of cases) {
    if (c.maxScourM == null) continue;
    const gi = GRADES.findIndex((g) => g.key === gradeOf(c.maxScourM!, fd).key);
    if (gi >= 0) counts[gi] += 1;
  }
  return counts;
}

function renderMiniScatterSvg(flows: MockCaseRow[], fd: number, size: number): string {
  const fMin = Math.min(...flows.map((c) => Number.parseFloat(c.flow)), 0.05);
  const fMax = Math.max(...flows.map((c) => Number.parseFloat(c.flow)), 0.12);
  const sMax = Math.max(...flows.map((c) => c.maxScourM ?? 0), fd * 0.5);
  const pad = 10;
  const iw = size - pad * 2;
  const ih = size - pad * 2;
  const sx = linearScale([fMin * 0.95, fMax * 1.05], [pad, pad + iw]);
  const sy = linearScale([0, sMax * 1.08], [pad + ih, pad]);
  const fdY = sy(Math.min(fd, sMax * 1.08));
  let dots = '';
  for (const c of flows) {
    const scour = c.maxScourM!;
    const g = gradeOf(scour, fd);
    const cx = sx(Number.parseFloat(c.flow));
    const cy = sy(scour);
    const r = 2.2 + c.diameterM * 0.35;
    const sel = c.selected ? ' case-bi-scatter__dot--sel' : '';
    const tip = esc(`${c.id} · ${c.flow} · ${scour.toFixed(2)}m · ${g.name}`);
    dots += `<g class="case-bi-scatter__dot${sel}" data-scatter-id="${esc(c.id)}" data-tip="${tip}" tabindex="0" role="button">
      <circle cx="${cx}" cy="${cy}" r="${r + 1.5}" fill="${g.color}" opacity="0.25"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${g.color}" stroke="${c.selected ? '#00D4B0' : '#0c2034'}" stroke-width="${c.selected ? 1.4 : 0.6}"/>
    </g>`;
  }
  return `<svg class="case-bi-scatter case-bi-scatter--mini" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="유량·세굴 미니맵">
    <rect x="${pad}" y="${pad}" width="${iw}" height="${ih}" rx="4" fill="#06121e" stroke="#1c3650" stroke-width="0.8"/>
    <line x1="${pad}" y1="${fdY}" x2="${pad + iw}" y2="${fdY}" class="case-bi-scatter__fd" stroke-width="0.8" stroke-dasharray="2 2"/>
    ${dots}
  </svg>`;
}

function renderFullScatterSvg(flows: MockCaseRow[], fd: number, w: number, h: number): string {
  const fMin = Math.min(...flows.map((c) => Number.parseFloat(c.flow)), 0.05);
  const fMax = Math.max(...flows.map((c) => Number.parseFloat(c.flow)), 0.12);
  const sMax = Math.max(...flows.map((c) => c.maxScourM ?? 0), fd);
  const pad = { l: 34, r: 10, t: 8, b: 20 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const sx = linearScale([fMin * 0.95, fMax * 1.05], [pad.l, pad.l + iw]);
  const sy = linearScale([0, sMax * 1.05], [pad.t + ih, pad.t]);

  const [d70, d40, d20] = gradeDepthThresholds(fd);
  const zones = [
    { y0: sy(d70), y1: sy(0), color: GRADES[0].color, op: 0.08 },
    { y0: sy(d40), y1: sy(d70), color: GRADES[1].color, op: 0.08 },
    { y0: sy(d20), y1: sy(d40), color: GRADES[2].color, op: 0.09 },
    { y0: sy(sMax * 1.05), y1: sy(d20), color: GRADES[3].color, op: 0.1 },
  ];
  let zoneSvg = '';
  for (const z of zones) {
    const y = Math.min(z.y0, z.y1);
    const hh = Math.abs(z.y1 - z.y0);
    if (hh < 1) continue;
    zoneSvg += `<rect x="${pad.l}" y="${y}" width="${iw}" height="${hh}" fill="${z.color}" opacity="${z.op}"/>`;
  }

  const fdY = sy(fd);
  const grid = `<line class="case-bi-scatter__axis" x1="${pad.l}" y1="${pad.t + ih}" x2="${pad.l + iw}" y2="${pad.t + ih}"/>
    <line class="case-bi-scatter__axis" x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ih}"/>
    <line class="case-bi-scatter__fd" x1="${pad.l}" y1="${fdY}" x2="${pad.l + iw}" y2="${fdY}" stroke-dasharray="4 3"/>
    <text class="case-bi-scatter__fd-label" x="${pad.l + iw - 2}" y="${fdY - 4}" text-anchor="end">근입 ${fd.toFixed(1)} m</text>`;

  const ticks = `<text class="case-bi-scatter__tick" x="${pad.l + iw / 2}" y="${h - 5}" text-anchor="middle">유량 m³/s</text>
    <text class="case-bi-scatter__tick" x="${sx(fMin)}" y="${h - 5}" text-anchor="start">${fMin.toFixed(2)}</text>
    <text class="case-bi-scatter__tick" x="${sx(fMax)}" y="${h - 5}" text-anchor="end">${fMax.toFixed(2)}</text>
    <text class="case-bi-scatter__tick case-bi-scatter__tick--y" x="${pad.l - 4}" y="${pad.t + ih}" text-anchor="end">${sMax.toFixed(1)} m</text>`;

  let dots = '';
  for (const c of flows) {
    const scour = c.maxScourM!;
    const g = gradeOf(scour, fd);
    const cx = sx(Number.parseFloat(c.flow));
    const cy = sy(scour);
    const r = 4 + c.diameterM * 0.95;
    const sel = c.selected ? ' case-bi-scatter__dot--sel' : '';
    const tip = esc(`${c.id} · 유량 ${c.flow} · 세굴 ${scour.toFixed(2)} m · ${g.name}`);
    dots += `<g class="case-bi-scatter__dot${sel}" data-scatter-id="${esc(c.id)}" data-tip="${tip}" tabindex="0" role="button">
      <circle cx="${cx}" cy="${cy}" r="${r + 2}" class="case-bi-scatter__halo" fill="${g.color}" opacity="0.22"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${g.color}" stroke="${c.selected ? '#00D4B0' : 'rgba(12,32,52,0.9)'}" stroke-width="${c.selected ? 2.5 : 1.2}"/>
    </g>`;
  }

  return `<svg class="case-bi-scatter case-bi-scatter--main" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="유량 대 세굴 산점도">
    ${zoneSvg}${grid}${dots}${ticks}
  </svg>`;
}

function renderBiKpi(label: string, valueHtml: string, barPct: number, mod = ''): string {
  return `<div class="case-bi-kpi${mod ? ` case-bi-kpi${mod}` : ''}">
    <span class="case-bi-kpi__label">${esc(label)}</span>
    <span class="case-bi-kpi__val">${valueHtml}</span>
    <span class="case-bi-kpi__track" aria-hidden="true"><i data-bar-pct="${barPct.toFixed(1)}" style="width:0%"></i></span>
  </div>`;
}

function renderLegendRow(opts: {
  name: string;
  count: number;
  pct: number;
  color: string;
  tip: string;
  active: boolean;
  pulse?: boolean;
  attrs: string;
}): string {
  const active = opts.active ? ' is-active' : '';
  const pulse = opts.pulse ? ' case-bi-legend__row--pulse' : '';
  return `<button type="button" class="case-bi-legend__row${active}${pulse}" data-tip="${escAttr(opts.tip)}" ${opts.attrs}>
    <span class="case-bi-legend__dot" style="--c:${opts.color}"></span>
    <span class="case-bi-legend__name">${esc(opts.name)}</span>
    <span class="case-bi-legend__count" data-bi-count="${opts.count}">0</span>
    <span class="case-bi-legend__track" aria-hidden="true"><i data-bar-pct="${opts.pct.toFixed(1)}" style="width:0%;background:${opts.color}"></i></span>
    <span class="case-bi-legend__pct">${opts.pct.toFixed(0)}%</span>
  </button>`;
}

function renderDonutSlot(
  donutHtml: string,
  hub: { id: string; label: string; value: number; sub: string },
): string {
  return `<div class="case-bi-viz-slot">
    <div class="case-bi-donut case-bi-donut--enter">${donutHtml}</div>
    <div class="case-bi-hub" data-bi-hub="${escAttr(hub.id)}">
      <span class="case-bi-hub__label">${esc(hub.label)}</span>
      <span class="case-bi-hub__value" data-bi-count="${hub.value}">0</span>
      <span class="case-bi-hub__sub" data-bi-hub-sub>${esc(hub.sub)}</span>
    </div>
  </div>`;
}

function renderStatusPanel(cases: MockCaseRow[], statusChip: CaseStatusChip): string {
  const keys = ['done', 'run', 'wait', 'err'] as const;
  const segments = keys.map((id) => ({
    id,
    value: cases.filter((c) => c.status === id).length,
    color: MOCK_CASE_STATUS[id].color,
    label: MOCK_CASE_STATUS[id].label,
  }));
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const doneN = segments.find((s) => s.id === 'done')?.value ?? 0;
  const verifyPct = (doneN / total) * 100;
  const runN = segments.find((s) => s.id === 'run')?.value ?? 0;

  const donut = renderDonutChart({
    size: BI_DONUT_SIZE,
    innerRatio: 0.64,
    segments: segments.map((s) => ({ ...s, label: s.label })),
    centerHtml: `<text x="${BI_DONUT_SIZE / 2}" y="${BI_DONUT_SIZE / 2}" opacity="0" font-size="1">전체 ${cases.length}</text>`,
  });

  const rows = segments
    .map((seg) => {
      const pct = (seg.value / total) * 100;
      const tip = `${seg.label} ${seg.value}건 (${pct.toFixed(0)}%) · 클릭해 목록 필터`;
      return renderLegendRow({
        name: seg.label,
        count: seg.value,
        pct,
        color: seg.color,
        tip,
        active: statusChip === seg.id,
        pulse: seg.id === 'run' && seg.value > 0,
        attrs: `data-donut-id="${seg.id}" data-bi-status-label="${escAttr(seg.label)}" data-bi-status-count="${seg.value}" data-bi-status-pct="${pct.toFixed(1)}"`,
      });
    })
    .join('');

  return `<section class="case-bi-panel case-bi-panel--status" aria-label="케이스 상태" data-bi-run-count="${runN}">
    <header class="case-bi-panel__head">
      <h3 class="case-bi-panel__title">상태</h3>
      <p class="case-bi-panel__hint">클릭·호버 → 목록 필터</p>
    </header>
    <div class="case-bi-panel__body">
      ${renderDonutSlot(donut, {
        id: 'status',
        label: '전체',
        value: cases.length,
        sub: `검증완료 ${verifyPct.toFixed(0)}%`,
      })}
      <div class="case-bi-panel__side">
        ${renderBiKpi('검증완료율', `<b data-bi-count="${verifyPct}">0</b>%`, verifyPct, '--ok')}
        <div class="case-bi-legend">${rows}</div>
      </div>
    </div>
  </section>`;
}

function renderGradePanel(filtered: MockCaseRow[], fd: number, gradeFilter: string): string {
  const counts = gradeCounts(filtered, fd);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const maxCount = Math.max(...counts, 1);
  const pending = filtered.filter((c) => c.maxScourM == null).length;

  const stackSegs = GRADES.map((g, i) => {
    const c = counts[i];
    const share = (c / total) * 100;
    const active = gradeFilter === g.key ? ' is-active' : '';
    const tip = escAttr(`${g.name} ${c}건 (${share.toFixed(0)}%) · ${g.action}`);
    return `<button type="button" class="case-bi-grade__stack-seg${active}${c <= 0 ? ' is-empty' : ''}" data-act="bi-grade" data-grade-key="${g.key}" data-bi-grade-label="${escAttr(g.name)}" data-bi-grade-count="${c}" data-bi-grade-pct="${share.toFixed(1)}" data-tip="${tip}" style="flex:${share.toFixed(2)} 1 0;min-width:${c > 0 ? 6 : 0}px;--seg-color:${g.color};--seg-share:${share.toFixed(2)}" aria-label="${tip}">
      <span class="case-bi-grade__stack-shine" aria-hidden="true"></span>
      <span class="case-bi-grade__stack-label">${esc(g.name)}</span>
    </button>`;
  }).join('');

  const cols = GRADES.map((g, i) => {
    const c = counts[i];
    const share = (c / total) * 100;
    const colH = (c / maxCount) * 100;
    const active = gradeFilter === g.key ? ' is-active' : '';
    const tip = escAttr(`${g.name} ${c}건 · 클릭해 등급 필터`);
    return `<button type="button" class="case-bi-grade__col${active}" data-act="bi-grade" data-grade-key="${g.key}" data-bi-grade-label="${escAttr(g.name)}" data-bi-grade-count="${c}" data-bi-grade-pct="${share.toFixed(1)}" data-tip="${tip}">
      <span class="case-bi-grade__col-share">${share.toFixed(0)}%</span>
      <span class="case-bi-grade__col-track" aria-hidden="true">
        <i class="case-bi-grade__col-fill" data-bar-pct="${colH.toFixed(1)}" style="--fill-color:${g.color};height:0%"></i>
        <span class="case-bi-grade__col-glow" style="--fill-color:${g.color}"></span>
      </span>
      <span class="case-bi-grade__col-count" data-bi-count="${c}">0</span>
      <span class="case-bi-grade__col-name" style="color:${g.color}">${esc(g.name)}</span>
    </button>`;
  }).join('');

  const scaleMarks = GRADES.map(
    (g) =>
      `<span class="case-bi-grade__scale-dot" style="background:${g.color}" title="${esc(g.name)}"></span>`,
  ).join('');

  return `<section class="case-bi-panel case-bi-panel--grade" aria-label="등급 분포">
    <header class="case-bi-panel__head">
      <h3 class="case-bi-panel__title">등급 분포</h3>
      <p class="case-bi-panel__hint">표시 중 <b data-bi-count="${total}">0</b>건 · 막대·기둥 클릭 → 등급 필터</p>
    </header>
    <div class="case-bi-panel__body case-bi-panel__body--grade">
      <div class="case-bi-grade__stack case-bi-grade__stack--enter" role="img" aria-label="등급 비율 누적 막대">${stackSegs}</div>
      <div class="case-bi-grade__chart">
        <div class="case-bi-grade__scale" aria-hidden="true">${scaleMarks}<span class="case-bi-grade__scale-cap">심각</span></div>
        <div class="case-bi-grade__cols">${cols}</div>
      </div>
      ${pending > 0 ? `<p class="case-bi-grade__pending"><span class="case-bi-grade__pending-pulse"></span>세굴 미산출 <b>${pending}</b>건은 분포에서 제외</p>` : ''}
    </div>
  </section>`;
}

function renderFlowScourPanel(filtered: MockCaseRow[], fd: number, _gradeFilter: string): string {
  const flows = filtered.filter((c) => c.maxScourM != null);
  const pending = filtered.length - flows.length;
  const maxScour = flows.length ? Math.max(...flows.map((c) => c.maxScourM ?? 0)) : 0;
  const coverPct = Math.min(100, (flows.length / Math.max(filtered.length, 1)) * 100);
  const hintExtra = pending > 0 ? ` · 미산출 ${pending}건 제외` : '';

  const mini =
    flows.length > 0
      ? renderMiniScatterSvg(flows, fd, BI_DONUT_SIZE)
      : `<svg class="case-bi-scatter case-bi-scatter--mini case-bi-scatter--empty" viewBox="0 0 ${BI_DONUT_SIZE} ${BI_DONUT_SIZE}" width="${BI_DONUT_SIZE}" height="${BI_DONUT_SIZE}" aria-hidden="true"><rect x="10" y="10" width="72" height="72" rx="4" fill="#06121e" stroke="#1c3650"/><text x="46" y="48" text-anchor="middle" fill="#6b8299" font-size="8">—</text></svg>`;

  const chartW = 320;
  const chartH = 132;
  const mainChart =
    flows.length > 0
      ? renderFullScatterSvg(flows, fd, chartW, chartH)
      : `<p class="case-bi-scatter__empty">표시할 해석 결과가 없습니다</p>`;

  return `<section class="case-bi-panel case-bi-panel--scatter" aria-label="유량과 세굴">
    <header class="case-bi-panel__head">
      <h3 class="case-bi-panel__title">유량 · 세굴</h3>
      <p class="case-bi-panel__hint">점 클릭 → 케이스 선택${hintExtra}</p>
    </header>
    <div class="case-bi-panel__body">
      ${renderDonutSlot(mini, {
        id: 'scatter',
        label: '해석',
        value: flows.length,
        sub: flows.length ? `최대 ${maxScour.toFixed(1)} m` : '결과 없음',
      })}
      <div class="case-bi-panel__side case-bi-panel__side--scatter">
        ${renderBiKpi('표시율', `<b data-bi-count="${flows.length}">0</b>/${filtered.length}`, coverPct, '--scatter')}
        <div class="case-bi-scatter-wrap">${mainChart}</div>
      </div>
    </div>
  </section>`;
}

export function renderCaseBiStrip(opts: CaseBiStripOptions): string {
  return `<div class="case-bi-strip viz-widget-grid case-bi-strip--enter" data-widget-id="case-bi" data-status-chip="${opts.statusChip}" data-grade-filter="${opts.gradeFilter}">
    ${renderStatusPanel(opts.allCases, opts.statusChip)}
    ${renderGradePanel(opts.filtered, opts.foundationDepthM, opts.gradeFilter)}
    ${renderFlowScourPanel(opts.filtered, opts.foundationDepthM, opts.gradeFilter)}
  </div>`;
}

function animateWidthBars(strip: Element): void {
  strip.querySelectorAll<HTMLElement>('[data-bar-pct]').forEach((el) => {
    const pct = el.getAttribute('data-bar-pct') ?? '0';
    if (el.classList.contains('case-bi-grade__col-fill')) return;
    el.style.width = '0%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.width = `${pct}%`;
      });
    });
  });
}

function animateHeightBars(strip: Element): void {
  strip.querySelectorAll<HTMLElement>('.case-bi-grade__col-fill[data-bar-pct]').forEach((el) => {
    const pct = el.getAttribute('data-bar-pct') ?? '0';
    el.style.height = '0%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.height = `${pct}%`;
      });
    });
  });
}

function animateStack(strip: Element): void {
  const stack = strip.querySelector('.case-bi-grade__stack--enter');
  if (stack) stack.classList.add('is-drawn');
}

function animateDonuts(strip: Element): void {
  strip.querySelectorAll('.case-bi-donut--enter').forEach((d) => d.classList.add('is-drawn'));
}

function bindCountUps(strip: Element): (() => void)[] {
  const stops: (() => void)[] = [];
  strip.querySelectorAll<HTMLElement>('[data-bi-count]').forEach((el) => {
    const to = Number.parseFloat(el.getAttribute('data-bi-count') ?? '0');
    const kpiVal = el.closest('.case-bi-kpi__val');
    const inKpi = kpiVal != null;
    const kpiText = kpiVal?.textContent ?? '';
    const isPct = inKpi && kpiText.includes('%');
    const hasSlash = inKpi && kpiText.includes('/');
    stops.push(
      countUpText(
        el,
        to,
        (v) => {
          if (hasSlash) {
            const denom = el.parentElement?.textContent?.split('/')[1]?.trim() ?? '';
            return `${Math.round(v)}/${denom}`;
          }
          if (isPct) return v.toFixed(0);
          return Math.round(v).toString();
        },
        {
          durationMs: 720,
          key: `bi-${el.closest('section')?.className}-${el.className}-${to}`,
        },
      ),
    );
  });
  return stops;
}

function setGroupDim(strip: Element, attr: string, id: string | null, selector: string): void {
  strip.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    const match = id && el.getAttribute(attr) === id;
    el.classList.toggle('is-dimmed', !!id && !match);
    el.classList.toggle('is-spotlight', !!match);
  });
}

function hubDefaults(
  strip: Element,
): Map<string, { label: string; sub: string; countAttr: string }> {
  const map = new Map<string, { label: string; sub: string; countAttr: string }>();
  strip.querySelectorAll<HTMLElement>('[data-bi-hub]').forEach((hub) => {
    const id = hub.getAttribute('data-bi-hub') ?? '';
    const valueEl = hub.querySelector<HTMLElement>('.case-bi-hub__value');
    map.set(id, {
      label: hub.querySelector('.case-bi-hub__label')?.textContent ?? '',
      sub: hub.querySelector('[data-bi-hub-sub]')?.textContent ?? '',
      countAttr: valueEl?.getAttribute('data-bi-count') ?? '0',
    });
  });
  return map;
}

/** 호버·포커스 연출 + 진입 애니메이션 (클릭은 페이지 위임) */
export function bindCaseBiStrip(container: HTMLElement): () => void {
  const strip = container.querySelector('.case-bi-strip');
  if (!strip) return () => {};

  animateDonuts(strip);
  animateStack(strip);
  animateWidthBars(strip);
  animateHeightBars(strip);
  const countStops = bindCountUps(strip);
  const hubs = hubDefaults(strip);

  const resetHub = (hubId: string): void => {
    const def = hubs.get(hubId);
    const hub = strip.querySelector<HTMLElement>(`[data-bi-hub="${hubId}"]`);
    if (!def || !hub) return;
    const label = hub.querySelector('.case-bi-hub__label');
    const sub = hub.querySelector('[data-bi-hub-sub]');
    const val = hub.querySelector('.case-bi-hub__value');
    if (label) label.textContent = def.label;
    if (sub) sub.textContent = def.sub;
    if (val) val.textContent = val.textContent ?? def.countAttr;
  };

  const setHub = (hubId: string, label: string, count: string, sub: string): void => {
    const hub = strip.querySelector<HTMLElement>(`[data-bi-hub="${hubId}"]`);
    if (!hub) return;
    const labelEl = hub.querySelector('.case-bi-hub__label');
    const subEl = hub.querySelector('[data-bi-hub-sub]');
    const valEl = hub.querySelector('.case-bi-hub__value');
    if (labelEl) labelEl.textContent = label;
    if (valEl) valEl.textContent = count;
    if (subEl) subEl.textContent = sub;
  };

  const resetAllHubs = (): void => {
    for (const id of hubs.keys()) resetHub(id);
  };

  const spotlightStatus = (id: string | null): void => {
    const panel = strip.querySelector('.case-bi-panel--status');
    if (!panel) return;
    setGroupDim(panel, 'data-donut-id', id, '[data-donut-id]');
    setGroupDim(panel, 'data-donut-id', id, '.viz-donut-seg');
  };

  const spotlightGrade = (key: string | null): void => {
    const panel = strip.querySelector('.case-bi-panel--grade');
    if (!panel) return;
    setGroupDim(panel, 'data-grade-key', key, '[data-grade-key]');
  };

  const setGradeHub = (el: HTMLElement): void => {
    const key = el.getAttribute('data-grade-key');
    if (!key) return;
    setHub(
      'grade',
      el.getAttribute('data-bi-grade-label') ?? key,
      el.getAttribute('data-bi-grade-count') ?? '0',
      `${el.getAttribute('data-bi-grade-pct') ?? '0'}%`,
    );
    spotlightGrade(key);
  };

  const onOver = (e: Event): void => {
    const t = e.target as HTMLElement;
    const scatterDot = t.closest('[data-scatter-id]');
    if (scatterDot) {
      setGroupDim(
        strip,
        'data-scatter-id',
        scatterDot.getAttribute('data-scatter-id'),
        '[data-scatter-id]',
      );
      return;
    }

    const seg = t.closest('.viz-donut-seg');
    if (seg instanceof SVGPathElement) {
      const panel = seg.closest('.case-bi-panel');
      const id = seg.getAttribute('data-donut-id');
      if (!id || !panel) return;
      if (panel.classList.contains('case-bi-panel--status')) {
        const row = panel.querySelector<HTMLElement>(`.case-bi-legend__row[data-donut-id="${id}"]`);
        if (row) {
          setHub(
            'status',
            row.getAttribute('data-bi-status-label') ?? id,
            row.getAttribute('data-bi-status-count') ?? '0',
            `${row.getAttribute('data-bi-status-pct') ?? '0'}%`,
          );
        }
        spotlightStatus(id);
      }
      return;
    }

    const statusRow = t.closest('.case-bi-panel--status .case-bi-legend__row');
    if (statusRow instanceof HTMLElement) {
      const id = statusRow.getAttribute('data-donut-id');
      if (id) {
        setHub(
          'status',
          statusRow.getAttribute('data-bi-status-label') ?? id,
          statusRow.getAttribute('data-bi-status-count') ?? '0',
          `${statusRow.getAttribute('data-bi-status-pct') ?? '0'}%`,
        );
        spotlightStatus(id);
      }
      return;
    }

    const gradeHit = t.closest(
      '.case-bi-panel--grade .case-bi-grade__stack-seg, .case-bi-panel--grade .case-bi-grade__col',
    );
    if (gradeHit instanceof HTMLElement) {
      setGradeHub(gradeHit);
    }
  };

  const onOut = (e: Event): void => {
    const rel = (e as MouseEvent).relatedTarget;
    if (rel instanceof Node && strip.contains(rel)) return;
    strip.querySelectorAll('.is-dimmed, .is-spotlight').forEach((el) => {
      el.classList.remove('is-dimmed', 'is-spotlight');
    });
    resetAllHubs();
  };

  strip.addEventListener('mouseover', onOver);
  strip.addEventListener('mouseout', onOut);
  strip.addEventListener('focusin', onOver);
  strip.addEventListener('focusout', onOut);

  return () => {
    strip.removeEventListener('mouseover', onOver);
    strip.removeEventListener('mouseout', onOut);
    strip.removeEventListener('focusin', onOver);
    strip.removeEventListener('focusout', onOut);
    countStops.forEach((stop) => stop());
  };
}
