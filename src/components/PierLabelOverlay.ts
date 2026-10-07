import type { Camera } from 'three';
import { Vector3 } from 'three';
import type { PierDefinition } from '@/modules/PierMarker';
import type { Disposable } from '@/types/disposable';
import type { Grade } from '@/constants/grade';

interface PierLabel {
  pierId: string;
  x: number;
  z: number;
  el: HTMLElement;
}

/** 교각 라벨 — P2 · 경계 (등급 색) */
export class PierLabelOverlay implements Disposable {
  public readonly element: HTMLElement;
  private readonly labels: PierLabel[] = [];
  private camera: Camera | null = null;
  private enabled = false;
  private readonly tmp = new Vector3();

  public constructor() {
    this.element = document.createElement('div');
    this.element.className = 'pier-label-overlay';
  }

  public setPiers(piers: PierDefinition[]): void {
    for (const l of this.labels) l.el.remove();
    this.labels.length = 0;
    for (const p of piers) {
      const el = document.createElement('div');
      el.className = 'pier-label-overlay__tag';
      el.textContent = p.id;
      this.element.appendChild(el);
      this.labels.push({ pierId: p.id, x: p.x, z: p.z, el });
    }
  }

  public setEnabled(on: boolean): void {
    this.enabled = on;
    this.element.style.display = on ? 'block' : 'none';
  }

  public setCamera(camera: Camera): void {
    this.camera = camera;
  }

  public updateGrades(grades: Map<string, Grade>, containerW: number, containerH: number): void {
    if (!this.enabled || !this.camera) return;
    for (const l of this.labels) {
      const g = grades.get(l.pierId);
      this.tmp.set(l.x, 1.2, l.z);
      this.tmp.project(this.camera);
      if (this.tmp.z > 1) {
        l.el.style.visibility = 'hidden';
        continue;
      }
      l.el.style.visibility = 'visible';
      const sx = (this.tmp.x * 0.5 + 0.5) * containerW;
      const sy = (-this.tmp.y * 0.5 + 0.5) * containerH;
      l.el.style.left = `${sx}px`;
      l.el.style.top = `${sy}px`;
      if (g) {
        l.el.textContent = `${l.pierId} · ${g.name}`;
        l.el.style.background = g.color;
        l.el.style.color = g.key === 'a2' ? '#3d2a00' : '#fff';
      } else {
        l.el.textContent = l.pierId;
      }
    }
  }

  public dispose(): void {
    this.element.remove();
  }
}
