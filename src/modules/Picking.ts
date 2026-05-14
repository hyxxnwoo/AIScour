import { Raycaster, Vector2 } from 'three';
import type { Camera, Object3D } from 'three';
import type { Disposable } from '@/types/disposable';

export interface PickResult {
  worldX: number;
  worldY: number;
  worldZ: number;
}

export type PickListener = (result: PickResult | null) => void;

export interface PickingOptions {
  canvas: HTMLCanvasElement;
  camera: Camera;
  pickables: Object3D[];
  // 호버 시에도 이벤트를 발행할지 (기본: true). false 면 클릭만 발행.
  emitOnHover?: boolean;
  // hover 디바운스 간격(ms). 매 프레임 raycast 부담을 줄인다.
  hoverThrottleMs?: number;
}

// Picking: 마우스 좌표를 NDC 로 변환 → Raycaster 로 pickables 와 교차 검사.
// 호버는 throttle, 클릭은 즉시 발행한다.
export class Picking implements Disposable {
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: Camera;
  private pickables: Object3D[];
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly hoverListeners = new Set<PickListener>();
  private readonly clickListeners = new Set<PickListener>();
  private readonly emitOnHover: boolean;
  private readonly hoverThrottleMs: number;
  private lastHoverEmitAt = 0;

  public constructor(options: PickingOptions) {
    this.canvas = options.canvas;
    this.camera = options.camera;
    this.pickables = options.pickables;
    this.emitOnHover = options.emitOnHover ?? true;
    this.hoverThrottleMs = options.hoverThrottleMs ?? 60;

    if (this.emitOnHover) {
      this.canvas.addEventListener('pointermove', this.onPointerMove);
      this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    }
    this.canvas.addEventListener('click', this.handleClick);
  }

  public onHover(listener: PickListener): () => void {
    this.hoverListeners.add(listener);
    return () => this.hoverListeners.delete(listener);
  }

  public onClick(listener: PickListener): () => void {
    this.clickListeners.add(listener);
    return () => this.clickListeners.delete(listener);
  }

  private onPointerMove = (event: PointerEvent): void => {
    const now = performance.now();
    if (now - this.lastHoverEmitAt < this.hoverThrottleMs) return;
    this.lastHoverEmitAt = now;
    const result = this.pickFromEvent(event);
    for (const cb of this.hoverListeners) cb(result);
  };

  private onPointerLeave = (): void => {
    for (const cb of this.hoverListeners) cb(null);
  };

  private handleClick = (event: MouseEvent): void => {
    const result = this.pickFromEvent(event);
    for (const cb of this.clickListeners) cb(result);
  };

  private pickFromEvent(event: MouseEvent): PickResult | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    const first = hits[0];
    if (!first) return null;
    return {
      worldX: first.point.x,
      worldY: first.point.y,
      worldZ: first.point.z,
    };
  }

  public updatePickables(pickables: Object3D[]): void {
    this.pickables = pickables;
  }

  public dispose(): void {
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('click', this.handleClick);
    this.hoverListeners.clear();
    this.clickListeners.clear();
  }
}
