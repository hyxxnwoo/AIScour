import { describe, expect, it } from 'vitest';
import { structureCenterX } from '@/constants/experiment';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import type { ScourSeries } from '@/types/terrain';
import { pierScourDepths, pierScourRatios } from '@/utils/pierScourSample';

describe('pierScourRatios', () => {
  it('세굴이 진행될수록 교각 주변 비율이 커진다', async () => {
    const pierX = structureCenterX();
    const series = await new SyntheticScourSource({
      frameCount: 10,
      frameIntervalSeconds: 30,
      pier: { x: pierX, z: 0 },
    }).load();
    const piers = [{ id: 'P1', x: pierX, z: 0, diameter: 0.1, height: 0.5 }];
    const early = pierScourRatios(series, piers, 0, 0.12)[0]!.ratio;
    const late = pierScourRatios(series, piers, 270, 0.12)[0]!.ratio;
    expect(late).toBeGreaterThan(early);
  });

  it('scourSearchRadius 가 있으면 교각 발 밖의 세굴 최대점까지 포함한다', () => {
    const width = 41;
    const height = 41;
    const cellSize = 0.01;
    const delta = new Float32Array(width * height);
    // 교각(중심 gx=20,gy=20)에서 0.09 m 떨어진 곳에 -0.02 m 세굴
    delta[20 * width + 29] = -0.02;
    const series: ScourSeries = {
      baseTerrain: { width, height, cellSize, elevations: new Float32Array(width * height) },
      frames: [{ timestampSeconds: 0, deltaElevations: delta }],
    };
    const narrow = { id: 'P1', x: 0, z: 0, diameter: 0.0625 };
    const wide = { ...narrow, scourSearchRadius: 0.125 };

    expect(pierScourDepths(series, [narrow], 0)[0]!.scourDepthM).toBe(0);
    expect(pierScourDepths(series, [wide], 0)[0]!.scourDepthM).toBeCloseTo(0.02, 6);
  });
});
