import {
  IS_THRESHOLD_PROVISIONAL,
  gradeIndex,
  gradeOf,
  remainPct,
  worstPierByDepth,
} from '@/constants/grade';
import type { PierDefinition } from '@/modules/PierMarker';
import type { PierDepthSeries } from '@/utils/pierTimeSeries';
import {
  computePierReachTimes,
  describeNextGradeEta,
  scourProgressRate,
} from '@/utils/pierTimeSeries';
import type { PierScourDepth } from '@/utils/pierScourSample';
import type { Disposable } from '@/types/disposable';
import { renderSemiRemainGauge, renderEmptyRingPlaceholder, renderRingGauge } from '@/viz/gauge';
import { renderSparkline } from '@/viz/sparkline';
import { renderGradeLadder } from '@/viz/eventTimeline';
import { viewState } from '@/state/viewState';
import { observeWidgetTier } from '@/viz/widget';
import { animateVizBars } from '@/viz/vizMotion';

export interface RiskJudgmentPanelHandlers {
  onOpenSop: () => void;
}

interface PierCardRefs {
  root: HTMLElement;
  depthVal: HTMLElement;
  remainHost: HTMLElement;
  sparkHost: HTMLElement;
  etaBar: HTMLElement;
  etaFill: HTMLElement;
  finalMarker: HTMLElement;
  finalBar: HTMLElement;
}

/** 9번 우측 — 종합·교각별 위험 정보 (viz 중심, DOM 유지) */
export class RiskJudgmentPanel implements Disposable {
  public readonly element: HTMLElement;
  private readonly host: HTMLElement;
  private readonly handlers: RiskJudgmentPanelHandlers;
  private summaryEl: HTMLElement;
  private gaugeHost: HTMLElement;
  private gradeNameEl: HTMLElement;
  private ladderHost: HTMLElement;
  private cardsHost: HTMLElement;
  private lrfdHost: HTMLElement;
  private lastWorstGradeKey = '';
  private pierCards = new Map<string, PierCardRefs>();

  public constructor(handlers: RiskJudgmentPanelHandlers) {
    this.handlers = handlers;
    this.element = document.createElement('div');
    this.element.className = 'risk-judgment-panel risk-judgment-panel--viz viz-widget is-hidden';
    this.element.dataset.widgetId = 'risk-judgment';
    this.host = document.createElement('div');
    this.host.className = 'risk-judgment-panel__scroll';

    this.summaryEl = document.createElement('div');
    this.summaryEl.className = 'risk-judgment-panel__summary viz-tier viz-tier--core';
    this.gaugeHost = document.createElement('div');
    this.gaugeHost.className = 'risk-judgment-panel__gauge-host';
    this.gradeNameEl = document.createElement('div');
    this.gradeNameEl.className = 'risk-judgment-panel__grade-name';
    this.ladderHost = document.createElement('div');
    this.ladderHost.className = 'risk-judgment-panel__ladder-host viz-tier viz-tier--detail';

    const sopBtn = document.createElement('button');
    sopBtn.type = 'button';
    sopBtn.className = 'risk-judgment-panel__sop-btn';
    sopBtn.textContent = '대응 절차(SOP) 보기 →';
    this.summaryEl.append(
      document.createElement('div'), // label filled in update
      this.gaugeHost,
      this.gradeNameEl,
      this.ladderHost,
      sopBtn,
    );
    const labelSlot = this.summaryEl.firstElementChild as HTMLElement;
    labelSlot.className = 'risk-judgment-panel__summary-label';

    this.cardsHost = document.createElement('div');
    this.cardsHost.className = 'risk-judgment-panel__cards viz-tier viz-tier--basic';

    this.lrfdHost = document.createElement('div');
    this.lrfdHost.className = 'risk-judgment-panel__lrfd viz-tier viz-tier--detail';
    this.lrfdHost.innerHTML = `
      <div class="risk-judgment-panel__lrfd-title">신뢰성 지표 (LRFD)<span class="risk-judgment-panel__tag">3차년도 연계</span></div>
      <div class="risk-judgment-panel__lrfd-rings"></div>
      <div class="risk-judgment-panel__hint">β·Pe·TTC — 3차년도 LRFD 모듈 연계 후 표시</div>`;

    const head = document.createElement('div');
    head.className = 'risk-judgment-panel__section-head';
    head.innerHTML = `교각별 위험 정보 ${IS_THRESHOLD_PROVISIONAL ? '<span class="risk-judgment-panel__prov">잠정 기준</span>' : ''}`;

    this.host.append(this.summaryEl, head, this.cardsHost, this.lrfdHost);
    this.element.appendChild(this.host);

    this.host.addEventListener('pointerdown', this.onHostPointerDown);
    this.ensureLrfdRings();
    observeWidgetTier(this.element);
  }

