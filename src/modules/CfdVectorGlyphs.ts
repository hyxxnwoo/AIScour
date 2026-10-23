import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  type Scene,
  Vector3,
} from 'three';
import type { Disposable } from '@/types/disposable';
import type { CfdFlowSource, FlowBounds, FlowVelocity } from '@/data/cfdFlowField';
import { CFD_SETTINGS } from '@/constants/cfdSettings';
import { sampleCfdVelocityColor } from '@/utils/cfdVelocityColor';

export interface CfdVectorGlyphsOptions {
  scene: Scene;
  flow: CfdFlowSource;
  bounds: FlowBounds;
  bedAt: (x: number, z: number) => number | null;
  waterLevelY: number;
  speedMax: number;
}

const UP = new Vector3(0, 1, 0);
const REFRESH_SECONDS = 0.12; // 합성 와류열이 시간에 따라 변하므로 일정 간격으로 다시 샘플
const EMPTY = new Matrix4().makeScale(0, 0, 0);

/**
 * 속도 벡터 글리프(화살표). 수심 비율 위치의 수평면에 격자로 배치하고 길이는 속력에 비례한다.
 * 밀도(1~5)는 setDensity 로 바꾸며, 값이 클수록 간격이 좁아진다. 개수는 vectorMaxCount 로 제한한다.
 */
export class CfdVectorGlyphs implements Disposable {
  private readonly scene: Scene;
  private readonly flow: CfdFlowSource;
  private readonly bounds: FlowBounds;
  private readonly bedAt: (x: number, z: number) => number | null;
  private readonly waterY: number;
  private readonly speedMax: number;
  private readonly shaftGeom: CylinderGeometry;
  private readonly headGeom: ConeGeometry;
  private readonly shaftMat = new MeshBasicMaterial();
  private readonly headMat = new MeshBasicMaterial();
  private shaft!: InstancedMesh;
  private head!: InstancedMesh;
  private points: Array<{ x: number; y: number; z: number }> = [];
  private spacing = 0;
  private density: number = CFD_SETTINGS.vectorDensityDefault;
  private realSinceRefresh = 0;
  private lastRefreshT = Number.NaN;
  private visible = true;
  private readonly v: FlowVelocity = { vx: 0, vy: 0, vz: 0 };
  private readonly rgb = { r: 0, g: 0, b: 0 };
  private readonly color = new Color();
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly dir = new Vector3();
  private readonly pos = new Vector3();
  private readonly scl = new Vector3();

  public constructor(options: CfdVectorGlyphsOptions) {
    this.scene = options.scene;
    this.flow = options.flow;
    this.bounds = options.bounds;
    this.bedAt = options.bedAt;
    this.waterY = options.waterLevelY;
    this.speedMax = Math.max(1e-6, options.speedMax);
    this.shaftGeom = new CylinderGeometry(0.04, 0.04, 1, 6);
    this.shaftGeom.translate(0, 0.5, 0);
    this.headGeom = new ConeGeometry(0.12, 0.25, 8);
    this.headGeom.translate(0, 1.125, 0);
    this.rebuildPoints();
  }

  public get glyphCount(): number {
    return this.points.length;
  }

  public get currentDensity(): number {
    return this.density;
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.shaft.visible = visible;
    this.head.visible = visible;
    if (visible) this.lastRefreshT = Number.NaN;
  }

  public setDensity(density: number): void {
    const d = Math.round(
      Math.min(CFD_SETTINGS.vectorDensityMax, Math.max(CFD_SETTINGS.vectorDensityMin, density)),
    );
    if (d === this.density) return;
    this.density = d;
    this.rebuildPoints();
    this.lastRefreshT = Number.NaN;
  }

  /** t 가 바뀌었거나 일정 시간이 지났을 때만 다시 샘플한다. realDelta 는 직전 프레임 이후 실시간(초). */
  public update(t: number, realDelta: number): void {
    if (!this.visible) return;
    this.realSinceRefresh += realDelta;
    if (
      Number.isFinite(this.lastRefreshT) &&
      t === this.lastRefreshT &&
      this.realSinceRefresh < REFRESH_SECONDS
    ) {
      return;
    }
    this.realSinceRefresh = 0;
    this.refresh(t);
  }

