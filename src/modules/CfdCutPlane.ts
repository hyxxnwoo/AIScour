import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  type Scene,
  UnsignedByteType,
  Vector3,
} from 'three';
import type { Disposable } from '@/types/disposable';
import type { CfdFlowSource, FlowBounds, FlowVelocity } from '@/data/cfdFlowField';
import { sampleCfdVelocityColor } from '@/utils/cfdVelocityColor';

/** longitudinal: 종단 A–A′(흐름 X × 연직, 고정 Z) · transverse: 횡단 B–B′(횡단 Z × 연직, 고정 X) */
export type CutAxis = 'longitudinal' | 'transverse';

export interface CfdCutPlaneOptions {
  scene: Scene;
  flow: CfdFlowSource;
  bounds: FlowBounds;
  bedAt: (x: number, z: number) => number | null;
  waterLevelY: number;
  speedMax: number;
}

const TEX_W = 96;
const TEX_H = 32;
const VEC_COLS = 14;
const VEC_ROWS = 5;
const REFRESH_SECONDS = 0.12;
const UP = new Vector3(0, 1, 0);
const EMPTY = new Matrix4().makeScale(0, 0, 0);

/**
 * 연직 단면(cut-plane): 유속 크기 컨투어와 면내 벡터를 함께 그린다.
 * 위치는 setPosition 으로 바꾸고(종단이면 Z, 횡단이면 X 월드 좌표), 값이 바뀌거나 시각이 바뀔 때만 다시 샘플한다.
 */
export class CfdCutPlane implements Disposable {
  private readonly scene: Scene;
  private readonly flow: CfdFlowSource;
  private readonly bounds: FlowBounds;
  private readonly bedAt: (x: number, z: number) => number | null;
  private readonly waterY: number;
  private readonly speedMax: number;
  private readonly yMin: number;
  private readonly pixels = new Uint8Array(TEX_W * TEX_H * 4);
  private readonly texture: DataTexture;
  private readonly planeGeom = new PlaneGeometry(1, 1);
  private readonly planeMat: MeshBasicMaterial;
  private readonly plane: Mesh;
  private readonly shaftGeom = new CylinderGeometry(0.04, 0.04, 1, 6);
  private readonly headGeom = new ConeGeometry(0.12, 0.25, 8);
  private readonly arrowMat = new MeshBasicMaterial({ color: 0x10161d });
  private readonly shaft: InstancedMesh;
  private readonly head: InstancedMesh;
  private axis: CutAxis = 'longitudinal';
  private position = 0;
  private visible = true;
  private dirty = true;
  private lastT = Number.NaN;
  private sinceRefresh = 0;
  private readonly v: FlowVelocity = { vx: 0, vy: 0, vz: 0 };
  private readonly rgb = { r: 0, g: 0, b: 0 };
  private readonly color = new Color();
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly dir = new Vector3();
  private readonly pos = new Vector3();
  private readonly scl = new Vector3();