  private ensureLrfdRings(): void {
    const rings = this.lrfdHost.querySelector('.risk-judgment-panel__lrfd-rings');
    if (!rings) return;
    rings.innerHTML = ['β', 'Pe', 'TTC']
      .map(
        (l) =>
          `<div class="risk-judgment-panel__lrfd-item"><span>${l}</span>${renderEmptyRingPlaceholder(40, '—')}</div>`,
      )
      .join('');
  }

  private onHostPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.risk-judgment-panel__sop-btn')) return;
    this.handlers.onOpenSop();
  };

  private ensurePierCard(pierId: string): PierCardRefs {
    let refs = this.pierCards.get(pierId);
    if (refs) return refs;
    const root = document.createElement('div');
    root.className = 'risk-judgment-panel__card';
    root.innerHTML = `
      <div class="risk-judgment-panel__card-head">
        <span class="risk-judgment-panel__pier-id"></span>
        <span class="grade-pill"></span>
        <span class="risk-judgment-panel__depth-val"></span>
      </div>
      <div class="risk-judgment-panel__viz-row">
        <div class="risk-judgment-panel__remain-gauge"></div>
        <div class="risk-judgment-panel__spark"></div>
      </div>
      <div class="risk-judgment-panel__eta">
        <span class="risk-judgment-panel__eta-label">다음 등급</span>
        <div class="viz-progress-bar"><i></i></div>
        <span class="risk-judgment-panel__eta-text"></span>
      </div>
      <div class="risk-judgment-panel__final-bar-wrap">
        <span class="risk-judgment-panel__muted">평형 세굴심</span>
        <div class="risk-judgment-panel__final-bar"><i class="risk-judgment-panel__final-fill"></i><i class="risk-judgment-panel__final-marker"></i></div>
      </div>`;
    this.cardsHost.appendChild(root);
    const pill = root.querySelector('.grade-pill') as HTMLElement;
    refs = {
      root,
      depthVal: root.querySelector('.risk-judgment-panel__depth-val') as HTMLElement,
      remainHost: root.querySelector('.risk-judgment-panel__remain-gauge') as HTMLElement,
      sparkHost: root.querySelector('.risk-judgment-panel__spark') as HTMLElement,
      etaBar: root.querySelector('.risk-judgment-panel__eta') as HTMLElement,
      etaFill: root.querySelector('.viz-progress-bar i') as HTMLElement,
      finalMarker: root.querySelector('.risk-judgment-panel__final-marker') as HTMLElement,
      finalBar: root.querySelector('.risk-judgment-panel__final-bar') as HTMLElement,
    };
    root.querySelector('.risk-judgment-panel__pier-id')!.textContent = pierId;
    root.dataset.pierId = pierId;
    root.addEventListener('click', () => {
      viewState.setSelectedPier(pierId);
      for (const card of this.cardsHost.querySelectorAll<HTMLElement>(
        '.risk-judgment-panel__card',
      )) {
        card.classList.toggle('is-linked-highlight', card.dataset.pierId === pierId);
      }
    });
    pill.className = 'grade-pill';
    this.pierCards.set(pierId, refs);
    return refs;
  }

  public update(
    pierDepths: PierScourDepth[],
    pierSeries: PierDepthSeries[],
    timeSeconds: number,
    foundationDepthM: number,
    _piers: PierDefinition[],
  ): void {
    const readings = pierDepths.map((d) => ({
      pierId: d.pierId,
      scourDepthM: d.scourDepthM,
    }));
    const worst = worstPierByDepth(readings);
    if (!worst) {
      this.cardsHost.textContent = '교각 데이터 없음';
      return;
    }
    const wg = gradeOf(worst.scourDepthM, foundationDepthM);
    const remain = remainPct(worst.scourDepthM, foundationDepthM);
    const seriesById = new Map(pierSeries.map((s) => [s.pierId, s]));

    if (wg.key !== this.lastWorstGradeKey) {
      this.summaryEl.classList.add('risk-judgment-panel__summary--pulse');
      this.lastWorstGradeKey = wg.key;
    }
    this.summaryEl.style.borderColor = wg.color;
    this.summaryEl.style.background = `${wg.color}22`;
    const label = this.summaryEl.querySelector(
      '.risk-judgment-panel__summary-label',
    ) as HTMLElement;
    label.style.color = wg.color;
    label.textContent = '종합 위험 등급';
    this.gaugeHost.innerHTML = renderSemiRemainGauge({
      valuePct: remain,
      size: 128,
      accent: wg.color,
      label: `${worst.pierId} · 여유`,
      showGradeTicks: true,
      pulse: this.lastWorstGradeKey !== '' && this.lastWorstGradeKey !== wg.key,
    });
    this.gradeNameEl.innerHTML = `<span class="risk-judgment-panel__grade-name" style="color:${wg.color}">${wg.name}</span>
      <span class="risk-judgment-panel__grade-en" style="color:${wg.color}">Level ${gradeIndex(wg) + 1} / 4 · ${wg.en}</span>
      <span class="risk-judgment-panel__action">표준 조치: <b>${wg.action}</b></span>`;
    this.ladderHost.innerHTML = renderGradeLadder(wg.key, true);
    const sopBtn = this.summaryEl.querySelector('.risk-judgment-panel__sop-btn') as HTMLElement;
    sopBtn.style.background = wg.color;

    const seen = new Set<string>();
    for (const d of pierDepths) {
      seen.add(d.pierId);
      const gg = gradeOf(d.scourDepthM, foundationDepthM);
      const ps = seriesById.get(d.pierId);
      const reach = ps ? computePierReachTimes(ps, foundationDepthM) : null;
      const rate = ps ? scourProgressRate(ps, timeSeconds) : 0;
      const next = ps
        ? describeNextGradeEta(ps, timeSeconds, d.scourDepthM, foundationDepthM)
        : '—';
      const refs = this.ensurePierCard(d.pierId);
      refs.root.style.borderColor = `${gg.color}88`;
      const pill = refs.root.querySelector('.grade-pill') as HTMLElement;
      pill.className = `grade-pill grade-pill--${gg.key}`;
      pill.textContent = gg.name;
      refs.depthVal.style.color = gg.color;
      refs.depthVal.textContent = `${d.scourDepthM.toFixed(2)} m`;
      const rPct = remainPct(d.scourDepthM, foundationDepthM);
      refs.remainHost.innerHTML = renderRingGauge({
        value: rPct,
        max: 100,
        size: 48,
        color: gg.color,
        label: `${Math.round(rPct)}%`,
      });
      if (ps) {
        const idx = ps.times.findIndex((t) => t > timeSeconds);
        const end = idx < 0 ? ps.depths.length : idx + 1;
        const slice = ps.depths.slice(Math.max(0, end - 24), end);
        refs.sparkHost.innerHTML = renderSparkline({
          values: slice,
          width: 100,
          height: 32,
          stroke: gg.color,
        });
      }
      const etaPct = next.includes('약') ? 55 : next.includes('도달 안') ? 15 : 100;
      refs.etaFill.setAttribute('data-bar-pct', String(etaPct));
      refs.etaFill.style.width = '0%';
      refs.etaFill.style.background = gg.color;
      const etaText = refs.etaBar.querySelector('.risk-judgment-panel__eta-text') as HTMLElement;
      etaText.textContent = next;
      etaText.setAttribute('data-tip', `최근 300 s +${rate.toFixed(2)} m`);
      const finalD = reach?.finalDepthM ?? d.scourDepthM;
      const barPct = Math.min(100, (d.scourDepthM / finalD) * 100);
      const finalFill = refs.finalBar.querySelector(
        '.risk-judgment-panel__final-fill',
      ) as HTMLElement;
      finalFill.style.width = `${barPct}%`;
      finalFill.style.background = `${gg.color}66`;
      refs.finalMarker.style.left = `${Math.min(100, (finalD / foundationDepthM) * 100)}%`;
      refs.finalMarker.setAttribute('data-tip', `평형 ${finalD.toFixed(2)} m`);
    }
    for (const [id, refs] of this.pierCards) {
      if (!seen.has(id)) refs.root.remove();
    }
    for (const id of [...this.pierCards.keys()]) {
      if (!seen.has(id)) this.pierCards.delete(id);
    }
    animateVizBars(this.cardsHost);
    const sel = viewState.selectedPierId;
    for (const card of this.cardsHost.querySelectorAll<HTMLElement>('.risk-judgment-panel__card')) {
      card.classList.toggle('is-linked-highlight', card.dataset.pierId === sel);
    }
  }

  public setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
  }

  public dispose(): void {
    this.host.removeEventListener('pointerdown', this.onHostPointerDown);
    this.element.remove();
  }
}
