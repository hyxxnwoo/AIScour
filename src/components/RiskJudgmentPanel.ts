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

export interface RiskJudgmentPanelHandlers {
  onOpenSop: () => void;
}

/** 9번 우측 — 종합·교각별 위험 정보 */
export class RiskJudgmentPanel implements Disposable {
  public readonly element: HTMLElement;
  private readonly host: HTMLElement;
  private readonly handlers: RiskJudgmentPanelHandlers;

  public constructor(handlers: RiskJudgmentPanelHandlers) {
    this.handlers = handlers;
    this.element = document.createElement('div');
    this.element.className = 'risk-judgment-panel is-hidden';
    this.host = document.createElement('div');
    this.host.className = 'risk-judgment-panel__scroll';
    this.element.appendChild(this.host);
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
      this.host.textContent = '교각 데이터 없음';
      return;
    }
    const wg = gradeOf(worst.scourDepthM, foundationDepthM);
    const seriesById = new Map(pierSeries.map((s) => [s.pierId, s]));

    const summary = document.createElement('div');
    summary.className = 'risk-judgment-panel__summary';
    summary.style.borderColor = wg.color;
    summary.style.background = `${wg.color}22`;
    summary.innerHTML = `
      <div class="risk-judgment-panel__summary-label" style="color:${wg.color}">종합 위험 등급 (최고 위험 교각 기준)</div>
      <div class="risk-judgment-panel__summary-row">
        <div>
          <div class="risk-judgment-panel__grade-name" style="color:${wg.color}">${wg.name}</div>
          <div class="risk-judgment-panel__grade-en" style="color:${wg.color}">Level ${gradeIndex(wg) + 1} / 4 · ${wg.en}</div>
        </div>
        <div class="risk-judgment-panel__summary-right">
          <div class="risk-judgment-panel__muted">${worst.pierId} 잔여 여유율</div>
          <div class="risk-judgment-panel__remain-big" style="color:${wg.color}">${remainPct(worst.scourDepthM, foundationDepthM).toFixed(0)} %</div>
          <div class="risk-judgment-panel__fd">기초 근입 ${foundationDepthM.toFixed(2)} m</div>
        </div>
      </div>
      <div class="risk-judgment-panel__action">표준 조치: <b>${wg.action}</b> <span class="risk-judgment-panel__muted">(계획서 p.43)</span></div>`;
    const sopBtn = document.createElement('button');
    sopBtn.type = 'button';
    sopBtn.className = 'risk-judgment-panel__sop-btn';
    sopBtn.style.background = wg.color;
    sopBtn.textContent = '대응 절차(SOP) 보기 →';
    sopBtn.addEventListener('click', () => this.handlers.onOpenSop());
    summary.appendChild(sopBtn);

    const head = document.createElement('div');
    head.className = 'risk-judgment-panel__section-head';
    head.innerHTML = `교각별 위험 정보 ${IS_THRESHOLD_PROVISIONAL ? '<span class="risk-judgment-panel__prov">잠정 기준</span>' : ''}`;

    const cards = document.createElement('div');
    cards.className = 'risk-judgment-panel__cards';
    for (const d of pierDepths) {
      const gg = gradeOf(d.scourDepthM, foundationDepthM);
      const ps = seriesById.get(d.pierId);
      const reach = ps ? computePierReachTimes(ps, foundationDepthM) : null;
      const rate = ps ? scourProgressRate(ps, timeSeconds) : 0;
      const next = ps
        ? describeNextGradeEta(ps, timeSeconds, d.scourDepthM, foundationDepthM)
        : '—';
      const card = document.createElement('div');
      card.className = 'risk-judgment-panel__card';
      card.style.borderColor = `${gg.color}88`;
      card.innerHTML = `
        <div class="risk-judgment-panel__card-head">
          <span class="risk-judgment-panel__pier-id">${d.pierId}</span>
          <span class="grade-pill grade-pill--${gg.key}">${gg.name}</span>
          <span class="risk-judgment-panel__depth-val" style="color:${gg.color}">${d.scourDepthM.toFixed(2)} m</span>
        </div>
        <div class="risk-judgment-panel__kv"><span>잔여 여유율</span><b>${remainPct(d.scourDepthM, foundationDepthM).toFixed(1)} %</b></div>
        <div class="risk-judgment-panel__kv"><span>진행 속도 (최근 300 s)</span><b>+${rate.toFixed(2)} m</b></div>
        <div class="risk-judgment-panel__kv"><span>다음 등급 (추세)</span><b>${next}</b></div>
        <div class="risk-judgment-panel__kv"><span>최종(평형) 세굴심</span><b>${(reach?.finalDepthM ?? d.scourDepthM).toFixed(2)} m</b></div>`;
      cards.appendChild(card);
    }

    const lrfd = document.createElement('div');
    lrfd.className = 'risk-judgment-panel__lrfd';
    lrfd.innerHTML = `
      <div class="risk-judgment-panel__lrfd-title">신뢰성 지표 (LRFD)<span class="risk-judgment-panel__tag">3차년도 연계</span></div>
      <div class="risk-judgment-panel__kv"><span>신뢰성 지수 β</span><b class="risk-judgment-panel__muted">—</b></div>
      <div class="risk-judgment-panel__kv"><span>초과확률 Pe</span><b class="risk-judgment-panel__muted">—</b></div>
      <div class="risk-judgment-panel__kv"><span>위험 도달 시간 TTC</span><b class="risk-judgment-panel__muted">—</b></div>
      <div class="risk-judgment-panel__hint">계획서 p.43·60 표출 항목. 3차년도 LRFD 신뢰성 모듈 연계 후 표시 (현재 자리만 확보)</div>`;

    this.host.replaceChildren(summary, head, cards, lrfd);
  }

  public setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
  }

  public dispose(): void {
    this.element.remove();
  }
}
