import { describe, expect, it } from 'vitest';
import { SyntheticFluidSource } from '@/data/SyntheticFluidSource';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import { injectScrdifFromScour } from '@/utils/injectScrdifFluid';

describe('injectScrdifFromScour', () => {
  it('지형 세굴 변화량을 유체 scrdif 스칼라에 주입한다', async () => {
    const scour = await new SyntheticScourSource({
      width: 21,
      height: 21,
      cellSize: 0.05,
      frameCount: 3,
      frameIntervalSeconds: 10,
      pier: { x: 0, z: 0 },
      pierDiameter: 0.1,
      scourRate: 4,
    }).load();
    const fluid = await new SyntheticFluidSource({
      width: 11,
      height: 6,
      depth: 11,
      cellSize: 0.1,
      frameCount: 3,
      frameIntervalSeconds: 10,
      pier: { x: 0, z: 0, radius: 0.05 },
    }).load();

    injectScrdifFromScour(fluid, scour, 0.15);

    const frame = fluid.frames.at(-1)!;
    const scrdif = frame.scalars?.scrdif;
    expect(scrdif).toBeDefined();
    const minVal = Math.min(...(scrdif ?? []));
    expect(minVal).toBeLessThan(0);
  });
});
