import type { Disposable } from '@/types/disposable';
import type { FlowOrigin } from '@/data/cfdFlowField';
import { cfdVelocityGradientCss } from '@/utils/cfdVelocityColor';

/** CFD 모드 유속 컬러바(m/s). 세굴심 컬러바는 기존 ColorLegend 를 CFD 색으로 바꿔 함께 쓴다. */
export class CfdVelocityColorbar implements Disposable {
  public readonly element: HTMLElement;
  private readonly tag: HTMLElement;
  private readonly minEl: HTMLElement;
  private readonly midEl: HTMLElement;
  private readonly maxEl: HTMLElement;

  public constructor() {
    this.element = document.createElement('div');
    this.element.className = 'cfd-velocity-colorbar is-hidden';
    this.element.dataset.widgetId = 'cfd-velocity-colorbar';

    const title = document.createElement('div');
    title.className = 'cfd-velocity-colorbar__title';
    const label = document.createElement('span');
    label.textContent = '유속 (m/s)';
    this.tag = document.createElement('span');
    this.tag.className = 'cfd-velocity-colorbar__tag';
    this.tag.textContent = '목업';
    this.tag.hidden = true;
    title.append(label, this.tag);

    const bar = document.createElement('div');
    bar.className = 'cfd-velocity-colorbar__bar';
    bar.style.background = cfdVelocityGradientCss('to right');

    const scale = document.createElement('div');
    scale.className = 'cfd-velocity-colorbar__scale';
    this.minEl = document.createElement('span');
    this.midEl = document.createElement('span');
    this.maxEl = document.createElement('span');
    scale.append(this.minEl, this.midEl, this.maxEl);

    this.element.append(title, bar, scale);
    this.setRange(1);
  }

  /** 0 ~ max(m/s) 범위를 표시한다. */
  public setRange(maxSpeed: number): void {
    const dec = maxSpeed >= 1 ? 2 : maxSpeed >= 0.1 ? 3 : 4;
    this.minEl.textContent = (0).toFixed(dec);
    this.midEl.textContent = (maxSpeed / 2).toFixed(dec);
    this.maxEl.textContent = maxSpeed.toFixed(dec);
  }

  public setFlowOrigin(origin: FlowOrigin): void {
    this.tag.hidden = origin !== 'synthetic';
  }

  public setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
  }

  public dispose(): void {
    this.element.remove();
  }
}
