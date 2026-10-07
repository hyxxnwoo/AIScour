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

/** 목록 1페이지에 표시할 목업 케이스 수 (최대 20) */
const PAGE_SIZE = MOCK_CASE_LIST_LIMIT;
const MOCK_TOTAL = MOCK_CASE_COUNT;

export interface CaseManagementPageHandlers {
  onOpenViewer: (caseId: string) => void;
  onOpenDataPipeline: () => void;
  onOpenDataPipelineError: (caseId: string) => void;
  /** files null → 4번만 열기, files 있음 → 4번에서 자동 파싱 */
  onStartNewSimulation: (files: File[] | null) => void;
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
  private dropActive = false;
  private readonly fileInput: HTMLInputElement;

  public constructor(handlers: CaseManagementPageHandlers) {
    this.handlers = handlers;
    this.cases = MOCK_CASES.map((c) => ({ ...c }));
    this.element = document.createElement('div');
    this.element.className = 'mgmt-page case-mgmt-page screen-stack-page is-hidden';
    this.host = document.createElement('div');
    this.host.className = 'mgmt-page__body';
    this.element.appendChild(this.host);

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = true;
    this.fileInput.accept = '.csv,text/csv';
    this.fileInput.hidden = true;
    this.element.appendChild(this.fileInput);
    this.fileInput.addEventListener('change', () => {
      const files = Array.from(this.fileInput.files ?? []);
      this.fileInput.value = '';
      if (files.length > 0) this.handlers.onStartNewSimulation(files);
    });

    this.element.addEventListener('dragover', (e) => this.onDragOver(e));
    this.element.addEventListener('dragleave', (e) => this.onDragLeave(e));
    this.element.addEventListener('drop', (e) => this.onDrop(e));

    this.element.addEventListener('click', (e) => this.onClick(e));
    this.element.addEventListener('change', (e) => this.onChange(e));
    this.render();
  }

  private csvFilesFromDataTransfer(dt: DataTransfer | null): File[] {
    return Array.from(dt?.files ?? []).filter(
      (f) => f.name.toLowerCase().endsWith('.csv') || f.type.includes('csv'),
    );
  }

  private onDragOver(e: DragEvent): void {
    if (!(e.target as HTMLElement).closest('[data-drop-zone]')) return;
    e.preventDefault();
    if (!this.dropActive) {
      this.dropActive = true;
      this.render();
    }
  }

  private onDragLeave(e: DragEvent): void {
    const zone = (e.target as HTMLElement).closest('[data-drop-zone]');
    if (!zone) return;
    this.dropActive = false;
    this.render();
  }

  private onDrop(e: DragEvent): void {
    const zone = (e.target as HTMLElement).closest('[data-drop-zone]');
    if (!zone) return;
    e.preventDefault();
    this.dropActive = false;
    const files = this.csvFilesFromDataTransfer(e.dataTransfer);
    if (files.length === 0) {
      this.toast = 'CSV 파일(.csv)만 업로드할 수 있습니다.';
      this.render();
      return;
    }
    this.handlers.onStartNewSimulation(files);
  }

