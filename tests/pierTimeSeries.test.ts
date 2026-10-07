import { describe, expect, it } from 'vitest';
import { structureCenterX } from '@/constants/experiment';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import {
  buildPierDepthSeries,
  computePierReachTimes,
  depthAtTime,
  describeNextGradeEta,
  firstTimeDepthReached,
} from '@/utils/pierTimeSeries';

describe('pierTimeSeries', () => {
  it('firstTimeDepthReached finds crossing', () => {
    expect(firstTimeDepthReached([0, 10, 20], [0.01, 0.05, 0.2], 0.04)).toBe(10);
    expect(firstTimeDepthReached([0, 10], [0.01, 0.02], 0.5)).toBeNull();
  });

  it('depthAtTime interpolates', () => {
    const ps = { pierId: 'P1', times: [0, 10], depths: [0, 1] };
    expect(depthAtTime(ps, 5)).toBeCloseTo(0.5);
    expect(describeNextGradeEta(ps, 0, 0.01, 5.2)).toMatch(/주의|도달|최고/);
  });

  it('buildPierDepthSeries grows with time', async () => {
    const pierX = structureCenterX();
    const series = await new SyntheticScourSource({
      frameCount: 8,
      frameIntervalSeconds: 30,
      pier: { x: pierX, z: 0 },
    }).load();
    const piers = [{ id: 'P1', x: pierX, z: 0, diameter: 0.1, height: 0.5, shape: 'circle' as const }];
    const built = buildPierDepthSeries(series, piers, 0.127)[0]!;
    expect(built.depths.at(-1)).toBeGreaterThanOrEqual(built.depths[0] ?? 0);
    const reach = computePierReachTimes(built, 0.127);
    expect(reach.pierId).toBe('P1');
  });
});
