import { describe, expect, it } from 'vitest';
import type { TerrainGrid } from '@/types/terrain';
import { terrainGridToWorldXZ } from '@/utils/fluidWorld';
import { detectScourHoles } from '@/utils/scourHoleDetect';

function makeTerrain(width = 21, height = 21, cellSize = 0.01): TerrainGrid {
  return {
    width,
    height,
    cellSize,
    elevations: new Float32Array(width * height),
  };
}

function setDeltaAt(
  delta: Float32Array,
  terrain: TerrainGrid,
  gx: number,
  gy: number,
  value: number,
): void {
  delta[gy * terrain.width + gx] = value;
}

describe('detectScourHoles', () => {
  it('링 형태 세굴공의 중심이 링 중앙에 수렴한다', () => {
    const terrain = makeTerrain(31, 31);
    const delta = new Float32Array(terrain.width * terrain.height);
    const cx = 15;
    const cy = 15;
    const innerR = 2;
    const outerR = 5;

    for (let gy = 0; gy < terrain.height; gy += 1) {
      for (let gx = 0; gx < terrain.width; gx += 1) {
        const d = Math.hypot(gx - cx, gy - cy);
        if (d >= innerR && d <= outerR) {
          setDeltaAt(delta, terrain, gx, gy, -0.08);
        }
      }
    }

    const holes = detectScourHoles(delta, terrain, { pierDiameter: 0.1 });
    expect(holes.length).toBe(1);
    const expected = terrainGridToWorldXZ(cx, cy, terrain);
    expect(holes[0]!.x).toBeCloseTo(expected.x, 2);
    expect(holes[0]!.z).toBeCloseTo(expected.z, 2);
  });

  it('하류 퇴적 사구보다 세굴 구덩이를 선택한다', () => {
    const terrain = makeTerrain(41, 41);
    const delta = new Float32Array(terrain.width * terrain.height);

    // 세굴 구덩이 (중앙)
    for (let gy = 18; gy <= 22; gy += 1) {
      for (let gx = 18; gx <= 22; gx += 1) {
        setDeltaAt(delta, terrain, gx, gy, -0.06);
      }
    }
    // 더 큰 퇴적 사구 (하류)
    for (let gy = 19; gy <= 21; gy += 1) {
      for (let gx = 30; gx <= 34; gx += 1) {
        setDeltaAt(delta, terrain, gx, gy, +0.12);
      }
    }

    const holes = detectScourHoles(delta, terrain, { pierDiameter: 0.1 });
    expect(holes.length).toBe(1);
    const scourCenter = terrainGridToWorldXZ(20, 20, terrain);
    expect(holes[0]!.x).toBeCloseTo(scourCenter.x, 1);
    expect(holes[0]!.z).toBeCloseTo(scourCenter.z, 1);
  });

  it('분리된 세굴공 2개를 검출하고 깊은 쪽을 먼저 반환한다', () => {
    const terrain = makeTerrain(51, 51);
    const delta = new Float32Array(terrain.width * terrain.height);

    for (let gy = 10; gy <= 14; gy += 1) {
      for (let gx = 10; gx <= 14; gx += 1) {
        setDeltaAt(delta, terrain, gx, gy, -0.04);
      }
    }
    for (let gy = 35; gy <= 39; gy += 1) {
      for (let gx = 35; gx <= 39; gx += 1) {
        setDeltaAt(delta, terrain, gx, gy, -0.09);
      }
    }

    const holes = detectScourHoles(delta, terrain, { pierDiameter: 0.1, maxHoles: 3 });
    expect(holes.length).toBe(2);
    expect(holes[0]!.maxDepthM).toBeGreaterThan(holes[1]!.maxDepthM);

    const deepCenter = terrainGridToWorldXZ(37, 37, terrain);
    expect(holes[0]!.x).toBeCloseTo(deepCenter.x, 1);
    expect(holes[0]!.z).toBeCloseTo(deepCenter.z, 1);
  });

  it('세굴이 없으면 |Δ| 최대 셀로 폴백한다', () => {
    const terrain = makeTerrain(21, 21);
    const delta = new Float32Array(terrain.width * terrain.height);
    setDeltaAt(delta, terrain, 8, 12, +0.07);

    const holes = detectScourHoles(delta, terrain, { pierDiameter: 0.1 });
    expect(holes.length).toBe(1);
    const expected = terrainGridToWorldXZ(8, 12, terrain);
    expect(holes[0]!.x).toBeCloseTo(expected.x, 3);
    expect(holes[0]!.z).toBeCloseTo(expected.z, 3);
  });
});
