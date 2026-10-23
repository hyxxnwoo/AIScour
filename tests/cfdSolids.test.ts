import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import {
  effectiveRadius,
  footprintRadius,
  pushOutOfSolid,
  solidContains,
  type FlowSolidSpec,
} from '@/data/flowSolids';
import { SyntheticCfdFlow, type FlowPier } from '@/data/cfdFlowField';
import { CfdPathlines } from '@/modules/CfdPathlines';

const round: FlowSolidSpec = {
  x: 0,
  z: 0,
  shape: 'circle',
  half: 0.05,
  baseY: 0,
  footing: { shape: 'circle', lengthX: 0.2, widthZ: 0.2, height: 0.04 },
};
const square: FlowSolidSpec = {
  x: 0,
  z: 0,
  shape: 'square',
  half: 0.05,
  baseY: 0,
  footing: { shape: 'rectangle', lengthX: 0.24, widthZ: 0.16, height: 0.04 },
};

describe('flowSolids', () => {
  it('하단부는 기둥보다 넓고 높이 안에서만 고체이다', () => {
    expect(solidContains(round, 0.08, 0.02, 0)).toBe(true); // 기둥 밖, 하단부 안
    expect(solidContains(round, 0.08, 0.06, 0)).toBe(false); // 하단부 위
    expect(solidContains(round, 0.02, 0.1, 0)).toBe(true); // 기둥 안(높은 곳)
    expect(solidContains(round, 0.11, 0.02, 0)).toBe(false); // 하단부 밖
  });

  it('사각 기둥의 모서리 영역도 고체로 본다(원으로 근사하면 놓친다)', () => {
    expect(solidContains(square, 0.048, 0.1, 0.048)).toBe(true);
    expect(solidContains({ ...square, shape: 'circle' }, 0.048, 0.1, 0.048)).toBe(false);
  });

  it('고체 안의 점은 표면 밖으로 밀려나고, 밖의 점은 null 이다', () => {
    expect(pushOutOfSolid(round, 0.3, 0.02, 0)).toBeNull();
    for (const [x, y, z] of [
      [0.08, 0.02, 0],
      [0.0, 0.1, 0.03],
      [0.04, 0.035, 0.04],
      [0.11, 0.02, 0.0],
    ] as const) {
      const r = pushOutOfSolid(square, x, y, z);
      if (solidContains(square, x, y, z)) {
        expect(r).not.toBeNull();
        expect(solidContains(square, r!.x, r!.y, r!.z)).toBe(false);
      }
    }
  });

  it('하단부 윗면 가까이에서는 위로 올라타고, 기둥 안에서는 수평으로 밀린다', () => {
    const up = pushOutOfSolid(round, 0.09, 0.039, 0)!; // 기둥 밖, 하단부 윗면 바로 아래
    expect(up.y).toBeGreaterThan(0.04);
    expect(up.x).toBeCloseTo(0.09, 6);
    const side = pushOutOfSolid(round, 0.02, 0.039, 0)!; // 기둥 안
    expect(Math.hypot(side.x, side.z)).toBeGreaterThanOrEqual(0.05);
  });

  it('등가 반경은 하단부 높이 이하에서 커진다', () => {
    expect(effectiveRadius(round, 0.02)).toBeCloseTo(0.1, 6);
    expect(effectiveRadius(round, 0.1)).toBeCloseTo(0.05, 6);
    expect(footprintRadius(square)).toBeCloseTo(Math.hypot(0.24, 0.16) / 2, 6);
  });
});

describe('유선이 기둥·하단부를 통과하지 않는다', () => {
  const bounds = { minX: -0.8, maxX: 0.8, minZ: -0.4, maxZ: 0.4 };
  const bed = (): number => 0;

  function run(pier: FlowPier, spec: FlowSolidSpec): void {
    const flow = new SyntheticCfdFlow({
      inflowSpeed: 0.3,
      waterLevelY: 0.15,
      bedElevation: bed,
      piers: [pier],
    });
    // 하단부 내부는 유동장이 비어 있어야 한다
    const v = { vx: 0, vy: 0, vz: 0 };
    expect(flow.sample(spec.x + 0.08, 0.02, spec.z, 0, v)).toBe(false);

    const scene = new Scene();
    let s = 11;
    const rnd = (): number => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
    const p = new CfdPathlines({
      scene,
      flow,
      bounds,
      bedAt: bed,
      waterLevelY: 0.15,
      piers: [pier],
      speedMax: 0.5,
      count: 300,
      tail: 6,
      random: rnd,
    });
    let inside = 0;
    const geom = (scene.children[0] as unknown as {
      geometry: { getAttribute: (n: string) => { array: Float32Array } };
    }).geometry;
    for (let f = 0; f < 300; f += 1) {
      p.update(f * 0.03, 1 / 60);
      const arr = geom.getAttribute('position').array;
      for (let i = 0; i < arr.length; i += 3) {
        if (solidContains(spec, arr[i], arr[i + 1], arr[i + 2])) inside += 1;
      }
    }
    expect(inside).toBe(0);
    p.dispose();
  }

  it('원형 기둥 + 원형 하단부', () => {
    run(
      { x: 0, z: 0, radius: 0.05, shape: 'circle', footing: round.footing!, baseY: 0 },
      round,
    );
  });

  it('사각 기둥 + 직사각 하단부', () => {
    run(
      { x: 0, z: 0, radius: 0.05, shape: 'square', footing: square.footing!, baseY: 0 },
      square,
    );
  });
});
