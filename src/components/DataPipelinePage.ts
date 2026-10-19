import { PIPELINE_QA_QC_STAGE_LABEL } from '@/constants/fieldLabels';
import {
  MOCK_PIPELINE_FILE_COUNT,
  MOCK_PIPELINE_FILES,
  type MockPipelineFile,
} from '@/data/mockPipelineFiles';
import { paginateRows, totalPages } from '@/utils/caseListFilter';
import type { Disposable } from '@/types/disposable';
import {
  bindPipelineViz,
  maxSizePctOnPage,
  renderPipelineDetailPanel,
  renderPipelineFileRow,
  renderPipelineKpiPanel,
  renderPipelineStageStrip,
  type PipelineListSeg,
} from '@/viz/pipelineViz';
import { bindWidgetTiers } from '@/viz/widget';

export interface DataPipelinePageHandlers {
  onOpenCases: () => void;
  onOpenConditionSetup: () => void;
}

const PAGE_SIZE = 14;

/** 3번 데이터 연동 — 목업 필터·파일 선택·재처리 */
export class DataPipelinePage implements Disposable {
  public readonly element: HTMLElement;
  private readonly handlers: DataPipelinePageHandlers;
  private readonly host: HTMLElement;
  private files: MockPipelineFile[];
  private listSeg: PipelineListSeg = 'all';
  private stageMin: number | 'all' = 'all';
  private page = 1;
  private selectedId: string;
  private focusedLogIdx: number | null = null;
  private toast = '';
  private unbindTiers: (() => void) | null = null;
  private unbindPipelineViz: (() => void) | null = null;

  public constructor(handlers: DataPipelinePageHandlers) {
    this.handlers = handlers;
    this.files = MOCK_PIPELINE_FILES.map((f) => ({
      ...f,
      logs: f.logs.map((l) => ({ ...l })),
    }));
    this.selectedId = this.files.find((f) => f.result === 'err')?.id ?? this.files[0].id;
    this.element = document.createElement('div');
    this.element.className = 'mgmt-page data-pipeline-page screen-stack-page is-hidden';
    this.host = document.createElement('div');
    this.host.className = 'mgmt-page__body';
    this.element.appendChild(this.host);
    this.element.addEventListener('click', (e) => this.onClick(e));
    this.render();
  }

  /** 2번 ‘오류 확인 →’ 등에서 파일 포커스 */
  public focusFile(fileName: string): void {
    const hit = this.files.find((f) => f.fileName === fileName || f.caseId === fileName);
    if (hit) {
      this.selectedId = hit.id;
      this.focusedLogIdx = null;
      this.listSeg = hit.result === 'err' ? 'err' : 'all';
    }
    this.render();
  }

