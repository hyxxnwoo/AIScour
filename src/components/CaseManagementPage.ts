import {
  BED_MATERIAL_GRAIN_HINT,
  BED_MATERIAL_GRAIN_LABEL,
  formatBedMaterialGrainMm,
} from '@/constants/fieldLabels';
import { DEFAULT_FOUNDATION_DEPTH_M } from '@/constants/grade';
import {
  MOCK_CASE_CHIPS,
  MOCK_CASE_COUNT,
  MOCK_CASE_LIST_LIMIT,
  MOCK_CASE_STATUS,
  MOCK_CASES,
  type MockCaseRow,
} from '@/data/mockCases';
import {
  DEFAULT_CASE_FILTERS,
  filterMockCases,
  paginateRows,
  totalPages,
  uniqueCaseShapes,
  type CaseListFilters,
  type CaseStatusChip,
} from '@/utils/caseListFilter';
import type { Disposable } from '@/types/disposable';
import { bindCaseBiStrip, renderCaseBiStrip } from '@/viz/caseBiStrip';
import { bindCaseSelectedSummary, renderCaseSelectedSummary } from '@/viz/caseSelectedSummary';
import {
  renderCaseIdCell,
  renderCaseRowAction,
  renderCaseStatusBadge,
  renderRowSelectButton,
  renderShapeCell,
  renderUpdatedAtCell,
} from '@/viz/tableCaseCells';
import {
  bindTableMetricViz,
  renderTableMetricCell,
  renderTableScourCell,
  renderTableVizColHead,
} from '@/viz/tableMetricCell';
import { bindWidgetTiers } from '@/viz/widget';

/** 목록 1페이지에 표시할 목업 케이스 수 */
const PAGE_SIZE = MOCK_CASE_LIST_LIMIT;
const MOCK_TOTAL = MOCK_CASE_COUNT;

export interface CaseManagementPageHandlers {
  onOpenViewer: (caseId: string) => void;
  onOpenDataPipeline: () => void;
  onOpenDataPipelineError: (caseId: string) => void;
  /** 조건 설정(4번)으로 이동 — CSV는 뷰어와 동일 플로우로 4번에서 선택 */
  onStartNewSimulation: () => void;
}

/** 2번 케이스 관리 (메인) — 목업 필터·칩·페이지 동작 */
export class CaseManagementPage implements Disposable {
  public readonly element: HTMLElement;
  private readonly handlers: CaseManagementPageHandlers;
  private readonly host: HTMLElement;
  private cases: MockCaseRow[];
  private statusChip: CaseStatusChip = 'all';
  private filters: CaseListFilters = { ...DEFAULT_CASE_FILTERS };
  private page = 1;
  private toast = '';
  private unbindTiers: (() => void) | null = null;
  private unbindTableViz: (() => void) | null = null;
  private unbindBiStrip: (() => void) | null = null;
  private unbindCaseSummary: (() => void) | null = null;

  public constructor(handlers: CaseManagementPageHandlers) {
    this.handlers = handlers;
    this.cases = MOCK_CASES.map((c) => ({ ...c }));
    this.element = document.createElement('div');
    this.element.className = 'mgmt-page case-mgmt-page screen-stack-page is-hidden';
    this.host = document.createElement('div');
    this.host.className = 'mgmt-page__body';
    this.element.appendChild(this.host);

    this.element.addEventListener('click', (e) => this.onClick(e));
    this.element.addEventListener('change', (e) => this.onChange(e));
    this.render();
  }

