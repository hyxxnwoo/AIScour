import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { FLUME } from '@/constants/experiment';
import { SyntheticFluidSource } from '@/data/SyntheticFluidSource';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import { TerrainWater } from '@/modules/TerrainWater';
import { waterSurfaceElevation } from '@/utils/fluidWorld';

describe('TerrainWater', () => {
  it('고정 수심으로 지형 전체에 수면 메쉬를 추가한다', async () => {
    const scour = await new SyntheticScourSource({
      width: 21,
      height: 21,
      cellSize: 1,
      frameCount: 2,
    }).load();
    const fluid = await new SyntheticFluidSource({
      width: 21,
      height: 8,
      depth: 21,
      cellSize: 1,
      frameCount: 2,
    }).load();

    const waterLevel = waterSurfaceElevation(scour.baseTerrain, FLUME.waterDepthM);
    const cx = Math.floor(scour.baseTerrain.width / 2);
    const cy = Math.floor(scour.baseTerrain.height / 2);
    const bedCenter = scour.baseTerrain.elevations[cy * scour.baseTerrain.width + cx];
    expect(waterLevel).toBeGreaterThan(bedCenter);

    const scene = new Scene();
    const water = new TerrainWater({
      scene,
      scourSeries: scour,
      fluidSeries: fluid,
      waterLevel,
    });

    expect(scene.children).toHaveLength(2);
    water.updateAtTime(0);
    expect(water.currentRangeForLegend.max).toBeGreaterThanOrEqual(water.currentRangeForLegend.min);

    const fillMesh = scene.children.find(
      (c) => c !== scene.children[0] && 'scale' in c,
    ) as { scale: { y: number } } | undefined;
    const fillHeightAtStart = fillMesh?.scale.y ?? 0;
    water.updateAtTime(scour.frames.at(-1)!.timestampSeconds);
    const fillHeightAtEnd = fillMesh?.scale.y ?? 0;
    expect(fillHeightAtEnd).toBeCloseTo(fillHeightAtStart, 5);

    water.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('CSV 유체 격자가 작아도 고정 수심 수면은 지형 전체에 표시된다', async () => {
    const scour = await new SyntheticScourSource({
      width: 21,
      height: 21,
      cellSize: 1,
      frameCount: 1,
    }).load();
    const fluid = await new SyntheticFluidSource({
      width: 3,
      height: 2,
      depth: 1,
      cellSize: 1,
      frameCount: 1,
    }).load();
    fluid.frames[0]!.velocityX[0] = 1;
    fluid.frames[0]!.velocityY[0] = 2;
    fluid.frames[0]!.velocityZ[0] = 3;

    const waterLevel = waterSurfaceElevation(scour.baseTerrain, FLUME.waterDepthM);
    const scene = new Scene();
    const water = new TerrainWater({
      scene,
      scourSeries: scour,
      fluidSeries: fluid,
      waterLevel,
    });
    water.updateAtTime(0);
    water.setVisible(true);

    const surface = scene.children[0] as { visible: boolean };
    expect(surface.visible).toBe(true);

    water.dispose();
  });

  it('유체 필드가 전부 0이어도 고정 수심 수면은 표시된다', async () => {
    const scour = await new SyntheticScourSource({
      width: 21,
      height: 21,
      cellSize: 1,
      frameCount: 1,
    }).load();
    const fluid = await new SyntheticFluidSource({
      width: 3,
      height: 2,
      depth: 1,
      cellSize: 1,
      frameCount: 1,
      inflowSpeed: 0,
    }).load();

    const waterLevel = waterSurfaceElevation(scour.baseTerrain, FLUME.waterDepthM);
    const scene = new Scene();
    const water = new TerrainWater({
      scene,
      scourSeries: scour,
      fluidSeries: fluid,
      waterLevel,
    });
    water.updateAtTime(0);
    water.setVisible(true);

    const surface = scene.children[0] as { visible: boolean };
    expect(surface.visible).toBe(true);

    water.dispose();
  });
});
