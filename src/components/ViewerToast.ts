import type { Disposable } from '@/types/disposable';

/** 뷰어 중앙 하단 — 짧은 안내 메시지 (자동 사라짐) */
export class ViewerToast implements Disposable {
  public readonly element: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor() {
    this.element = document.createElement('div');
    this.element.className = 'viewer-toast';
    this.element.setAttribute('role', 'status');
    this.element.hidden = true;
  }

  public show(message: string, durationMs = 4800): void {
    this.element.textContent = message;
    this.element.hidden = false;
    this.element.classList.remove('is-leaving');
    void this.element.offsetWidth;
    this.element.classList.add('is-visible');
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.dismiss(), durationMs);
  }

  public dismiss(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.element.classList.remove('is-visible');
    this.element.classList.add('is-leaving');
    window.setTimeout(() => {
      if (!this.element.classList.contains('is-visible')) {
        this.element.hidden = true;
        this.element.classList.remove('is-leaving');
      }
    }, 320);
  }

  public dispose(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.element.remove();
  }
}
