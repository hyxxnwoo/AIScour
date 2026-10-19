import {
  formatRemainMarginPctShort,
  REMAIN_MARGIN_PCT_LABEL,
  SCOUR_OF_FOUNDATION_PCT_LABEL,
} from '@/constants/fieldLabels';
import { gradeOf, remainPct } from '@/constants/grade';

const VIZCOL = 'mgmt-table-vizcol';

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function barStyle(color: string, pct: number): string {
  const w = pct.toFixed(1);
  return `--bar-pct:${w}%;--bar-color:${color};--bar-glow:${color}99`;
}

/** 헤더·본문 동일 폭 — 컬럼명 (th, 본문 value+bar와 세로 정렬) */
export function renderTableVizColHead(label: string | string[], mod = ''): string {
  const cls = mod ? `${VIZCOL} ${VIZCOL}--head ${mod}` : `${VIZCOL} ${VIZCOL}--head`;
  const lines = Array.isArray(label) ? label : [label];
  const labelHtml = lines
    .map((line) => `<span class="${VIZCOL}__label-line">${line}</span>`)
    .join('');
  return `<span class="${cls}"><span class="${VIZCOL}__label">${labelHtml}</span></span>`;
}

export interface TableMetricCellOpts {
  caseId: string;
  metric: 'diameter' | 'flow' | 'grain' | 'scour';
  tip: string;
}

function renderBarInner(pct: number, color: string): string {
  const w = Math.max(0, Math.min(100, pct));
  return `<span class="${VIZCOL}__bar" aria-hidden="true">
    <i class="${VIZCOL}__fill" style="${barStyle(color, w)}">
      <span class="${VIZCOL}__shine"></span>
    </i>
  </span>`;
}

/** 본문 — 수치 + 짧은 막대 (헤더와 같은 vizcol 폭) */
export function renderTableMetricCell(
  valueText: string,
  pctOfMax: number,
  barColor: string,
  opts: TableMetricCellOpts,
): string {
  const w = Math.max(0, Math.min(100, pctOfMax));
  const tip = escAttr(opts.tip);
  const hot = w >= 85 ? ` ${VIZCOL}--hot` : '';
  return `<button type="button" class="${VIZCOL} ${VIZCOL}--btn ${VIZCOL}--${opts.metric}${hot}" data-act="metric-focus" data-case-id="${opts.caseId}" data-metric="${opts.metric}" data-tip="${tip}" aria-label="${tip}">
    <span class="${VIZCOL}__val"><span class="${VIZCOL}__num">${valueText}</span></span>
    ${renderBarInner(w, barColor)}
  </button>`;
}

/** 최대 세굴 */
export function renderTableScourCell(
  scourDepthM: number,
  foundationDepthM: number,
  caseId: string,
): string {
  const fd = Math.max(foundationDepthM, 1e-9);
  const g = gradeOf(scourDepthM, fd);
  const pct = Math.min(100, (Math.max(0, scourDepthM) / fd) * 100);
  const remain = remainPct(scourDepthM, fd);
  const remainShort = formatRemainMarginPctShort(remain);
  const tip = escAttr(
    `최대 세굴 ${scourDepthM.toFixed(2)} m · ${SCOUR_OF_FOUNDATION_PCT_LABEL} ${pct.toFixed(0)}% · ${REMAIN_MARGIN_PCT_LABEL} ${remain.toFixed(0)}% (${remainShort}) · ${g.name} (${g.action})`,
  );
  return `<button type="button" class="${VIZCOL} ${VIZCOL}--btn ${VIZCOL}--scour" data-act="metric-focus" data-case-id="${caseId}" data-metric="scour" data-tip="${tip}" aria-label="${tip}">
    <span class="${VIZCOL}__val"><span class="${VIZCOL}__num">${scourDepthM.toFixed(2)} m</span></span>
    <span class="${VIZCOL}__meta"><span class="grade-pill grade-pill--${g.key}">${g.name}</span></span>
    ${renderBarInner(pct, g.color)}
  </button>`;
}

/** 표 렌더 후 막대 채움·행·열 연동 */
export function bindTableMetricViz(container: HTMLElement): () => void {
  const table = container.querySelector<HTMLElement>('.mgmt-table--viz');
  const fills = container.querySelectorAll<HTMLElement>(`.${VIZCOL}__fill`);

  fills.forEach((fill) => fill.classList.remove('is-drawn'));
  table?.classList.add('is-bars-enter');
  const raf = requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fills.forEach((fill) => fill.classList.add('is-drawn'));
      table?.classList.remove('is-bars-enter');
    });
  });

  const setHoverMetric = (metric: string | null): void => {
    if (!table) return;
    if (metric) table.setAttribute('data-hover-metric', metric);
    else table.removeAttribute('data-hover-metric');
  };

  const onOver = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(`.${VIZCOL}--btn`);
    if (!btn) return;
    btn.closest('tr')?.classList.add('is-metric-hover');
    const m = btn.getAttribute('data-metric');
    if (m) setHoverMetric(m);
  };
  const onOut = (e: Event): void => {
    const rel = (e as MouseEvent).relatedTarget;
    const btn = (e.target as HTMLElement).closest(`.${VIZCOL}--btn`);
    if (!btn) return;
    if (rel instanceof Node && btn.contains(rel)) return;
    btn.closest('tr')?.classList.remove('is-metric-hover');
    const still = rel instanceof HTMLElement ? rel.closest(`.${VIZCOL}--btn`) : null;
    setHoverMetric(still?.getAttribute('data-metric') ?? null);
  };

  const onClick = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(`.${VIZCOL}--btn`);
    if (!btn) return;
    btn.classList.remove('is-flash');
    void btn.offsetWidth;
    btn.classList.add('is-flash');
  };

  container.addEventListener('mouseover', onOver);
  container.addEventListener('mouseout', onOut);
  container.addEventListener('click', onClick);

  return () => {
    cancelAnimationFrame(raf);
    container.removeEventListener('mouseover', onOver);
    container.removeEventListener('mouseout', onOut);
    container.removeEventListener('click', onClick);
    setHoverMetric(null);
    table?.classList.remove('is-bars-enter');
    container
      .querySelectorAll('tr.is-metric-hover')
      .forEach((tr) => tr.classList.remove('is-metric-hover'));
  };
}
