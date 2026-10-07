import type { ScreenId } from '@/app/ScreenRouter';
import type { Disposable } from '@/types/disposable';

const VIEWER_TABS: Array<{ id: ScreenId; label: string }> = [
  { id: 4, label: '조건 설정' },
  { id: 5, label: '3D 세굴 가시화' },
  { id: 6, label: '평면 · 단면' },
  { id: 7, label: '등급 · 하상' },
  { id: 8, label: '타임라인 · 시계열' },
  { id: 9, label: '위험 판정' },
];

export interface ViewerSubNavHandlers {
  onNavigate: (screen: ScreenId) => void;
}

/** 뷰어 화면(4~9) 하위 탭 */
export class ViewerSubNav implements Disposable {
  public readonly element: HTMLElement;
  private readonly handlers: ViewerSubNavHandlers;

  public constructor(handlers: ViewerSubNavHandlers) {
    this.handlers = handlers;
    this.element = document.createElement('nav');
    this.element.className = 'viewer-subnav';
    this.element.id = 'subnav-root';

    const lbl = document.createElement('span');
    lbl.className = 'viewer-subnav__lbl';
    lbl.textContent = '뷰어';
    this.element.appendChild(lbl);

    for (const tab of VIEWER_TABS) {
      const a = document.createElement('button');
      a.type = 'button';
      a.className = 'viewer-subnav__tab';
      a.dataset.screen = String(tab.id);
      const k = document.createElement('span');
      k.className = 'viewer-subnav__key';
      k.textContent = String(tab.id);
      a.append(k, document.createTextNode(tab.label));
      a.addEventListener('click', () => this.handlers.onNavigate(tab.id));
      this.element.appendChild(a);
    }
  }

  public setActive(screen: ScreenId): void {
    for (const btn of this.element.querySelectorAll<HTMLButtonElement>('.viewer-subnav__tab')) {
      btn.classList.toggle('is-on', Number(btn.dataset.screen) === screen);
    }
  }

  public setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
  }

  public dispose(): void {
    this.element.remove();
  }
}
