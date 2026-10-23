// CFD 모드 유동장 소스. 해석(FLOW-3D) 유속 u·v·w 가 데이터에 있으면 그것을 쓰고,
// 없으면 해석해 기반 합성 유동장을 쓴다. 호출 쪽은 origin 만 보고 '목업' 표시를 붙이면 된다.
//
// 좌표는 월드 규약(X=흐름, Y=연직, Z=횡단)이며 속도 성분도 같은 축이다.

import type { FluidSeries } from '@/types/fluid';
import { fluidYiAtWorldY, sampleFluidVelocityAtWorld, fluidGridOrigin } from '@/utils/fluidWorld';
import {
  effectiveRadius,
  footprintRadius,
  pushOutOfSolid,
  solidContains,
  type FlowSolidSpec,
  type SolidFootingSpec,
} from '@/data/flowSolids';

export type FlowOrigin = 'synthetic' | 'real';

export const FLOW_ORIGIN_LABEL: Record<FlowOrigin, string> = {
  synthetic: '목업(합성 유동장)',
  real: '해석 데이터',
};

export interface FlowVelocity {
  vx: number;
  vy: number;
  vz: number;
}

export interface CfdFlowSource {
  readonly origin: FlowOrigin;
  /** 점 (x,y,z) 의 시각 t 유속(m/s)을 out 에 쓴다. 고체(교각·하상 아래)·수면 위·격자 밖이면 false(out=0). */
  sample(x: number, y: number, z: number, t: number, out: FlowVelocity): boolean;
  /** (x,z) 지점 하상 전단응력(Pa). 잠정값: 합성은 τ = ρ·Cf·U_bed². */
  bedShearStress(x: number, z: number, t: number): number;
  /** 점이 교각 기둥·하단부 고체 안이면 가장 가까운 표면 밖으로 민 좌표를, 바깥이면 null 을 돌려준다. */
  resolveSolid(x: number, y: number, z: number): { x: number; y: number; z: number } | null;
}

export interface FlowPier {
  x: number;
  z: number;
  /** 기둥 반폭(= 직경/2). 사각 기둥이면 한 변의 절반 */
  radius: number;
  /** 기둥 형상. 기본 'circle' */
  shape?: 'circle' | 'square';
  /** 기둥 아래 하단부(footing) */
  footing?: SolidFootingSpec;
  /** 기둥·하단부가 시작하는 월드 높이(PierMarker 의 baseElevation). 기본 0 */
  baseY?: number;
}

export function toSolidSpec(p: FlowPier): FlowSolidSpec {
  const spec: FlowSolidSpec = {
    x: p.x,
    z: p.z,
    shape: p.shape ?? 'circle',
    half: p.radius,
    baseY: p.baseY ?? 0,
  };
  if (p.footing) spec.footing = p.footing;
  return spec;
}

