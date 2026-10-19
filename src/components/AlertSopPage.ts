import { GRADES, gradeOf, remainPct } from '@/constants/grade';
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
import { renderDonutChart } from '@/viz/donut';
import { renderGradeLadder, renderEventTimeline, renderHeatStrip } from '@/viz/eventTimeline';
import { renderRingGauge } from '@/viz/gauge';
import { dayKeyFromAt, type ParsedHistoryRow } from '@/viz/eventTimelineHelpers';
import { bindWidgetTiers } from '@/viz/widget';
import {
  attachAlertSopSpotlight,
  bindAlertSopViz,
  flashAlertSopTarget,
  renderAlertColHeader,
  renderAlertFlowGuide,
  renderAlertGradeCards,
  renderAlertHero,
  renderAlertKpiStrip,
  renderAlertListCard,
} from '@/viz/alertSopViz';

/** 목록·이력 — flex로 영역을 채우되 과도한 스크롤 방지 */
const ALERT_PAGE_SIZE = 6;
const ALERT_HIST_MAX = 6;

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
  private unbindTiers: (() => void) | null = null;
  private unbindAlertViz: (() => void) | null = null;
  private unbindSpotlight: (() => void) | null = null;
  /** 사용자에게 한 번이라도 보인 뒤에는 클릭 갱신만 소프트 처리 */
  private hasShownMotion = false;
  private pendingFlashSelector: string | null = null;

  public constructor(options: AlertSopPageOptions) {
    this.store = options.store;
    this.caseId = options.caseId;
    this.durationSeconds = options.durationSeconds;
    this.onChanged = options.onChanged;
    this.element = document.createElement('div');
    this.element.className = 'alert-sop-page alert-sop-page--fill screen-stack-page is-hidden';
    this.element.addEventListener('click', (e) => this.onClick(e));
    this.unbindSpotlight = attachAlertSopSpotlight(this.element);
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
      this.pendingFlashSelector = `[data-sop-idx="${sopIdx}"]`;
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
      this.pendingFlashSelector = '.alert-sop-page__close';
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
    const donutSeg = t.closest('[data-donut-id]')?.getAttribute('data-donut-id') as
      | 'active'
      | 'closed'
      | null;
    if (donutSeg === 'active' || donutSeg === 'closed') {
      this.alertSeg = donutSeg;
      this.alertPage = 1;
      this.pendingFlashSelector = `[data-donut-id="${donutSeg}"]`;
      this.render();
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
      this.pendingFlashSelector = `[data-act="alert-seg"][data-seg="${seg}"]`;
      this.render();
      return;
    }
    const pageAttr = t.closest('[data-act="alert-page"]')?.getAttribute('data-page');
    if (pageAttr) {
      this.alertPage = Number.parseInt(pageAttr, 10);
      this.pendingFlashSelector = '.alert-sop-page__list-scroll';
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
      this.pendingFlashSelector = `[data-alert-id="${alertId}"]`;
      this.render();
    }
  }

  private render(): void {
    const visible = !this.element.classList.contains('is-hidden');
    const playEnterMotion = visible && !this.hasShownMotion;
    if (playEnterMotion) this.hasShownMotion = true;
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
        const pending = appl.length - nDone;
        const isFocus = rec.id === this.selectedAlertId;
        const isClosedRow = rec.status === 'closed';
        const st = isClosedRow ? '종료됨' : isFocus ? `미조치 ${pending}건` : '조치중';
        const rp = remainPct(depth, this.foundationDepthM);
        return renderAlertListCard({
          rec,
          gradeKey: grade.key,
          gradeName: grade.name,
          gradeColor: grade.color,
          remainPct: rp,
          statusText: st,
          assignee: rec.assignee,
          isFocus,
        });
      })
      .join('');

    const pagerBtns = Array.from({ length: pages }, (_, i) => {
      const p = i + 1;
      return `<button type="button" class="alert-sop-page__pager-btn ${p === this.alertPage ? 'is-on' : ''}" data-act="alert-page" data-page="${p}">${p}</button>`;
    }).join('');

    const segBtn = (key: 'all' | 'active' | 'closed', label: string, count: number): string =>
      `<button type="button" class="alert-sop-page__seg-btn ${this.alertSeg === key ? 'is-on' : ''}" data-act="alert-seg" data-seg="${key}">${label} <b>${count}</b></button>`;

    let sopStepNo = 0;
    const nextPending = this.store.sop.find((s) => !s.na && !s.done);
    const nextPendingIdx = nextPending ? this.store.sop.findIndex((s) => s === nextPending) : -1;

    const sopRows = this.store.sop
      .map((s, i) => {
        const g = GRADES.find((x) => x.key === s.gradeKey)!;
        const bd = s.na ? 'var(--line2)' : s.done ? '#1F5440' : '#4A3C14';
        const status = s.na
          ? '심각 등급 도달 시 자동 활성'
          : s.done
            ? `완료 · ${s.when ?? ''} · ${s.who ?? ''}`
            : '미완료';
        const statusColor = s.na ? '#6B8299' : s.done ? '#5BD6A0' : '#E8B21A';
        const actions = s.na
          ? ''
          : `<button type="button" class="alert-sop-page__lnk" data-act="toast-memo">메모</button>
             <button type="button" class="alert-sop-page__lnk" data-act="toast-attach">첨부</button>
             <button type="button" class="alert-sop-page__sop-toggle" data-sop-idx="${i}">${s.done ? '취소' : '완료 처리'}</button>`;
        const rowState = s.na ? 'na' : s.done ? 'done' : 'wait';
        const pendingPulse = rowState === 'wait' ? ' is-pending' : '';
        const isNext = i === nextPendingIdx ? ' is-next-up' : '';
        const stepBadge = s.na
          ? '<span class="alert-sop-page__sop-num is-na">—</span>'
          : (() => {
              sopStepNo += 1;
              return `<span class="alert-sop-page__sop-num">${sopStepNo}</span>`;
            })();
        return `<div class="alert-sop-page__sop-row alert-sop-page__sop-row--${rowState}${pendingPulse}${isNext}" data-sop-idx="${i}" style="--sop-bd:${bd};${s.na ? 'opacity:.55' : ''}">
          ${stepBadge}
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

    const histRows: ParsedHistoryRow[] = this.store.historyForTimeline().map((h) => ({
      at: h.at,
      who: h.who,
      text: h.text,
      kind: h.kind,
      dayKey: dayKeyFromAt(h.at),
    }));
    const hist = renderEventTimeline(histRows.slice(0, ALERT_HIST_MAX));

    const gradeLadder = renderGradeLadder(focusGrade.key, true);
    const gradePanel = `<div class="alert-sop-page__grade-stack">
      <div class="alert-sop-page__grade-ladder-wrap viz-tier viz-tier--core">
        <p class="alert-sop-page__grade-ladder-cap">현재 <b style="color:${focusGrade.color}">${focusGrade.name}</b> 구간</p>
        ${gradeLadder}
      </div>
      <div class="alert-sop-page__grade-cards">${renderAlertGradeCards(focusGrade.key)}</div>
    </div>`;

    const statusDonut = renderDonutChart({
      size: 80,
      segments: [
        { id: 'active', value: activeCount, color: '#E8791A', label: '진행' },
        { id: 'closed', value: closedCount, color: '#2EA36B', label: '종료' },
      ],
      centerHtml: `<text x="40" y="44" text-anchor="middle" fill="#9FB6C8" font-size="11">경보</text>`,
    });
    const heatCells = this.buildAlertHeatStrip();

    const sopProgressRing = renderRingGauge({
      value: nDone,
      max: Math.max(appl.length, 1),
      size: 52,
      color: '#2EA36B',
      label: `${nDone}/${appl.length}`,
    });

    const closeLabel = closed ? '경보 종료됨' : allDone ? '경보 종료' : '경보 종료 (SOP 완료 후)';
    const closeClass = closed
      ? 'alert-sop-page__close is-closed'
      : allDone
        ? 'alert-sop-page__close is-ready'
        : 'alert-sop-page__close is-disabled';
    const closeAttrs =
      allDone && !closed ? 'data-act="alert-close" role="button" tabindex="0"' : '';

    const canClose = allDone && !closed;
    const focusRemain = remainPct(focusDepth, this.foundationDepthM);
    const heroRing = renderRingGauge({
      value: focusRemain,
      max: 100,
      size: 76,
      color: focusGrade.color,
      label: `${focusRemain.toFixed(0)}%`,
    });

    const kpiStrip = renderAlertKpiStrip({
      activeCount,
      closedCount,
      sopDone: nDone,
      sopTotal: appl.length,
      canClose,
      focusGradeName: focusGrade.name,
      focusGradeColor: focusGrade.color,
      focusPier: focusRec.pier,
      caseId: this.caseId,
      durationSeconds: this.durationSeconds,
    });

    const flowGuide = renderAlertFlowGuide({
      pier: focusRec.pier,
      allDone,
      closed,
    });

    const hero = renderAlertHero({
      pier: focusRec.pier,
      gradeName: focusGrade.name,
      gradeKey: focusGrade.key,
      gradeColor: focusGrade.color,
      scourM: focusDepth,
      foundationM: this.foundationDepthM,
      remain: focusRemain,
      issuedAt: focusRec.issuedAt,
      assignee: focusRec.assignee,
      caseId: focusRec.caseId,
      closed,
      ringHtml: heroRing,
      closeLabel,
      closeClass,
      closeAttrs,
      allDone,
    });

    this.element.innerHTML = `
      <div class="alert-sop-page__top">
        ${kpiStrip}
        ${flowGuide}
      </div>
      <div class="alert-sop-page__cols viz-widget-grid">
        <aside class="alert-sop-page__col alert-sop-page__col--list viz-widget alert-sop-page__col--glass">
          <div class="alert-sop-page__col-head viz-tier viz-tier--basic">
            ${renderAlertColHeader(1, '경보 목록', '교각을 선택하면 가운데 SOP가 연동됩니다', 'list')}
            <div class="alert-sop-page__seg">${segBtn('all', '전체', MOCK_ALERT_RECORD_COUNT)}${segBtn('active', '진행중', activeCount)}${segBtn('closed', '종료', closedCount)}</div>
            <div class="alert-sop-page__list-viz viz-tier viz-tier--detail">${statusDonut}${renderHeatStrip(heatCells)}</div>
          </div>
          <div class="alert-sop-page__list-scroll viz-tier viz-tier--core"><div class="alert-sop-page__alert-stack">${alertList || '<p class="alert-sop-page__hint">해당 상태의 경보가 없습니다.</p>'}</div>
            <div class="alert-sop-page__list-pager">
              <button type="button" class="alert-sop-page__pager-btn" data-act="alert-page" data-page="${Math.max(1, this.alertPage - 1)}" ${this.alertPage <= 1 ? 'disabled' : ''}>◀</button>
              ${pagerBtns}
              <button type="button" class="alert-sop-page__pager-btn" data-act="alert-page" data-page="${Math.min(pages, this.alertPage + 1)}" ${this.alertPage >= pages ? 'disabled' : ''}>▶</button>
            </div>
          </div>
        </aside>
        <section class="alert-sop-page__col alert-sop-page__col--main alert-sop-page__col--glass">
          <div class="alert-sop-page__main-scroll">
            ${hero}
            <div class="alert-sop-page__sop-head">
              ${renderAlertColHeader(2, 'SOP 조치', '각 항목 완료 처리 → 이력 자동 기록', 'sop')}
              <span class="alert-sop-page__sop-progress">${sopProgressRing}</span>
            </div>
            <div class="alert-sop-page__sop-list"><div class="alert-sop-page__sop-stack">${sopRows}</div></div>
            <div class="alert-sop-page__hist-block">
              <h2 class="alert-sop-page__h2 alert-sop-page__hist-title">대응 이력 <span class="alert-sop-page__sub">최근 ${ALERT_HIST_MAX}건</span></h2>
              <div class="alert-sop-page__hist alert-sop-page__hist--timeline">${hist}</div>
            </div>
          </div>
        </section>
        <aside class="alert-sop-page__col alert-sop-page__col--grades viz-widget viz-tier--detail alert-sop-page__col--glass">
          ${renderAlertColHeader(3, '등급 · 표준 조치', '계획서 기준 대응 가이드', 'grades')}
          ${gradePanel}
          <span class="alert-sop-page__badge">DT-200 · SOP</span>
        </aside>
      </div>`;
    this.unbindTiers?.();
    this.unbindAlertViz?.();
    this.unbindTiers = bindWidgetTiers(this.element);
    this.unbindAlertViz = bindAlertSopViz(this.element, {
      enter: playEnterMotion,
      animateBars: playEnterMotion,
      animateCount: playEnterMotion,
    });
    const flashSel = this.pendingFlashSelector;
    this.pendingFlashSelector = null;
    if (flashSel) {
      requestAnimationFrame(() => flashAlertSopTarget(this.element, flashSel));
    }
  }

  /** 7일 발령 히트맵 (목록 헤더용) */
  private buildAlertHeatStrip(): Array<{ label: string; color: string; count: number }> {
    const days: Array<{ label: string; color: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const slot = i;
      const count = MOCK_ALERT_RECORDS.filter((r) => {
        const dk = dayKeyFromAt(r.issuedAt);
        return dk.endsWith(String(28 - (slot % 10)).padStart(2, '0')) || slot < 2;
      }).length;
      const sample = MOCK_ALERT_RECORDS[slot % MOCK_ALERT_RECORDS.length];
      const depth = sample ? this.depthForRecord(sample) : 1;
      const g = gradeOf(depth, this.foundationDepthM);
      days.push({ label: `D-${i}`, color: g.color, count: Math.min(count, 5) });
    }
    return days;
  }

  public dispose(): void {
    this.unbindTiers?.();
    this.unbindAlertViz?.();
    this.unbindSpotlight?.();
    this.element.remove();
  }
}
