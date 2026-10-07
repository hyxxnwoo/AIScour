import { describe, expect, it } from 'vitest';
import { buildSampleProbeDashboard, dataToWorld } from '@/data/buildSampleProbeDashboard';
import { datasetFromColumns } from '@/utils/parseSampleProbeCsv';
import { worldXZToTerrainGrid } from '@/utils/fluidWorld';
import { FLUME_INFLOW_BOUNDARY } from '@/utils/flumeInflowBoundary';

function makeProbeColumns(
  rows: Array<{ x: number; y: number; z: number; scrdif?: number }>,
) {
  const count = rows.length;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const u = new Float32Array(count);
  const v = new Float32Array(count);
  const w = new Float32Array(count);
  const scrdif = new Float32Array(count);
  rows.forEach((row, i) => {
    x[i] = row.x;
    y[i] = row.y;
    z[i] = row.z;
    scrdif[i] = row.scrdif ?? 0;
  });
  return { x, y, z, u, v, w, scrdif, count };
}

describe('flume inflow boundary mask', () => {
  it('masks hungry-water scour (data x ≤ 0.22 m) by default', () => {
    const dataset = datasetFromColumns(
      makeProbeColumns([
        { x: 0.15, y: 0, z: 0, scrdif: -0.05 },
        { x: 0.45, y: 0, z: 0, scrdif: -0.08 },
      ]),
    );
    const built = buildSampleProbeDashboard(dataset);
    expect(built.scour.baseTerrain.metadata?.inflowBoundaryMasked).toBe(true);

    const terrain = built.scour.baseTerrain;
    const bounds = built.probeSeries.bounds;
    const frame = built.scour.frames[0]!;
    const inletWorld = dataToWorld(0.15, 0, 0, bounds);
    const bridgeWorld = dataToWorld(0.45, 0, 0, bounds);
    const inletCell = worldXZToTerrainGrid(inletWorld.x, inletWorld.z, terrain);
    const bridgeCell = worldXZToTerrainGrid(bridgeWorld.x, bridgeWorld.z, terrain);
    const inletIdx =
      Math.round(inletCell.gy) * terrain.width + Math.round(inletCell.gx);
    const bridgeIdx =
      Math.round(bridgeCell.gy) * terrain.width + Math.round(bridgeCell.gx);

    expect(frame.deltaElevations[inletIdx]).toBe(0);
    expect(frame.deltaElevations[bridgeIdx]).toBeLessThan(-0.05);
  });

  it('can disable mask explicitly', () => {
    const dataset = datasetFromColumns(
      makeProbeColumns([
        { x: 0.15, y: 0, z: 0, scrdif: -0.05 },
        { x: 0.16, y: 0.01, z: 0, scrdif: -0.05 },
      ]),
    );
    const built = buildSampleProbeDashboard(dataset, { maskInflowBoundaryScour: false });
    expect(built.scour.baseTerrain.metadata?.inflowBoundaryMasked).toBeFalsy();
    const bounds = built.probeSeries.bounds;
    const terrain = built.scour.baseTerrain;
    const world = dataToWorld(0.15, 0, 0, bounds);
    const cell = worldXZToTerrainGrid(world.x, world.z, terrain);
    const idx = Math.round(cell.gy) * terrain.width + Math.round(cell.gx);
    expect(built.scour.frames[0]!.deltaElevations[idx]).toBeLessThan(-0.04);
  });

  it('documents threshold constants', () => {
    expect(FLUME_INFLOW_BOUNDARY.fixedBedMaxDataX).toBe(0.09);
    expect(FLUME_INFLOW_BOUNDARY.mobileBedStartDataX).toBe(0.1);
    expect(FLUME_INFLOW_BOUNDARY.hungryWaterScourMaskMaxDataX).toBe(0.22);
  });
});