function resolveAny(
  solids: FlowSolidSpec[],
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number } | null {
  let cur: { x: number; y: number; z: number } | null = null;
  // 겹친 고체(기둥↔하단부 등)가 연달아 밀릴 수 있어 몇 번 반복한다.
  for (let pass = 0; pass < 3; pass += 1) {
    let moved = false;
    for (const sol of solids) {
      const r = pushOutOfSolid(sol, cur?.x ?? x, cur?.y ?? y, cur?.z ?? z);
      if (r) {
        cur = r;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return cur;
}

export interface CfdFlowOptions {
  fluidSeries: FluidSeries;
  /** 상류 접근 유속(m/s). 해석 데이터가 없을 때 합성 유동장의 기준 */
  inflowSpeed: number;
  waterLevelY: number;
  /** 초기 하상 표고(m). 격자 밖이면 null */
  bedElevation: (x: number, z: number) => number | null;
  piers: FlowPier[];
}

const WATER_DENSITY = 1000; // kg/m^3
const BED_FRICTION_CF = 0.0035; // 잠정값 — CellDetailPopover 의 기존 추정식과 동일
const STROUHAL = 0.2; // 원기둥 후류(Re 가 큰 영역) 잠정값
const FLOW_EPS = 1e-4; // m/s
const VORTEX_COUNT = 8; // 교각마다 동시에 유지하는 후류 와류 수

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 어느 프레임에든 유의미한 u·v·w 가 하나라도 있으면 true. */
export function seriesHasVelocity(series: FluidSeries): boolean {
  for (const f of series.frames) {
    for (const arr of [f.velocityX, f.velocityY, f.velocityZ]) {
      for (let i = 0; i < arr.length; i += 1) {
        if (Math.abs(arr[i]) > FLOW_EPS) return true;
      }
    }
  }
  return false;
}

/** 해석해 기반 합성 유동장: 1/7 멱법칙 접근류 + 교각 포텐셜류 + 후류 결손 + 카르만 와류열 + 말굽와류. */
export class SyntheticCfdFlow implements CfdFlowSource {
  public readonly origin: FlowOrigin = 'synthetic';
  private readonly u0: number;
  private readonly waterLevelY: number;
  private readonly bed: (x: number, z: number) => number | null;
  private readonly solids: FlowSolidSpec[];
  /** 교각별 후류 와류 상태(시각 vortexT 기준): [x0, z0, Γ/2π·수명계수, rc²] × VORTEX_COUNT */
  private readonly vortexState: Float64Array;
  private vortexT = Number.NaN;
  /** 교각별 평면 최대 반경(기둥·하단부) — 먼 점 판별용 */
  private readonly reach: number[];
  private readonly tmp: FlowVelocity = { vx: 0, vy: 0, vz: 0 };

  public constructor(
    options: Pick<CfdFlowOptions, 'inflowSpeed' | 'waterLevelY' | 'bedElevation' | 'piers'>,
  ) {
    this.u0 = options.inflowSpeed;
    this.waterLevelY = options.waterLevelY;
    this.bed = options.bedElevation;
    this.solids = options.piers.map(toSolidSpec);
    this.vortexState = new Float64Array(this.solids.length * VORTEX_COUNT * 4);
    this.reach = this.solids.map(footprintRadius);
  }

  /** 시각 t 의 후류 와류(위치·세기·코어 크기)를 계산한다. 같은 t 로 다시 부르면 건너뛴다. */
  private prepareVortices(t: number): void {
    if (t === this.vortexT) return;
    this.vortexT = t;
    const U = this.u0;
    const vs = this.vortexState;
    vs.fill(0);
    if (!(U > 1e-6)) return;
    for (let si = 0; si < this.solids.length; si += 1) {
      const p = this.solids[si];
      const D = 2 * p.half;
      const halfT = 0.5 / ((STROUHAL * U) / D); // 한쪽에서 와류가 떨어지는 간격
      const Rw = footprintRadius(p); // 하단부가 넓으면 그 끝에서 떨어져 나간다
      const rc0 = 0.5 * p.half;
      const gamma0 = 4.92 * U * rc0;
      const kTop = Math.floor(t / halfT);
      for (let j = 0; j < VORTEX_COUNT; j += 1) {
        const kk = kTop - j;
        const age = t - kk * halfT;
        const side = ((kk % 2) + 2) % 2 === 0 ? 1 : -1;
        // 생성 직후 서서히 나타나고, 가장 오래된 와류는 서서히 사라진다(와류가 튀어 오르지 않게)
        const life =
          smoothstep(0, 0.5 * halfT, age) *
          (1 - smoothstep((VORTEX_COUNT - 1) * halfT, VORTEX_COUNT * halfT, age)) *
          Math.exp(-age / (6 * halfT));
        if (life < 1e-3) continue;
        const grow = 1 + 0.12 * (age / halfT);
        const rc = rc0 * grow;
        const o = (si * VORTEX_COUNT + j) * 4;
        vs[o] = p.x + 1.1 * Rw + 0.85 * U * age;
        vs[o + 1] = p.z + side * 0.65 * Rw * (1 + 0.05 * (age / halfT));
        vs[o + 2] = (side * gamma0 * life) / (2 * Math.PI);
        vs[o + 3] = rc * rc;
      }
    }
  }

  public resolveSolid(x: number, y: number, z: number): { x: number; y: number; z: number } | null {
    return resolveAny(this.solids, x, y, z);
  }

  public sample(x: number, y: number, z: number, t: number, out: FlowVelocity): boolean {
    out.vx = 0;
    out.vy = 0;
    out.vz = 0;
    const bed = this.bed(x, z);
    if (bed === null || y < bed || y > this.waterLevelY + 1e-9) return false;
    const h = Math.max(1e-3, this.waterLevelY - bed);
    const zeta = clamp((y - bed) / h, 0.02, 1);
    const U = this.u0;
    // 깊이 평균이 U 가 되도록 8/7 로 정규화한 1/7 멱법칙
    const prof = (8 / 7) * zeta ** (1 / 7);
    let vx = U * prof;
    let vy = 0;
    let vz = 0;

    this.prepareVortices(t);
    const vs = this.vortexState;
    const wallFade = smoothstep(0, 0.2, zeta); // 하상 부근에서는 와류가 약해진다
    for (let si = 0; si < this.solids.length; si += 1) {
      const p = this.solids[si];
      const rawDx = x - p.x;
      const rawDz = z - p.z;
      const reach = this.reach[si];
      // 교각에서 충분히 먼 점(12배 이상)은 고체·포텐셜류·말굽와류·결손의 영향이 미미하므로 건너뛰고 후류 와류만 더한다.
      const far = rawDx * rawDx + rawDz * rawDz > 144 * reach * reach;
      if (!far && solidContains(p, x, y, z)) return false; // 기둥 또는 하단부 내부(고체)
      const dx = x - p.x;
      const dz = z - p.z;
      // 이 높이에서 흐름을 막는 등가 반경(하단부 높이 이하에서는 하단부가 지배)
      const R = effectiveRadius(p, y);
      const r2 = Math.max(dx * dx + dz * dz, R * R);
      const rho = Math.sqrt(r2);
      const r4 = r2 * r2;

      // 포텐셜류 교란: 교각 옆 가속, 전면 정체
      if (!far) {
        const k = (R * R) / r4;
        vx += -U * prof * k * (dx * dx - dz * dz);
        vz += -U * prof * 2 * k * dx * dz;
      }

      // 후류: 평균 속도 결손(교각 뒤로 갈수록 회복)
      if (dx > R) {
        const sx = dx / R;
        const A = 0.35 / (1 + 0.35 * (sx - 1));
        const b = R * (1 + 0.25 * (sx - 1));
        const ramp = smoothstep(R, 1.5 * R, dx);
        vx -= U * prof * A * Math.exp(-((dz / b) ** 2)) * ramp;
      }

      // 카르만 와류열: 교각 좌우에서 번갈아 떨어져 나온 연직축 와류가 하류로 흘러가며 퍼지고 약해진다.
      // 와류는 Lamb-Oseen 속도장이라 입자가 실제로 소용돌이를 돌며 흘러간다.
      // +Z 쪽 와류는 Γ>0 (중심선 쪽으로 역류를 만들어 재순환 영역이 생긴다), −Z 쪽은 반대 방향.
      // 와류 상태는 t 에만 의존하므로 시각마다 한 번만 계산해 둔다(prepareVortices).
      const base = si * VORTEX_COUNT * 4;
      for (let j = 0; j < VORTEX_COUNT; j += 1) {
        const o = base + j * 4;
        const g2pi = vs[o + 2];
        if (g2pi === 0) continue;
        const ex = x - vs[o];
        const ez = z - vs[o + 1];
        const e2 = ex * ex + ez * ez + 1e-12;
        const rc2 = vs[o + 3];
        // 코어(3rc) 밖에서는 1−exp(−9)≈1 이라 지수함수를 생략한다.
        const core = e2 > 9 * rc2 ? 1 : 1 - Math.exp(-e2 / rc2);
        const swirl = (g2pi * wallFade * core) / e2;
        vx += swirl * ez;
        vz -= swirl * ex;
      }

      // 말굽와류: 교각 전면 하상 근처, (반경 ρ, 연직 y) 평면의 Lamb-Oseen 와류. 안쪽 하강류·하상 부근 외향류.
      const upstream = far ? 0 : smoothstep(-0.2, 0.8, -dx / rho);
      if (upstream > 0) {
        const rc = 0.45 * R;
        const a = rho - 1.5 * R;
        const bb = y - (bed + Math.min(0.12 * h, 1.2 * R));
        const d2 = a * a + bb * bb + 1e-12;
        const gamma = 4.92 * U * rc;
        const omega = (gamma / (2 * Math.PI * d2)) * (1 - Math.exp(-d2 / (rc * rc))) * upstream;
        const vRho = -omega * bb;
        vy += omega * a;
        vx += (vRho * dx) / rho;
        vz += (vRho * dz) / rho;
      }
    }

    out.vx = vx;
    out.vy = vy;
    out.vz = vz;
    return true;
  }

  public bedShearStress(x: number, z: number, t: number): number {
    const bed = this.bed(x, z);
    if (bed === null) return 0;
    const h = Math.max(1e-3, this.waterLevelY - bed);
    if (!this.sample(x, bed + 0.05 * h, z, t, this.tmp)) return 0;
    const sp2 = this.tmp.vx * this.tmp.vx + this.tmp.vz * this.tmp.vz;
    return WATER_DENSITY * BED_FRICTION_CF * sp2;
  }
}

/** 해석 격자(FluidSeries)의 u·v·w 를 삼선형 보간해 쓰는 실데이터 유동장. */
export class SeriesCfdFlow implements CfdFlowSource {
  public readonly origin: FlowOrigin = 'real';
  private readonly series: FluidSeries;
  private readonly bed: (x: number, z: number) => number | null;
  private lastIdx = 0;

  private readonly solids: FlowSolidSpec[];

  public constructor(
    series: FluidSeries,
    bedElevation: (x: number, z: number) => number | null,
    piers: FlowPier[] = [],
  ) {
    this.series = series;
    this.bed = bedElevation;
    this.solids = piers.map(toSolidSpec);
  }

  public resolveSolid(x: number, y: number, z: number): { x: number; y: number; z: number } | null {
    return resolveAny(this.solids, x, y, z);
  }

  private frameAt(t: number): number {
    const frames = this.series.frames;
    let i = this.lastIdx < frames.length ? this.lastIdx : 0;
    if (frames[i].timestampSeconds > t) i = 0;
    while (i + 1 < frames.length && frames[i + 1].timestampSeconds <= t) i += 1;
    this.lastIdx = i;
    return i;
  }

  public sample(x: number, y: number, z: number, t: number, out: FlowVelocity): boolean {
    out.vx = 0;
    out.vy = 0;
    out.vz = 0;
    if (this.series.frames.length === 0) return false;
    const bed = this.bed(x, z);
    if (bed !== null && y < bed) return false;
    const v = sampleFluidVelocityAtWorld(
      this.series.grid,
      this.series.frames[this.frameAt(t)],
      x,
      y,
      z,
    );
    if (!v) return false;
    out.vx = v.vx;
    out.vy = v.vy;
    out.vz = v.vz;
    return true;
  }

  public bedShearStress(x: number, z: number, t: number): number {
    if (this.series.frames.length === 0) return 0;
    const frame = this.series.frames[this.frameAt(t)];
    const grid = this.series.grid;
    const o = fluidGridOrigin(grid);
    const cs = grid.cellSize;
    const xi = Math.round((x - o.x) / cs);
    const zi = Math.round((z - o.z) / cs);
    if (xi < 0 || zi < 0 || xi >= grid.width || zi >= grid.depth) return 0;
    const bed = this.bed(x, z) ?? o.y;
    const yi = fluidYiAtWorldY(grid, bed + cs);
    const idx = xi + yi * grid.width + zi * grid.width * grid.height;
    const shrvel = frame.scalars?.['shrvel']?.[idx];
    if (shrvel !== undefined) return WATER_DENSITY * shrvel * shrvel; // τ = ρ·u*²
    const vx = frame.velocityX[idx] ?? 0;
    const vz = frame.velocityZ[idx] ?? 0;
    return WATER_DENSITY * BED_FRICTION_CF * (vx * vx + vz * vz);
  }
}

export interface FlowBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** 유동장 속력의 대략적 최대값(색 범위용). 영역을 성기게 훑어 한 번만 계산한다. */
export function estimateSpeedMax(
  flow: CfdFlowSource,
  bounds: FlowBounds,
  bedAt: (x: number, z: number) => number | null,
  waterLevelY: number,
  t = 0,
): number {
  const v: FlowVelocity = { vx: 0, vy: 0, vz: 0 };
  let max = 0;
  const NX = 32;
  const NZ = 16;
  const NY = 4;
  for (let i = 0; i < NX; i += 1) {
    for (let k = 0; k < NZ; k += 1) {
      const x = bounds.minX + ((i + 0.5) / NX) * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + ((k + 0.5) / NZ) * (bounds.maxZ - bounds.minZ);
      const bed = bedAt(x, z);
      if (bed === null) continue;
      for (let j = 0; j < NY; j += 1) {
        const y = bed + ((j + 0.5) / NY) * Math.max(1e-3, waterLevelY - bed);
        if (!flow.sample(x, y, z, t, v)) continue;
        max = Math.max(max, Math.hypot(v.vx, v.vy, v.vz));
      }
    }
  }
  return max > 1e-6 ? max : 1;
}

/** 해석 유속이 있으면 실데이터, 없으면 합성 유동장. 실제 u·v·w 가 들어오면 자동으로 전환된다. */
export function createCfdFlowField(options: CfdFlowOptions): CfdFlowSource {
  if (seriesHasVelocity(options.fluidSeries)) {
    return new SeriesCfdFlow(options.fluidSeries, options.bedElevation, options.piers);
  }
  return new SyntheticCfdFlow(options);
}
