import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  type Scene,
} from 'three';
import type { Disposable } from '@/types/disposable';
import {
  toSolidSpec,
  type CfdFlowSource,
  type FlowBounds,
  type FlowPier,
  type FlowVelocity,
} from '@/data/cfdFlowField';
import { footprintRadius } from '@/data/flowSolids';
import { CFD_SETTINGS } from '@/constants/cfdSettings';
import { sampleCfdVelocityColor } from '@/utils/cfdVelocityColor';

export interface CfdPathlinesOptions {
  scene: Scene;
  flow: CfdFlowSource;
  bounds: FlowBounds;
  bedAt: (x: number, z: number) => number | null;
  waterLevelY: number;
  piers: FlowPier[];
  /** 색 범위 상한(m/s) */
  speedMax: number;
  count?: number;
  tail?: number;
  /** 난수 생성기(테스트용). 기본 Math.random */
  random?: () => number;
}

const SUBSTEP = 0.04; // 교각 반경(수 cm)·유속(수십 cm/s) 대비 한 걸음이 수 mm 라 충분히 작다
const MAX_FRAME_DT = 0.05;
const SCRUB_JUMP_SECONDS = 1.5;

/**
 * 유속 크기로 색을 칠한 입자 추적선(pathline). 꼬리는 링 버퍼로 유지하고 끝으로 갈수록 투명해진다.
 * 입자는 update(t, dt) 의 dt>0 일 때만 이동하므로 재생 중에만 흐르고, 일시정지하면 멈춘다.
 * 타임라인을 크게 건너뛰면(스크럽) 입자를 다시 투입해 꼬리가 시간 축에서 끊기지 않게 한다.
 */
export class CfdPathlines implements Disposable {
  private readonly scene: Scene;
  private readonly flow: CfdFlowSource;
  private readonly bounds: FlowBounds;
  private readonly bedAt: (x: number, z: number) => number | null;
  private readonly waterY: number;
  private readonly piers: FlowPier[];
  private readonly speedMax: number;
  private readonly n: number;
  private readonly tail: number;
  private readonly rnd: () => number;
  private readonly ring: Float32Array;
  /** 슬롯별 색(rgb). 점을 기록할 때 한 번만 계산해 매 프레임 컬러맵 계산을 피한다. */
  private readonly slotColors: Float32Array;
  private readonly ages: Float32Array;
  private readonly lastSpeed: Float32Array;
  private readonly pos: Float32Array; // 현재 위치 xyz
  private head = 0;
  private lastT = Number.NaN;
  private written = false;
  private readonly geometry: BufferGeometry;
  private readonly material: LineBasicMaterial;
  private readonly mesh: LineSegments;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly v: FlowVelocity = { vx: 0, vy: 0, vz: 0 };
  private readonly v2: FlowVelocity = { vx: 0, vy: 0, vz: 0 };
  private readonly rgb = { r: 0, g: 0, b: 0 };

