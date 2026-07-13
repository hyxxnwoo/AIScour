import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  type Scene,
  Vector3,
} from 'three';
import type { Disposable } from '@/types/disposable';
import type { FluidGrid3D, FluidSeries } from '@/types/fluid';
import { colorForFluidQuantity } from '@/utils/fluidQuantityColor';
import { fluidCellWorldPosition } from '@/utils/fluidWorld';

const MAX_ARROWS = 4_000;

export interface VelocityArrowsOptions {
  scene: Scene;
  series: FluidSeries;
  stride?: number;
  ySliceIndex?: number;
  maxArrowLength?: number;
}

const tmpMatrix = new Matrix4();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const tmpDir = new Vector3();
const tmpPos = new Vector3();
const UP = new Vector3(0, 1, 0);
const proxy = new Object3D();

export class VelocityArrows implements Disposable {
  private readonly scene: Scene;
  private readonly grid: FluidGrid3D;
  private readonly frames: FluidSeries['frames'];
  private readonly stride: number;
  private readonly ySliceIndex: number;
  private readonly maxArrowLength: number;
  private readonly samplePoints: Array<{ xi: number; yi: number; zi: number; worldPos: Vector3 }>;
  private readonly shaftMesh: InstancedMesh;
  private readonly headMesh: InstancedMesh;
  private readonly shaftMaterial: MeshBasicMaterial;
  private readonly headMaterial: MeshBasicMaterial;
  private readonly tmpColor = { r: 0, g: 0, b: 0 };
  private readonly threeColor = new Color();
  private currentFrameIndex = -1;

  public constructor(options: VelocityArrowsOptions) {
    this.scene = options.scene;
    this.grid = options.series.grid;
    this.frames = options.series.frames;
    this.stride = Math.max(1, options.stride ?? 4);
    this.ySliceIndex = options.ySliceIndex ?? -1;
    this.maxArrowLength = options.maxArrowLength ?? this.grid.cellSize * 2.0;

    this.samplePoints = this.buildSamplePoints();

    const shaftGeom = new CylinderGeometry(0.04, 0.04, 1, 6);
    shaftGeom.translate(0, 0.5, 0);
    const headGeom = new ConeGeometry(0.12, 0.25, 8);
    headGeom.translate(0, 1.125, 0);

    this.shaftMaterial = new MeshBasicMaterial({ vertexColors: false });
    this.headMaterial = new MeshBasicMaterial({ vertexColors: false });
    this.shaftMesh = new InstancedMesh(shaftGeom, this.shaftMaterial, this.samplePoints.length);
    this.headMesh = new InstancedMesh(headGeom, this.headMaterial, this.samplePoints.length);
    this.shaftMesh.frustumCulled = false;
    this.headMesh.frustumCulled = false;

    this.scene.add(this.shaftMesh);
    this.scene.add(this.headMesh);

    if (this.frames.length > 0) {
      this.applyFrame(0);
    }
  }

  public setVisible(visible: boolean): void {
    this.shaftMesh.visible = visible;
    this.headMesh.visible = visible;
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

  private buildSamplePoints(): Array<{ xi: number; yi: number; zi: number; worldPos: Vector3 }> {
    const { width: W, height: H, depth: D } = this.grid;
    const points: Array<{ xi: number; yi: number; zi: number; worldPos: Vector3 }> = [];
    let stride = this.stride;
    const yStart = this.ySliceIndex >= 0 ? this.ySliceIndex : 0;
    const yEnd = this.ySliceIndex >= 0 ? this.ySliceIndex + 1 : H;
    const yStep = this.ySliceIndex >= 0 ? 1 : stride;

    const countAt = (s: number): number => {
      const ySpan = this.ySliceIndex >= 0 ? 1 : Math.ceil(H / s);
      return Math.ceil(W / s) * ySpan * Math.ceil(D / s);
    };
    while (countAt(stride) > MAX_ARROWS && stride < Math.max(W, H, D)) {
      stride += 1;
    }

    for (let zi = 0; zi < D; zi += stride) {
      for (let yi = yStart; yi < yEnd; yi += yStep) {
        for (let xi = 0; xi < W; xi += stride) {
          const w = fluidCellWorldPosition(this.grid, xi, yi, zi);
          points.push({ xi, yi, zi, worldPos: new Vector3(w.x, w.y, w.z) });
          if (points.length >= MAX_ARROWS) return points;
        }
      }
    }
    return points;
  }

  private applyFrame(frameIndex: number): void {
    const frame = this.frames[frameIndex];
    if (!frame) return;
    this.currentFrameIndex = frameIndex;

    const { width: W, height: H } = this.grid;
    let speedMax = 0;
    for (const p of this.samplePoints) {
      const i = p.xi + p.yi * W + p.zi * W * H;
      const vx = frame.velocityX[i] ?? 0;
      const vy = frame.velocityY[i] ?? 0;
      const vz = frame.velocityZ[i] ?? 0;
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (sp > speedMax) speedMax = sp;
    }
    if (speedMax === 0) speedMax = 1;

    for (let i = 0; i < this.samplePoints.length; i += 1) {
      const p = this.samplePoints[i];
      const idx = p.xi + p.yi * W + p.zi * W * H;
      const vx = frame.velocityX[idx] ?? 0;
      const vy = frame.velocityY[idx] ?? 0;
      const vz = frame.velocityZ[idx] ?? 0;
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const length = (speed / speedMax) * this.maxArrowLength;

      if (speed < 1e-4 || length < 1e-3) {
        proxy.matrix.makeScale(0, 0, 0);
        this.shaftMesh.setMatrixAt(i, proxy.matrix);
        this.headMesh.setMatrixAt(i, proxy.matrix);
        continue;
      }

      tmpDir.set(vx, vy, vz).divideScalar(speed);
      tmpQuat.setFromUnitVectors(UP, tmpDir);
      tmpScale.set(1, length, 1);
      tmpPos.copy(p.worldPos);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      this.shaftMesh.setMatrixAt(i, tmpMatrix);
      this.headMesh.setMatrixAt(i, tmpMatrix);
      colorForFluidQuantity('speed', speed, 0, speedMax, this.tmpColor);
      this.threeColor.setRGB(this.tmpColor.r, this.tmpColor.g, this.tmpColor.b);
      this.shaftMesh.setColorAt(i, this.threeColor);
      this.headMesh.setColorAt(i, this.threeColor);
    }

    this.shaftMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
    if (this.shaftMesh.instanceColor) this.shaftMesh.instanceColor.needsUpdate = true;
    if (this.headMesh.instanceColor) this.headMesh.instanceColor.needsUpdate = true;
  }

  public dispose(): void {
    this.scene.remove(this.shaftMesh);
    this.scene.remove(this.headMesh);
    this.shaftMesh.dispose();
    this.headMesh.dispose();
    this.shaftMesh.geometry.dispose();
    this.headMesh.geometry.dispose();
    this.shaftMaterial.dispose();
    this.headMaterial.dispose();
  }
}
