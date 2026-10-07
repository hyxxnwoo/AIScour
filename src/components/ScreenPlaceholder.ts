import type { ScreenId } from '@/app/ScreenRouter';
import { SCREEN_TITLES } from '@/app/ScreenRouter';
import type { Disposable } from '@/types/disposable';

/** 미구현 화면 placeholder */
export class ScreenPlaceholder implements Disposable {
  public readonly element: HTMLElement;

  public constructor(screen: ScreenId) {
    this.element = document.createElement('div');
    this.element.className = 'screen-placeholder screen-stack-page';
    const title = SCREEN_TITLES[screen] ?? `화면 ${screen}`;
    this.element.innerHTML = `
      <div class="screen-placeholder__inner">
        <span class="screen-placeholder__num">${screen}</span>
        <h2>${title}</h2>
        <p>1차년도 묶음 작업 예정 화면입니다.</p>
      </div>`;
  }

  public setScreen(screen: ScreenId): void {
    const title = SCREEN_TITLES[screen] ?? `화면 ${screen}`;
    const num = this.element.querySelector('.screen-placeholder__num');
    const h2 = this.element.querySelector('h2');
    if (num) num.textContent = String(screen);
    if (h2) h2.textContent = title;
  }

  public dispose(): void {
    this.element.remove();
  }
}
