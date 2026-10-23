import type { Disposable } from '@/types/disposable';

/** CFD 모드 시각·프레임 오버레이: "t = 000.0 s / Frame n / N" */
export class CfdFrameReadout implements Disposable {
  public readonly element: HTMLElement;
  private lastText = '';

  public constructor() {
    this.element = document.createElement('div');
    this.element.className = 'cfd-frame-readout is-hidden';
    this.element.dataset.widgetId = 'cfd-frame-readout';
  }

  /** frameIndex 는 0 기반(없으면 -1), 화면에는 1 기반으로 표시한다. */
  public update(timeSeconds: number, frameIndex: number, frameTotal: number): void {
    const n = frameIndex >= 0 ? frameIndex + 1 : 0;
    const text = `t = ${timeSeconds.toFixed(1).padStart(5, '0')} s / Frame ${n} / ${frameTotal}`;
    if (text === this.lastText) return;
    this.lastText = text;
    this.element.textContent = text;
  }

  public setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
  }

  public dispose(): void {
    this.element.remove();
  }
}
