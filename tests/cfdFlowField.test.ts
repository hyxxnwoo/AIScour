import { describe, expect, it } from 'vitest';
import {
  FLOW_ORIGIN_LABEL,
  SeriesCfdFlow,
  SyntheticCfdFlow,
  createCfdFlowField,
  seriesHasVelocity,
  type FlowVelocity,
} from '@/data/cfdFlowField';
import type { FluidSeries } from '@/types/fluid';

const bed = (): number => 0;
const R = 0.05;
const synth = (): SyntheticCfdFlow =>
  new SyntheticCfdFlow({
    inflowSpeed: 0.25,
    waterLevelY: 0.15,
    bedElevation: bed,
    piers: [{ x: 0, z: 0, radius: R }],
  });

function zeroSeries(): FluidSeries {
  const n = 2 * 2 * 2;
  const z = (): Float32Array => new Float32Array(n);
  return {
    grid: { width: 2, height: 2, depth: 2, cellSize: 0.1 },
    frames: [{ timestampSeconds: 0, velocityX: z(), velocityY: z(), velocityZ: z(), pressure: z(), density: z() }],
  };
}

describe('합성 CFD 유동장', () => {
  const v: FlowVelocity = { vx: 0, vy: 0, vz: 0 };

  it('교각 내부·하상 아래·수면 위는 유효하지 않다', () => {
    const f = synth();
    expect(f.sample(0.01, 0.07, 0, 0, v)).toBe(false);
    expect(f.sample(-1, -0.01, 0, 0, v)).toBe(false);
    expect(f.sample(-1, 0.2, 0, 0, v)).toBe(false);
  });

  it('멀리 떨어진 상류는 접근류 U 에 가깝고 +x 방향이다', () => {
    const f = synth();
    expect(f.sample(-5, 0.075, 0.5, 0, v)).toBe(true);
    expect(v.vx).toBeGreaterThan(0.2);
    expect(v.vx).toBeLessThan(0.35);
    expect(Math.abs(v.vz)).toBeLessThan(0.01);
  });

  it('교각 바로 뒤 후류는 같은 높이 상류보다 느리다', () => {
    const f = synth();
    f.sample(3 * R, 0.1, 0, 0, v);
    const wake = v.vx;
    f.sample(-5, 0.1, 0, 0, v);
    expect(wake).toBeLessThan(v.vx * 0.8);
  });

  it('교각 옆에서는 가속되고, 후류 횡속도는 시간에 따라 부호가 바뀐다', () => {
    const f = synth();
    f.sample(0, 0.1, 1.3 * R, 0, v);
    const side = v.vx;
    f.sample(-5, 0.1, 0, 0, v);
    expect(side).toBeGreaterThan(v.vx);
    const signs = new Set<number>();
    for (let t = 0; t < 3; t += 0.05) {
      f.sample(4 * R, 0.1, 0, t, v);
      signs.add(Math.sign(v.vz));
    }
    expect(signs.has(1) && signs.has(-1)).toBe(true);
  });

  it('말굽와류: 교각 전면 하상 근처에 하강류가 생긴다', () => {
    const f = synth();
    let minVy = 0;
    for (let rr = 1.1; rr < 2.2; rr += 0.1) {
      for (let y = 0.003; y < 0.04; y += 0.003) {
        if (f.sample(-rr * R, y, 0, 0, v)) minVy = Math.min(minVy, v.vy);
      }
    }
    expect(minVy).toBeLessThan(-0.02);
  });

  it('하상 전단응력은 양수이고 교각 안쪽은 0', () => {
    const f = synth();
    expect(f.bedShearStress(-5, 0.5, 0)).toBeGreaterThan(0);
    expect(f.bedShearStress(0, 0, 0)).toBe(0);
  });
});

