import type { Disposable } from '@/types/disposable';
import { VIEW_MODE_LABELS, type ViewMode } from '@/state/viewState';

export interface ViewModeToggleHandlers {
  onChange: (mode: ViewMode) => void;
}

const MODES: ViewMode[] = ['basic', 'cfd'];

/** 3D 뷰어 상단 [기본 | CFD] 보기 모드 세그먼트 (캔버스 위) */
export class ViewModeToggle implements Disposable {
  public readonly element: HTMLElement;
  private mode: ViewMode;
  private readonly handlers: ViewModeToggleHandlers;

  public constructor(initial: ViewMode, handlers: ViewModeToggleHandlers) {
    this.mode = initial;
    this.handlers = handlers;
    this.element = document.createElement('div');
    this.element.className = 'view-mode-toggle';
    this.element.dataset.widgetId = 'view-mode-toggle';
    this.element.setAttribute('role', 'tablist');
    this.element.setAttribute('aria-label', '보기 모드');
    for (const m of MODES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'view-mode-toggle__btn';
      btn.dataset.mode = m;
      btn.setAttribute('role', 'tab');
      btn.textContent = VIEW_MODE_LABELS[m];
      btn.addEventListener('click', () => {
        if (this.mode === m) return;
        this.mode = m;
        this.sync();
        this.handlers.onChange(m);
      });
      this.element.appendChild(btn);
    }
    this.sync();
  }

  /** 외부 상태 변경(다른 화면·저장값 복원)을 반영한다. 핸들러는 호출하지 않는다. */
  public setMode(mode: ViewMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.sync();
  }

  public setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
  }

  private sync(): void {
    for (const btn of this.element.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
      const on = btn.dataset.mode === this.mode;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  public dispose(): void {
    this.element.remove();
  }
}
