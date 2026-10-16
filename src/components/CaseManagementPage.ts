import { DEFAULT_FOUNDATION_DEPTH_M, gradeOf, remainPct } from '@/constants/grade';
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
    const rowId = t.closest('[data-case-id]')?.getAttribute('data-case-id');
    if (t.closest('[data-act="toggle-row"]') && rowId) {
      const row = this.cases.find((c) => c.id === rowId);
      if (!row) return;
      if (row.selected) {
        row.selected = false;
      } else {
        for (const c of this.cases) c.selected = false;
        row.selected = true;
      }
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

  private renderSelectedSummary(fd: number): string {
    const row = this.selectedCase();
    if (!row) {
      return `<tr><td colspan="2" class="mgmt-table__cell mgmt-muted case-mgmt-empty">목록에서 케이스를 <b>하나</b> 선택하면 요약이 표시됩니다.</td></tr>`;
    }
    const st = MOCK_CASE_STATUS[row.status];
    const scour = row.maxScourM;
    const g = scour != null ? gradeOf(scour, fd) : null;
    const remain = scour != null ? remainPct(scour, fd) : null;
    const pairs: Array<[string, string]> = [
      ['케이스 ID', `<b>${row.id}</b>`],
      [
        '상태',
        `<span class="mgmt-sbadge" style="background:${st.bg};color:${st.color}">${st.label}</span>`,
      ],
      ['교각 형상', row.shape],
      ['직경', `${row.diameterM.toFixed(1)} m`],
      ['교각 수', String(row.pierCount)],
      ['유량', row.flow],
      ['입경 d50', row.d50],
      [
        '최대 세굴심',
        scour != null ? `<b>${scour.toFixed(2)} m</b>` : '<span class="mgmt-muted">—</span>',
      ],
      [
        '등급',
        g
          ? `<span class="grade-pill grade-pill--${g.key}">${g.name}</span>`
          : '<span class="mgmt-muted">—</span>',
      ],
      [
        '잔여 여유율',
        remain != null ? `${remain.toFixed(1)} %` : '<span class="mgmt-muted">—</span>',
      ],
      ['갱신', row.updatedAt],
    ];
    return pairs
      .map(
        ([label, value]) =>
          `<tr><th class="mgmt-table__cell">${label}</th><td class="mgmt-table__cell mgmt-table__cell--c">${value}</td></tr>`,
      )
      .join('');
  }

  private render(): void {
    const fd = DEFAULT_FOUNDATION_DEPTH_M;
    const selected = this.selectedCase();
    const selLabel = selected ? selected.id : '없음';
    const filtered = this.filteredCases();
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
      <div class="mgmt-filter"><div class="mgmt-filter__label">입경 d50</div>
        <select class="mgmt-filter__select" data-filter="d50">
          <option value="all" ${this.filters.d50 === 'all' ? 'selected' : ''}>전체</option>
          <option value="0.5" ${this.filters.d50 === '0.5' ? 'selected' : ''}>0.5</option>
          <option value="0.8" ${this.filters.d50 === '0.8' ? 'selected' : ''}>0.8</option>
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

    const tbody = pageRows
      .map((r) => {
        const st = MOCK_CASE_STATUS[r.status];
        const g = r.maxScourM != null ? gradeOf(r.maxScourM, fd) : null;
        let act = '<span class="mgmt-muted">대기열 2</span>';
        if (r.status === 'done') {
          act = `<button type="button" class="mgmt-link" data-act="viewer" data-case-id="${r.id}">뷰어 →</button>`;
        } else if (r.status === 'err') {
          act = `<button type="button" class="mgmt-link" data-act="error-check" data-case-id="${r.id}">오류 확인 →</button>`;
        } else if (r.status === 'run') {
          act = '<span class="mgmt-muted">62 %</span>';
        }
        return `<tr class="${r.selected ? 'is-selected' : ''}">
          <td class="mgmt-table__cell mgmt-table__cell--c">
            <button type="button" class="mgmt-check mgmt-check--single" data-act="toggle-row" data-case-id="${r.id}" aria-pressed="${r.selected ? 'true' : 'false'}" title="케이스 하나만 선택">${r.selected ? '◉' : '○'}</button>
          </td>
          <td class="mgmt-table__cell"><b>${r.id}</b></td>
          <td class="mgmt-table__cell">${r.shape}</td>
          <td class="mgmt-table__cell mgmt-table__cell--c">${r.diameterM.toFixed(1)} m</td>
          <td class="mgmt-table__cell mgmt-table__cell--c">${r.pierCount}</td>
          <td class="mgmt-table__cell mgmt-table__cell--num">${r.flow}</td>
          <td class="mgmt-table__cell mgmt-table__cell--num">${r.d50}</td>
          <td class="mgmt-table__cell mgmt-table__cell--num"><b>${r.maxScourM != null ? `${r.maxScourM.toFixed(2)} m` : '—'}</b></td>
          <td class="mgmt-table__cell">${g ? `<span class="grade-pill grade-pill--${g.key}">${g.name}</span>` : '<span class="mgmt-muted">—</span>'}</td>
          <td class="mgmt-table__cell"><span class="mgmt-sbadge" style="background:${st.bg};color:${st.color}">${st.label}</span></td>
          <td class="mgmt-table__cell mgmt-muted">${r.updatedAt}</td>
          <td class="mgmt-table__cell">${act}</td>
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
      <div class="mgmt-split">
        <section class="mgmt-panel mgmt-panel--main">
          <div class="case-new-sim">
            <div class="case-new-sim__copy">
              <h3 class="case-new-sim__title">새 시뮬레이션</h3>
              <p class="case-new-sim__desc">FLOW-3D 결과 CSV는 <b>조건 설정</b> 화면에서 업로드합니다. <b>적용하고 결과 보기</b>를 누르면 그 시뮬레이션의 케이스 ID가 발급됩니다.</p>
            </div>
            <button type="button" class="case-new-sim__cta" data-act="new-sim-start">새 해석 시작</button>
          </div>
          <div class="mgmt-chip-row">${chips}
            <span class="mgmt-chip-row__note">1차년도 목표 ${MOCK_TOTAL} case 이상 (계획서 A-1)</span>
          </div>
          <div class="mgmt-filter-row">${filters}
            <button type="button" class="mgmt-search-btn" data-act="search">검색</button>
          </div>
          <div class="mgmt-list-head">
            <h2 class="mgmt-h2">시뮬레이션 케이스 목록</h2>
            <span class="mgmt-sub">${MOCK_TOTAL}건 중 <b>${filtered.length}</b>건 표시 · 선택 <b>${selLabel}</b> · 페이지 ${this.page}/${pages}</span>
          </div>
          <div class="mgmt-table-wrap">
            <table class="mgmt-table">
              <thead><tr>
                <th></th><th>케이스 ID</th><th>교각 형상</th><th>직경</th><th>교각 수</th><th>유량</th><th>d50</th>
                <th>최대 세굴심</th><th>등급</th><th>상태</th><th>갱신</th><th></th>
              </tr></thead>
              <tbody>${tbody || '<tr><td colspan="12" class="mgmt-muted mgmt-table__cell--c">조건에 맞는 케이스가 없습니다</td></tr>'}</tbody>
            </table>
            <div class="mgmt-pager">
              <button type="button" class="mgmt-pager__btn" data-act="page" data-page="${Math.max(1, this.page - 1)}" ${this.page <= 1 ? 'disabled' : ''}>◀</button>
              ${pagerBtns}
              <button type="button" class="mgmt-pager__btn" data-act="page" data-page="${Math.min(pages, this.page + 1)}" ${this.page >= pages ? 'disabled' : ''}>▶</button>
            </div>
          </div>
        </section>
        <aside class="mgmt-panel mgmt-panel--side">
          <h2 class="mgmt-h2">선택 케이스 요약</h2>
          <table class="mgmt-table mgmt-table--compact">${this.renderSelectedSummary(fd)}</table>
          <p class="mgmt-hint">잔여 여유율·등급은 기초 근입 ${fd} m 기준 <span class="mgmt-prov">잠정</span></p>
          <div class="mgmt-side-actions">
            <button type="button" class="mgmt-btn" data-act="open-viewer-selected" ${selected ? '' : 'disabled'}>선택 케이스 뷰어에서 열기</button>
            <button type="button" class="mgmt-btn mgmt-btn--ghost" data-act="export-csv">CSV 내보내기</button>
          </div>
          <span class="mgmt-badge">DT-300 · 케이스 관리 (메인)</span>
        </aside>
      </div>`;
  }

  public dispose(): void {
    this.element.remove();
  }
}
