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

const SCOUR_EPS = 0.0005;

// SedimentLayer: 세굴로 파인 하상 아래 모래층 — pit 벽면이 bed 표고를 따라 내려간다.
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

    // 셀당 최대 4면 × 2삼각형 = 8정점
    this.maxQuads = width * height * 4;
    const maxVerts = this.maxQuads * 6;
    const pos = new Float32Array(maxVerts * 3);
    this.geometry = new BufferGeometry();
    this.positions = new BufferAttribute(pos, 3);
    this.geometry.setAttribute('position', this.positions);
    this.geometry.setDrawRange(0, 0);

    const material = new MeshStandardMaterial({
      color: 0x9a7344,
      roughness: 0.94,
      metalness: 0.01,
      side: DoubleSide,
    });
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.renderOrder = -1;
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

  private bedAt(gx: number, gy: number, delta: Float32Array): number {
    const idx = gy * this.grid.width + gx;
    return this.baseZ[idx] + delta[idx];
  }

  private applyFrame(index: number): void {
    const frame = this.frames[index];
    if (!frame) return;
    this.currentFrameIndex = index;

    const { width, height, cellSize } = this.grid;
    const delta = frame.deltaElevations;
    const arr = this.positions.array as Float32Array;
    let vi = 0;

    const pushQuad = (
      x0: number,
      z0: number,
      y0: number,
      x1: number,
      z1: number,
      y1: number,
    ): void => {
      if (vi + 18 > arr.length) return;
      // 두 삼각형 (CCW)
      arr[vi++] = x0;
      arr[vi++] = y0;
      arr[vi++] = z0;
      arr[vi++] = x1;
      arr[vi++] = y1;
      arr[vi++] = z1;
      arr[vi++] = x0;
      arr[vi++] = this.bottomY;
      arr[vi++] = z0;

      arr[vi++] = x1;
      arr[vi++] = y1;
      arr[vi++] = z1;
      arr[vi++] = x0;
      arr[vi++] = this.bottomY;
      arr[vi++] = z0;
      arr[vi++] = x1;
      arr[vi++] = this.bottomY;
      arr[vi++] = z1;
    };

    for (let gy = 0; gy < height; gy += 1) {
      for (let gx = 0; gx < width; gx += 1) {
        const d = delta[gy * width + gx];
        if (d >= -SCOUR_EPS) continue;

        const bed = this.bedAt(gx, gy, delta);
        const x = gx * cellSize - this.halfW;
        const z = gy * cellSize - this.halfH;
        const x1 = x + cellSize;
        const z1 = z + cellSize;

        if (gx + 1 < width) {
          const nBed = this.bedAt(gx + 1, gy, delta);
          if (nBed > bed + SCOUR_EPS) {
            const rimY = (bed + nBed) * 0.5;
            pushQuad(x1, z, rimY, x1, z1, rimY);
          }
        }
        if (gy + 1 < height) {
          const nBed = this.bedAt(gx, gy + 1, delta);
          if (nBed > bed + SCOUR_EPS) {
            const rimY = (bed + nBed) * 0.5;
            pushQuad(x, z1, rimY, x1, z1, rimY);
          }
        }
        if (gx > 0) {
          const nBed = this.bedAt(gx - 1, gy, delta);
          if (nBed > bed + SCOUR_EPS) {
            const rimY = (bed + nBed) * 0.5;
            pushQuad(x, z, rimY, x, z1, rimY);
          }
        }
        if (gy > 0) {
          const nBed = this.bedAt(gx, gy - 1, delta);
          if (nBed > bed + SCOUR_EPS) {
            const rimY = (bed + nBed) * 0.5;
            pushQuad(x, z, rimY, x1, z, rimY);
          }
        }
      }
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
