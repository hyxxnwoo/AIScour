import type { Grade } from '@/constants/grade';
import type { ScreenId } from '@/app/ScreenRouter';
import type { Disposable } from '@/types/disposable';

export interface GlobalNavHandlers {
  onNavigate: (screen: ScreenId) => void;
  onReportUnavailable: () => void;
}

export interface GlobalNavBadge {
  grade: Grade;
  pierId: string;
}

/** 상단 GNB — 케이스 / 뷰어 / 경보·SOP / 리포트 */
export class GlobalNav implements Disposable {
  public readonly element: HTMLElement;
  private readonly handlers: GlobalNavHandlers;
  private readonly badgeEl: HTMLElement;
  private readonly badgeDot: HTMLElement;
  private readonly badgeText: HTMLElement;
  private activeMenu: 'case' | 'viewer' | 'alert' | null = 'viewer';

  public constructor(handlers: GlobalNavHandlers) {
    this.handlers = handlers;
    this.element = document.createElement('header');
    this.element.className = 'global-nav';
    this.element.id = 'gnb-root';

    const logo = document.createElement('div');
    logo.className = 'global-nav__logo';
    logo.innerHTML = 'AI <i>SCOUR</i>';

    const nav = document.createElement('nav');
    nav.className = 'global-nav__menus';
    const menus: Array<{
      label: string;
      key: 'case' | 'viewer' | 'alert' | 'report';
      screen?: ScreenId;
    }> = [
      { label: '케이스', key: 'case', screen: 2 },
      { label: '시뮬레이션 뷰어', key: 'viewer', screen: 4 },
      { label: '경보 · SOP', key: 'alert', screen: 10 },
      { label: '리포트', key: 'report' },
    ];
    for (const m of menus) {
      const a = document.createElement('button');
      a.type = 'button';
      a.className = 'global-nav__link';
      a.dataset.menuKey = m.key;
      a.textContent = m.label;
      a.addEventListener('click', () => {
        if (m.key === 'report') {
          this.handlers.onReportUnavailable();
          return;
        }
        if (m.screen) this.handlers.onNavigate(m.screen);
      });
      nav.appendChild(a);
    }

    const right = document.createElement('div');
    right.className = 'global-nav__right';

    const caseSel = document.createElement('div');
    caseSel.className = 'global-nav__case';
    caseSel.textContent = 'Case A-032 · 원기둥 D=1.6 m · 교각 3 ▾';

    this.badgeEl = document.createElement('div');
    this.badgeEl.className = 'global-nav__alertdot';
    this.badgeDot = document.createElement('span');
    this.badgeDot.className = 'global-nav__dot';
    this.badgeText = document.createElement('span');
    this.badgeEl.append(this.badgeDot, this.badgeText);

    const admin = document.createElement('span');
    admin.className = 'global-nav__admin';
    admin.textContent = 'admin ▾';

    right.append(caseSel, this.badgeEl, admin);
    this.element.append(logo, nav, right);
    this.setBadge({
      grade: {
        key: 'a1',
        name: '관심',
        en: 'Blue',
        minRemainPct: 70,
        color: '#2E7DD1',
        action: '',
      },
      pierId: 'P1',
    });
  }

  public setActiveForScreen(screen: ScreenId): void {
    if (screen === 2 || screen === 3) this.activeMenu = 'case';
    else if (screen >= 4 && screen <= 9) this.activeMenu = 'viewer';
    else if (screen === 10) this.activeMenu = 'alert';
    else this.activeMenu = null;

    for (const btn of this.element.querySelectorAll<HTMLButtonElement>('.global-nav__link')) {
      const key = btn.dataset.menuKey;
      btn.classList.toggle(
        'is-on',
        (key === 'case' && this.activeMenu === 'case') ||
          (key === 'viewer' && this.activeMenu === 'viewer') ||
          (key === 'alert' && this.activeMenu === 'alert'),
      );
    }
  }

  public setBadge(badge: GlobalNavBadge): void {
    this.badgeEl.style.color = badge.grade.color;
    this.badgeDot.style.background = badge.grade.color;
    this.badgeDot.style.boxShadow = `0 0 0 3px ${badge.grade.color}33`;
    this.badgeText.textContent = `${badge.grade.name} · ${badge.pierId}`;
  }

  public dispose(): void {
    this.element.remove();
  }
}
