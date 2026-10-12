import {
  MOCK_PIPELINE_FILE_COUNT,
  MOCK_PIPELINE_FILES,
  type MockPipelineFile,
  type PipelineResultKey,
} from '@/data/mockPipelineFiles';
import { paginateRows, totalPages } from '@/utils/caseListFilter';
import type { Disposable } from '@/types/disposable';

export interface DataPipelinePageHandlers {
  onOpenCases: () => void;
  onOpenConditionSetup: () => void;
}

type ListSeg = 'all' | PipelineResultKey;

const PAGE_SIZE = 12;

const RESULT_BADGE: Record<PipelineResultKey, readonly [string, string, string]> = {
  ok: ['완료', '#5BD6A0', '#10402F'],
  warn: ['경고', '#E8B21A', '#3D2A0C'],
  err: ['오류', '#E8796B', '#3B1512'],
  run: ['처리중', '#6FB6DE', '#102C45'],
  wait: ['대기', '#9FB6C8', '#1B3350'],
};

/** 3번 데이터 연동 — 목업 필터·파일 선택·재처리 */
export class DataPipelinePage implements Disposable {
  public readonly element: HTMLElement;
  private readonly handlers: DataPipelinePageHandlers;
  private readonly host: HTMLElement;
  private files: MockPipelineFile[];
  private listSeg: ListSeg = 'all';
  private page = 1;
  private selectedId: string;
  private toast = '';

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
    if (this.listSeg === 'all') return this.files;
    return this.files.filter((f) => f.result === this.listSeg);
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (t.closest('[data-act="tab-cases"]')) {
      this.handlers.onOpenCases();
      return;
    }
    const seg = t.closest('[data-act="seg"]')?.getAttribute('data-seg') as ListSeg | null;
    if (seg) {
      this.listSeg = seg;
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
    const fileId = t.closest('[data-act="pick-file"]')?.getAttribute('data-file-id');
    if (fileId) {
      this.selectedId = fileId;
      this.render();
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
      { stage: 'QA / QC', time: '—', state: 'wait', detail: '대기' },
      { stage: '서비스 반영', time: '—', state: 'wait', detail: '대기' },
    ];
    this.toast = `${f.fileName} 재처리 요청됨 (목업)`;
    this.listSeg = 'run';
    this.render();
  }

  private countAtStage(minProgress: number): number {
    return this.files.filter((f) => f.stageProgress >= minProgress).length;
  }

