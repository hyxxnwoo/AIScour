import { FLUME, structureCenterX, terrainGridDims } from '@/constants/experiment';
import type { ScourFrame, ScourSeries, TerrainGrid } from '@/types/terrain';
import type { SampleProbeColumns } from '@/utils/parseSampleProbeCsv';
import { terrainGridToWorldXZ, worldXZToTerrainGrid } from '@/utils/fluidWorld';
import { flowScourDelta } from '@/utils/scourShape';

export interface SampleProbeBounds {
  minDataX: number;
  maxDataX: number;
  minDataY: number;
  maxDataY: number;
  minDataZ: number;
  maxDataZ: number;
  centerDataX: number;
  centerDataY: number;
  centerDataZ: number;
  minScrdif: number;
  maxScrdif: number;
}

export interface SampleProbeSample {
  t: number;
  rowIndex: number;
  dataX: number;
  dataY: number;
  dataZ: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  u: number;
  v: number;
  w: number;
  scrdif: number;
}

export interface SampleProbeSeries {
  samples: SampleProbeSample[];
  rowCount: number;
  baseIntervalSeconds: number;
  stepMultiple: number;
  durationSeconds: number;
  bounds: SampleProbeBounds;
}

export interface SampleProbeDashboard {
  scour: ScourSeries;
  probeSeries: SampleProbeSeries;
}

export interface BuildSampleProbeDashboardOptions {
  baseIntervalSeconds?: number;
  stepMultiple?: number;
  pierX?: number;
  pierZ?: number;
  pierDiameter?: number;
  scourRate?: number;
  sandGrainSizeMm?: number;
  permeable?: boolean;
  inflowSpeed?: number;
  tankHeightY?: number;
}

export interface HybridScourPierConfig {
  pierX: number;
  pierZ: number;
  pierRadius: number;
  equilibriumDepth: number;
  pierDiameter: number;
  pierHeight: number;
}

const SCRDIF_EPS = 1e-12;
export const MAX_SCOUR_FRAMES = 4096;
const MAX_SCOUR_FRAME_BYTES = 256 * 1024 * 1024;

/** CSV bounds 에 scrdif 신호가 없는지 판별한다. */
export function csvScrdifIsAllZero(bounds: SampleProbeBounds): boolean {
  return Math.abs(bounds.maxScrdif) < SCRDIF_EPS && Math.abs(bounds.minScrdif) < SCRDIF_EPS;
}

/** 합성 세굴과 동일 스케일의 균형 깊이(m). */
export function computeHybridEquilibriumDepth(
  options: Pick<
    BuildSampleProbeDashboardOptions,
    'pierDiameter' | 'scourRate' | 'sandGrainSizeMm' | 'permeable' | 'inflowSpeed'
  > = {},
): number {
  const pierDiameter = options.pierDiameter ?? FLUME.structure.diameterM;
  const scourRate = options.scourRate ?? 1.0;
  const sandGrainSizeMm = options.sandGrainSizeMm ?? FLUME.sandGrainSizeMm;
  const permeable = options.permeable ?? false;
  const inflowSpeed = options.inflowSpeed ?? 0.25;

  const grainFactor = Math.min(
    1.4,
    Math.max(0.7, Math.pow(FLUME.sandGrainSizeMm / Math.max(0.05, sandGrainSizeMm), 0.2)),
  );
  const speedFactor = Math.min(1.5, Math.max(0.6, inflowSpeed / 0.25));
  const permeabilityFactor = permeable ? 0.6 : 1.0;
  return 1.3 * pierDiameter * scourRate * grainFactor * permeabilityFactor * speedFactor;
}

export function resolveHybridScourPier(
  options: BuildSampleProbeDashboardOptions = {},
): HybridScourPierConfig {
  const pierDiameter = options.pierDiameter ?? FLUME.structure.diameterM;
  const tankHeightY = options.tankHeightY ?? FLUME.tank.heightY;
  return {
    pierX: options.pierX ?? structureCenterX(),
    pierZ: options.pierZ ?? 0,
    pierRadius: pierDiameter / 2,
    equilibriumDepth: computeHybridEquilibriumDepth(options),
    pierDiameter,
    pierHeight: tankHeightY + 0.03,
  };
}

