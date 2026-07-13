import { describe, expect, it } from 'vitest';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import { structureCenterX } from '@/constants/experiment';

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

  it('마지막 프레임에서 교각 상류가 하류 원거리보다 더 깊이 파인다', async () => {
    const width = 41;
    const height = 21;
    const cellSize = 0.02;
    const source = new SyntheticScourSource({
      width,
      height,
      cellSize,
      frameCount: 8,
      pier: { x: 0, z: 0 },
      pierDiameter: 0.1,
    });
    const series = await source.load();
    const last = series.frames.at(-1)!;
    const cx = Math.round(((width - 1) * cellSize) / 2 / cellSize);
    const cy = Math.floor(height / 2);
    const upstreamIdx = cy * width + Math.max(0, cx - 4);
    const downstreamIdx = cy * width + Math.min(width - 1, cx + 12);
    expect(last.deltaElevations[upstreamIdx]).toBeLessThan(0);
    expect(last.deltaElevations[upstreamIdx]).toBeLessThan(last.deltaElevations[downstreamIdx]);
  });

  it('투과 구조물은 불투과 대비 세굴 깊이가 얕다', async () => {
    const width = 21;
    const baseOpts = {
      width,
      height: 21,
      cellSize: 0.05,
      frameCount: 5,
      pier: { x: 0, z: 0 },
      pierDiameter: 0.1,
    };
    const impermeable = await new SyntheticScourSource(baseOpts).load();
    const permeable = await new SyntheticScourSource({ ...baseOpts, permeable: true }).load();
    const cx = Math.round(((width - 1) * baseOpts.cellSize) / 2 / baseOpts.cellSize);
    const cy = 10;
    const sampleIdx = cy * width + Math.max(0, cx - 2);
    const impermeableDepth = impermeable.frames.at(-1)!.deltaElevations[sampleIdx];
    const permeableDepth = permeable.frames.at(-1)!.deltaElevations[sampleIdx];
    expect(impermeableDepth).toBeLessThan(0);
    expect(permeableDepth).toBeLessThan(0);
    expect(Math.abs(permeableDepth)).toBeLessThan(Math.abs(impermeableDepth));
  });

  it('structureCenterX 기본값은 입구 전방 구간을 반영한다', () => {
    expect(structureCenterX()).toBeCloseTo(-1.116 / 2 + 0.1, 5);
  });
});
