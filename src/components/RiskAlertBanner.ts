import { gradeIndex, gradeOf, remainPct } from '@/constants/grade';
import type { PierScourDepth } from '@/utils/pierScourSample';
import type { PierDepthSeries } from '@/utils/pierTimeSeries';
import { scourProgressRate } from '@/utils/pierTimeSeries';
import type { Disposable } from '@/types/disposable';

export interface RiskAlertBannerHandlers {
  onOpenSop: () => void;
}

/** 9번 3D 상단 경보 배너 */
export class RiskAlertBanner implements Disposable {
  public readonly element: HTMLElement;
  private readonly handlers: RiskAlertBannerHandlers;
  private inner!: HTMLElement;

  public constructor(handlers: RiskAlertBannerHandlers) {
    this.handlers = handlers;
    this.element = document.createElement('div');
    this.element.className = 'risk-alert-banner is-hidden';
    this.element.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-act="sop"]')) this.handlers.onOpenSop();
    });
  }

  public update(
    pierDepths: PierScourDepth[],
    pierSeries: PierDepthSeries[],
    timeSeconds: number,
    foundationDepthM: number,
    worst: { pierId: string; scourDepthM: number },
  ): void {
    const g = gradeOf(worst.scourDepthM, foundationDepthM);
    const ps = pierSeries.find((s) => s.pierId === worst.pierId);
    const rate = ps ? scourProgressRate(ps, timeSeconds) : 0;
    const nOver = pierDepths.filter(
      (d) => gradeIndex(gradeOf(d.scourDepthM, foundationDepthM)) >= 1,
    ).length;
    this.element.style.borderColor = g.color;
    if (!this.inner) {
      this.inner = document.createElement('div');
      this.inner.className = 'risk-alert-banner__inner';
      this.element.appendChild(this.inner);
    }
    this.inner.innerHTML = `
      <span class="risk-alert-banner__icon" style="color:${g.color}">⚠</span>
      <div class="risk-alert-banner__text">
        <div class="risk-alert-banner__title" style="color:${g.color}">${g.name} (${g.en}) — ${worst.pierId} 교각 잔여 여유율 ${remainPct(worst.scourDepthM, foundationDepthM).toFixed(0)} %</div>
        <div class="risk-alert-banner__sub">최근 300 s 진행 +${rate.toFixed(2)} m · 주의 이상 교각 ${nOver} / ${pierDepths.length}</div>
      </div>
      <button type="button" class="risk-alert-banner__cta" style="background:${g.color}" data-act="sop">대응 절차 →</button>`;
  }

  public setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
  }

  public dispose(): void {
    this.element.remove();
  }
}
