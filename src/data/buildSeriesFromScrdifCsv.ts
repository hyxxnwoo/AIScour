import { FLUME } from '@/constants/experiment';
import type { Flow3dGridMeta, Flow3dBuiltSeries } from '@/data/buildSeriesFromFlow3dCsv';
import { buildSeriesFromFlow3dVariables } from '@/data/buildSeriesFromFlow3dCsv';
import { computeBounds, dataToWorld } from '@/data/buildTimeProbeSeries';
import { FLOW3D_VARIABLE_DEFS } from '@/data/flow3dVariableDefs';
import type { FluidFrame, FluidGrid3D, FluidSeries } from '@/types/fluid';
import type { ScourFrame, ScourSeries, TerrainGrid } from '@/types/terrain';
import type { Flow3dScrdifColumns } from '@/utils/parseFlow3dScrdifCsv';
import { classifyScrdifCsvLayout } from '@/utils/scrdifCsvLayout';
import { fluidYiAtWorldY, worldXZToTerrainGrid } from '@/utils/fluidWorld';
import type { ParsedFlow3dVariable } from '@/utils/parseFlow3dVariableCsv';
import { fluidIndex } from '@/types/fluid';

const COORD_EPS = 1e-5;
/** 1D 흐름 슬라이스를 가로 단면 전체로 펼칠 때 최소 격자 행 수. */
const MIN_TERRAIN_CROSS_SECTION = 8;
/** temporal-probe 분기에서 행당 지형 격자를 만들 때 허용하는 최대 프레임 수. */
const MAX_SCOUR_FRAMES = 4096;

function terrainVertexCount(spanMeters: number, cellSize: number): number {
  return Math.max(2, Math.round(spanMeters / cellSize) + 1);
}

function uniqueSorted(values: Float32Array): number[] {
  return [...new Set(Array.from(values))].sort((a, b) => a - b);
}

function estimateAxisCellSize(coords: number[]): number {
  if (coords.length <= 1) return FLUME.fluidCellSize;
  let minSpan = Infinity;
  for (let i = 1; i < coords.length; i += 1) {
    const span = Math.abs(coords[i]! - coords[i - 1]!);
    if (span > COORD_EPS && span < minSpan) minSpan = span;
  }
  return Number.isFinite(minSpan) && minSpan > 0 ? minSpan : FLUME.fluidCellSize;
}

function coordIndexMap(coords: number[]): Map<number, number> {
  const map = new Map<number, number>();
  coords.forEach((value, index) => map.set(value, index));
  return map;
}

