import {
  BED_MATERIAL_GRAIN_LABEL,
  formatBedMaterialGrainMm,
  formatRemainMarginPctShort,
  REMAIN_MARGIN_PCT_LABEL,
  SCOUR_OF_FOUNDATION_PCT_LABEL,
} from '@/constants/fieldLabels';
import { DEFAULT_FOUNDATION_DEPTH_M, gradeOf, remainPct, type Grade } from '@/constants/grade';
import { MOCK_CASE_STATUS, type MockCaseRow } from '@/data/mockCases';
import { renderSemiRemainGauge } from '@/viz/gauge';
import { renderCaseIdCell, renderCaseStatusBadge, renderShapeCell } from '@/viz/tableCaseCells';

export interface RenderCaseSelectedSummaryOpts {
  row: MockCaseRow | null;
  foundationDepthM?: number;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function renderScourStrip(scourM: number, fd: number, g: Grade): string {
  const pct = Math.min(100, (Math.max(0, scourM) / fd) * 100);
  const remain = remainPct(scourM, fd);
  return `<div class="case-sel-summary__scour-strip">
    <div class="case-sel-summary__scour-top">
      <span class="case-sel-summary__scour-depth">${scourM.toFixed(2)} m</span>
      <span class="grade-pill grade-pill--${g.key}">${g.name}</span>
    </div>
    <div class="mgmt-table-vizcol__bar" aria-hidden="true">
      <i class="mgmt-table-vizcol__fill" style="--bar-pct:${pct.toFixed(1)}%;--bar-color:${g.color};--bar-glow:${g.color}99">
        <span class="mgmt-table-vizcol__shine"></span>
      </i>
    </div>
    <p class="case-sel-summary__scour-meta">
      ${SCOUR_OF_FOUNDATION_PCT_LABEL} <b>${pct.toFixed(0)}%</b>
      · ${REMAIN_MARGIN_PCT_LABEL} <b>${formatRemainMarginPctShort(remain)}</b>
    </p>
  </div>`;
}

function renderPendingBlock(row: MockCaseRow): string {
  const st = MOCK_CASE_STATUS[row.status];
  const msgs: Record<MockCaseRow['status'], string> = {
    run: '해석 진행 중 — 완료 후 세굴·등급 산출',
    wait: '대기열 — 변환 후 해석 시작',
    err: 'QA 오류 — 연동 화면에서 로그 확인',
    done: '',
  };
  const msg = msgs[row.status];
  if (!msg) {
    return `<p class="mgmt-muted case-sel-summary__pending-short">세굴 결과 없음</p>`;
  }
  return `<div class="case-sel-summary__pending">
    <span class="mgmt-sbadge mgmt-sbadge--table mgmt-sbadge--${row.status}" style="--sb-fg:${st.color};--sb-bg:${st.bg}">
      <span class="mgmt-sbadge__dot" aria-hidden="true"></span>${esc(st.label)}
    </span>
    <p class="case-sel-summary__pending-msg">${esc(msg)}</p>
  </div>`;
}

function renderParamGrid(row: MockCaseRow, fd: number, dsOverD: number | null): string {
  const rows: Array<[string, string]> = [
    ['형상', row.shape],
    ['직경', `${row.diameterM.toFixed(1)} m`],
    ['유량', `${row.flow} m/s`],
    [BED_MATERIAL_GRAIN_LABEL, formatBedMaterialGrainMm(row.d50)],
    ['기수', `${row.pierCount}기`],
    ['근입 기준', `${fd.toFixed(1)} m`],
  ];
  if (dsOverD != null) {
    rows.push(['ds/D', dsOverD.toFixed(2)]);
  }
  const body = rows
    .map(
      ([k, v]) => `<div class="case-sel-summary__param"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`,
    )
    .join('');
  return `<dl class="case-sel-summary__params">${body}</dl>`;
}

export function renderCaseSelectedSummary(opts: RenderCaseSelectedSummaryOpts): string {
  const row = opts.row;
  if (!row) {
    return `<p class="mgmt-muted case-mgmt-empty">목록에서 케이스를 선택하세요.</p>`;
  }

  const fd = opts.foundationDepthM ?? DEFAULT_FOUNDATION_DEPTH_M;
  const st = MOCK_CASE_STATUS[row.status];
  const scour = row.maxScourM;
  const g = scour != null ? gradeOf(scour, fd) : null;
  const remain = scour != null ? remainPct(scour, fd) : null;
  const dsOverD = scour != null ? scour / Math.max(row.diameterM, 1e-9) : null;

  const gauge =
    g != null && remain != null
      ? renderSemiRemainGauge({
          valuePct: remain,
          size: 76,
          accent: g.color,
          label: g.name,
          showGradeTicks: false,
        })
      : '';

  const riskBlock =
    scour != null && g != null && remain != null
      ? `<section class="case-sel-summary__risk case-sel-summary__risk--compact" aria-label="세굴 위험도">
          <div class="case-sel-summary__gauge-wrap">${gauge}</div>
          <div class="case-sel-summary__risk-detail">
            ${renderScourStrip(scour, fd, g)}
            <p class="case-sel-summary__action" style="--act-color:${g.color}">${esc(g.action)}</p>
          </div>
        </section>`
      : renderPendingBlock(row);

  return `<div class="case-sel-summary case-sel-summary--compact">
    <header class="case-sel-summary__head">
      <div class="case-sel-summary__id">${renderCaseIdCell(row.id)}</div>
      <div class="case-sel-summary__tags">
        ${renderShapeCell(row.shape)}
        ${renderCaseStatusBadge(st.label, st.color, st.bg, row.status)}
      </div>
      <p class="case-sel-summary__meta">${esc(row.updatedAt)}</p>
    </header>
    ${riskBlock}
    <section class="case-sel-summary__section case-sel-summary__section--params">
      ${renderParamGrid(row, fd, dsOverD)}
    </section>
  </div>`;
}

/** 요약 패널 막대 진입 애니메이션 */
export function bindCaseSelectedSummary(root: HTMLElement): () => void {
  const scope = root.querySelector<HTMLElement>('.case-sel-summary');
  if (!scope) return () => {};
  const fills = scope.querySelectorAll<HTMLElement>('.mgmt-table-vizcol__fill');
  fills.forEach((f) => f.classList.remove('is-drawn'));
  const raf = requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fills.forEach((f) => f.classList.add('is-drawn'));
    });
  });
  return () => cancelAnimationFrame(raf);
}
