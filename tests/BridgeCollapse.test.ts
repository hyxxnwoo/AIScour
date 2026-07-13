import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import { BridgeCollapse } from '@/modules/BridgeCollapse';

describe('BridgeCollapse', () => {
  it('타임라인 되감기 시 붕괴 이전 자세·세굴 상태로 복원한다', async () => {
    const series = await new SyntheticScourSource({
      width: 21,
      height: 21,
      cellSize: 0.05,
      frameCount: 20,
      frameIntervalSeconds: 10,
      pier: { x: 0, z: 0 },
      pierDiameter: 0.1,
      scourRate: 5,
      criticalScourDepth: 0.05,
    }).load();

    const scene = new Scene();
    const collapse = new BridgeCollapse({
      scene,
      series,
      piers: [{ id: 'P1', x: 0, z: 0, diameter: 0.1, height: 0.5 }],
      criticalScourDepth: 0.05,
    });

    const endT = series.frames.at(-1)!.timestampSeconds;
    collapse.updateAtTime(endT);
    expect(collapse.isAnyPierCollapsedAt(endT)).toBe(true);

    collapse.updateAtTime(0);
    expect(collapse.isAnyPierCollapsedAt(0)).toBe(false);
    expect(collapse.getScourRatios(0)[0]?.collapsed).toBe(false);

    collapse.dispose();
  });
});
