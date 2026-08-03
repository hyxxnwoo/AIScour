import { describe, expect, it } from 'vitest';
import { SyntheticFluidSource } from '@/data/SyntheticFluidSource';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import { FluidTracers, probeSpeed } from '@/modules/FluidTracers';
import { structureCenterX } from '@/constants/experiment';
import { defaultFluidSliceHeight } from '@/utils/fluidWorld';
import { Scene } from 'three';

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
    const before = (scene.children[0] as unknown as { geometry: { attributes: { position: { array: Float32Array } } } })
      .geometry.attributes.position.array.slice();

    for (let i = 0; i < 30; i += 1) {
      tracers.tick(1 / 30);
    }

    const after = (scene.children[0] as unknown as { geometry: { attributes: { position: { array: Float32Array } } } })
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

  it('CSV 프로브 u·v·w=0 이면 입자를 숨긴다', async () => {
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

    tracers.setProbeVelocity({ u: 0, v: 0, w: 0 });
    expect(mesh.visible).toBe(false);

    tracers.dispose();
  });

  it('CSV 프로브 u·v·w 가 있으면 입자가 이동한다', async () => {
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
      fluidU: 0,
      fluidV: 0,
      fluidW: 0,
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

    tracers.setProbeVelocity({ u: 0.35, v: 0, w: 0 });
    expect(probeSpeed(0.35, 0, 0)).toBeGreaterThan(0.012);

    tracers.updateAtTime(0);
    const before = (scene.children[0] as unknown as { geometry: { attributes: { position: { array: Float32Array } } } })
      .geometry.attributes.position.array.slice();

    for (let i = 0; i < 30; i += 1) {
      tracers.tick(1 / 30);
    }

    const after = (scene.children[0] as unknown as { geometry: { attributes: { position: { array: Float32Array } } } })
      .geometry.attributes.position.array;

    let moved = 0;
    for (let i = 0; i < before.length; i += 3) {
      if (Math.hypot(after[i] - before[i], after[i + 2] - before[i + 2]) > 1e-4) moved += 1;
    }
    expect(moved).toBeGreaterThan(5);

    tracers.dispose();
  });

  it('기둥 충돌이 있으면 입자가 원기둥 내부에 머무르지 않는다', async () => {
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
      fluidU: 0,
      fluidV: 0,
      fluidW: 0,
    }).load();
    const waterLevel = defaultFluidSliceHeight(fluid, scour.baseTerrain);
    const pierX = structureCenterX();
    const pierRadius = 0.05;

    const scene = new Scene();
    const tracers = new FluidTracers({
      scene,
      fluidSeries: fluid,
      scourSeries: scour,
      waterLevel,
      particleCount: 40,
      piers: [{ id: 'P1', x: pierX, z: 0, diameter: pierRadius * 2, height: 1 }],
      structurePermeable: false,
      baseElevation: 0,
    });

    tracers.setProbeVelocity({ u: 0.35, v: 0, w: 0 });
    tracers.updateAtTime(0);

    for (let i = 0; i < 120; i += 1) {
      tracers.tick(1 / 30);
    }

    const positions = (scene.children[0] as unknown as { geometry: { attributes: { position: { array: Float32Array } } } })
      .geometry.attributes.position.array;

    let insidePier = 0;
    for (let i = 0; i < positions.length; i += 6) {
      const x = positions[i + 3]!;
      const z = positions[i + 5]!;
      if (Math.hypot(x - pierX, z) < pierRadius - 1e-4) insidePier += 1;
    }
    expect(insidePier).toBe(0);

    tracers.dispose();
  });
});
