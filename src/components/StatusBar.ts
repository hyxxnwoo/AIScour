import type { Disposable } from '@/types/disposable';

export interface StatusBarState {
  caseId: string;
  coordinateSystem: string;
  units: string;
  foundationDepthM: number;
  convertedAt: string;
  frameIndex: number;
  frameCount: number;
  extra?: string;
}

/** 하단 상태바 — 케이스·좌표계·기초 근입·프레임 */
export class StatusBar implements Disposable {
  public readonly element: HTMLElement;
  private readonly parts: {
    caseId: HTMLElement;
    coord: HTMLElement;
    units: HTMLElement;
    foundation: HTMLElement;
    converted: HTMLElement;
    frame: HTMLElement;
    extra: HTMLElement;
  };

  public constructor(initial: StatusBarState) {
    this.element = document.createElement('footer');
    this.element.className = 'status-bar';
    this.element.id = 'sbar-root';

    const mk = (label: string, bold = false): HTMLElement => {
      const span = document.createElement('span');
      if (bold) {
        const b = document.createElement('b');
        b.textContent = label;
        span.appendChild(b);
      } else {
        span.textContent = label;
      }
      return span;
    };

    this.parts = {
      caseId: mk(''),
      coord: mk(''),
      units: mk(''),
      foundation: mk(''),
      converted: mk(''),
      frame: mk(''),
      extra: mk(''),
    };

    this.element.append(
      document.createTextNode('Case '),
      this.parts.caseId,
      this.sep(),
      document.createTextNode('좌표계 '),
      this.parts.coord,
      this.sep(),
      document.createTextNode('단위 '),
      this.parts.units,
      this.sep(),
      document.createTextNode('기초 근입 '),
      this.parts.foundation,
      this.sep(),
      document.createTextNode('변환 '),
      this.parts.converted,
      this.sep(),
      document.createTextNode('프레임 '),
      this.parts.frame,
      this.parts.extra,
    );

    this.update(initial);
  }

  private sep(): HTMLSpanElement {
    const s = document.createElement('span');
    s.className = 'status-bar__sep';
    s.textContent = '|';
    return s;
  }

  public update(state: Partial<StatusBarState>): void {
    if (state.caseId !== undefined) this.parts.caseId.innerHTML = `<b>${state.caseId}</b>`;
    if (state.coordinateSystem !== undefined)
      this.parts.coord.innerHTML = `<b>${state.coordinateSystem}</b>`;
    if (state.units !== undefined) this.parts.units.innerHTML = `<b>${state.units}</b>`;
    if (state.foundationDepthM !== undefined)
      this.parts.foundation.innerHTML = `<b>${state.foundationDepthM.toFixed(2)} m</b>`;
    if (state.convertedAt !== undefined)
      this.parts.converted.innerHTML = `<b>${state.convertedAt}</b>`;
    if (state.frameIndex !== undefined && state.frameCount !== undefined) {
      this.parts.frame.innerHTML = `<b>${state.frameIndex} / ${state.frameCount}</b>`;
    }
    if (state.extra !== undefined) {
      if (state.extra) {
        this.parts.extra.innerHTML = `<span class="status-bar__sep">|</span><span>${state.extra}</span>`;
      } else {
        this.parts.extra.textContent = '';
      }
    }
  }

  public dispose(): void {
    this.element.remove();
  }
}
