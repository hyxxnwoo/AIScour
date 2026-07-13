import type { Disposable } from '@/types/disposable';

/** 화면 고정 유입(+X) 방향 안내. 좌측(−X) 유입 → 우측(+X) 유출. */
export class FlowDirectionBadge implements Disposable {
  public readonly element: HTMLElement;

  public constructor() {
    this.element = document.createElement('div');
    this.element.className = 'flow-direction-badge';
    this.element.setAttribute('role', 'note');
    this.element.setAttribute('aria-label', '유입에서 유출 방향으로 물이 흐릅니다. 좌측에서 우측으로 +X 방향');

    const inflow = document.createElement('span');
    inflow.className = 'flow-direction-badge__label';
    inflow.textContent = '유입 (−X)';

    const track = document.createElement('span');
    track.className = 'flow-direction-badge__track';
    track.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i += 1) {
      const chevron = document.createElement('span');
      chevron.className = 'flow-direction-badge__chevron';
      chevron.style.animationDelay = `${i * 0.35}s`;
      track.appendChild(chevron);
    }

    const outflow = document.createElement('span');
    outflow.className = 'flow-direction-badge__label';
    outflow.textContent = '유출 (+X)';

    this.element.append(inflow, track, outflow);
  }

  public dispose(): void {
    this.element.remove();
  }
}