  public constructor(options: CfdPathlinesOptions) {
    this.scene = options.scene;
    this.flow = options.flow;
    this.bounds = options.bounds;
    this.bedAt = options.bedAt;
    this.waterY = options.waterLevelY;
    this.piers = options.piers;
    this.speedMax = Math.max(1e-6, options.speedMax);
    this.n = Math.max(1, options.count ?? CFD_SETTINGS.pathlineCount);
    this.tail = Math.max(2, options.tail ?? CFD_SETTINGS.pathlineTail);
    this.rnd = options.random ?? Math.random;

    this.ring = new Float32Array(this.n * this.tail * 3);
    this.slotColors = new Float32Array(this.n * this.tail * 3);
    this.ages = new Float32Array(this.n);
    this.lastSpeed = new Float32Array(this.n);
    this.pos = new Float32Array(this.n * 3);

    const segs = this.n * (this.tail - 1);
    this.positions = new Float32Array(segs * 2 * 3);
    this.colors = new Float32Array(segs * 2 * 4);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 4));
    this.material = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new LineSegments(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.scene.add(this.mesh);

    for (let i = 0; i < this.n; i += 1) this.respawn(i);
  }

  public get particleCount(): number {
    return this.n;
  }

  public get tailLength(): number {
    return this.tail;
  }

  public setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  /** t: 타임라인 시각(유동장 시각), dt: 이번 프레임에 입자를 옮길 실시간(초). 0 이면 정지. */
  public update(t: number, dt: number): void {
    if (Number.isFinite(this.lastT) && Math.abs(t - this.lastT) > SCRUB_JUMP_SECONDS) {
      for (let i = 0; i < this.n; i += 1) this.respawn(i);
    }
    this.lastT = t;
    if (dt > 0) {
      this.advance(t, Math.min(dt, MAX_FRAME_DT) * CFD_SETTINGS.pathlineSpeedScale);
      this.writeBuffers();
    } else if (!this.written) {
      this.writeBuffers();
    }
  }

  private advance(t: number, dt: number): void {
    const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
    const h = dt / steps;
    for (let i = 0; i < this.n; i += 1) {
      let x = this.pos[i * 3];
      let y = this.pos[i * 3 + 1];
      let z = this.pos[i * 3 + 2];
      let dead = false;
      let speed = 0;
      for (let s = 0; s < steps && !dead; s += 1) {
        // 한 프레임(수십 ms) 안에서 와류의 이동은 무시할 수 있어 같은 t 로 샘플한다(와류 상태 캐시 재사용).
        const tt = t;
        if (!this.flow.sample(x, y, z, tt, this.v)) {
          dead = true;
          break;
        }
        speed = Math.hypot(this.v.vx, this.v.vy, this.v.vz);
        // 중점법(RK2)
        const ok = this.flow.sample(
          x + 0.5 * h * this.v.vx,
          y + 0.5 * h * this.v.vy,
          z + 0.5 * h * this.v.vz,
          tt,
          this.v2,
        );
        const u = ok ? this.v2 : this.v;
        x += h * u.vx;
        y += h * u.vy;
        z += h * u.vz;
        // 기둥·하단부 안으로 들어가면 표면 밖으로 밀어내 표면을 따라 미끄러지게 한다(통과·소멸 방지).
        const pushed = this.flow.resolveSolid(x, y, z);
        if (pushed) {
          x = pushed.x;
          y = pushed.y;
          z = pushed.z;
        }
        const bed = this.bedAt(x, z);
        const { minX, maxX, minZ, maxZ } = this.bounds;
        if (bed === null || x > maxX || x < minX || z < minZ || z > maxZ) {
          dead = true;
          break;
        }
        // 하상·수면 밖으로 나가면 경계면에 붙인다
        y = Math.min(this.waterY - 1e-4, Math.max(bed + 1e-4, y));
      }
      this.ages[i] += dt;
      if (dead || this.ages[i] > CFD_SETTINGS.pathlineMaxAgeSeconds) {
        this.respawn(i);
        continue;
      }
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      this.lastSpeed[i] = speed;
    }
    // 모든 입자가 같은 링 위치를 공유한다(한 프레임에 한 점씩 기록).
    this.head = (this.head + 1) % this.tail;
    for (let i = 0; i < this.n; i += 1) this.recordPoint(i, this.head, this.lastSpeed[i]);
  }

  /** speed 를 주면 유속을 다시 샘플하지 않고 그 값으로 색을 정한다(직전 걸음에서 이미 구한 값). */
  private recordPoint(i: number, slot: number, speed?: number): void {
    const o = (i * this.tail + slot) * 3;
    const x = this.pos[i * 3];
    const y = this.pos[i * 3 + 1];
    const z = this.pos[i * 3 + 2];
    this.ring[o] = x;
    this.ring[o + 1] = y;
    this.ring[o + 2] = z;
    let sp = speed;
    if (sp === undefined) {
      const t = Number.isFinite(this.lastT) ? this.lastT : 0;
      const ok = this.flow.sample(x, y, z, t, this.v);
      sp = ok ? Math.hypot(this.v.vx, this.v.vy, this.v.vz) : 0;
    }
    sampleCfdVelocityColor(sp, 0, this.speedMax, this.rgb);
    this.slotColors[o] = this.rgb.r;
    this.slotColors[o + 1] = this.rgb.g;
    this.slotColors[o + 2] = this.rgb.b;
  }

  /** 상류에서 새로 투입하고 꼬리 전체를 같은 점으로 채워 길이 0 으로 시작한다. */
  private respawn(i: number): void {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const t = Number.isFinite(this.lastT) ? this.lastT : 0;
    let x = minX;
    let y = this.waterY;
    let z = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      let cx: number;
      let cz: number;
      let cy: number;
      const pick = this.rnd();
      if (this.piers.length > 0 && pick < CFD_SETTINGS.pathlineWakeFraction) {
        // 교각 바로 뒤(후류) — 떨어져 나오는 와류를 입자가 돌며 지나가는 모습이 보이도록 투입
        const p = this.piers[Math.floor(this.rnd() * this.piers.length) % this.piers.length];
        const fr = footprintRadius(toSolidSpec(p));
        cx = p.x + fr * (1.3 + this.rnd() * 3.5);
        cz = p.z + (this.rnd() - 0.5) * 2.4 * fr;
        const bed = this.bedAt(cx, cz);
        if (bed === null) continue;
        cy = bed + (this.waterY - bed) * (0.05 + this.rnd() * 0.9);
      } else if (
        this.piers.length > 0 &&
        pick < CFD_SETTINGS.pathlineWakeFraction + CFD_SETTINGS.pathlineHorseshoeFraction
      ) {
        const p = this.piers[Math.floor(this.rnd() * this.piers.length) % this.piers.length];
        const ang = Math.PI + (this.rnd() - 0.5) * 2.2; // 교각 상류 쪽 호
        const rr = footprintRadius(toSolidSpec(p)) * (1.5 + this.rnd() * 0.9);
        cx = p.x + Math.cos(ang) * rr;
        cz = p.z + Math.sin(ang) * rr;
        const bed = this.bedAt(cx, cz);
        if (bed === null) continue;
        cy = bed + (this.waterY - bed) * (0.02 + this.rnd() * 0.14);
      } else {
        cx = minX + this.rnd() * (maxX - minX) * 0.08; // 상류 입구 근처
        cz = minZ + this.rnd() * (maxZ - minZ);
        const bed = this.bedAt(cx, cz);
        if (bed === null) continue;
        cy = bed + (this.waterY - bed) * (0.03 + this.rnd() * 0.94);
      }
      x = cx;
      y = cy;
      z = cz;
      if (this.flow.sample(cx, cy, cz, t, this.v)) break;
    }
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    // 수명을 분산해 입자가 동시에 사라지지 않게 한다.
    this.ages[i] = this.rnd() * CFD_SETTINGS.pathlineMaxAgeSeconds * 0.5;
    for (let s = 0; s < this.tail; s += 1) this.recordPoint(i, s);
  }

  private writeBuffers(): void {
    this.written = true;
    const tail = this.tail;
    let pv = 0;
    let cv = 0;
    for (let i = 0; i < this.n; i += 1) {
      for (let k = 0; k < tail - 1; k += 1) {
        // k=0 이 가장 오래된 점, head 가 가장 새로운 점.
        const sA = (this.head + 1 + k) % tail;
        const sB = (this.head + 2 + k) % tail;
        for (let e = 0; e < 2; e += 1) {
          const s = e === 0 ? sA : sB;
          const o = (i * tail + s) * 3;
          this.positions[pv++] = this.ring[o];
          this.positions[pv++] = this.ring[o + 1];
          this.positions[pv++] = this.ring[o + 2];
          this.colors[cv++] = this.slotColors[o];
          this.colors[cv++] = this.slotColors[o + 1];
          this.colors[cv++] = this.slotColors[o + 2];
          this.colors[cv++] = ((k + e) / (tail - 1)) * 0.9;
        }
      }
    }
    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