/** 세굴 프레임 한도 안에 들어오도록 stride 를 올린다. */
export function resolveSafeStepMultiple(
  requestedStep: number,
  totalDataRows: number,
  maxFrames = MAX_SCOUR_FRAMES,
): number {
  const requested = Math.max(1, Math.floor(requestedStep));
  if (totalDataRows <= 0) return requested;
  const minStep = Math.ceil(totalDataRows / maxFrames);
  return Math.max(requested, minStep);
}

function resolveTerrainGrid(pier: HybridScourPierConfig): TerrainGrid {
  const dims = terrainGridDims();
  const vertexCount = dims.width * dims.height;
  return {
    width: dims.width,
    height: dims.height,
    cellSize: dims.cellSize,
    elevations: new Float32Array(vertexCount),
    metadata: {
      elevationUnit: 'm',
      simulationId: 'sample-probe-csv',
      piers: [
        {
          id: 'P1',
          x: pier.pierX,
          z: pier.pierZ,
          diameter: pier.pierDiameter,
          height: pier.pierHeight,
        },
      ],
    },
  };
}

function assertScourMemoryBudget(
  columns: SampleProbeColumns,
  terrain: TerrainGrid,
  loopStep: number,
): void {
  const frameCount = Math.ceil(columns.count / loopStep);
  if (frameCount > MAX_SCOUR_FRAMES) {
    throw new Error(
      '세굴 프레임 메모리가 너무 큽니다. 재생 간격을 늘리거나 행 수가 적은 CSV를 사용해 주세요.',
    );
  }

  const vertexCount = terrain.width * terrain.height;
  const estimatedBytes = frameCount * vertexCount * Float32Array.BYTES_PER_ELEMENT;
  if (estimatedBytes > MAX_SCOUR_FRAME_BYTES) {
    throw new Error(
      '세굴 프레임 메모리가 너무 큽니다. 재생 간격을 늘리거나 행 수가 적은 CSV를 사용해 주세요.',
    );
  }
}

function resolveBuildStride(
  columns: SampleProbeColumns,
  requestedStep: number,
): { loopStep: number; seriesStepMultiple: number; totalRows: number; parseStride: number } {
  const parseStride = Math.max(1, columns.stats?.parseStepMultiple ?? 1);
  const buildStep = Math.max(1, Math.floor(requestedStep));
  const totalRows = columns.stats?.dataRowCount ?? columns.count;
  const parseStrided = parseStride > 1 && columns.count < totalRows;

  if (parseStrided) {
    return { loopStep: 1, seriesStepMultiple: parseStride, totalRows, parseStride };
  }

  return { loopStep: buildStep, seriesStepMultiple: buildStep, totalRows, parseStride: 1 };
}

function sourceRowIndex(storedIndex: number, parseStride: number, loopStep: number): number {
  if (parseStride > 1 && loopStep === 1) return storedIndex * parseStride;
  return storedIndex;
}

export function computeBounds(columns: SampleProbeColumns): SampleProbeBounds {
  let minDataX = Infinity;
  let maxDataX = -Infinity;
  let minDataY = Infinity;
  let maxDataY = -Infinity;
  let minDataZ = Infinity;
  let maxDataZ = -Infinity;
  let minScrdif = Infinity;
  let maxScrdif = -Infinity;

  for (let i = 0; i < columns.count; i += 1) {
    const x = columns.x[i]!;
    const y = columns.y[i]!;
    const z = columns.z[i]!;
    const s = columns.scrdif[i]!;
    if (x < minDataX) minDataX = x;
    if (x > maxDataX) maxDataX = x;
    if (y < minDataY) minDataY = y;
    if (y > maxDataY) maxDataY = y;
    if (z < minDataZ) minDataZ = z;
    if (z > maxDataZ) maxDataZ = z;
    if (s < minScrdif) minScrdif = s;
    if (s > maxScrdif) maxScrdif = s;
  }

  if (!isFinite(minDataX)) {
    minDataX = maxDataX = minDataY = maxDataY = minDataZ = maxDataZ = 0;
    minScrdif = maxScrdif = 0;
  }

  return {
    minDataX,
    maxDataX,
    minDataY,
    maxDataY,
    minDataZ,
    maxDataZ,
    centerDataX: (minDataX + maxDataX) / 2,
    centerDataY: (minDataY + maxDataY) / 2,
    centerDataZ: (minDataZ + maxDataZ) / 2,
    minScrdif,
    maxScrdif,
  };
}