  public setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
    if (visible) this.render();
  }

  private selectedCases(): MockCaseRow[] {
    return this.cases.filter((c) => c.selected);
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
      if (row.selected) row.selected = false;
      else if (this.selectedCases().length < 3) row.selected = true;
      else this.toast = '비교는 최대 3개까지 선택할 수 있습니다 (목업)';
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
      const sel = this.selectedCases()[0]?.id ?? 'A-032';
      this.handlers.onOpenViewer(sel);
      return;
    }
    if (t.closest('[data-act="export-csv"]')) {
      this.exportCsv();
      return;
    }
    if (t.closest('[data-act="new-sim-pick"]')) {
      this.fileInput.click();
      return;
    }
    if (t.closest('[data-act="new-sim-goto"]')) {
      this.handlers.onStartNewSimulation(null);
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

  private renderCompare(fd: number): string {
    const sel = this.selectedCases();
    const a = sel[0] ?? this.cases[0];
    const b = sel[1] ?? this.cases[1];
    const da = a.maxScourM ?? 0;
    const db = b.maxScourM ?? 0;
    const ra = remainPct(da, fd);
    const rb = remainPct(db, fd);
    const pctDiff = da > 1e-9 ? ((db / da - 1) * 100).toFixed(1) : '—';
    const rows: Array<[string, string, string, string]> = [
      ['항목', a.id, b.id, '차이'],
      [
        '교각 직경',
        `${a.diameterM.toFixed(1)} m`,
        `${b.diameterM.toFixed(1)} m`,
        `${(b.diameterM / a.diameterM).toFixed(1)} 배`,
      ],
      ['유량', a.flow, b.flow, '–'],
      ['최대 세굴심', `${da.toFixed(2)} m`, `${db.toFixed(2)} m`, `+${pctDiff} %`],
      ['세굴폭', '4.6 m', '6.8 m', '+47.8 %'],
      ['세굴공 체적', '9.8 m³', '18.4 m³', '+87.8 %'],
      ['잔여 여유율', `${ra.toFixed(1)} %`, `${rb.toFixed(1)} %`, `−${(ra - rb).toFixed(1)} %p`],
      ['등급', gradeOf(da, fd).name, gradeOf(db, fd).name, ''],
    ];
    return rows
      .map((r, i) => {
        const cells = r
          .map((c, j) => {
            if (i === rows.length - 1 && (j === 1 || j === 2)) {
              const g = gradeOf(j === 1 ? da : db, fd);
              return `<td class="mgmt-table__cell mgmt-table__cell--c"><span class="grade-pill grade-pill--${g.key}">${c}</span></td>`;
            }
            const tag = i === 0 ? 'th' : 'td';
            const cls = j === 0 ? '' : ' mgmt-table__cell--c';
            const diff = i >= 3 && j === 3 ? ' mgmt-table__cell--warn' : '';
            return `<${tag} class="mgmt-table__cell${cls}${diff}">${c}</${tag}>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
  }

  private render(): void {
    const fd = DEFAULT_FOUNDATION_DEPTH_M;
    const selCount = this.selectedCases().length;
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
            <button type="button" class="mgmt-check" data-act="toggle-row" data-case-id="${r.id}">${r.selected ? '☑' : '☐'}</button>
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
              <p class="case-new-sim__desc">FLOW-3D CSV를 올리면 <b>조건 설정(4번)</b>으로 이동해 파싱·조건 확인 후 3D 뷰어(5번)까지 이어집니다.</p>
            </div>
            <div class="case-new-sim__drop ${this.dropActive ? 'is-dragover' : ''}" data-drop-zone role="button" tabindex="0">
              <span class="case-new-sim__drop-icon">CSV</span>
              <span class="case-new-sim__drop-main">파일을 여기에 놓거나</span>
              <button type="button" class="mgmt-link case-new-sim__pick" data-act="new-sim-pick">파일 선택</button>
              <span class="case-new-sim__drop-sub">sampledata.csv · 교각별 다중 CSV(P1,P2,…) 지원</span>
            </div>
            <button type="button" class="mgmt-btn case-new-sim__goto" data-act="new-sim-goto">조건 설정 화면에서 업로드 →</button>
          </div>
          <div class="mgmt-chip-row">${chips}
            <span class="mgmt-chip-row__note">1차년도 목표 ${MOCK_TOTAL} case 이상 (계획서 A-1)</span>
          </div>
          <div class="mgmt-filter-row">${filters}
            <button type="button" class="mgmt-search-btn" data-act="search">검색</button>
          </div>
          <div class="mgmt-list-head">
            <h2 class="mgmt-h2">시뮬레이션 케이스 목록</h2>
            <span class="mgmt-sub">${MOCK_TOTAL}건 중 <b>${filtered.length}</b>건 표시 · 선택 ${selCount} / 3 · 페이지 ${this.page}/${pages}</span>
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
          <h2 class="mgmt-h2">선택 케이스 비교</h2>
          <table class="mgmt-table mgmt-table--compact">${this.renderCompare(fd)}</table>
          <p class="mgmt-hint">잔여 여유율·등급은 기초 근입 ${fd} m 기준 <span class="mgmt-prov">잠정</span></p>
          <div class="mgmt-side-actions">
            <button type="button" class="mgmt-btn" data-act="open-viewer-selected">선택 케이스 뷰어에서 열기</button>
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
