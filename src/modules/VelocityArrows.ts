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
import type { FluidFrame, FluidGrid3D, FluidSeries } from '@/types/fluid';
import { sampleFluidColor } from '@/utils/fluidColorRamp';

export interface VelocityArrowsOptions {
  scene: Scene;
  series: FluidSeries;
  // 그리드 다운샘플 간격(셀 단위). 기본 4 → 4셀마다 1개 화살표
  stride?: number;
  // 연직(Y) 슬라이스 인덱스. -1 이면 모든 Y 평면(부피).
  ySliceIndex?: number;
  // 화살표 최대 길이(미터)
  maxArrowLength?: number;
}

const tmpMatrix = new Matrix4();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const tmpDir = new Vector3();
const tmpPos = new Vector3();
// ConeGeometry 의 +Y 방향과 정렬하기 위한 기준 벡터
const UP = new Vector3(0, 1, 0);
const proxy = new Object3D();

// VelocityArrows: 다운샘플된 격자 위치마다 instanced 화살표(원기둥+원뿔)로 속도 벡터를 표시한다.
// 색상은 magnitude 에 따라 viridis 컬러맵.
export class VelocityArrows implements Disposable {
  private readonly scene: Scene;
  private readonly grid: FluidGrid3D;
  private readonly frames: FluidFrame[];
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

    // 단위 길이(=1) 기준 지오메트리. setMatrixAt 에서 길이 스케일.
    const shaftGeom = new CylinderGeometry(0.04, 0.04, 1, 6);
    shaftGeom.translate(0, 0.5, 0); // 원점에서 +Y 방향으로 자라도록
    const headGeom = new ConeGeometry(0.12, 0.25, 8);
    headGeom.translate(0, 1 + 0.125, 0);

    this.shaftMaterial = new MeshBasicMaterial({ vertexColors: false });
    this.headMaterial = new MeshBasicMaterial({ vertexColors: false });
    // InstancedMesh 인스턴스 색상 사용
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
    const { width: W, height: H, depth: D, cellSize: cs } = this.grid;
    const halfW = ((W - 1) * cs) / 2;
    const halfD = ((D - 1) * cs) / 2;
    const points: Array<{ xi: number; yi: number; zi: number; worldPos: Vector3 }> = [];
    const yStart = this.ySliceIndex >= 0 ? this.ySliceIndex : 0;
    const yEnd = this.ySliceIndex >= 0 ? this.ySliceIndex + 1 : H;
    const yStep = this.ySliceIndex >= 0 ? 1 : this.stride;
    for (let zi = 0; zi < D; zi += this.stride) {
      for (let yi = yStart; yi < yEnd; yi += yStep) {
        for (let xi = 0; xi < W; xi += this.stride) {
          points.push({
            xi,
            yi,
            zi,
            worldPos: new Vector3(xi * cs - halfW, yi * cs, zi * cs - halfD),
          });
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

    // 먼저 magnitude min/max 를 구해 색상 정규화에 사용
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

      // 길이는 speed 비율로, 최댓값은 maxArrowLength 로 클램프
      const length = speedMax === 0 ? 0 : (speed / speedMax) * this.maxArrowLength;

      if (speed < 1e-4 || length < 1e-3) {
        // 화살표 숨김: 스케일 0
        proxy.matrix.makeScale(0, 0, 0);
        this.shaftMesh.setMatrixAt(i, proxy.matrix);
        this.headMesh.setMatrixAt(i, proxy.matrix);
        this.shaftMesh.setColorAt(i, this.threeColor.setRGB(0, 0, 0));
        this.headMesh.setColorAt(i, this.threeColor.setRGB(0, 0, 0));
        continue;
      }

      tmpDir.set(vx, vy, vz).divideScalar(speed);
      tmpQuat.setFromUnitVectors(UP, tmpDir);
      tmpScale.set(1, length, 1);
      tmpPos.copy(p.worldPos);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      this.shaftMesh.setMatrixAt(i, tmpMatrix);

      // 헤드는 길이 스케일을 작게 유지 (translate 가 1 단위 기준이므로 같은 매트릭스 사용)
      this.headMesh.setMatrixAt(i, tmpMatrix);

      sampleFluidColor(speed, 0, speedMax, this.tmpColor);
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