  public constructor(options: CfdCutPlaneOptions) {
    this.scene = options.scene;
    this.flow = options.flow;
    this.bounds = options.bounds;
    this.bedAt = options.bedAt;
    this.waterY = options.waterLevelY;
    this.speedMax = Math.max(1e-6, options.speedMax);

    // 단면 하단 = 영역 안 최저 하상 표고
    let lo = this.waterY;
    for (let i = 0; i <= 16; i += 1) {
      for (let k = 0; k <= 8; k += 1) {
        const b = this.bedAt(
          this.bounds.minX + (i / 16) * (this.bounds.maxX - this.bounds.minX),
          this.bounds.minZ + (k / 8) * (this.bounds.maxZ - this.bounds.minZ),
        );
        if (b !== null) lo = Math.min(lo, b);
      }
    }
    this.yMin = Math.min(lo, this.waterY - 1e-3);

    this.texture = new DataTexture(this.pixels, TEX_W, TEX_H, RGBAFormat, UnsignedByteType);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.planeMat = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    });
    this.plane = new Mesh(this.planeGeom, this.planeMat);
    this.plane.renderOrder = 5;
    this.scene.add(this.plane);

    this.shaftGeom.translate(0, 0.5, 0);
    this.headGeom.translate(0, 1.125, 0);
    const n = VEC_COLS * VEC_ROWS;
    this.shaft = new InstancedMesh(this.shaftGeom, this.arrowMat, n);
    this.head = new InstancedMesh(this.headGeom, this.arrowMat, n);
    for (const mesh of [this.shaft, this.head]) {
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      this.scene.add(mesh);
    }
    this.layoutPlane();
  }

  public get currentAxis(): CutAxis {
    return this.axis;
  }

  public get currentPosition(): number {
    return this.position;
  }

  /** 위치를 놓을 수 있는 범위(월드 좌표). 종단이면 Z 범위, 횡단이면 X 범위. */
  public positionRange(axis: CutAxis = this.axis): { min: number; max: number } {
    return axis === 'longitudinal'
      ? { min: this.bounds.minZ, max: this.bounds.maxZ }
      : { min: this.bounds.minX, max: this.bounds.maxX };
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.plane.visible = visible;
    this.shaft.visible = visible;
    this.head.visible = visible;
    if (visible) this.dirty = true;
  }

  public setAxis(axis: CutAxis): void {
    if (axis === this.axis) return;
    this.axis = axis;
    this.layoutPlane();
  }

  public setPosition(value: number): void {
    const r = this.positionRange();
    const p = Math.min(r.max, Math.max(r.min, value));
    if (Math.abs(p - this.position) < 1e-9) return;
    this.position = p;
    this.layoutPlane();
  }

  /** 축·위치를 한 번에 지정한다(축이 바뀔 때 위치 범위 클램프 순서를 보장). */
  public setPlane(axis: CutAxis, value: number): void {
    this.axis = axis;
    const r = this.positionRange(axis);
    this.position = Math.min(r.max, Math.max(r.min, value));
    this.layoutPlane();
  }

  public update(t: number, realDelta: number): void {
    if (!this.visible) return;
    this.sinceRefresh += realDelta;
    if (!this.dirty && t === this.lastT && this.sinceRefresh < REFRESH_SECONDS) return;
    this.sinceRefresh = 0;
    this.lastT = t;
    this.dirty = false;
    this.refresh(t);
  }

  private spanH(): number {
    return this.axis === 'longitudinal'
      ? this.bounds.maxX - this.bounds.minX
      : this.bounds.maxZ - this.bounds.minZ;
  }

  private layoutPlane(): void {
    const w = this.spanH();
    const h = this.waterY - this.yMin;
    const cy = (this.waterY + this.yMin) / 2;
    this.plane.scale.set(w, h, 1);
    if (this.axis === 'longitudinal') {
      this.plane.rotation.set(0, 0, 0);
      this.plane.position.set((this.bounds.minX + this.bounds.maxX) / 2, cy, this.position);
    } else {
      this.plane.rotation.set(0, Math.PI / 2, 0);
      this.plane.position.set(this.position, cy, (this.bounds.minZ + this.bounds.maxZ) / 2);
    }
    this.dirty = true;
  }

  /** 단면 위 점(수평 좌표 s∈[0,1], 높이 비율 f∈[0,1])의 월드 좌표. */
  private worldAt(s: number, f: number): { x: number; y: number; z: number } {
    const y = this.yMin + f * (this.waterY - this.yMin);
    return this.axis === 'longitudinal'
      ? { x: this.bounds.minX + s * (this.bounds.maxX - this.bounds.minX), y, z: this.position }
      : { x: this.position, y, z: this.bounds.minZ + s * (this.bounds.maxZ - this.bounds.minZ) };
  }

  private refresh(t: number): void {
    // 유속 크기 컨투어 텍스처
    for (let j = 0; j < TEX_H; j += 1) {
      const f = (j + 0.5) / TEX_H;
      for (let i = 0; i < TEX_W; i += 1) {
        const w = this.worldAt((i + 0.5) / TEX_W, f);
        const o = (j * TEX_W + i) * 4;
        if (!this.flow.sample(w.x, w.y, w.z, t, this.v)) {
          this.pixels[o + 3] = 0;
          continue;
        }
        const speed = Math.hypot(this.v.vx, this.v.vy, this.v.vz);
        sampleCfdVelocityColor(speed, 0, this.speedMax, this.rgb);
        this.pixels[o] = Math.round(this.rgb.r * 255);
        this.pixels[o + 1] = Math.round(this.rgb.g * 255);
        this.pixels[o + 2] = Math.round(this.rgb.b * 255);
        this.pixels[o + 3] = 235;
      }
    }
    this.texture.needsUpdate = true;

    // 면내 벡터(종단: u·w, 횡단: v·w)
    const cell = Math.min(this.spanH() / VEC_COLS, (this.waterY - this.yMin) / VEC_ROWS);
    const maxLen = cell * 0.9;
    // 평면 앞(카메라 쪽)으로 살짝 띄워 컨투어에 묻히지 않게 한다.
    const lift = this.axis === 'longitudinal' ? new Vector3(0, 0, 0.002) : new Vector3(0.002, 0, 0);
    let idx = 0;
    for (let r = 0; r < VEC_ROWS; r += 1) {
      for (let c = 0; c < VEC_COLS; c += 1, idx += 1) {
        const w = this.worldAt((c + 0.5) / VEC_COLS, (r + 0.5) / VEC_ROWS);
        if (!this.flow.sample(w.x, w.y, w.z, t, this.v)) {
          this.shaft.setMatrixAt(idx, EMPTY);
          this.head.setMatrixAt(idx, EMPTY);
          continue;
        }
        const inH = this.axis === 'longitudinal' ? this.v.vx : this.v.vz;
        const inV = this.v.vy;
        const mag = Math.hypot(inH, inV);
        const len = Math.min(1, mag / this.speedMax) * maxLen;
        if (mag < 1e-6 || len < 1e-6) {
          this.shaft.setMatrixAt(idx, EMPTY);
          this.head.setMatrixAt(idx, EMPTY);
          continue;
        }
        if (this.axis === 'longitudinal') this.dir.set(inH, inV, 0);
        else this.dir.set(0, inV, inH);
        this.dir.divideScalar(mag);
        this.q.setFromUnitVectors(UP, this.dir);
        this.pos.set(w.x, w.y, w.z).add(lift);
        const s = len / 1.375;
        this.scl.set(s, s, s);
        this.m.compose(this.pos, this.q, this.scl);
        this.shaft.setMatrixAt(idx, this.m);
        this.head.setMatrixAt(idx, this.m);
        this.shaft.setColorAt(idx, this.color.setRGB(0.06, 0.09, 0.11));
        this.head.setColorAt(idx, this.color);
      }
    }
    this.shaft.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
    if (this.shaft.instanceColor) this.shaft.instanceColor.needsUpdate = true;
    if (this.head.instanceColor) this.head.instanceColor.needsUpdate = true;
  }

  public dispose(): void {
    this.scene.remove(this.plane, this.shaft, this.head);
    this.shaft.dispose();
    this.head.dispose();
    this.planeGeom.dispose();
    this.planeMat.dispose();
    this.texture.dispose();
    this.shaftGeom.dispose();
    this.headGeom.dispose();
    this.arrowMat.dispose();
  }
}
