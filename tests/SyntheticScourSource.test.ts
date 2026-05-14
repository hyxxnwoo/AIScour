import { describe, expect, it } from 'vitest';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';

describe('SyntheticScourSource', () => {
  it('지정한 격자 크기와 프레임 수의 데이터를 생성한다', async () => {
    const source = new SyntheticScourSource({
      width: 16,
      height: 16,
      frameCount: 10,
      frameIntervalSeconds: 2,
    });
    const series = await source.load();
    expect(series.baseTerrain.width).toBe(16);
    expect(series.baseTerrain.height).toBe(16);
    expect(series.baseTerrain.elevations.length).toBe(16 * 16);
    expect(series.frames).toHaveLength(10);
    expect(series.frames[0]?.timestampSeconds).toBe(0);
    expect(series.frames.at(-1)?.timestampSeconds).toBe(18);
  });

  it('마지막 프레임의 중앙에서 가장 깊은 세굴이 발생한다', async () => {
    const source = new SyntheticScourSource({ width: 21, height: 21, frameCount: 5 });
    const series = await source.load();
    const last = series.frames.at(-1);
    expect(last).toBeDefined();
    const cx = 10;
    const cy = 10;
    const center = last!.deltaElevations[cy * 21 + cx];
    const corner = last!.deltaElevations[0];
    expect(center).toBeLessThan(0);
    expect(center).toBeLessThan(corner);
  });
});
