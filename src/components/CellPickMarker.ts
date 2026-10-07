import type { Camera } from 'three';
import { Vector3 } from 'three';
import type { Disposable } from '@/types/disposable';

/** 7번 — 선택 셀 3D 위치 마커 (화면 투영) */
export class CellPickMarker implements Disposable {
  public readonly element: HTMLElement;
  private worldX = 0;
  private worldZ = 0;
  private visible = false;
  private camera: Camera | null = null;
  private readonly tmp = new Vector3();

  public constructor() {
    this.element = document.createElement('div');
    this.element.className = 'cell-pick-marker is-hidden';
    this.element.innerHTML =
      '<span class="cell-pick-marker__dot"></span><span class="cell-pick-marker__stem"></span>';
  }

  public setCamera(camera: Camera): void {
    this.camera = camera;
  }

  public setWorldPosition(worldX: number, worldZ: number): void {
    this.worldX = worldX;
    this.worldZ = worldZ;
    this.visible = true;
    this.element.classList.remove('is-hidden');
  }

  public hide(): void {
    this.visible = false;
    this.element.classList.add('is-hidden');
  }

  public draw(containerWidth: number, containerHeight: number): void {
    if (!this.visible || !this.camera) return;
    this.tmp.set(this.worldX, 0.02, this.worldZ);
    this.tmp.project(this.camera);
    if (this.tmp.z > 1) {
      this.element.classList.add('is-hidden');
      return;
    }
    this.element.classList.remove('is-hidden');
    const sx = (this.tmp.x * 0.5 + 0.5) * containerWidth;
    const sy = (-this.tmp.y * 0.5 + 0.5) * containerHeight;
    this.element.style.left = `${sx}px`;
    this.element.style.top = `${sy}px`;
  }

  public dispose(): void {
    this.element.remove();
  }
}
