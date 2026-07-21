import { describe, expect, it } from 'vitest';
import { structureCenterX } from '@/constants/experiment';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import { pierScourRatios } from '@/utils/pierScourSample';

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
});