/** FLOW-3D 데이터 좌표 → Three.js 월드 좌표. */
export function dataToWorld(
  dataX: number,
  dataY: number,
  dataZ: number,
  bounds: SampleProbeBounds,
): { x: number; y: number; z: number } {
  return {
    x: dataX - bounds.centerDataX,
    y: dataZ - bounds.centerDataZ,
    z: dataY - bounds.centerDataY,
  };
}

export function probeDurationSeconds(rowCount: number, intervalSeconds = 30): number {
  return Math.max(0, rowCount) * intervalSeconds;
}

export function rowIndexAtTime(
  rowCount: number,
  timeSeconds: number,
  intervalSeconds = 30,
): number {
  if (rowCount <= 0) return 0;
  return Math.min(rowCount - 1, Math.max(0, Math.floor(timeSeconds / intervalSeconds)));
}

function medianPositiveDelta(values: Float32Array): number | null {
  const deltas: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const d = Math.abs(values[i]! - values[i - 1]!);
    if (d > 1e-12) deltas.push(d);
  }
  if (deltas.length === 0) return null;
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  return deltas.length % 2 === 0
    ? (deltas[mid - 1]! + deltas[mid]!) / 2
    : deltas[mid]!;
}

export function estimateInfluenceRadius(
  columns: SampleProbeColumns,
  cellSize: number,
  pierRadius?: number,
): number {
  const medianDx = medianPositiveDelta(columns.x);
  const fromMedian = medianDx !== null && medianDx > 0 ? medianDx * 2 : cellSize * 2;
  const minFromPier = (pierRadius ?? FLUME.structure.diameterM / 2) * 1.5;
  return Math.max(fromMedian, minFromPier);
}

function normalizeScrdifValue(scrdifValue: number): number {
  if (!Number.isFinite(scrdifValue) || Math.abs(scrdifValue) < SCRDIF_EPS) return 0;
  return scrdifValue > 0 ? -scrdifValue : scrdifValue;
}

function buildSyntheticScourDelta(
  terrain: TerrainGrid,
  pier: HybridScourPierConfig,
  timeProgress: number,
): Float32Array {
  const { width, height, cellSize } = terrain;
  const halfW = ((width - 1) * cellSize) / 2;
  const halfH = ((height - 1) * cellSize) / 2;
  const delta = new Float32Array(width * height);

  for (let gy = 0; gy < height; gy += 1) {
    for (let gx = 0; gx < width; gx += 1) {
      const worldX = gx * cellSize - halfW;
      const worldZ = gy * cellSize - halfH;
      delta[gy * width + gx] = flowScourDelta(
        worldX,
        worldZ,
        pier.pierX,
        pier.pierZ,
        pier.pierRadius,
        pier.equilibriumDepth,
        timeProgress,
      );
    }
  }

  return delta;
}

function splatScrdif(
  delta: Float32Array,
  terrain: TerrainGrid,
  worldX: number,
  worldZ: number,
  scrdifValue: number,
  radius: number,
): void {
  const scourValue = normalizeScrdifValue(scrdifValue);
  if (Math.abs(scourValue) < SCRDIF_EPS) return;

  const { gx: centerGx, gy: centerGy } = worldXZToTerrainGrid(worldX, worldZ, terrain);
  const rCells = Math.ceil((radius * 2) / terrain.cellSize);

  const minGx = Math.max(0, Math.floor(centerGx - rCells));
  const maxGx = Math.min(terrain.width - 1, Math.ceil(centerGx + rCells));
  const minGy = Math.max(0, Math.floor(centerGy - rCells));
  const maxGy = Math.min(terrain.height - 1, Math.ceil(centerGy + rCells));

  for (let gy = minGy; gy <= maxGy; gy += 1) {
    for (let gx = minGx; gx <= maxGx; gx += 1) {
      const { x, z } = terrainGridToWorldXZ(gx, gy, terrain);
      const r = Math.hypot(x - worldX, z - worldZ);
      if (r > radius * 2) continue;
      const weight = Math.exp(-Math.pow(r / radius, 2));
      const idx = gy * terrain.width + gx;
      delta[idx] += scourValue * weight;
    }
  }
}