  private render(): void {
    const total = this.files.length;
    const funnel = [
      ['업로드', 1],
      ['파싱', 2],
      ['경량화 · 변환', 3],
      ['QA / QC', 4],
      ['서비스 반영', 5],
    ] as const;
    const col = { ok: '#2EA36B', warn: '#E8B21A' };
    const stepHtml = funnel
      .map((s, i) => {
        const done = this.countAtStage(s[1]);
        const pct = total > 0 ? (done / total) * 100 : 0;
        const tone: 'ok' | 'warn' = pct >= 85 ? 'ok' : 'warn';
        const c = col[tone];
        const arrow = i < funnel.length - 1 ? '<span class="data-pipeline__arrow">▶</span>' : '';
        return `${arrow}<div class="data-pipeline__step" style="border-color:${c}55">
          <div class="data-pipeline__step-label">${i + 1}. ${s[0]}</div>
          <div class="data-pipeline__step-val" style="color:${c}">${done} / ${total}</div>
          <div class="data-pipeline__step-bar"><span style="width:${pct.toFixed(1)}%;background:${c}"></span></div>
        </div>`;
      })
      .join('');

    const dotc: Record<string, string> = { warn: '#E8B21A', err: '#E8796B', run: '#6FB6DE' };
    const dots = (n: number, r: string) =>
      `<span class="data-pipeline__dots">${[0, 1, 2, 3, 4]
        .map(
          (k) =>
            `<i style="background:${k < n ? '#2EA36B' : k === n && dotc[r] ? dotc[r] : '#1E3A57'}"></i>`,
        )
        .join('')}</span>`;

    const visible = this.visibleFiles();
    const pages = totalPages(visible.length, PAGE_SIZE);
    const safePage = Math.min(this.page, Math.max(1, pages));
    if (safePage !== this.page) this.page = safePage;
    const pageRows = paginateRows(visible, this.page, PAGE_SIZE);

    const sel = this.selectedFile();
    const selBadge = RESULT_BADGE[sel.result];

    const countBy = (key: PipelineResultKey): number =>
      this.files.filter((f) => f.result === key).length;

    const fileRows = pageRows
      .map((f) => {
        const r = RESULT_BADGE[f.result];
        const isSel = f.id === this.selectedId;
        return `<tr class="${isSel ? 'is-selected' : ''}" data-act="pick-file" data-file-id="${f.id}" role="button">
          <td><b>${f.fileName}</b></td><td>${f.caseId}</td><td class="mgmt-muted">${f.uploadedAt}</td><td class="mgmt-table__cell--num">${f.sizeLabel}</td>
          <td>${dots(f.stageProgress, f.result)}</td>
          <td><span class="mgmt-sbadge" style="background:${r[2]};color:${r[1]}">${r[0]}</span></td>
          <td class="data-pipeline__detail">${f.summary}</td></tr>`;
      })
      .join('');

    const detHtml = sel.logs
      .map((d) => {
        const c =
          d.state === 'ok'
            ? '#2EA36B'
            : d.state === 'err'
              ? '#E8796B'
              : d.state === 'run'
                ? '#6FB6DE'
                : '#4E6F8C';
        return `<div class="data-pipeline__log-row">
          <span class="data-pipeline__log-dot" style="background:${c}"></span>
          <span class="data-pipeline__log-step">${d.stage}</span>
          <span class="mgmt-muted">${d.time}</span>
          <span style="color:${d.state === 'err' ? '#E8796B' : '#9FB6C8'}">${d.detail}</span>
        </div>`;
      })
      .join('');

    const segs: Array<{ key: ListSeg; label: string; count: number }> = [
      { key: 'all', label: '전체', count: this.files.length },
      { key: 'ok', label: '완료', count: countBy('ok') },
      { key: 'run', label: '처리중', count: countBy('run') },
      { key: 'warn', label: '경고', count: countBy('warn') },
      { key: 'err', label: '오류', count: countBy('err') },
      { key: 'wait', label: '대기', count: countBy('wait') },
    ];
    const segHtml = segs
      .map(
        (s) =>
          `<button type="button" class="data-pipeline__seg-btn ${this.listSeg === s.key ? 'is-on' : ''}" data-act="seg" data-seg="${s.key}">${s.label} <b>${s.count}</b></button>`,
      )
      .join('');

    const pagerBtns = Array.from({ length: pages }, (_, i) => {
      const p = i + 1;
      return `<button type="button" class="mgmt-pager__btn ${p === this.page ? 'is-on' : ''}" data-act="page" data-page="${p}">${p}</button>`;
    }).join('');

    const kpi = [
      ['자동화율', '94 %', '목표 > 90 %'],
      ['NRMSE', '0.72 %', '목표 < 1 %'],
      ['물리 제약 통과율', '97.5 %', '안식각 · 상대세굴심'],
      ['텐서 품질점수', '0.88', '목표 ≥ 0.85'],
    ];

    const toastHtml = this.toast ? `<div class="mgmt-toast">${this.toast}</div>` : '';

    this.host.innerHTML = `
      ${toastHtml}
      <div class="mgmt-tabs">
        <button type="button" class="mgmt-tabs__link" data-act="tab-cases">케이스 관리</button>
        <span class="is-on">데이터 연동 현황</span>
      </div>
      <div class="data-pipeline__steps">${stepHtml}</div>
      <div class="mgmt-split data-pipeline__split">
        <section class="mgmt-panel mgmt-panel--main">
          <div class="data-pipeline__list-head">
            <div>
              <h2 class="mgmt-h2">CSV 파일별 처리 현황</h2>
              <span class="mgmt-sub">연동 DB <b>${MOCK_PIPELINE_FILE_COUNT}</b>건 · 필터 <b>${visible.length}</b>건 · 페이지 ${this.page}/${pages}</span>
            </div>
            <div class="data-pipeline__seg">${segHtml}</div>
          </div>
          <div class="mgmt-table-wrap data-pipeline__table-wrap">
            <table class="mgmt-table mgmt-table--pick">
              <thead><tr><th>파일명</th><th>연결 케이스</th><th>업로드</th><th>크기</th><th>처리 단계</th><th>결과</th><th>내용</th></tr></thead>
              <tbody>${fileRows || '<tr><td colspan="7" class="mgmt-muted mgmt-table__cell--c">해당 결과 없음</td></tr>'}</tbody>
            </table>
            <div class="mgmt-pager">
              <button type="button" class="mgmt-pager__btn" data-act="page" data-page="${Math.max(1, this.page - 1)}" ${this.page <= 1 ? 'disabled' : ''}>◀</button>
              ${pagerBtns}
              <button type="button" class="mgmt-pager__btn" data-act="page" data-page="${Math.min(pages, this.page + 1)}" ${this.page >= pages ? 'disabled' : ''}>▶</button>
            </div>
            <p class="mgmt-hint">행 클릭 → 우측 단계 로그 · 처리 단계: 업로드 → 파싱 → 경량화·변환 → QA/QC → 서비스 반영</p>
          </div>
        </section>
        <aside class="data-pipeline__side">
          <div class="mgmt-panel data-pipeline__detail-panel">
            <div class="data-pipeline__detail-head">
              <h2 class="mgmt-h2">선택 파일 · ${sel.fileName}</h2>
              <span class="mgmt-sbadge" style="background:${selBadge[2]};color:${selBadge[1]}">${selBadge[0]}</span>
            </div>
            ${detHtml}
            <div class="data-pipeline__detail-actions">
              <button type="button" class="mgmt-btn" data-act="reprocess">재처리 요청</button>
              <button type="button" class="mgmt-btn mgmt-btn--ghost" data-act="view-case">케이스 보기</button>
            </div>
          </div>
          <div class="mgmt-panel data-pipeline__kpi">
            <h2 class="mgmt-h2">품질 지표 (QA / QC)</h2>
            <div class="data-pipeline__kpi-grid">
              ${kpi
                .map(
                  (k) => `<div class="data-pipeline__kpi-card">
                <div class="mgmt-filter__label">${k[0]}</div>
                <div class="data-pipeline__kpi-val">${k[1]}</div>
                <div class="data-pipeline__kpi-target">${k[2]}</div></div>`,
                )
                .join('')}
            </div>
          </div>
          <div class="data-pipeline__upload-note">
            CSV 업로드는 <button type="button" class="mgmt-link" data-act="goto-condition">조건 설정 화면 →</button> 에서 합니다.
          </div>
          <span class="mgmt-badge">DT-300 · 데이터 연동 현황 (탭 2)</span>
        </aside>
      </div>`;
  }

  public dispose(): void {
    this.element.remove();
  }
}
