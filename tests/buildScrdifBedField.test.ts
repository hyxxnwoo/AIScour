import { describe, expect, it } from 'vitest';
import { terrainGridDims } from '@/constants/experiment';
import {
  buildBedAxes,
  bedGridSize,
  inferScrdifCentroidsFromDataset,
  mergeDeltaByMaxAbs,
  reduceScrdifToBed,
  resampleBedToTerrain,
} from '@/data/buildScrdifBedField';
import { computeBounds, dataToWorld, resolveCsvPierLayout } from '@/data/buildSampleProbeDashboard';
import {
  datasetFromColumns,
  type SampleProbeColumns,
} from '@/utils/parseSampleProbeCsv';
import { worldXZToTerrainGrid } from '@/utils/fluidWorld';
import { nearestIndex } from '@/utils/probeDataAxis';

function makeProbeColumns(
  rows: Array<{
    x: number;
    y: number;
    z: number;
    scrdif?: number;
  }>,
): SampleProbeColumns {
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

function resolveTerrainGridFromDims() {
  const dims = terrainGridDims();
  return {
    width: dims.width,
    height: dims.height,
    cellSize: dims.cellSize,
    elevations: new Float32Array(dims.width * dims.height),
    metadata: { elevationUnit: 'm', simulationId: 'test' },
  };
}

describe('reduceScrdifToBed', () => {
  it('같은 (x, y) 에 z 만 다른 행은 |scrdif| 가 가장 큰 행의 부호 있는 값을 남긴다', () => {
    const columns = makeProbeColumns([
      { x: 0.5, y: 0, z: -0.1, scrdif: +0.02 },
      { x: 0.5, y: 0, z: 0.0, scrdif: -0.05 },
      { x: 0.5, y: 0, z: 0.1, scrdif: +0.01 },
    ]);
    const dataset = datasetFromColumns(columns);
    const axes = buildBedAxes(dataset);
    const bed = new Float32Array(bedGridSize(axes));

    reduceScrdifToBed(columns, axes.x, axes.y, bed);

    const xi = nearestIndex(axes.x.values, 0.5);
    const yi = nearestIndex(axes.y.values, 0);
    expect(bed[yi * axes.x.values.length + xi]).toBeCloseTo(-0.05);
  });
});

describe('resampleBedToTerrain', () => {
  it('음수 scrdif 는 해당 위치 지형 셀에서 delta < 0, 양수는 delta > 0', () => {
    const columns = makeProbeColumns([
      { x: 0.4, y: -0.05, z: 0, scrdif: -0.04 },
      { x: 0.7, y: 0.05, z: 0, scrdif: +0.03 },
    ]);
    const dataset = datasetFromColumns(columns);
    const bounds = computeBounds(columns);
    const axes = buildBedAxes(dataset);
    const terrain = resolveTerrainGridFromDims();
    const bed = new Float32Array(bedGridSize(axes));
    const delta = new Float32Array(terrain.width * terrain.height);

    reduceScrdifToBed(columns, axes.x, axes.y, bed);
    resampleBedToTerrain(
      bed,
      axes.x,
      axes.y,
      {
        originDataX: bounds.originDataX,
        originDataY: bounds.originDataY,
      },
      terrain,
      delta,
    );

    const scourWorld = dataToWorld(0.4, -0.05, 0, bounds);
    const depositWorld = dataToWorld(0.7, 0.05, 0, bounds);
    const scourCell = worldXZToTerrainGrid(scourWorld.x, scourWorld.z, terrain);
    const depositCell = worldXZToTerrainGrid(depositWorld.x, depositWorld.z, terrain);
    const scourIdx =
      Math.round(scourCell.gy) * terrain.width + Math.round(scourCell.gx);
    const depositIdx =
      Math.round(depositCell.gy) * terrain.width + Math.round(depositCell.gx);

    expect(delta[scourIdx]).toBeLessThan(0);
    expect(delta[depositIdx]).toBeGreaterThan(0);
  });

  it('CSV 발자국 밖 지형 셀은 0 이다', () => {
    const columns = makeProbeColumns([{ x: 0.55, y: 0, z: 0, scrdif: -0.05 }]);
    const dataset = datasetFromColumns(columns);
    const bounds = computeBounds(columns);
    const axes = buildBedAxes(dataset);
    const terrain = resolveTerrainGridFromDims();
    const bed = new Float32Array(bedGridSize(axes));
    const delta = new Float32Array(terrain.width * terrain.height);

    reduceScrdifToBed(columns, axes.x, axes.y, bed);
    resampleBedToTerrain(
      bed,
      axes.x,
      axes.y,
      {
        originDataX: bounds.originDataX,
        originDataY: bounds.originDataY,
      },
      terrain,
      delta,
    );

    const farIdx = 0;
    expect(delta[farIdx]).toBe(0);
  });

  it('CSV (x, y) 가 dataToWorld + worldXZToTerrainGrid 와 정합된다', () => {
    const columns = makeProbeColumns([{ x: 0.55, y: 0.02, z: 0, scrdif: -0.06 }]);
    const dataset = datasetFromColumns(columns);
    const bounds = computeBounds(columns);
    const axes = buildBedAxes(dataset);
    const terrain = resolveTerrainGridFromDims();
    const bed = new Float32Array(bedGridSize(axes));
    const delta = new Float32Array(terrain.width * terrain.height);

    reduceScrdifToBed(columns, axes.x, axes.y, bed);
    resampleBedToTerrain(
      bed,
      axes.x,
      axes.y,
      {
        originDataX: bounds.originDataX,
        originDataY: bounds.originDataY,
      },
      terrain,
      delta,
    );

    const world = dataToWorld(0.55, 0.02, 0, bounds);
    const cell = worldXZToTerrainGrid(world.x, world.z, terrain);
    const idx = Math.round(cell.gy) * terrain.width + Math.round(cell.gx);
    expect(Math.abs(delta[idx]!)).toBeGreaterThan(0);
  });
});

describe('inferScrdifCentroids', () => {
  it('|scrdif| 최대 셀을 교각 위치로 추정한다', () => {
    const columns = makeProbeColumns([
      { x: 0.5, y: 0.1, z: 0, scrdif: -0.08 },
      { x: 0.52, y: 0.1, z: 0, scrdif: -0.02 },
    ]);
    const dataset = datasetFromColumns(columns);
    const centroids = inferScrdifCentroidsFromDataset(dataset, 1, 0.25);
    expect(centroids.length).toBe(1);
    expect(centroids[0]!.dataX).toBeCloseTo(0.5, 2);
    expect(centroids[0]!.dataY).toBeCloseTo(0.1, 2);
  });

  it('resolveCsvPierLayout 은 scrdif 위치의 세굴공 중심에 교각을 둔다', () => {
    const columns = makeProbeColumns([{ x: 0.55, y: -0.04, z: 0, scrdif: -0.07 }]);
    const dataset = datasetFromColumns(columns);
    const bounds = computeBounds(columns);
    const piers = resolveCsvPierLayout(dataset, bounds, { pierCount: 1 });
    expect(piers.length).toBe(1);
    const expected = dataToWorld(0.55, -0.04, 0, bounds);
    expect(piers[0]!.x).toBeCloseTo(expected.x, 1);
    expect(piers[0]!.z).toBeCloseTo(expected.z, 1);
  });

  it('세굴공이 여러 개여도 교각은 1개만 두고 가장 깊은 곳에 배치한다', () => {
    const columns = makeProbeColumns([
      { x: 0.45, y: -0.06, z: 0, scrdif: -0.04 },
      { x: 0.65, y: 0.05, z: 0, scrdif: -0.09 },
    ]);
    const dataset = datasetFromColumns(columns);
    const bounds = computeBounds(columns);
    const piers = resolveCsvPierLayout(dataset, bounds);
    expect(piers.length).toBe(1);
    const expected = dataToWorld(0.65, 0.05, 0, bounds);
    expect(piers[0]!.x).toBeCloseTo(expected.x, 1);
    expect(piers[0]!.z).toBeCloseTo(expected.z, 1);
  });
});

describe('mergeDeltaByMaxAbs', () => {
  it('겹치는 셀마다 |값| 이 더 큰 쪽을 남긴다', () => {
    const dst = new Float32Array([0.01, -0.02, 0]);
    const src = new Float32Array([0.05, -0.01, -0.03]);
    mergeDeltaByMaxAbs(dst, src);
    expect(dst[0]).toBeCloseTo(0.05);
    expect(dst[1]).toBeCloseTo(-0.02);
    expect(dst[2]).toBeCloseTo(-0.03);
  });
});
