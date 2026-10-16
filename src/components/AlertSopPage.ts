import { GRADES, IS_THRESHOLD_PROVISIONAL, gradeOf, remainPct } from '@/constants/grade';
import {
  MOCK_ALERT_RECORDS,
  MOCK_ALERT_RECORD_COUNT,
  countAlertsByStatus,
  type MockAlertRecord,
} from '@/data/mockAlertRecords';
import type { MockAlertSopStore } from '@/state/mockAlertSop';
import { paginateRows, totalPages } from '@/utils/caseListFilter';
import type { PierScourDepth } from '@/utils/pierScourSample';
import type { Disposable } from '@/types/disposable';

const ALERT_PAGE_SIZE = 8;

export interface AlertSopPageOptions {
  store: MockAlertSopStore;
  caseId: string;
  /** 해석 종료 시각(s) — 목록 스냅샷 */
  durationSeconds: number;
  onChanged: () => void;
}

/** 10번 경보 · SOP 전체 화면 */
export class AlertSopPage implements Disposable {
  public readonly element: HTMLElement;
  private readonly store: MockAlertSopStore;
  private caseId: string;
  private durationSeconds: number;
  private readonly onChanged: () => void;
  private snapshotDepths: PierScourDepth[] = [];
  private foundationDepthM = 5.2;
  private focusPierId = 'P2';
  private selectedAlertId = 'alert-seed-1';
  private alertSeg: 'all' | 'active' | 'closed' = 'active';
  private alertPage = 1;

  public constructor(options: AlertSopPageOptions) {
    this.store = options.store;
    this.caseId = options.caseId;
    this.durationSeconds = options.durationSeconds;
    this.onChanged = options.onChanged;
    this.element = document.createElement('div');
    this.element.className = 'alert-sop-page screen-stack-page is-hidden';
    this.element.addEventListener('click', (e) => this.onClick(e));
  }

  public setCaseId(caseId: string): void {
    this.caseId = caseId;
    if (!this.element.classList.contains('is-hidden')) this.render();
  }

  public setContext(
    depthsAtEnd: PierScourDepth[],
    foundationDepthM: number,
    durationSeconds: number,
  ): void {
    this.snapshotDepths = depthsAtEnd;
    this.foundationDepthM = foundationDepthM;
    this.durationSeconds = durationSeconds;
    const sorted = [...depthsAtEnd].sort((a, b) => b.scourDepthM - a.scourDepthM);
    this.focusPierId = sorted[0]?.pierId ?? 'P2';
    const linked = MOCK_ALERT_RECORDS.find(
      (r) => r.status === 'active' && r.caseId === this.caseId && r.pier === this.focusPierId,
    );
    if (linked) this.selectedAlertId = linked.id;
    this.render();
  }

  private selectedRecord(): MockAlertRecord {
    return MOCK_ALERT_RECORDS.find((r) => r.id === this.selectedAlertId) ?? MOCK_ALERT_RECORDS[0];
  }

  private depthForRecord(rec: MockAlertRecord): number {
    if (rec.caseId === this.caseId) {
      const live = this.snapshotDepths.find((d) => d.pierId === rec.pier);
      if (live) return live.scourDepthM;
    }
    return rec.scourDepthM;
  }