  public setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
    if (visible) this.render();
  }

  private selectedFile(): MockPipelineFile {
    return this.files.find((f) => f.id === this.selectedId) ?? this.files[0];
  }

  private visibleFiles(): MockPipelineFile[] {
    let list =
      this.listSeg === 'all' ? this.files : this.files.filter((f) => f.result === this.listSeg);
    if (this.stageMin !== 'all') {
      const minStage = this.stageMin;
      list = list.filter((f) => f.stageProgress >= minStage);
    }
    return list;
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (t.closest('[data-act="tab-cases"]')) {
      this.handlers.onOpenCases();
      return;
    }
    if (t.closest('[data-act="pipeline-reset"]')) {
      this.listSeg = 'all';
      this.stageMin = 'all';
      this.page = 1;
      this.focusedLogIdx = null;
      this.render();
      return;
    }
    const stageMinAttr = t.closest('[data-act="pipeline-stage"]')?.getAttribute('data-stage-min');
    if (stageMinAttr) {
      const n = Number.parseInt(stageMinAttr, 10);
      this.stageMin = this.stageMin === n ? 'all' : n;
      this.page = 1;
      this.render();
      return;
    }
    const seg = t.closest('[data-act="seg"]')?.getAttribute('data-seg') as PipelineListSeg | null;
    if (seg) {
      this.listSeg = this.listSeg === seg ? 'all' : seg;
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
    const logIdxAttr = t.closest('[data-act="log-step"]')?.getAttribute('data-log-idx');
    if (logIdxAttr != null) {
      const idx = Number.parseInt(logIdxAttr, 10);
      this.focusedLogIdx = this.focusedLogIdx === idx ? null : idx;
      this.render();
      return;
    }
    const listRow = t.closest('tbody tr[data-file-id]');
    if (
      listRow instanceof HTMLTableRowElement &&
      !t.closest('.data-pipeline__detail-actions, [data-act="reprocess"], [data-act="view-case"]')
    ) {
      const fileId = listRow.getAttribute('data-file-id');
      if (fileId) {
        this.selectedId = fileId;
        this.focusedLogIdx = null;
        this.render();
      }
      return;
    }
    if (t.closest('[data-act="goto-condition"]')) {
      this.handlers.onOpenConditionSetup();
      return;
    }
    if (t.closest('[data-act="reprocess"]')) {
      this.requestReprocess();
      return;
    }
    if (t.closest('[data-act="view-case"]')) {
      this.handlers.onOpenCases();
      return;
    }
  }

  private requestReprocess(): void {
    const f = this.selectedFile();
    f.result = 'run';
    f.stageProgress = 1;
    f.summary = '재처리 요청 접수 — 파싱부터 다시 시작 (목업)';
    f.logs = [
      { stage: '업로드', time: '—', state: 'ok', detail: '기존 파일 재사용' },
      { stage: '파싱', time: '—', state: 'run', detail: '재처리 큐 등록' },
      { stage: '경량화 · 변환', time: '—', state: 'wait', detail: '대기' },
      { stage: PIPELINE_QA_QC_STAGE_LABEL, time: '—', state: 'wait', detail: '대기' },
      { stage: '서비스 반영', time: '—', state: 'wait', detail: '대기' },
    ];
    this.toast = `${f.fileName} 재처리 요청됨 (목업)`;
    this.listSeg = 'run';
    this.render();
  }

  private render(): void {
    const visible = this.visibleFiles();
    const pages = totalPages(visible.length, PAGE_SIZE);
    const safePage = Math.min(this.page, Math.max(1, pages));
    if (safePage !== this.page) this.page = safePage;
    const pageRows = paginateRows(visible, this.page, PAGE_SIZE);
    const sizePct = maxSizePctOnPage(pageRows);

    const sel = this.selectedFile();
    const stageStrip = renderPipelineStageStrip(this.files, this.listSeg, this.stageMin);

    const fileRows = pageRows
      .map((f) => renderPipelineFileRow(f, f.id === this.selectedId, sizePct(f.sizeLabel)))
      .join('');

    const pagerBtns = Array.from({ length: pages }, (_, i) => {
      const p = i + 1;
      return `<button type="button" class="mgmt-pager__btn ${p === this.page ? 'is-on' : ''}" data-act="page" data-page="${p}">${p}</button>`;
    }).join('');

    const toastHtml = this.toast ? `<div class="mgmt-toast">${this.toast}</div>` : '';

    this.host.innerHTML = `
      ${toastHtml}
      <div class="mgmt-tabs">
        <button type="button" class="mgmt-tabs__link" data-act="tab-cases">케이스 관리</button>
        <span class="is-on">데이터 연동 현황</span>
      </div>
      ${stageStrip}
      <div class="mgmt-split data-pipeline__split">
        <section class="mgmt-panel mgmt-panel--main data-pipeline__main">
          <div class="data-pipeline__list-head viz-tier viz-tier--basic">
            <div>
              <h2 class="mgmt-h2">CSV 파일별 처리 현황</h2>
              <span class="mgmt-sub">연동 DB <b>${MOCK_PIPELINE_FILE_COUNT}</b>건 · 표시 <b>${visible.length}</b>건 · 페이지 ${this.page}/${pages}</span>
            </div>
          </div>
          <div class="mgmt-table-wrap data-pipeline__table-wrap">
            <table class="mgmt-table mgmt-table--pick mgmt-table--viz data-pipeline-table">
              <colgroup>
                <col class="mgmt-col--file" />
                <col class="mgmt-col--id" />
                <col class="mgmt-col--date" />
                <col class="mgmt-col--viz" />
                <col class="mgmt-col--step" />
                <col class="mgmt-col--status" />
                <col class="mgmt-col--detail" />
              </colgroup>
              <thead><tr class="mgmt-table__head-row">
                <th><span class="mgmt-table__th-label">파일명</span></th>
                <th><span class="mgmt-table__th-label">연결 케이스</span></th>
                <th><span class="mgmt-table__th-label">업로드</span></th>
                <th class="mgmt-table__th--viz"><span class="mgmt-table__th-label">크기</span></th>
                <th><span class="mgmt-table__th-label">처리 단계</span></th>
                <th><span class="mgmt-table__th-label">결과</span></th>
                <th class="viz-tier viz-tier--detail"><span class="mgmt-table__th-label">내용</span></th>
              </tr></thead>
              <tbody>${fileRows || '<tr><td colspan="7" class="mgmt-muted mgmt-table__cell--c">해당 결과 없음</td></tr>'}</tbody>
            </table>
          </div>
          <footer class="data-pipeline__pager mgmt-pager" aria-label="목록 페이지">
            <button type="button" class="mgmt-pager__btn" data-act="page" data-page="${Math.max(1, this.page - 1)}" ${this.page <= 1 ? 'disabled' : ''}>◀</button>
            ${pagerBtns}
            <button type="button" class="mgmt-pager__btn" data-act="page" data-page="${Math.min(pages, this.page + 1)}" ${this.page >= pages ? 'disabled' : ''}>▶</button>
          </footer>
        </section>
        <aside class="data-pipeline__side viz-widget" data-widget-id="pipeline-detail">
          <div class="mgmt-panel data-pipeline__detail-panel pipeline-side-panel viz-tier viz-tier--detail">
            <h2 class="mgmt-h2">선택 파일</h2>
            <p class="pipeline-side-panel__hint">목록 행 클릭 · 타임라인 단계 클릭으로 상세 확인</p>
            ${renderPipelineDetailPanel(sel, this.focusedLogIdx)}
            <div class="data-pipeline__detail-actions">
              <button type="button" class="mgmt-btn" data-act="reprocess">재처리 요청</button>
              <button type="button" class="mgmt-btn mgmt-btn--ghost" data-act="view-case">케이스 보기</button>
            </div>
          </div>
          ${renderPipelineKpiPanel()}
          <div class="data-pipeline__upload-note">
            CSV 업로드는 <button type="button" class="mgmt-link" data-act="goto-condition">조건 설정 화면 →</button> 에서 합니다.
          </div>
          <span class="mgmt-badge">DT-300 · 데이터 연동 현황 (탭 2)</span>
        </aside>
      </div>`;
    this.unbindTiers?.();
    this.unbindPipelineViz?.();
    this.unbindTiers = bindWidgetTiers(this.host);
    this.unbindPipelineViz = bindPipelineViz(this.host);
  }

  public dispose(): void {
    this.unbindPipelineViz?.();
    this.unbindTiers?.();
    this.element.remove();
  }
}