function buildScourFrames(
  columns: SampleProbeColumns,
  terrain: TerrainGrid,
  bounds: SampleProbeBounds,
  baseIntervalSeconds: number,
  loopStep: number,
  parseStride: number,
  totalRows: number,
  influenceRadius: number,
  pier: HybridScourPierConfig,
): ScourFrame[] {
  const frames: ScourFrame[] = [];

  for (let i = 0; i < columns.count; i += loopStep) {
    const rowIndex = sourceRowIndex(i, parseStride, loopStep);
    const timeProgress = totalRows <= 1 ? 1 : rowIndex / (totalRows - 1);
    const delta = buildSyntheticScourDelta(terrain, pier, timeProgress);

    const scrdifValue = columns.scrdif[i]!;
    if (Math.abs(scrdifValue) >= SCRDIF_EPS) {
      const world = dataToWorld(
        columns.x[i]!,
        columns.y[i]!,
        columns.z[i]!,
        bounds,
      );
      splatScrdif(
        delta,
        terrain,
        world.x,
        world.z,
        scrdifValue,
        influenceRadius,
      );
    }

    frames.push({
      timestampSeconds: rowIndex * baseIntervalSeconds,
      deltaElevations: delta,
    });
  }

  return frames;
}

function buildProbeSamples(
  columns: SampleProbeColumns,
  bounds: SampleProbeBounds,
  baseIntervalSeconds: number,
  loopStep: number,
  parseStride: number,
): SampleProbeSample[] {
  const samples: SampleProbeSample[] = [];

  for (let i = 0; i < columns.count; i += loopStep) {
    const rowIndex = sourceRowIndex(i, parseStride, loopStep);
    const dataX = columns.x[i]!;
    const dataY = columns.y[i]!;
    const dataZ = columns.z[i]!;
    const world = dataToWorld(dataX, dataY, dataZ, bounds);
    samples.push({
      t: rowIndex * baseIntervalSeconds,
      rowIndex,
      dataX,
      dataY,
      dataZ,
      worldX: world.x,
      worldY: world.y,
      worldZ: world.z,
      u: columns.u[i]!,
      v: columns.v[i]!,
      w: columns.w[i]!,
      scrdif: columns.scrdif[i]!,
    });
  }

  return samples;
}

/** CSV 열 데이터를 세굴 시리즈 + 프로브 시리즈로 변환한다. */
export function buildSampleProbeDashboard(
  columns: SampleProbeColumns,
  options: BuildSampleProbeDashboardOptions = {},
): SampleProbeDashboard {
  const baseIntervalSeconds = options.baseIntervalSeconds ?? 30;
  const requestedStep = Math.max(1, Math.floor(options.stepMultiple ?? 1));
  const { loopStep, seriesStepMultiple, totalRows, parseStride } = resolveBuildStride(
    columns,
    requestedStep,
  );
  const bounds = computeBounds(columns);
  const pier = resolveHybridScourPier(options);
  const baseTerrain = resolveTerrainGrid(pier);
  const influenceRadius = estimateInfluenceRadius(
    columns,
    baseTerrain.cellSize,
    pier.pierRadius,
  );

  assertScourMemoryBudget(columns, baseTerrain, loopStep);

  const frames = buildScourFrames(
    columns,
    baseTerrain,
    bounds,
    baseIntervalSeconds,
    loopStep,
    parseStride,
    totalRows,
    influenceRadius,
    pier,
  );

  const samples = buildProbeSamples(
    columns,
    bounds,
    baseIntervalSeconds,
    loopStep,
    parseStride,
  );

  return {
    scour: { baseTerrain, frames },
    probeSeries: {
      samples,
      rowCount: totalRows,
      baseIntervalSeconds,
      stepMultiple: seriesStepMultiple,
      durationSeconds: probeDurationSeconds(totalRows, baseIntervalSeconds),
      bounds,
    },
  };
}

/** 시각 t 에 맞는 프로브 샘플(보간 없음, stride 정렬). */
export function probeAtTime(
  series: SampleProbeSeries,
  timeSeconds: number,
): SampleProbeSample | null {
  const { samples, baseIntervalSeconds, stepMultiple, rowCount } = series;
  if (samples.length === 0 || rowCount <= 0) return null;

  let rowIndex = rowIndexAtTime(rowCount, timeSeconds, baseIntervalSeconds);
  rowIndex -= rowIndex % stepMultiple;

  let sample = samples[0]!;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i]!;
    if (s.rowIndex <= rowIndex) sample = s;
    else break;
  }

  return sample;
}