  public setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
    if (visible) this.render();
  }

  public knownCaseIds(): string[] {
    return this.cases.map((row) => row.id);
  }

  public findCase(caseId: string): MockCaseRow | null {
    return this.cases.find((row) => row.id === caseId) ?? null;
  }

  /** CSV 적용으로 발급된 케이스를 이번 세션 목록 맨 앞에 둔다. */
  public registerIssuedCase(row: MockCaseRow): void {
    this.cases = this.cases
      .filter((item) => item.id !== row.id)
      .map((item) => ({ ...item, selected: false }));
    this.cases.unshift({ ...row, selected: true });
    this.page = 1;
    this.render();
  }

  /** bootstrap 후 조건 설정(4번) 이동 핸들러 연결 */
  public bindStartNewSimulation(handler: CaseManagementPageHandlers['onStartNewSimulation']): void {
    this.handlers.onStartNewSimulation = handler;
  }

  private selectedCase(): MockCaseRow | null {
    return this.cases.find((c) => c.selected) ?? null;
  }

  private filteredCases(): MockCaseRow[] {
    return filterMockCases(this.cases, this.statusChip, this.filters);
  }

  private onChange(e: Event): void {
    const el = e.target as HTMLSelectElement;
    const key = el.dataset.filter as keyof CaseListFilters | undefined;
    if (!key) return;
    this.filters = { ...this.filters, [key]: el.value };
    this.page = 1;
    this.render();
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (t.closest('[data-act="tab-data"]')) {
      this.handlers.onOpenDataPipeline();
      return;
    }
    const chip = t.closest('[data-act="chip"]')?.getAttribute('data-chip') as CaseStatusChip | null;
    if (chip) {
      this.statusChip = chip;
      this.page = 1;
      this.render();
      return;
    }
    const pageAttr = t.closest('[data-act="page"]')?.getAttribute('data-page');
    if (pageAttr) {
      this.page = Number.parseInt(pageAttr, 10);
      this.render();
      return;
    }
    if (t.closest('[data-act="search"]')) {
      this.toast = `검색 적용 — ${this.filteredCases().length}건 (목업)`;
      this.page = 1;
      this.render();
      return;
    }
    const scatterId = t.closest('[data-scatter-id]')?.getAttribute('data-scatter-id');
    if (scatterId) {
      for (const c of this.cases) c.selected = c.id === scatterId;
      this.render();
      return;
    }
    const gradeFromDonut = t
      .closest('.case-bi-panel--grade .viz-donut-seg')
      ?.getAttribute('data-donut-id');
    const gradeBi =
      t.closest('[data-act="bi-grade"]')?.getAttribute('data-grade-key') ??
      (gradeFromDonut && /^a[1-4]$/.test(gradeFromDonut) ? gradeFromDonut : null);
    if (gradeBi) {
      const next = gradeBi as CaseListFilters['gradeKey'];
      this.filters = {
        ...this.filters,
        gradeKey: this.filters.gradeKey === next ? 'all' : next,
      };
      this.page = 1;
      this.render();
      return;
    }
    const donutId = (t.closest('.viz-donut-seg')?.getAttribute('data-donut-id') ??
      t.closest('[data-donut-id]')?.getAttribute('data-donut-id')) as CaseStatusChip | null;
    if (donutId && donutId !== 'all') {
      this.statusChip = this.statusChip === donutId ? 'all' : donutId;
      this.page = 1;
      this.render();
      return;
    }
    const viewerId = t.closest('[data-act="viewer"]')?.getAttribute('data-case-id');
    if (viewerId) {
      this.handlers.onOpenViewer(viewerId);
      return;
    }
    const errCase = t.closest('[data-act="error-check"]')?.getAttribute('data-case-id');
    if (errCase) {
      this.handlers.onOpenDataPipelineError(errCase);
      return;
    }
    const listRow = t.closest('tbody tr[data-case-id]');
    if (
      listRow instanceof HTMLTableRowElement &&
      !t.closest('.mgmt-table__cell--act, [data-act="viewer"], [data-act="error-check"]')
    ) {
      const rowId = listRow.getAttribute('data-case-id');
      if (rowId) {
        const row = this.cases.find((c) => c.id === rowId);
        if (row) {
          if (row.selected) {
            row.selected = false;
          } else {
            for (const c of this.cases) c.selected = false;
            row.selected = true;
          }
          this.render();
        }
      }
      return;
    }
    if (t.closest('[data-act="open-viewer-selected"]')) {
      const sel = this.selectedCase();
      if (!sel) {
        this.toast = '목록에서 케이스를 하나 선택해 주세요.';
        this.render();
        return;
      }
      this.handlers.onOpenViewer(sel.id);
      return;
    }
    if (t.closest('[data-act="export-csv"]')) {
      this.exportCsv();
      return;
    }
    if (t.closest('[data-act="new-sim-start"]')) {
      this.handlers.onStartNewSimulation();
    }
  }

  private exportCsv(): void {
    const rows = this.filteredCases();
    const header = 'id,shape,diameter,flow,d50,maxScour,status';
    const body = rows
      .map((r) =>
        [r.id, r.shape, r.diameterM, r.flow, r.d50, r.maxScourM ?? '', r.status].join(','),
      )
      .join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'scdt_cases_mock.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    this.toast = `CSV ${rows.length}건 내보냄 (목업)`;
    this.render();
  }

  private renderBiStrip(filtered: MockCaseRow[], fd: number): string {
    return renderCaseBiStrip({
      allCases: this.cases,
      filtered,
      foundationDepthM: fd,
      statusChip: this.statusChip,
      gradeFilter: this.filters.gradeKey,
    });
  }

  private render(): void {
    const fd = DEFAULT_FOUNDATION_DEPTH_M;
    const selected = this.selectedCase();
    const selLabel = selected ? selected.id : '없음';
    const filtered = this.filteredCases();
    const summaryHtml = renderCaseSelectedSummary({
      row: selected,
      foundationDepthM: fd,
    });
    const pages = totalPages(filtered.length, PAGE_SIZE);
    const safePage = Math.min(this.page, pages);
    if (safePage !== this.page) this.page = safePage;
    const pageRows = paginateRows(filtered, this.page, PAGE_SIZE);

    const chipKeys: CaseStatusChip[] = ['all', 'done', 'run', 'wait', 'err'];
    const chips = MOCK_CASE_CHIPS.map((c, i) => {
      const key = chipKeys[i] ?? 'all';
      const on = this.statusChip === key;
      return `<button type="button" class="mgmt-chip ${on ? 'is-on' : ''}" data-act="chip" data-chip="${key}">${c.label} <b style="color:${c.color}">${c.count}</b></button>`;
    }).join('');

    const shapes = uniqueCaseShapes(this.cases);
    const shapeOpts = ['<option value="all">전체</option>']
      .concat(
        shapes.map(
          (s) => `<option value="${s}" ${this.filters.shape === s ? 'selected' : ''}>${s}</option>`,
        ),
      )
      .join('');

    const filters = `
      <div class="mgmt-filter"><div class="mgmt-filter__label">교각 형상</div>
        <select class="mgmt-filter__select" data-filter="shape">${shapeOpts}</select></div>
      <div class="mgmt-filter"><div class="mgmt-filter__label">직경</div>
        <select class="mgmt-filter__select" data-filter="diameter">
          <option value="all" ${this.filters.diameter === 'all' ? 'selected' : ''}>전체</option>
          <option value="lt1" ${this.filters.diameter === 'lt1' ? 'selected' : ''}>&lt; 1.0 m</option>
          <option value="ge1" ${this.filters.diameter === 'ge1' ? 'selected' : ''}>≥ 1.0 m</option>
        </select></div>
      <div class="mgmt-filter"><div class="mgmt-filter__label">유량</div>
        <select class="mgmt-filter__select" data-filter="flowBand">
          <option value="all" ${this.filters.flowBand === 'all' ? 'selected' : ''}>전체</option>
          <option value="low" ${this.filters.flowBand === 'low' ? 'selected' : ''}>&lt; 0.08</option>
          <option value="mid" ${this.filters.flowBand === 'mid' ? 'selected' : ''}>0.08 – 0.10</option>
          <option value="high" ${this.filters.flowBand === 'high' ? 'selected' : ''}>&gt; 0.10</option>
        </select></div>
      <div class="mgmt-filter"><div class="mgmt-filter__label" data-tip="${BED_MATERIAL_GRAIN_HINT}">${BED_MATERIAL_GRAIN_LABEL}</div>
        <select class="mgmt-filter__select" data-filter="d50">
          <option value="all" ${this.filters.d50 === 'all' ? 'selected' : ''}>전체</option>
          <option value="0.5" ${this.filters.d50 === '0.5' ? 'selected' : ''}>${formatBedMaterialGrainMm('0.5')}</option>
          <option value="0.8" ${this.filters.d50 === '0.8' ? 'selected' : ''}>${formatBedMaterialGrainMm('0.8')}</option>
        </select></div>
      <div class="mgmt-filter"><div class="mgmt-filter__label">등급</div>
        <select class="mgmt-filter__select" data-filter="gradeKey">
          <option value="all" ${this.filters.gradeKey === 'all' ? 'selected' : ''}>전체</option>
          <option value="a1" ${this.filters.gradeKey === 'a1' ? 'selected' : ''}>관심</option>
          <option value="a2" ${this.filters.gradeKey === 'a2' ? 'selected' : ''}>주의</option>
          <option value="a3" ${this.filters.gradeKey === 'a3' ? 'selected' : ''}>경계</option>
          <option value="a4" ${this.filters.gradeKey === 'a4' ? 'selected' : ''}>심각</option>
        </select></div>
      <div class="mgmt-filter"><div class="mgmt-filter__label">상태</div>
        <select class="mgmt-filter__select" data-filter="status">
          <option value="all" ${this.filters.status === 'all' ? 'selected' : ''}>전체</option>
          <option value="done" ${this.filters.status === 'done' ? 'selected' : ''}>검증완료</option>
          <option value="run" ${this.filters.status === 'run' ? 'selected' : ''}>해석중</option>
          <option value="wait" ${this.filters.status === 'wait' ? 'selected' : ''}>대기</option>
          <option value="err" ${this.filters.status === 'err' ? 'selected' : ''}>QA 오류</option>
        </select></div>`;

    const grainHint = BED_MATERIAL_GRAIN_HINT.replace(/"/g, '&quot;');
    const diamMax = Math.max(...filtered.map((c) => c.diameterM), 0.01);
    const flowMax = Math.max(...filtered.map((c) => Number.parseFloat(c.flow)), 0.01);
    const d50Max = Math.max(...filtered.map((c) => Number.parseFloat(c.d50)), 0.01);

    const tbody = pageRows
      .map((r) => {
        const st = MOCK_CASE_STATUS[r.status];
        const act = renderCaseRowAction(r.status, r.id);
        const scourCell =
          r.maxScourM != null
            ? renderTableScourCell(r.maxScourM, fd, r.id)
            : '<span class="mgmt-muted">—</span>';
        const diamPct = (r.diameterM / diamMax) * 100;
        const flowN = Number.parseFloat(r.flow);
        const flowPct = (flowN / flowMax) * 100;
        const d50N = Number.parseFloat(r.d50);
        const d50Pct = (d50N / d50Max) * 100;
        return `<tr class="${r.selected ? 'is-selected' : ''}" data-case-id="${r.id}" data-act="toggle-row" aria-selected="${r.selected ? 'true' : 'false'}">
          <td class="mgmt-table__cell mgmt-table__cell--c">${renderRowSelectButton(r.id, r.selected)}</td>
          <td class="mgmt-table__cell mgmt-table__cell--id">${renderCaseIdCell(r.id)}</td>
          <td class="mgmt-table__cell mgmt-table__cell--optional mgmt-table__cell--shape">${renderShapeCell(r.shape)}</td>
          <td class="mgmt-table__cell mgmt-table__cell--metric" data-metric="diameter">${renderTableMetricCell(`${r.diameterM.toFixed(1)} m`, diamPct, '#6FB6DE', { caseId: r.id, metric: 'diameter', tip: `직경 ${r.diameterM.toFixed(1)} m · 목록 최대 ${diamMax.toFixed(1)} m 대비 ${diamPct.toFixed(0)}%` })}</td>
          <td class="mgmt-table__cell mgmt-table__cell--metric" data-metric="flow">${renderTableMetricCell(r.flow, flowPct, '#00D4B0', { caseId: r.id, metric: 'flow', tip: `유량 ${r.flow} · 목록 최대 ${flowMax.toFixed(0)} 대비 ${flowPct.toFixed(0)}%` })}</td>
          <td class="mgmt-table__cell mgmt-table__cell--metric" data-metric="grain">${renderTableMetricCell(formatBedMaterialGrainMm(r.d50), d50Pct, '#C4A574', { caseId: r.id, metric: 'grain', tip: `${formatBedMaterialGrainMm(r.d50)} · 목록 최대 ${d50Max.toFixed(2)} mm 대비 ${d50Pct.toFixed(0)}%` })}</td>
          <td class="mgmt-table__cell mgmt-table__cell--scour" data-metric="scour">${scourCell}</td>
          <td class="mgmt-table__cell mgmt-table__cell--status">${renderCaseStatusBadge(st.label, st.color, st.bg, r.status)}</td>
          <td class="mgmt-table__cell mgmt-table__cell--optional mgmt-table__cell--date">${renderUpdatedAtCell(r.updatedAt)}</td>
          <td class="mgmt-table__cell mgmt-table__cell--act">${act}</td>
        </tr>`;
      })
      .join('');

    const pagerBtns = Array.from({ length: pages }, (_, i) => {
      const p = i + 1;
      return `<button type="button" class="mgmt-pager__btn ${p === this.page ? 'is-on' : ''}" data-act="page" data-page="${p}">${p}</button>`;
    }).join('');

    const toastHtml = this.toast ? `<div class="mgmt-toast">${this.toast}</div>` : '';

    this.host.innerHTML = `
      ${toastHtml}
      <div class="mgmt-tabs">
        <span class="is-on">케이스 관리</span>
        <button type="button" class="mgmt-tabs__link" data-act="tab-data">데이터 연동 현황</button>
      </div>
      ${this.renderBiStrip(filtered, fd)}
      <div class="mgmt-split">
        <section class="mgmt-panel mgmt-panel--main">
          <div class="viz-tier viz-tier--detail case-new-sim case-new-sim--compact">
            <div class="case-new-sim__copy">
              <h3 class="case-new-sim__title">새 시뮬레이션</h3>
              <p class="case-new-sim__desc">CSV는 <b>조건 설정</b>에서 업로드 · <b>적용하고 결과 보기</b> 시 케이스 ID 발급</p>
            </div>
            <button type="button" class="case-new-sim__cta" data-act="new-sim-start">새 해석 시작</button>
          </div>
          <div class="mgmt-chip-row viz-widget" data-widget-id="case-chips">${chips}
            <span class="mgmt-chip-row__note viz-tier viz-tier--detail">목표 ${MOCK_TOTAL}+ case</span>
          </div>
          <div class="mgmt-filter-row viz-tier viz-tier--basic">${filters}
            <button type="button" class="mgmt-search-btn" data-act="search">검색</button>
          </div>
          <div class="mgmt-list-head">
            <h2 class="mgmt-h2">시뮬레이션 케이스 목록</h2>
            <span class="mgmt-sub">${MOCK_TOTAL}건 중 <b>${filtered.length}</b>건 표시 · 선택 <b>${selLabel}</b> · 페이지 ${this.page}/${pages}</span>
          </div>
          <div class="mgmt-table-wrap">
            <div class="mgmt-table-scroll">
            <table class="mgmt-table mgmt-table--pick mgmt-table--viz">
              <colgroup>
                <col class="mgmt-col--select" />
                <col class="mgmt-col--id" />
                <col class="mgmt-col--shape mgmt-table__cell--optional" />
                <col class="mgmt-col--viz" span="2" />
                <col class="mgmt-col--viz mgmt-col--viz-wide" />
                <col class="mgmt-col--viz mgmt-col--viz-scour" />
                <col class="mgmt-col--status" />
                <col class="mgmt-col--date mgmt-table__cell--optional" />
                <col class="mgmt-col--act" />
              </colgroup>
              <thead><tr class="mgmt-table__head-row">
                <th><span class="mgmt-table__th-label"></span></th>
                <th><span class="mgmt-table__th-label">케이스 ID</span></th>
                <th class="mgmt-table__cell--optional"><span class="mgmt-table__th-label">교각 형상</span></th>
                <th class="mgmt-table__th--viz">${renderTableVizColHead('직경')}</th>
                <th class="mgmt-table__th--viz">${renderTableVizColHead('유량')}</th>
                <th class="mgmt-table__th--viz mgmt-table__th--viz-wide" data-tip="${grainHint}">${renderTableVizColHead(['하상·퇴적물', '입경'])}</th>
                <th class="mgmt-table__th--viz">${renderTableVizColHead('최대 세굴')}</th>
                <th><span class="mgmt-table__th-label">상태</span></th>
                <th class="mgmt-table__cell--optional"><span class="mgmt-table__th-label">갱신</span></th>
                <th><span class="mgmt-table__th-label"></span></th>
              </tr></thead>
              <tbody>${tbody || '<tr><td colspan="10" class="mgmt-muted mgmt-table__cell--c">조건에 맞는 케이스가 없습니다</td></tr>'}</tbody>
            </table>
            </div>
            <div class="mgmt-pager">
              <button type="button" class="mgmt-pager__btn" data-act="page" data-page="${Math.max(1, this.page - 1)}" ${this.page <= 1 ? 'disabled' : ''}>◀</button>
              ${pagerBtns}
              <button type="button" class="mgmt-pager__btn" data-act="page" data-page="${Math.min(pages, this.page + 1)}" ${this.page >= pages ? 'disabled' : ''}>▶</button>
            </div>
          </div>
        </section>
        <aside class="mgmt-panel mgmt-panel--side viz-widget viz-tier--detail" data-widget-id="case-compare">
          <h2 class="mgmt-h2">선택 케이스 요약</h2>
          ${summaryHtml}
          <p class="mgmt-hint">잔여 여유율·등급은 기초 근입 ${fd} m 기준 <span class="mgmt-prov">잠정</span></p>
          <div class="mgmt-side-actions">
            <button type="button" class="mgmt-btn" data-act="open-viewer-selected" ${selected ? '' : 'disabled'}>선택 케이스 뷰어에서 열기</button>
            <button type="button" class="mgmt-btn mgmt-btn--ghost" data-act="export-csv">CSV 내보내기</button>
          </div>
          <span class="mgmt-badge">DT-300 · 케이스 관리 (메인)</span>
        </aside>
      </div>`;
    this.unbindTiers?.();
    this.unbindTableViz?.();
    this.unbindBiStrip?.();
    this.unbindCaseSummary?.();
    this.unbindTiers = bindWidgetTiers(this.host);
    const tableWrap = this.host.querySelector('.mgmt-table-wrap');
    this.unbindTableViz = tableWrap instanceof HTMLElement ? bindTableMetricViz(tableWrap) : null;
    this.unbindBiStrip = bindCaseBiStrip(this.host);
    const sidePanel = this.host.querySelector('.mgmt-panel--side');
    this.unbindCaseSummary =
      sidePanel instanceof HTMLElement ? bindCaseSelectedSummary(sidePanel) : null;
  }

  public dispose(): void {
    this.unbindCaseSummary?.();
    this.unbindBiStrip?.();
    this.unbindTableViz?.();
    this.unbindTiers?.();
    this.element.remove();
  }
}
