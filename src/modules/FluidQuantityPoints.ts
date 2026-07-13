import {
  BufferAttribute,
  BufferGeometry,
  Points,
  PointsMaterial,
  type Scene,
} from 'three';
import type { Disposable } from '@/types/disposable';
import type { FluidFrame, FluidGrid3D, FluidQuantity, FluidSeries } from '@/types/fluid';
import { sampleFluidQuantity } from '@/types/fluid';
import { fluidCellWorldPosition } from '@/utils/fluidWorld';
import {
  colorForFluidQuantity,
  normalizeFluidQuantityRange,
} from '@/utils/fluidQuantityColor';

const MAX_POINTS = 80_000;

export interface FluidQuantityPointsOptions {
  scene: Scene;
  series: FluidSeries;
  /** 격자 다운샘플 간격(셀). 자동 조정될 수 있음. */
  stride?: number;
  initialQuantity?: FluidQuantity;
}

interface SamplePoint {
  xi: number;
  yi: number;
  zi: number;
}

/**
 * CSV x·y·z 좌표에 맞춰 유체량을 3D 점으로 표시한다.
 * 각 점의 위치 = 격자 셀의 월드 좌표, 색 = 선택한 물리량.
 */
export class FluidQuantityPoints implements Disposable {
  private readonly scene: Scene;
  private readonly grid: FluidGrid3D;
  private readonly frames: FluidFrame[];
  private readonly samples: SamplePoint[];
  private readonly points: Points;
  private readonly geometry: BufferGeometry;
  private readonly material: PointsMaterial;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly tmpColor = { r: 0, g: 0, b: 0 };
  private currentQuantity: FluidQuantity;
  private currentFrameIndex = -1;
  private currentRange: { min: number; max: number } = { min: 0, max: 1 };
  private sliceYi = -1;

  public constructor(options: FluidQuantityPointsOptions) {
    this.scene = options.scene;
    this.grid = options.series.grid;
    this.frames = options.series.frames;
    this.currentQuantity = options.initialQuantity ?? 'speed';
    this.samples = this.buildSamples(options.stride ?? 2);

    const n = this.samples.length;
    this.positions = new Float32Array(n * 3);
    this.colors = new Float32Array(n * 3);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));

    this.material = new PointsMaterial({
      size: Math.max(0.08, this.grid.cellSize * 0.35),
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });

    this.points = new Points(this.geometry, this.material);
    this.scene.add(this.points);

    if (this.frames.length > 0) {
      this.applyFrame(0);
    }
  }

  public setVisible(visible: boolean): void {
    this.points.visible = visible;
  }

  public get isVisible(): boolean {
    return this.points.visible;
  }

  public setQuantity(q: FluidQuantity): void {
    if (q === this.currentQuantity) return;
    this.currentQuantity = q;
    if (this.currentFrameIndex >= 0) this.applyFrame(this.currentFrameIndex);
  }

  /** Y 슬라이스 인덱스. -1 이면 전체 높이. */
  public setSliceIndex(yi: number): void {
    this.sliceYi = yi;
    if (this.currentFrameIndex >= 0) this.applyFrame(this.currentFrameIndex);
  }

  public get currentRangeForLegend(): { min: number; max: number } {
    return this.currentRange;
  }

  public get currentQuantityName(): FluidQuantity {
    return this.currentQuantity;
  }

  public computeRangeForQuantity(q: FluidQuantity): { min: number; max: number } {
    if (this.currentFrameIndex < 0) return { min: 0, max: 1 };
    const frame = this.frames[this.currentFrameIndex];
    if (!frame) return { min: 0, max: 1 };

    let vMin = Infinity;
    let vMax = -Infinity;
    for (let i = 0; i < this.samples.length; i += 1) {
      const { xi, yi, zi } = this.samples[i];
      if (this.sliceYi >= 0 && yi !== this.sliceYi) continue;
      const v = sampleFluidQuantity(this.grid, frame, q, xi, yi, zi);
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }

    if (!isFinite(vMin) || !isFinite(vMax) || vMin === vMax) {
      return { min: 0, max: 1 };
    }
    return normalizeFluidQuantityRange(q, vMin, vMax);
  }

  public updateAtTime(timeSeconds: number): void {
    if (this.frames.length === 0) return;
    let idx = 0;
    for (let i = 0; i < this.frames.length; i += 1) {
      if (this.frames[i].timestampSeconds <= timeSeconds) idx = i;
      else break;
    }
    if (idx !== this.currentFrameIndex) {
      this.applyFrame(idx);
    }
  }

  private buildSamples(requestedStride: number): SamplePoint[] {
    const { width: W, height: H, depth: D } = this.grid;
    let stride = Math.max(1, requestedStride);
    const total = Math.ceil(W / stride) * Math.ceil(H / stride) * Math.ceil(D / stride);
    if (total > MAX_POINTS) {
      stride = Math.ceil(Math.cbrt((W * H * D) / MAX_POINTS));
    }

    const out: SamplePoint[] = [];
    for (let zi = 0; zi < D; zi += stride) {
      for (let yi = 0; yi < H; yi += stride) {
        for (let xi = 0; xi < W; xi += stride) {
          out.push({ xi, yi, zi });
        }
      }
    }
    return out;
  }

  private applyFrame(frameIndex: number): void {
    const frame = this.frames[frameIndex];
    if (!frame) return;
    this.currentFrameIndex = frameIndex;

    let vMin = Infinity;
    let vMax = -Infinity;
    let write = 0;
    for (let i = 0; i < this.samples.length; i += 1) {
      const { xi, yi, zi } = this.samples[i];
      if (this.sliceYi >= 0 && yi !== this.sliceYi) continue;
      const v = sampleFluidQuantity(this.grid, frame, this.currentQuantity, xi, yi, zi);
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }

    if (!isFinite(vMin) || !isFinite(vMax) || vMin === vMax) {
      vMin = 0;
      vMax = 1;
    }
    const range = normalizeFluidQuantityRange(this.currentQuantity, vMin, vMax);
    this.currentRange = range;
    const { min: normMin, max: normMax } = range;

    for (let i = 0; i < this.samples.length; i += 1) {
      const { xi, yi, zi } = this.samples[i];
      if (this.sliceYi >= 0 && yi !== this.sliceYi) continue;
      const w = fluidCellWorldPosition(this.grid, xi, yi, zi);
      const v = sampleFluidQuantity(this.grid, frame, this.currentQuantity, xi, yi, zi);
      colorForFluidQuantity(this.currentQuantity, v, normMin, normMax, this.tmpColor);
      this.positions[write] = w.x;
      this.positions[write + 1] = w.y;
      this.positions[write + 2] = w.z;
      this.colors[write] = this.tmpColor.r;
      this.colors[write + 1] = this.tmpColor.g;
      this.colors[write + 2] = this.tmpColor.b;
      write += 3;
    }

    const count = write / 3;
    this.geometry.setDrawRange(0, count);
    (this.geometry.attributes['position'] as BufferAttribute).needsUpdate = true;
    (this.geometry.attributes['color'] as BufferAttribute).needsUpdate = true;
  }

  public dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
