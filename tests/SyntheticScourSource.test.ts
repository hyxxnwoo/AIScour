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

  it('metadata.piers 개수는 piers 옵션과 일치한다', async () => {
    const source = new SyntheticScourSource({
      width: 21,
      height: 21,
      cellSize: 0.05,
      frameCount: 4,
      piers: [
        { id: 'P1', x: -0.2, z: -0.15 },
        { id: 'P2', x: -0.2, z: 0 },
        { id: 'P3', x: -0.2, z: 0.15 },
      ],
    });
    const series = await source.load();
    expect(series.baseTerrain.metadata?.piers).toHaveLength(3);
    expect(series.baseTerrain.metadata?.piers?.map((p) => p.id)).toEqual(['P1', 'P2', 'P3']);
  });

  it('다중 기둥은 각 위치에서 세굴 구멍을 만든다', async () => {
    const width = 41;
    const height = 41;
    const cellSize = 0.02;
    const pierZ = 0.12;
    const source = new SyntheticScourSource({
      width,
      height,
      cellSize,
      frameCount: 8,
      pierDiameter: 0.1,
      piers: [
        { x: 0, z: -pierZ },
        { x: 0, z: pierZ },
      ],
    });
    const series = await source.load();
    const last = series.frames.at(-1)!;
    const halfW = ((width - 1) * cellSize) / 2;
    const halfH = ((height - 1) * cellSize) / 2;

    const sampleNearPier = (pierX: number, pierZ: number): number => {
      const worldX = pierX - 0.08;
      const gx = Math.round((worldX + halfW) / cellSize);
      const gz = Math.round((pierZ + halfH) / cellSize);
      return last.deltaElevations[gz * width + gx]!;
    };

    expect(sampleNearPier(0, -pierZ)).toBeLessThan(-0.001);
    expect(sampleNearPier(0, pierZ)).toBeLessThan(-0.001);
    expect(sampleNearPier(0, 0)).toBeGreaterThanOrEqual(sampleNearPier(0, -pierZ));
  });
});
