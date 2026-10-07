import { GRADES, IS_THRESHOLD_PROVISIONAL, gradeOf, remainPct } from '@/constants/grade';
import type { MockAlertSopStore } from '@/state/mockAlertSop';
import type { PierScourDepth } from '@/utils/pierScourSample';
import type { Disposable } from '@/types/disposable';

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
  private readonly caseId: string;
  private durationSeconds: number;
  private readonly onChanged: () => void;
  private snapshotDepths: PierScourDepth[] = [];
  private foundationDepthM = 5.2;
  private focusPierId = 'P2';
  private alertSeg: 'all' | 'active' | 'closed' = 'active';

  public constructor(options: AlertSopPageOptions) {
    this.store = options.store;
    this.caseId = options.caseId;
    this.durationSeconds = options.durationSeconds;
    this.onChanged = options.onChanged;
    this.element = document.createElement('div');
    this.element.className = 'alert-sop-page screen-stack-page is-hidden';
    this.element.addEventListener('click', (e) => this.onClick(e));
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
    this.render();
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
      this.render();
      return;
    }
    const pier = t.closest('[data-act="alert-pick"]')?.getAttribute('data-pier');
    if (pier) {
      this.focusPierId = pier;
      this.render();
    }
  }

  private render(): void {
    const depths =
      this.snapshotDepths.length > 0 ? this.snapshotDepths : [{ pierId: 'P2', scourDepthM: 0 }];
    const list = [...depths]
      .map((d) => ({
        pier: d.pierId,
        depth: d.scourDepthM,
        grade: gradeOf(d.scourDepthM, this.foundationDepthM),
      }))
      .sort((a, b) => b.depth - a.depth);
    const focusDepth =
      depths.find((d) => d.pierId === this.focusPierId)?.scourDepthM ?? list[0]?.depth ?? 0;
    const focusGrade = gradeOf(focusDepth, this.foundationDepthM);
    const appl = this.store.applicableItems();
    const nDone = appl.filter((s) => s.done).length;
    const allDone = this.store.allApplicableDone();
    const closed = this.store.alertClosed;
    const issuedAt = '2026-10-02 09:22';
    const mockTimes = ['10-02 09:22', '10-02 03:10', '10-01 22:40'];
    const mockClosedHistory = [
      { pier: 'P1', time: '09-28 14:10', depth: 1.2 },
      { pier: 'P3', time: '09-25 08:40', depth: 0.95 },
    ];

    const liveAlerts = list.map((a, i) => ({
      ...a,
      time: mockTimes[i] ?? '—',
      isPrimary: a.pier === this.focusPierId || (this.focusPierId === 'P2' && i === 0),
      isClosed: closed && i === 0,
    }));

    const closedAlerts = mockClosedHistory.map((h) => ({
      pier: h.pier,
      depth: h.depth,
      grade: gradeOf(h.depth, this.foundationDepthM),
      time: h.time,
      isPrimary: h.pier === this.focusPierId,
      isClosed: true,
    }));

    let alertsForList =
      this.alertSeg === 'closed'
        ? closedAlerts
        : this.alertSeg === 'active'
          ? liveAlerts.filter((a) => !a.isClosed)
          : [...liveAlerts, ...closedAlerts];

    if (alertsForList.length === 0) {
      alertsForList = liveAlerts;
    }

    const activeCount = closed ? 2 : liveAlerts.filter((a) => !a.isClosed).length;
    const closedCount = closed ? 13 : 12;

    const alertList = alertsForList
      .map((a) => {
        const cc = a.grade.color;
        const pending = appl.length - nDone;
        const isFocus = a.pier === this.focusPierId;
        const st = a.isClosed ? '종료됨' : isFocus ? `미조치 ${pending}건` : '조치중';
        return `<button type="button" class="alert-sop-page__alert-item" data-act="alert-pick" data-pier="${a.pier}" style="background:${isFocus ? `${cc}1F` : '#0E2235'};border-color:${isFocus ? cc : 'var(--line2)'}">
          <div class="alert-sop-page__alert-head">
            <span class="grade-pill grade-pill--${a.grade.key}">${a.grade.name}</span>
            <span class="alert-sop-page__alert-pier">${a.pier} 교각</span>
            <span class="alert-sop-page__alert-time">${a.time}</span>
          </div>
          <div class="alert-sop-page__alert-sub">잔여 여유율 ${remainPct(a.depth, this.foundationDepthM).toFixed(0)} % · <b>${st}</b></div>
        </button>`;
      })
      .join('');

    const segBtn = (key: 'all' | 'active' | 'closed', label: string) =>
      `<button type="button" class="alert-sop-page__seg-btn ${this.alertSeg === key ? 'is-on' : ''}" data-act="alert-seg" data-seg="${key}">${label}</button>`;

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
              <span class="alert-sop-page__sub">진행중 ${activeCount} | 종료 ${closedCount}</span>
            </div>
            <div class="alert-sop-page__seg">${segBtn('all', '전체')}${segBtn('active', '진행중')}${segBtn('closed', '종료')}</div>
          </div>
          <div class="alert-sop-page__list-scroll">${alertList}
            <div class="alert-sop-page__hint">교각 ${depths.length}개 기준 · 케이스 ${this.caseId} (t = ${Math.round(this.durationSeconds)} s)</div>
          </div>
        </aside>
        <section class="alert-sop-page__col alert-sop-page__col--main">
          <div class="alert-sop-page__focus" style="border-color:${focusGrade.color};background:${focusGrade.color}1F">
            <div>
              <div class="alert-sop-page__focus-title" style="color:${focusGrade.color}">⚠ ${focusGrade.name} (${focusGrade.en}) — ${this.focusPierId} 교각${closed ? ' · 종료됨' : ''}</div>
              <div class="alert-sop-page__focus-meta">발령 ${issuedAt} &nbsp;|&nbsp; 잔여 여유율 ${remainPct(focusDepth, this.foundationDepthM).toFixed(0)} % &nbsp;|&nbsp; 세굴심 ${focusDepth.toFixed(2)} m &nbsp;|&nbsp; 담당 김○○ (시설관리과) &nbsp;|&nbsp; 케이스 ${this.caseId}</div>
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