describe('실데이터 자동 전환', () => {
  it('유속이 전부 0 이면 합성(목업), 값이 들어오면 실데이터를 쓴다', () => {
    const opt = {
      inflowSpeed: 0.25,
      waterLevelY: 0.15,
      bedElevation: bed,
      piers: [],
    };
    const empty = zeroSeries();
    expect(seriesHasVelocity(empty)).toBe(false);
    const a = createCfdFlowField({ ...opt, fluidSeries: empty });
    expect(a.origin).toBe('synthetic');

    const real = zeroSeries();
    real.frames[0].velocityX.fill(0.4);
    expect(seriesHasVelocity(real)).toBe(true);
    const b = createCfdFlowField({ ...opt, fluidSeries: real });
    expect(b).toBeInstanceOf(SeriesCfdFlow);
    expect(b.origin).toBe('real');
    const v: FlowVelocity = { vx: 0, vy: 0, vz: 0 };
    expect(b.sample(0, 0.05, 0, 0, v)).toBe(true);
    expect(v.vx).toBeCloseTo(0.4, 5);
    expect(FLOW_ORIGIN_LABEL.synthetic).toContain('목업');
  });
});

describe('카르만 와류열(후류 와류)', () => {
  const U = 0.25;
  const Rp = 0.05;
  const f = new SyntheticCfdFlow({
    inflowSpeed: U,
    waterLevelY: 0.15,
    bedElevation: () => 0,
    piers: [{ x: 0, z: 0, radius: Rp }],
  });
  const halfT = 0.5 / ((0.2 * U) / (2 * Rp)); // 한쪽 와류 생성 간격(s)
  const v: FlowVelocity = { vx: 0, vy: 0, vz: 0 };

  // 와류 중심 주변 닫힌 경로의 순환(∮u·dl). +y 축 기준 양의 회전: z → x 방향.
  function circulation(cx: number, cz: number, t: number, rad: number): number {
    const N = 96;
    let sum = 0;
    for (let i = 0; i < N; i += 1) {
      const phi = (i / N) * 2 * Math.PI;
      const phi2 = ((i + 1) / N) * 2 * Math.PI;
      const mid = (phi + phi2) / 2;
      f.sample(cx + rad * Math.sin(mid), 0.08, cz + rad * Math.cos(mid), t, v);
      // 접선 d(l) = (dx, dz) = rad·(cos φ, −sin φ)·dφ
      const dphi = phi2 - phi;
      sum += (v.vx * Math.cos(mid) - v.vz * Math.sin(mid)) * rad * dphi;
    }
    return sum;
  }

  it('좌우에서 번갈아 떨어진 와류는 서로 반대 방향으로 돌고 하류로 이동한다', () => {
    const t = 3 * halfT + 0.01; // k=2(+Z 쪽, 나이 ≈1 halfT), k=1(−Z 쪽, 나이 ≈2 halfT)
    const conv = 0.85 * U;
    const xOf = (age: number): number => 1.1 * Rp + conv * age;
    const zOf = (side: number, age: number): number => side * 0.65 * Rp * (1 + 0.05 * (age / halfT));
    const gPlus = circulation(xOf(halfT), zOf(1, halfT), t, 0.02);
    const gMinus = circulation(xOf(2 * halfT), zOf(-1, 2 * halfT), t, 0.02);
    expect(gPlus).toBeGreaterThan(0.002);
    expect(gMinus).toBeLessThan(-0.002);
  });

  it('와류는 시간이 지나면 하류로 이동해 같은 위치의 회전이 바뀐다', () => {
    const t0 = 3 * halfT + 0.01;
    const here = circulation(1.1 * Rp + 0.85 * U * halfT, 0.65 * Rp * 1.05, t0, 0.02);
    const later = circulation(1.1 * Rp + 0.85 * U * halfT, 0.65 * Rp * 1.05, t0 + 1.5 * halfT, 0.02);
    expect(Math.abs(later)).toBeLessThan(Math.abs(here));
  });

  it('후류 영역의 속도는 와류 때문에 접근류보다 비균일하다(재순환 포함)', () => {
    let minVx = Infinity;
    for (let t = 0; t < 4 * halfT; t += 0.1) {
      for (let x = 0.07; x < 0.4; x += 0.02) {
        f.sample(x, 0.08, 0, t, v);
        minVx = Math.min(minVx, v.vx);
      }
    }
    expect(minVx).toBeLessThan(0.05); // 중심선 부근에서 속도가 크게 떨어지거나 역류
  });
});
