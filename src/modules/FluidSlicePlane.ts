import {
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
import { sampleFluidColor } from '@/utils/fluidColorRamp';

export interface FluidSlicePlaneOptions {
  scene: Scene;
  series: FluidSeries;
  // 초기 슬라이스 높이(미터, Y). 기본은 도메인 중간.
  initialHeight?: number;
  // 초기 표시 양
  initialQuantity?: FluidQuantity;
}

// FluidSlicePlane: 도메인 내 수평 단면(Y = const) 을 DataTexture(W×D) 로 색칠해 표시한다.
// 양 변경 / 높이 변경 시 텍스처를 다시 채운다.
export class FluidSlicePlane implements Disposable {
  private readonly scene: Scene;
  private readonly grid: FluidGrid3D;
  private readonly frames: FluidFrame[];
  private readonly mesh: Mesh;
  private readonly geometry: PlaneGeometry;
  private readonly material: MeshBasicMaterial;
  private readonly texture: DataTexture;
  private readonly pixels: Uint8Array;
  private readonly tmpColor = { r: 0, g: 0, b: 0 };
  private currentFrameIndex = -1;
  private currentQuantity: FluidQuantity;
  // 슬라이스가 위치한 Y 격자 인덱스
  private currentYi: number;
  private currentRange: { min: number; max: number } = { min: 0, max: 1 };

  public constructor(options: FluidSlicePlaneOptions) {
    this.scene = options.scene;
    this.grid = options.series.grid;
    this.frames = options.series.frames;
    this.currentQuantity = options.initialQuantity ?? 'speed';

    const initialY = options.initialHeight ?? ((this.grid.height - 1) * this.grid.cellSize) / 2;
    this.currentYi = this.heightToIndex(initialY);

    const { width: W, depth: D, cellSize: cs } = this.grid;
    this.pixels = new Uint8Array(W * D * 4);
    this.texture = new DataTexture(this.pixels, W, D, RGBAFormat, UnsignedByteType);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.wrapS = ClampToEdgeWrapping;
    this.texture.wrapT = ClampToEdgeWrapping;
    this.texture.needsUpdate = true;

    this.geometry = new PlaneGeometry((W - 1) * cs, (D - 1) * cs, 1, 1);
    this.geometry.rotateX(-Math.PI / 2); // X-Z 평면이 되도록

    this.material = new MeshBasicMaterial({
      map: this.texture,
      side: DoubleSide,
      transparent: true,
      opacity: 0.85,
    });

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.position.y = initialY;
    this.scene.add(this.mesh);

    if (this.frames.length > 0) {
      this.applyFrame(0);
    }
  }

  public setVisible(visible: boolean): void {
    this.mesh.visible = visible;
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
      // 위치만 부드럽게 이동
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

  // 외부 시계로부터 절대 시간(초) 을 받아 가장 가까운 프레임을 적용한다.
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

    // 현재 슬라이스의 min/max 를 먼저 구해 정규화 기준으로 사용
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
    const cs = this.grid.cellSize;
    const yi = Math.round(y / cs);
    return Math.max(0, Math.min(this.grid.height - 1, yi));
  }

  private indexToHeight(yi: number): number {
    return yi * this.grid.cellSize;
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