  public setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
    if (visible) this.render();
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const sopIdx = t.closest('[data-sop-idx]')?.getAttribute('data-sop-idx');
    if (sopIdx != null) {
      this.store.toggleSop(Number(sopIdx));
      this.onChanged();
      this.render();
      return;
    }
    if (
      t.closest('[data-act="alert-close"]') &&
      this.store.allApplicableDone() &&
      !this.store.alertClosed
    ) {
      this.store.closeAlert();
      this.onChanged();
      this.render();
      return;
    }
    if (t.closest('[data-act="toast-memo"]')) {
      console.info('[SCDT 목업] 메모 입력');
      return;
    }
    if (t.closest('[data-act="toast-attach"]')) {
      console.info('[SCDT 목업] 첨부');
      return;
    }
    const seg = t.closest('[data-act="alert-seg"]')?.getAttribute('data-seg') as
      | 'all'
      | 'active'
      | 'closed'
      | null;
    if (seg) {
      this.alertSeg = seg;
      this.alertPage = 1;
      this.render();
      return;
    }
    const pageAttr = t.closest('[data-act="alert-page"]')?.getAttribute('data-page');
    if (pageAttr) {
      this.alertPage = Number.parseInt(pageAttr, 10);
      this.render();
      return;
    }
    const alertId = t.closest('[data-act="alert-pick"]')?.getAttribute('data-alert-id');
    if (alertId) {
      const rec = MOCK_ALERT_RECORDS.find((r) => r.id === alertId);
      if (rec) {
        this.selectedAlertId = rec.id;
        this.focusPierId = rec.pier;
      }
      this.render();
    }
  }

  private render(): void {
    const focusRec = this.selectedRecord();
    const focusDepth = this.depthForRecord(focusRec);
    const focusGrade = gradeOf(focusDepth, this.foundationDepthM);
    const appl = this.store.applicableItems();
    const nDone = appl.filter((s) => s.done).length;
    const allDone = this.store.allApplicableDone();
    const sessionClosed = this.store.alertClosed;
    const recordClosed = focusRec.status === 'closed';
    const closed = recordClosed || (sessionClosed && focusRec.id === 'alert-seed-1');

    const filtered =
      this.alertSeg === 'all'
        ? MOCK_ALERT_RECORDS
        : MOCK_ALERT_RECORDS.filter((r) => r.status === this.alertSeg);
    const pages = totalPages(filtered.length, ALERT_PAGE_SIZE);
    const safePage = Math.min(this.alertPage, Math.max(1, pages));
    if (safePage !== this.alertPage) this.alertPage = safePage;
    const pageRows = paginateRows(filtered, this.alertPage, ALERT_PAGE_SIZE);

    const activeCount = countAlertsByStatus('active');
    const closedCount = countAlertsByStatus('closed');

    const alertList = pageRows
      .map((rec) => {
        const depth = this.depthForRecord(rec);
        const grade = gradeOf(depth, this.foundationDepthM);
        const cc = grade.color;
        const pending = appl.length - nDone;
        const isFocus = rec.id === this.selectedAlertId;
        const isClosedRow = rec.status === 'closed';
        const st = isClosedRow ? '종료됨' : isFocus ? `미조치 ${pending}건` : '조치중';
        return `<button type="button" class="alert-sop-page__alert-item ${isFocus ? 'is-focus' : ''}" data-act="alert-pick" data-alert-id="${rec.id}" style="background:${isFocus ? `${cc}1F` : '#0E2235'};border-color:${isFocus ? cc : 'var(--line2)'}">
          <div class="alert-sop-page__alert-head">
            <span class="grade-pill grade-pill--${grade.key}">${grade.name}</span>
            <span class="alert-sop-page__alert-pier">${rec.pier} · ${rec.caseId}</span>
            <span class="alert-sop-page__alert-time">${rec.issuedAt}</span>
          </div>
          <div class="alert-sop-page__alert-sub">잔여 여유율 ${remainPct(depth, this.foundationDepthM).toFixed(0)} % · ${rec.assignee} · <b>${st}</b></div>
        </button>`;
      })
      .join('');

    const pagerBtns = Array.from({ length: pages }, (_, i) => {
      const p = i + 1;
      return `<button type="button" class="alert-sop-page__pager-btn ${p === this.alertPage ? 'is-on' : ''}" data-act="alert-page" data-page="${p}">${p}</button>`;
    }).join('');

    const segBtn = (key: 'all' | 'active' | 'closed', label: string, count: number) =>
      `<button type="button" class="alert-sop-page__seg-btn ${this.alertSeg === key ? 'is-on' : ''}" data-act="alert-seg" data-seg="${key}">${label} <b>${count}</b></button>`;

    const sopRows = this.store.sop
      .map((s, i) => {
        const g = GRADES.find((x) => x.key === s.gradeKey)!;
        const bg = s.na ? '#0E2235' : s.done ? '#0F2A20' : '#2B2411';
        const bd = s.na ? 'var(--line2)' : s.done ? '#1F5440' : '#4A3C14';
        const status = s.na
          ? '심각 단계 도달 시 활성'
          : s.done
            ? `완료 · ${s.when ?? ''} · ${s.who ?? ''}`
            : '미조치';
        const statusColor = s.na ? '#6B8299' : s.done ? '#5BD6A0' : '#E8B21A';
        const actions = s.na
          ? ''
          : `<button type="button" class="alert-sop-page__lnk" data-act="toast-memo">메모</button>
             <button type="button" class="alert-sop-page__lnk" data-act="toast-attach">첨부</button>
             <button type="button" class="alert-sop-page__sop-toggle" data-sop-idx="${i}">${s.done ? '취소' : '완료 처리'}</button>`;
        return `<div class="alert-sop-page__sop-row" style="background:${bg};border-color:${bd};${s.na ? 'opacity:.55' : ''}">
          <div class="alert-sop-page__check ${s.done ? 'is-done' : ''}">${s.done ? '✓' : ''}</div>
          <span class="grade-pill grade-pill--${g.key}">${g.name}</span>
          <div class="alert-sop-page__sop-body">
            <div class="alert-sop-page__sop-title">${s.title}</div>
            <div class="alert-sop-page__sop-status" style="color:${statusColor}">${status}</div>
          </div>
          ${actions}
        </div>`;
      })
      .join('');

    const hist = this.store.history
      .map(
        (h) => `<div class="alert-sop-page__hist-row">
          <span class="alert-sop-page__hist-at">${h.at}</span>
          <span class="alert-sop-page__hist-who">${h.who}</span>
          <span class="alert-sop-page__hist-text">${h.text}</span>
        </div>`,
      )
      .join('');

    const gradeCards = GRADES.map((g, i) => {
      const rng = ['≥ 70 %', '40 – 70 %', '20 – 40 %', '< 20 %'][i];
      const hl = g.key === focusGrade.key;
      return `<div class="alert-sop-page__grade-card" style="border-color:${hl ? g.color : 'var(--line2)'};background:${hl ? `${g.color}1F` : '#0E2235'}">
        <div class="alert-sop-page__grade-card-head">
          <span class="grade-pill grade-pill--${g.key}">${g.name}</span>
          <span class="alert-sop-page__grade-en">${g.en}</span>
          <span class="alert-sop-page__grade-rng">${rng}</span>
        </div>
        <div class="alert-sop-page__grade-act">${g.action}</div>
      </div>`;
    }).join('');

    const closeLabel = closed ? '경보 종료됨' : allDone ? '경보 종료' : '경보 종료 (SOP 완료 후)';
    const closeClass = closed
      ? 'alert-sop-page__close is-closed'
      : allDone
        ? 'alert-sop-page__close is-ready'
        : 'alert-sop-page__close is-disabled';
    const closeAttrs =
      allDone && !closed ? 'data-act="alert-close" role="button" tabindex="0"' : '';

    this.element.innerHTML = `
      <div class="alert-sop-page__cols">
        <aside class="alert-sop-page__col alert-sop-page__col--list">
          <div class="alert-sop-page__col-head">
            <div class="alert-sop-page__col-title-row">
              <h2 class="alert-sop-page__h2">경보 목록</h2>
              <span class="alert-sop-page__sub">DB ${MOCK_ALERT_RECORD_COUNT}건 · 진행 ${activeCount} · 종료 ${closedCount}</span>
            </div>
            <div class="alert-sop-page__seg">${segBtn('all', '전체', MOCK_ALERT_RECORD_COUNT)}${segBtn('active', '진행중', activeCount)}${segBtn('closed', '종료', closedCount)}</div>
          </div>
          <div class="alert-sop-page__list-scroll">${alertList || '<p class="alert-sop-page__hint">해당 상태의 경보가 없습니다.</p>'}
            <div class="alert-sop-page__list-pager">
              <button type="button" class="alert-sop-page__pager-btn" data-act="alert-page" data-page="${Math.max(1, this.alertPage - 1)}" ${this.alertPage <= 1 ? 'disabled' : ''}>◀</button>
              ${pagerBtns}
              <button type="button" class="alert-sop-page__pager-btn" data-act="alert-page" data-page="${Math.min(pages, this.alertPage + 1)}" ${this.alertPage >= pages ? 'disabled' : ''}>▶</button>
            </div>
            <div class="alert-sop-page__hint">선택 경보 기준 SOP · 현재 해석 ${this.caseId} (t = ${Math.round(this.durationSeconds)} s)</div>
          </div>
        </aside>
        <section class="alert-sop-page__col alert-sop-page__col--main">
          <div class="alert-sop-page__focus" style="border-color:${focusGrade.color};background:${focusGrade.color}1F">
            <div>
              <div class="alert-sop-page__focus-title" style="color:${focusGrade.color}">⚠ ${focusGrade.name} (${focusGrade.en}) — ${focusRec.pier} 교각${closed ? ' · 종료됨' : ''}</div>
              <div class="alert-sop-page__focus-meta">발령 ${focusRec.issuedAt}${focusRec.closedAt ? ` · 종료 ${focusRec.closedAt}` : ''} &nbsp;|&nbsp; 잔여 여유율 ${remainPct(focusDepth, this.foundationDepthM).toFixed(0)} % &nbsp;|&nbsp; 세굴심 ${focusDepth.toFixed(2)} m &nbsp;|&nbsp; 담당 ${focusRec.assignee} &nbsp;|&nbsp; 케이스 ${focusRec.caseId}</div>
            </div>
            <div class="${closeClass}" style="${allDone && !closed ? `background:${focusGrade.color}` : ''}" ${closeAttrs}>${closeLabel}</div>
          </div>
          <div class="alert-sop-page__sop-head">
            <h2 class="alert-sop-page__h2">대응 절차 체크리스트 (SOP)</h2>
            <span class="alert-sop-page__sub">완료 ${nDone} / ${appl.length}</span>
          </div>
          <div class="alert-sop-page__sop-list">${sopRows}</div>
          <h2 class="alert-sop-page__h2 alert-sop-page__hist-title">대응 이력 <span class="alert-sop-page__sub">(append-only)</span></h2>
          <div class="alert-sop-page__hist">${hist}</div>
        </section>
        <aside class="alert-sop-page__col alert-sop-page__col--grades">
          <h2 class="alert-sop-page__h2">등급별 표준 대응 조치</h2>
          <div class="alert-sop-page__sub">연구개발계획서 p.43</div>
          ${gradeCards}
          <div class="alert-sop-page__hint">경계·심각 판정 시 현장 긴급 점검·통행 제한·임시 보강이 즉시 이루어지도록 경보 체계와 연동 (계획서 p.43). 여유율 구간은 ${IS_THRESHOLD_PROVISIONAL ? '<span class="alert-sop-page__prov">잠정</span>' : ''}</div>
          <span class="alert-sop-page__badge">DT-200 · 경보 · SOP 대응</span>
        </aside>
      </div>`;
  }

  public dispose(): void {
    this.element.remove();
  }
}
