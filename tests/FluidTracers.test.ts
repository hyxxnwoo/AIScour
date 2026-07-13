import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { SyntheticFluidSource } from '@/data/SyntheticFluidSource';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import { FluidTracers } from '@/modules/FluidTracers';
import { defaultFluidSliceHeight } from '@/utils/fluidWorld';

describe('FluidTracers', () => {
  it('유속장에 따라 입자 위치가 변한다', async () => {
    const scour = await new SyntheticScourSource({
      width: 21,
      height: 21,
      cellSize: 0.05,
      frameCount: 2,
    }).load();
    const fluid = await new SyntheticFluidSource({
      width: 21,
      height: 8,
      depth: 21,
      cellSize: 0.05,
      frameCount: 2,
      inflowSpeed: 0.4,
    }).load();
    const waterLevel = defaultFluidSliceHeight(fluid, scour.baseTerrain);

    const scene = new Scene();
    const tracers = new FluidTracers({
      scene,
      fluidSeries: fluid,
      scourSeries: scour,
      waterLevel,
      particleCount: 40,
    });

    tracers.updateAtTime(0);
    const before = (scene.children[0] as { geometry: { attributes: { position: { array: Float32Array } } } })
      .geometry.attributes.position.array.slice();

    for (let i = 0; i < 30; i += 1) {
      tracers.tick(1 / 30);
    }

    const after = (scene.children[0] as { geometry: { attributes: { position: { array: Float32Array } } } })
      .geometry.attributes.position.array;

    let moved = 0;
    for (let i = 0; i < before.length; i += 3) {
      if (Math.hypot(after[i] - before[i], after[i + 2] - before[i + 2]) > 1e-4) moved += 1;
    }
    expect(moved).toBeGreaterThan(5);

    tracers.dispose();
  });

  it('속도가 전부 0이면 입자 메쉬를 숨긴다', async () => {
    const scour = await new SyntheticScourSource({
      width: 21,
      height: 21,
      cellSize: 0.05,
      frameCount: 1,
    }).load();
    const fluid = await new SyntheticFluidSource({
      width: 21,
      height: 8,
      depth: 21,
      cellSize: 0.05,
      frameCount: 1,
      inflowSpeed: 0,
      fluidW: 0,
    }).load();
    for (const frame of fluid.frames) {
      frame.velocityX.fill(0);
      frame.velocityY.fill(0);
      frame.velocityZ.fill(0);
    }
    const waterLevel = defaultFluidSliceHeight(fluid, scour.baseTerrain);

    const scene = new Scene();
    const tracers = new FluidTracers({
      scene,
      fluidSeries: fluid,
      scourSeries: scour,
      waterLevel,
      particleCount: 20,
    });

    const mesh = scene.children[0] as { visible: boolean };
    expect(mesh.visible).toBe(false);

    tracers.setVisible(true);
    expect(mesh.visible).toBe(false);

    tracers.dispose();
  });

  it('u=0 이고 w만 있어도 |U|>0 이면 입자 메쉬를 표시한다', async () => {
    const scour = await new SyntheticScourSource({
      width: 21,
      height: 21,
      cellSize: 0.05,
      frameCount: 1,
    }).load();
    const fluid = await new SyntheticFluidSource({
      width: 21,
      height: 8,
      depth: 21,
      cellSize: 0.05,
      frameCount: 1,
      fluidU: 0,
      fluidV: 0,
      fluidW: 0.25,
    }).load();
    const waterLevel = defaultFluidSliceHeight(fluid, scour.baseTerrain);

    const scene = new Scene();
    const tracers = new FluidTracers({
      scene,
      fluidSeries: fluid,
      scourSeries: scour,
      waterLevel,
      particleCount: 20,
    });

    const mesh = scene.children[0] as { visible: boolean };
    expect(mesh.visible).toBe(true);

    tracers.dispose();
  });

  it('setForceHidden(true) 이면 hasFlow 여부와 관계없이 숨긴다', async () => {
    const scour = await new SyntheticScourSource({
      width: 21,
      height: 21,
      cellSize: 0.05,
      frameCount: 1,
    }).load();
    const fluid = await new SyntheticFluidSource({
      width: 21,
      height: 8,
      depth: 21,
      cellSize: 0.05,
      frameCount: 1,
      inflowSpeed: 0.4,
    }).load();
    const waterLevel = defaultFluidSliceHeight(fluid, scour.baseTerrain);

    const scene = new Scene();
    const tracers = new FluidTracers({
      scene,
      fluidSeries: fluid,
      scourSeries: scour,
      waterLevel,
      particleCount: 20,
    });

    const mesh = scene.children[0] as { visible: boolean };
    expect(mesh.visible).toBe(true);

    tracers.setForceHidden(true);
    expect(mesh.visible).toBe(false);

    tracers.setVisible(true);
    expect(mesh.visible).toBe(false);

    tracers.dispose();
  });
});
