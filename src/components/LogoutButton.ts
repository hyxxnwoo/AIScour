import type { Disposable } from '@/types/disposable';

export interface LogoutButtonOptions {
  onLogout: () => void;
}

const ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 16l4-4-4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 12H9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

// 우측 상단 독에 표시되는 로그아웃 버튼. 세션 인증 상태를 지우고 새로고침해 로그인 화면으로 되돌린다.
export class LogoutButton implements Disposable {
  public readonly element: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly onClick: () => void;

  public constructor(options: LogoutButtonOptions) {
    this.element = document.createElement('div');
    this.element.className = 'logout-button';

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'logout-button__btn';

    const icon = document.createElement('span');
    icon.className = 'logout-button__icon';
    icon.innerHTML = ICON_SVG;

    const label = document.createElement('span');
    label.textContent = '로그아웃';

    this.button.appendChild(icon);
    this.button.appendChild(label);
    this.element.appendChild(this.button);

    this.onClick = () => options.onLogout();
    this.button.addEventListener('click', this.onClick);
  }

  public dispose(): void {
    this.button.removeEventListener('click', this.onClick);
    this.element.remove();
  }
}