function lookupAxisIndex(map: Map<number, number>, coords: number[], value: number): number {
  const direct = map.get(value);
  if (direct !== undefined) return direct;

  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length; i += 1) {
    const dist = Math.abs(coords[i]! - value);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function resolveVerticalGrid(
  ys: number[],
  cellSize: number,
  waterDepth: number,
  metaHeight?: number,
): { height: number; originY: number; sliceMode: boolean; waterYi: number } {
  const originY = 0;
  const sliceMode = ys.length <= 1;
  const waterYi = fluidYiAtWorldY(
    { width: 1, height: 1, depth: 1, cellSize, originY },
    waterDepth,
  );
  const minHeight = Math.max(waterYi + 1, Math.ceil(waterDepth / cellSize) + 1);
  const height = metaHeight ?? (sliceMode ? minHeight : Math.max(ys.length, minHeight));
  return { height, originY, sliceMode, waterYi };
}

function resolveTerrainGridFromColumns(
  columns: Flow3dScrdifColumns,
  meta: Flow3dGridMeta,
): { grid: TerrainGrid; sliceModeCross: boolean } {
  const xs = uniqueSorted(columns.x);
  const ys = uniqueSorted(columns.y);
  const bounds = computeBounds(columns);

  const cellSize =
    meta.cellSize ??
    Math.min(estimateAxisCellSize(xs), estimateAxisCellSize(ys), FLUME.terrainCellSize);

  let maxAbsWorldX = 0;
  let maxAbsWorldZ = 0;
  for (let i = 0; i < columns.count; i += 1) {
    const world = dataToWorld(columns.x[i]!, columns.y[i]!, columns.z[i]!, bounds);
    maxAbsWorldX = Math.max(maxAbsWorldX, Math.abs(world.x));
    maxAbsWorldZ = Math.max(maxAbsWorldZ, Math.abs(world.z));
  }

  const sliceModeCross = ys.length <= 1 || maxAbsWorldZ < cellSize * 0.5;
  const spanX = Math.max(cellSize, maxAbsWorldX * 2);
  const spanZ = sliceModeCross
    ? Math.max(MIN_TERRAIN_CROSS_SECTION * cellSize, cellSize * 2)
    : Math.max(cellSize, maxAbsWorldZ * 2);

  const width = meta.width ?? terrainVertexCount(spanX, cellSize);
  const height = meta.height ?? terrainVertexCount(spanZ, cellSize);
  const elevations = new Float32Array(width * height);

  return {
    grid: {
      width,
      height,
      cellSize,
      elevations,
      metadata: {
        elevationUnit: 'm',
        simulationId: 'flow3d-scrdif-terrain',
      },
    },
    sliceModeCross,
  };
}

function writeScrdifToTerrainDelta(
  delta: Float32Array,
  terrain: TerrainGrid,
  worldX: number,
  worldZ: number,
  scrdif: number,
  sliceModeCross: boolean,
): void {
  const { gx, gy } = worldXZToTerrainGrid(worldX, worldZ, terrain);
  const ix = Math.round(gx);
  const iy = Math.round(gy);
  if (ix < 0 || ix >= terrain.width) return;

  const writeCell = (x: number, y: number): void => {
    if (y < 0 || y >= terrain.height) return;
    const idx = y * terrain.width + x;
    if (Math.abs(scrdif) >= Math.abs(delta[idx]!)) {
      delta[idx] = scrdif;
    }
  };

  if (sliceModeCross) {
    for (let row = 0; row < terrain.height; row += 1) {
      writeCell(ix, row);
    }
  } else {
    writeCell(ix, iy);
  }
}

/** scrdif 열을 지형 세굴/퇴적 Δ표고(ScourSeries)로 래스터화한다. */
export function buildScourSeriesFromScrdifColumns(
  columns: Flow3dScrdifColumns,
  meta: Flow3dGridMeta = {},
): ScourSeries | null {
  if (columns.count === 0) return null;

  const layout = classifyScrdifCsvLayout(columns);
  const bounds = computeBounds(columns);
  const { grid, sliceModeCross } = resolveTerrainGridFromColumns(columns, meta);
  const intervalSeconds = meta.intervalSeconds ?? 30;

  const buildSpatialSliceFrames = (): ScourFrame[] => {
    const delta = new Float32Array(grid.width * grid.height);
    for (let i = 0; i < columns.count; i += 1) {
      const world = dataToWorld(columns.x[i]!, columns.y[i]!, columns.z[i]!, bounds);
      writeScrdifToTerrainDelta(
        delta,
        grid,
        world.x,
        world.z,
        columns.scrdif[i]!,
        sliceModeCross,
      );
    }
    return [{ timestampSeconds: 0, deltaElevations: delta }];
  };

  if (layout === 'spatial-slice' || columns.count > MAX_SCOUR_FRAMES) {
    return { baseTerrain: grid, frames: buildSpatialSliceFrames() };
  }

  const frames: ScourFrame[] = [];
  for (let i = 0; i < columns.count; i += 1) {
    const delta = new Float32Array(grid.width * grid.height);
    const world = dataToWorld(columns.x[i]!, columns.y[i]!, columns.z[i]!, bounds);
    writeScrdifToTerrainDelta(
      delta,
      grid,
      world.x,
      world.z,
      columns.scrdif[i]!,
      sliceModeCross,
    );
    frames.push({ timestampSeconds: i * intervalSeconds, deltaElevations: delta });
  }
  return { baseTerrain: grid, frames };
}

function emptyFluidFrame(grid: FluidGrid3D, t: number): FluidFrame {
  const n = grid.width * grid.height * grid.depth;
  return {
    timestampSeconds: t,
    velocityX: new Float32Array(n),
    velocityY: new Float32Array(n),
    velocityZ: new Float32Array(n),
    pressure: new Float32Array(n),
    density: new Float32Array(n),
    scalars: {},
  };
}

function writeProbeToFluidFrame(
  frame: FluidFrame,
  grid: FluidGrid3D,
  terrain: TerrainGrid,
  worldX: number,
  worldZ: number,
  u: number,
  v: number,
  w: number,
  scrdif: number,
  sliceModeCross: boolean,
  waterYi: number,
): void {
  const { gx, gy } = worldXZToTerrainGrid(worldX, worldZ, terrain);
  const ix = Math.round(gx);
  const iz = Math.round(gy);
  if (ix < 0 || ix >= grid.width) return;

  if (!frame.scalars) frame.scalars = {};
  if (!frame.scalars.scrdif) {
    frame.scalars.scrdif = new Float32Array(grid.width * grid.height * grid.depth);
  }

  const writeCell = (xi: number, zi: number): void => {
    if (zi < 0 || zi >= grid.depth) return;
    const cell = fluidIndex(grid, xi, waterYi, zi);
    frame.velocityX[cell] = u;
    frame.velocityY[cell] = v;
    frame.velocityZ[cell] = w;
    frame.scalars!.scrdif![cell] = scrdif;
  };

  if (sliceModeCross) {
    for (let row = 0; row < grid.depth; row += 1) {
      writeCell(ix, row);
    }
  } else {
    writeCell(ix, iz);
  }
}

function buildTemporalFluidSeriesFromScrdifColumns(
  columns: Flow3dScrdifColumns,
  terrain: TerrainGrid,
  sliceModeCross: boolean,
  bounds: ReturnType<typeof computeBounds>,
  meta: Flow3dGridMeta,
): FluidSeries {
  const intervalSeconds = meta.intervalSeconds ?? 30;
  const waterDepth = meta.waterDepth ?? FLUME.waterDepthM;
  const cellSize = terrain.cellSize;
  const ys = uniqueSorted(columns.y);
  const { height, originY, waterYi } = resolveVerticalGrid(
    ys,
    cellSize,
    waterDepth,
    meta.height,
  );

  const grid: FluidGrid3D = {
    width: terrain.width,
    height,
    depth: terrain.height,
    cellSize,
    originY,
    originX: -((terrain.width - 1) * cellSize) / 2,
    originZ: -((terrain.height - 1) * cellSize) / 2,
  };

  const frames: FluidFrame[] = [];
  for (let i = 0; i < columns.count; i += 1) {
    const frame = emptyFluidFrame(grid, i * intervalSeconds);
    const world = dataToWorld(columns.x[i]!, columns.y[i]!, columns.z[i]!, bounds);
    writeProbeToFluidFrame(
      frame,
      grid,
      terrain,
      world.x,
      world.z,
      columns.u[i]!,
      columns.v[i]!,
      columns.w[i]!,
      columns.scrdif[i]!,
      sliceModeCross,
      waterYi,
    );
    frames.push(frame);
  }

  return {
    grid,
    frames,
    metadata: {
      velocityUnit: 'm/s',
      scalarUnits: { scrdif: 'm' },
      scalarLabels: { scrdif: FLOW3D_VARIABLE_DEFS.scrdif?.label ?? '세굴 변화량' },
      simulationId: 'flow3d-scrdif-temporal',
    },
  };
}

function variablesFromFluidFrame(
  frame: FluidFrame,
  grid: FluidGrid3D,
): ParsedFlow3dVariable[] {
  const scrdif = frame.scalars?.scrdif ?? new Float32Array(grid.width * grid.height * grid.depth);
  return [
    {
      id: 'ux',
      label: FLOW3D_VARIABLE_DEFS.ux?.label ?? 'x방향 유속',
      unit: FLOW3D_VARIABLE_DEFS.ux?.defaultUnit ?? 'm/s',
      values: frame.velocityX,
    },
    {
      id: 'vy',
      label: FLOW3D_VARIABLE_DEFS.vy?.label ?? 'y방향 유속',
      unit: FLOW3D_VARIABLE_DEFS.vy?.defaultUnit ?? 'm/s',
      values: frame.velocityY,
    },
    {
      id: 'vz',
      label: FLOW3D_VARIABLE_DEFS.vz?.label ?? 'z방향 유속',
      unit: FLOW3D_VARIABLE_DEFS.vz?.defaultUnit ?? 'm/s',
      values: frame.velocityZ,
    },
    {
      id: 'scrdif',
      label: FLOW3D_VARIABLE_DEFS.scrdif?.label ?? '세굴 변화량',
      unit: FLOW3D_VARIABLE_DEFS.scrdif?.defaultUnit ?? 'm',
      values: scrdif,
    },
  ];
}

/** x·y·z·u·v·w·scrdif 열 데이터를 FLOW-3D 격자 변수로 변환한다. */
export function buildSeriesFromScrdifColumns(
  columns: Flow3dScrdifColumns,
  meta: Flow3dGridMeta = {},
): Flow3dBuiltSeries {
  const layout = classifyScrdifCsvLayout(columns);
  const bounds = computeBounds(columns);
  const scour = buildScourSeriesFromScrdifColumns(columns, meta);

  if (layout === 'temporal-probe' && scour) {
    const { sliceModeCross } = resolveTerrainGridFromColumns(columns, meta);
    const fluid = buildTemporalFluidSeriesFromScrdifColumns(
      columns,
      scour.baseTerrain,
      sliceModeCross,
      bounds,
      meta,
    );
    const lastFrame = fluid.frames.at(-1) ?? fluid.frames[0]!;
    return {
      scour,
      fluid,
      variables: variablesFromFluidFrame(lastFrame, fluid.grid),
    };
  }

  const xs = uniqueSorted(columns.x);
  const ys = uniqueSorted(columns.y);
  const zs = uniqueSorted(columns.z);
  const waterDepth = meta.waterDepth ?? FLUME.waterDepthM;

  const cellSize =
    meta.cellSize ??
    Math.min(
      estimateAxisCellSize(xs),
      estimateAxisCellSize(ys),
      estimateAxisCellSize(zs),
      FLUME.fluidCellSize,
    );

  const width = meta.width ?? xs.length;
  const depth = meta.depth ?? Math.max(zs.length, 1);
  const { height, originY, sliceMode, waterYi } = resolveVerticalGrid(
    ys,
    cellSize,
    waterDepth,
    meta.height,
  );
  const cellCount = width * height * depth;

  const originX = meta.originX ?? xs[0] ?? 0;
  const originZ = meta.originZ ?? zs[0] ?? 0;

  const xMap = coordIndexMap(xs);
  const yMap = coordIndexMap(ys);
  const zMap = coordIndexMap(zs);

  const grid: FluidGrid3D = { width, height, depth, cellSize, originX, originY, originZ };

  const ux = new Float32Array(cellCount);
  const vy = new Float32Array(cellCount);
  const vz = new Float32Array(cellCount);
  const scrdif = new Float32Array(cellCount);

  for (let i = 0; i < columns.count; i += 1) {
    const xi = lookupAxisIndex(xMap, xs, columns.x[i]!);
    const zi = lookupAxisIndex(zMap, zs, columns.z[i]!);
    const yi = sliceMode ? waterYi : lookupAxisIndex(yMap, ys, columns.y[i]!);
    if (xi >= width || yi >= height || zi >= depth) continue;

    const cell = fluidIndex(grid, xi, yi, zi);
    ux[cell] = columns.u[i]!;
    vy[cell] = columns.v[i]!;
    vz[cell] = columns.w[i]!;
    scrdif[cell] = columns.scrdif[i]!;
  }

  const variables: ParsedFlow3dVariable[] = [
    {
      id: 'ux',
      label: FLOW3D_VARIABLE_DEFS.ux?.label ?? 'x방향 유속',
      unit: FLOW3D_VARIABLE_DEFS.ux?.defaultUnit ?? 'm/s',
      values: ux,
    },
    {
      id: 'vy',
      label: FLOW3D_VARIABLE_DEFS.vy?.label ?? 'y방향 유속',
      unit: FLOW3D_VARIABLE_DEFS.vy?.defaultUnit ?? 'm/s',
      values: vy,
    },
    {
      id: 'vz',
      label: FLOW3D_VARIABLE_DEFS.vz?.label ?? 'z방향 유속',
      unit: FLOW3D_VARIABLE_DEFS.vz?.defaultUnit ?? 'm/s',
      values: vz,
    },
    {
      id: 'scrdif',
      label: FLOW3D_VARIABLE_DEFS.scrdif?.label ?? '세굴 변화량',
      unit: FLOW3D_VARIABLE_DEFS.scrdif?.defaultUnit ?? 'm',
      values: scrdif,
    },
  ];

  return buildSeriesFromFlow3dVariables(variables, {
    ...meta,
    width,
    height,
    depth,
    cellSize,
    originX,
    originY,
    originZ,
    waterDepth,
    intervalSeconds: meta.intervalSeconds ?? 30,
  });
}
