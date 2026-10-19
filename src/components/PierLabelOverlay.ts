import type { Camera } from 'three';
import { Vector3 } from 'three';
import type { PierDefinition } from '@/modules/PierMarker';
import type { Disposable } from '@/types/disposable';
import type { Grade } from '@/constants/grade';

interface PierLabel {
  pierId: string;
  x: number;
  z: number;
  stack: HTMLElement;
  el: HTMLElement;
}

/** 교각 라벨 — P2 · 경계 (등급 색) */
export class PierLabelOverlay implements Disposable {
  public readonly element: HTMLElement;
  private readonly labels: PierLabel[] = [];
  private camera: Camera | null = null;
  private enabled = false;
  private focusPierId: string | null = null;
  private hoverPierId: string | null = null;
  private readonly tmp = new Vector3();

  public constructor() {
    this.element = document.createElement('div');
    this.element.className = 'pier-label-overlay';
  }

  public setPiers(piers: PierDefinition[]): void {
    for (const l of this.labels) l.stack.remove();
    this.labels.length = 0;
    for (const p of piers) {
      const stack = document.createElement('div');
      stack.className = 'pier-label-overlay__stack';
      const reticle = document.createElement('div');
      reticle.className = 'pier-label-overlay__reticle';
      reticle.setAttribute('aria-hidden', 'true');
      reticle.style.position = 'relative';
      const el = document.createElement('div');
      el.className = 'pier-label-overlay__tag';
      el.textContent = p.id;
      stack.append(reticle, el);
      this.element.appendChild(stack);
      this.labels.push({ pierId: p.id, x: p.x, z: p.z, stack, el });
    }
  }

  public setEnabled(on: boolean): void {
    this.enabled = on;
    this.element.style.display = on ? 'block' : 'none';
  }

  public setCamera(camera: Camera): void {
    this.camera = camera;
  }

  public setFocusState(focusId: string | null, hoverId: string | null): void {
    this.focusPierId = focusId;
    this.hoverPierId = hoverId;
  }

  public updateGrades(grades: Map<string, Grade>, containerW: number, containerH: number): void {
    if (!this.enabled || !this.camera) return;
    for (const l of this.labels) {
      const g = grades.get(l.pierId);
      this.tmp.set(l.x, 1.2, l.z);
      this.tmp.project(this.camera);
      if (this.tmp.z > 1) {
        l.stack.style.visibility = 'hidden';
        continue;
      }
      l.stack.style.visibility = 'visible';
      const sx = (this.tmp.x * 0.5 + 0.5) * containerW;
      const sy = (-this.tmp.y * 0.5 + 0.5) * containerH;
      l.stack.style.left = `${sx}px`;
      l.stack.style.top = `${sy}px`;
      if (g) {
        l.el.textContent = `${l.pierId} · ${g.name}`;
        l.el.style.background = g.color;
        l.el.style.color = g.key === 'a2' ? '#3d2a00' : '#fff';
      } else {
        l.el.textContent = l.pierId;
      }
      const focused = l.pierId === this.focusPierId;
      const hovered = l.pierId === this.hoverPierId;
      l.stack.classList.toggle('is-focused', focused);
      l.stack.classList.toggle('is-hovered', hovered && !focused);
    }
  }

  public dispose(): void {
    this.element.remove();
  }
}