  private rebuildPoints(): void {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const sizeX = maxX - minX;
    const sizeZ = maxZ - minZ;
    // 밀도 d → 길이 방향 대략 6·d 개. 상한을 넘으면 간격을 넓힌다.
    let spacing = sizeX / (6 * this.density);
    const countFor = (s: number): number => Math.ceil(sizeX / s) * Math.ceil(sizeZ / s);
    while (countFor(spacing) > CFD_SETTINGS.vectorMaxCount) spacing *= 1.1;
    const nx = Math.ceil(sizeX / spacing);
    const nz = Math.ceil(sizeZ / spacing);
    this.spacing = spacing;

    const pts: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i < nx; i += 1) {
      for (let k = 0; k < nz; k += 1) {
        const x = minX + (i + 0.5) * spacing;
        const z = minZ + (k + 0.5) * spacing;
        if (x > maxX || z > maxZ) continue;
        const bed = this.bedAt(x, z);
        if (bed === null) continue;
        const y = bed + (this.waterY - bed) * CFD_SETTINGS.vectorHeightFraction;
        if (y <= bed) continue;
        pts.push({ x, y, z });
      }
    }
    this.points = pts;

    if (this.shaft) {
      this.scene.remove(this.shaft, this.head);
      this.shaft.dispose();
      this.head.dispose();
    }
    const count = Math.max(1, pts.length);
    this.shaft = new InstancedMesh(this.shaftGeom, this.shaftMat, count);
    this.head = new InstancedMesh(this.headGeom, this.headMat, count);
    this.shaft.frustumCulled = false;
    this.head.frustumCulled = false;
    this.shaft.renderOrder = 4;
    this.head.renderOrder = 4;
    this.shaft.visible = this.visible;
    this.head.visible = this.visible;
    this.scene.add(this.shaft, this.head);
  }

  private refresh(t: number): void {
    this.lastRefreshT = t;
    const maxLen = this.spacing * 0.9;
    for (let i = 0; i < this.points.length; i += 1) {
      const p = this.points[i];
      if (!this.flow.sample(p.x, p.y, p.z, t, this.v)) {
        this.hide(i);
        continue;
      }
      const speed = Math.hypot(this.v.vx, this.v.vy, this.v.vz);
      const len = Math.min(1, speed / this.speedMax) * maxLen;
      if (speed < 1e-6 || len < 1e-6) {
        this.hide(i);
        continue;
      }
      this.dir.set(this.v.vx, this.v.vy, this.v.vz).divideScalar(speed);
      this.q.setFromUnitVectors(UP, this.dir);
      this.pos.set(p.x, p.y, p.z);
      // 화살표 전체 길이 = 몸통 1 + 머리 0.375 (단위 길이 기준)
      const s = len / 1.375;
      this.scl.set(s, s, s);
      this.m.compose(this.pos, this.q, this.scl);
      this.shaft.setMatrixAt(i, this.m);
      this.head.setMatrixAt(i, this.m);
      sampleCfdVelocityColor(speed, 0, this.speedMax, this.rgb);
      this.color.setRGB(this.rgb.r, this.rgb.g, this.rgb.b);
      this.shaft.setColorAt(i, this.color);
      this.head.setColorAt(i, this.color);
    }
    this.shaft.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
    if (this.shaft.instanceColor) this.shaft.instanceColor.needsUpdate = true;
    if (this.head.instanceColor) this.head.instanceColor.needsUpdate = true;
  }

  private hide(i: number): void {
    this.shaft.setMatrixAt(i, EMPTY);
    this.head.setMatrixAt(i, EMPTY);
  }

  public dispose(): void {
    this.scene.remove(this.shaft, this.head);
    this.shaft.dispose();
    this.head.dispose();
    this.shaftGeom.dispose();
    this.headGeom.dispose();
    this.shaftMat.dispose();
    this.headMat.dispose();
  }
}
