import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  type Scene,
} from 'three';
import type { Disposable } from '@/types/disposable';
import type { ScourFrame, ScourSeries, TerrainGrid } from '@/types/terrain';

export interface SedimentLayerOptions {
  scene: Scene;
  series: ScourSeries;
  /** 퇴적층 두께(미터). 표면(y=0) 아래로 내려간 깊이. */
  thicknessM: number;
}

// SedimentLayer: 하상 아래 모래층의 옆면 — 지형 가장자리를 따라 bed 표고에서 바닥까지 내려간다.
export class SedimentLayer implements Disposable {
  private readonly scene: Scene;
  private readonly grid: TerrainGrid;
  private readonly frames: ScourFrame[];
  private readonly baseZ: Float32Array;
  private readonly thickness: number;
  private readonly bottomY: number;
  private readonly halfW: number;
  private readonly halfH: number;
  private readonly mesh: Mesh;
  private readonly geometry: BufferGeometry;
  private readonly positions: BufferAttribute;
  private readonly maxQuads: number;
  private currentFrameIndex = -1;
  private verticalExaggeration = 1;

  public constructor(options: SedimentLayerOptions) {
    this.scene = options.scene;
    this.grid = options.series.baseTerrain;
    this.frames = options.series.frames;
    this.baseZ = this.grid.elevations;
    this.thickness = Math.max(0.01, options.thicknessM);
    this.bottomY = -this.thickness;

    const { width, height, cellSize } = this.grid;
    this.halfW = ((width - 1) * cellSize) / 2;
    this.halfH = ((height - 1) * cellSize) / 2;

    // 가장자리 구간당 2삼각형(6정점)
    this.maxQuads = (width - 1) * 2 + (height - 1) * 2;
    const maxVerts = this.maxQuads * 6;
    const pos = new Float32Array(maxVerts * 3);
    this.geometry = new BufferGeometry();
    this.positions = new BufferAttribute(pos, 3);
    this.geometry.setAttribute('position', this.positions);
    this.geometry.setDrawRange(0, 0);

    const material = new MeshStandardMaterial({
      color: 0x6b4522,
      roughness: 0.96,
      metalness: 0.0,
      side: DoubleSide,
    });
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.renderOrder = -1;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);

    if (this.frames.length > 0) {
      this.applyFrame(0);
    }
  }

  public updateAtTime(timeSeconds: number): void {
    if (this.frames.length === 0) return;
    const duration = this.frames.at(-1)?.timestampSeconds ?? 0;
    const clamped = Math.max(0, Math.min(timeSeconds, duration));
    let idx = 0;
    for (let i = 0; i < this.frames.length; i += 1) {
      if (this.frames[i].timestampSeconds <= clamped) idx = i;
      else break;
    }
    if (idx !== this.currentFrameIndex) {
      this.applyFrame(idx);
    }
  }

  /** Terrain 과 같은 과장 배율을 써야 지형이 과장될 때 벽면이 지표 위로 비쳐 보이지 않는다. */
  public setVerticalExaggeration(factor: number): void {
    const f = Math.max(0.1, factor);
    if (Math.abs(f - this.verticalExaggeration) < 1e-9) return;
    this.verticalExaggeration = f;
    if (this.currentFrameIndex >= 0) this.applyFrame(this.currentFrameIndex);
  }

  private bedAt(gx: number, gy: number, delta: Float32Array): number {
    const idx = gy * this.grid.width + gx;
    return this.baseZ[idx] + delta[idx] * this.verticalExaggeration;
  }

  private applyFrame(index: number): void {
    const frame = this.frames[index];
    if (!frame) return;
    this.currentFrameIndex = index;

    const { width, height, cellSize } = this.grid;
    const delta = frame.deltaElevations;
    const arr = this.positions.array as Float32Array;
    let vi = 0;

    // 지형 가장자리 단면(수조 유리벽 쪽에서 보이는 모래층 옆면). 정점마다 지표 높이를 따라가므로
    // 셀 단위 계단 없이 지형과 같은 곡선으로 이어진다.
    const pushSkirt = (gx0: number, gy0: number, gx1: number, gy1: number): void => {
      if (vi + 18 > arr.length) return;
      const xa = gx0 * cellSize - this.halfW;
      const za = gy0 * cellSize - this.halfH;
      const xb = gx1 * cellSize - this.halfW;
      const zb = gy1 * cellSize - this.halfH;
      const ya = this.bedAt(gx0, gy0, delta);
      const yb = this.bedAt(gx1, gy1, delta);
      const bottom = this.bottomY;
      const tri = [
        xa,
        ya,
        za,
        xb,
        yb,
        zb,
        xa,
        bottom,
        za,
        xb,
        yb,
        zb,
        xa,
        bottom,
        za,
        xb,
        bottom,
        zb,
      ];
      for (const v of tri) arr[vi++] = v;
    };

    for (let gx = 0; gx + 1 < width; gx += 1) {
      pushSkirt(gx, 0, gx + 1, 0);
      pushSkirt(gx, height - 1, gx + 1, height - 1);
    }
    for (let gy = 0; gy + 1 < height; gy += 1) {
      pushSkirt(0, gy, 0, gy + 1);
      pushSkirt(width - 1, gy, width - 1, gy + 1);
    }

    this.positions.needsUpdate = true;
    this.geometry.setDrawRange(0, vi / 3);
    this.geometry.computeVertexNormals();
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
  }
}
