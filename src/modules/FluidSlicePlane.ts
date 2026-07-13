import {
  BufferAttribute,
  DataTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RGBAFormat,
  type Scene,
  UnsignedByteType,
  LinearFilter,
  ClampToEdgeWrapping,
} from 'three';
import type { Disposable } from '@/types/disposable';
import type { FluidFrame, FluidGrid3D, FluidQuantity, FluidSeries } from '@/types/fluid';
import { sampleFluidQuantity } from '@/types/fluid';
import { fluidCellWorldPosition, fluidGridOrigin, fluidHeightRange } from '@/utils/fluidWorld';
import { sampleFluidColor } from '@/utils/fluidColorRamp';
import { waterSurfaceWave } from '@/utils/waterSurfaceWave';

export interface FluidSlicePlaneOptions {
  scene: Scene;
  series: FluidSeries;
  initialHeight?: number;
  initialQuantity?: FluidQuantity;
}

// FluidSlicePlane: 수평 단면 유체장 + 수면 찰랑임.
export class FluidSlicePlane implements Disposable {
  private readonly scene: Scene;
  private readonly grid: FluidGrid3D;
  private readonly frames: FluidFrame[];
  private readonly mesh: Mesh;
  private readonly geometry: PlaneGeometry;
  private readonly material: MeshBasicMaterial;
  private readonly texture: DataTexture;
  private readonly pixels: Uint8Array;
  private readonly basePositions: Float32Array;
  private readonly waveAmp: number;
  private readonly tmpColor = { r: 0, g: 0, b: 0 };
  private currentFrameIndex = -1;
  private currentQuantity: FluidQuantity;
  private currentYi: number;
  private currentRange: { min: number; max: number } = { min: 0, max: 1 };

  public constructor(options: FluidSlicePlaneOptions) {
    this.scene = options.scene;
    this.grid = options.series.grid;
    this.frames = options.series.frames;
    this.currentQuantity = options.initialQuantity ?? 'speed';

    const initialY = options.initialHeight ?? fluidHeightRange(this.grid).max * 0.4;
    this.currentYi = this.heightToIndex(initialY);

    const { width: W, depth: D, cellSize: cs } = this.grid;
    const origin = fluidGridOrigin(this.grid);
    this.waveAmp = Math.max(0.03, cs * 0.07);

    this.pixels = new Uint8Array(W * D * 4);
    this.texture = new DataTexture(this.pixels, W, D, RGBAFormat, UnsignedByteType);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.wrapS = ClampToEdgeWrapping;
    this.texture.wrapT = ClampToEdgeWrapping;
    this.texture.needsUpdate = true;

    const segW = Math.min(48, Math.max(12, W));
    const segD = Math.min(48, Math.max(12, D));
    this.geometry = new PlaneGeometry((W - 1) * cs, (D - 1) * cs, segW, segD);
    this.geometry.rotateX(-Math.PI / 2);

    const posAttr = this.geometry.attributes['position'] as BufferAttribute;
    this.basePositions = new Float32Array(posAttr.array.length);
    this.basePositions.set(posAttr.array);

    this.material = new MeshBasicMaterial({
      map: this.texture,
      side: DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.position.set(
      origin.x + ((W - 1) * cs) / 2,
      initialY,
      origin.z + ((D - 1) * cs) / 2,
    );
    this.scene.add(this.mesh);

    if (this.frames.length > 0) {
      this.applyFrame(0);
    }
  }

  public setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  public setOpacity(opacity: number): void {
    const o = Math.min(1, Math.max(0.05, opacity));
    this.material.opacity = o;
    this.material.transparent = o < 1 - 1e-6;
    this.material.needsUpdate = true;
  }

  /** 수면 찰랑임 애니메이션. */
  public tickRipple(elapsedSeconds: number): void {
    if (!this.mesh.visible) return;
    const posAttr = this.geometry.attributes['position'] as BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < posAttr.count; i += 1) {
      const x = this.basePositions[i * 3];
      const z = this.basePositions[i * 3 + 2];
      arr[i * 3 + 1] =
        this.basePositions[i * 3 + 1] + waterSurfaceWave(x, z, elapsedSeconds, this.waveAmp);
    }
    posAttr.needsUpdate = true;
  }

  public setQuantity(q: FluidQuantity): void {
    if (q === this.currentQuantity) return;
    this.currentQuantity = q;
    if (this.currentFrameIndex >= 0) {
      this.refresh(this.currentFrameIndex, true);
    }
  }

  public setHeight(yMeters: number): void {
    const yi = this.heightToIndex(yMeters);
    if (yi === this.currentYi) {
      this.mesh.position.y = this.indexToHeight(yi);
      return;
    }
    this.currentYi = yi;
    this.mesh.position.y = this.indexToHeight(yi);
    if (this.currentFrameIndex >= 0) {
      this.refresh(this.currentFrameIndex, true);
    }
  }

  public get currentRangeForLegend(): { min: number; max: number } {
    return this.currentRange;
  }

  public get currentQuantityName(): FluidQuantity {
    return this.currentQuantity;
  }

  public get currentSliceIndex(): number {
    return this.currentYi;
  }

  public updateAtTime(timeSeconds: number): void {
    if (this.frames.length === 0) return;
    let idx = 0;
    for (let i = 0; i < this.frames.length; i += 1) {
      if (this.frames[i].timestampSeconds <= timeSeconds) idx = i;
      else break;
    }
    if (idx !== this.currentFrameIndex) {
      this.refresh(idx, false);
    }
  }

  private refresh(frameIndex: number, force: boolean): void {
    if (!force && frameIndex === this.currentFrameIndex) return;
    this.applyFrame(frameIndex);
  }

  private applyFrame(frameIndex: number): void {
    const frame = this.frames[frameIndex];
    if (!frame) return;
    this.currentFrameIndex = frameIndex;
    const { width: W, depth: D } = this.grid;
    const yi = this.currentYi;

    let vMin = Infinity;
    let vMax = -Infinity;
    for (let zi = 0; zi < D; zi += 1) {
      for (let xi = 0; xi < W; xi += 1) {
        const v = sampleFluidQuantity(this.grid, frame, this.currentQuantity, xi, yi, zi);
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
    }
    if (!isFinite(vMin) || !isFinite(vMax) || vMin === vMax) {
      vMin = 0;
      vMax = 1;
    }
    this.currentRange = { min: vMin, max: vMax };

    for (let zi = 0; zi < D; zi += 1) {
      for (let xi = 0; xi < W; xi += 1) {
        const v = sampleFluidQuantity(this.grid, frame, this.currentQuantity, xi, yi, zi);
        sampleFluidColor(v, vMin, vMax, this.tmpColor);
        const px = (zi * W + xi) * 4;
        this.pixels[px] = Math.round(this.tmpColor.r * 255);
        this.pixels[px + 1] = Math.round(this.tmpColor.g * 255);
        this.pixels[px + 2] = Math.round(this.tmpColor.b * 255);
        this.pixels[px + 3] = 255;
      }
    }
    this.texture.needsUpdate = true;
  }

  private heightToIndex(y: number): number {
    const o = fluidGridOrigin(this.grid);
    const cs = this.grid.cellSize;
    const yi = Math.round((y - o.y) / cs);
    return Math.max(0, Math.min(this.grid.height - 1, yi));
  }

  private indexToHeight(yi: number): number {
    return fluidCellWorldPosition(this.grid, 0, yi, 0).y;
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
