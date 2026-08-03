import { FLUME, structureCenterX, terrainGridDims } from '@/constants/experiment';
import { buildProbeFluidSeries } from '@/data/buildProbeFluidSeries';
import {
  bedGridSize,
  buildBedAxes,
  inferPierWorldPositionsFromDataset,
  mergeDeltaByMaxAbs,
  reduceScrdifToBed,
  resampleBedToTerrain,
  type BedAxes,
} from '@/data/buildScrdifBedField';
import type { PierDefinition } from '@/modules/PierMarker';
import type { FluidSeries } from '@/types/fluid';
import type { ScourFrame, ScourSeries, TerrainGrid } from '@/types/terrain';
import { DEFAULT_SIM_PARAMS, type PierArrangement } from '@/types/simParams';
import {
  DEFAULT_T_INTERVAL_SECONDS,
  datasetFromColumns,
  type SampleProbeColumns,
  type SampleProbeDataset,
  type SampleProbeTimeBlock,
} from '@/utils/parseSampleProbeCsv';
import { buildCenteredPierLayout, buildPierLayout, clampPierCount } from '@/utils/pierLayout';
import {
  probeDataXToWorldX,
  probeDataYToWorldZ,
  probeWorldAnchor,
  type ProbeWorldAnchor,
} from '@/utils/probeWorldCoords';

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
  /** worldX = dataX - originDataX (수조 입구 기준 X). */
  originDataX: number;
  /** worldZ = dataY - originDataY (횡단 중심 기준 Z). */
  originDataY: number;
  minScrdif: number;
  maxScrdif: number;
}

export interface SampleProbeSample {
  t: number;
  /** 시간 블록 인덱스(0-based). */
  timeIndex: number;
  /** @deprecated timeIndex 와 동일. UI 호환용. */
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
  /** 전체 시간 블록 수(stride 적용 전). */
  rowCount: number;
  baseIntervalSeconds: number;
  stepMultiple: number;
  durationSeconds: number;
  bounds: SampleProbeBounds;
}

export interface SampleProbeDashboard {
  scour: ScourSeries;
  probeSeries: SampleProbeSeries;
  /** t 블록 행 데이터로 만든 3D 유체 필드. 공간 데이터가 없으면 null. */
  fluid: FluidSeries | null;
}

export interface BuildSampleProbeDashboardOptions {
  baseIntervalSeconds?: number;
  /** 시간 블록 stride(1=모든 t, 2=하나 건너뛰기…). */
  stepMultiple?: number;
  pierX?: number;
  pierZ?: number;
  pierCount?: number;
  pierArrangement?: PierArrangement;
  pierDiameter?: number;
  scourRate?: number;
  sandGrainSizeMm?: number;
  permeable?: boolean;
  inflowSpeed?: number;
  tankHeightY?: number;
  /** CSV x 를 월드 X 로 맞출 때 쓰는 수조 길이(미터). 기본 FLUME.tank.lengthX. */
  tankLengthX?: number;
}

const SCRDIF_EPS = 1e-12;
export const MAX_SCOUR_FRAMES = 4096;
const MAX_SCOUR_FRAME_BYTES = 256 * 1024 * 1024;
const DEFAULT_INFLOW_SPEED = 0.25;
const FLOW_SPEED_EPS = 1e-9;

export interface MeanFlowSnapshot {
  meanU: number;
  meanV: number;
  meanW: number;
  horizontalSpeed: number;
  flowHeading: number;
  inflowSpeed: number;
}

/** CSV 전체(또는 한 블록) 평균 유속 → 월드 XZ 흐름 방향·세기. 유속 0 이면 기본 inflowSpeed 폴백. */
export function computeMeanFlow(columns: SampleProbeColumns): MeanFlowSnapshot {
  let sumU = 0;
  let sumV = 0;
  let sumW = 0;
  for (let i = 0; i < columns.count; i += 1) {
    sumU += columns.u[i]!;
    sumV += columns.v[i]!;
    sumW += columns.w[i]!;
  }
  const n = Math.max(1, columns.count);
  const meanU = sumU / n;
  const meanV = sumV / n;
  const meanW = sumW / n;
  const horizontalSpeed = Math.hypot(meanU, meanV);
  const flowHeading =
    horizontalSpeed >= FLOW_SPEED_EPS ? Math.atan2(meanV, meanU) : 0;
  const inflowSpeed =
    horizontalSpeed >= FLOW_SPEED_EPS ? horizontalSpeed : DEFAULT_INFLOW_SPEED;
  return { meanU, meanV, meanW, horizontalSpeed, flowHeading, inflowSpeed };
}

function blockAggregate(columns: SampleProbeColumns): {
  meanU: number;
  meanV: number;
  meanW: number;
  meanScrdif: number;
  maxAbsScrdif: number;
  centerX: number;
  centerY: number;
  centerZ: number;
} {
  let sumU = 0;
  let sumV = 0;
  let sumW = 0;
  let sumS = 0;
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let maxAbs = 0;
  const n = Math.max(1, columns.count);
  for (let i = 0; i < columns.count; i += 1) {
    const u = columns.u[i]!;
    const v = columns.v[i]!;
    const w = columns.w[i]!;
    const s = columns.scrdif[i]!;
    sumU += u;
    sumV += v;
    sumW += w;
    sumS += s;
    sumX += columns.x[i]!;
    sumY += columns.y[i]!;
    sumZ += columns.z[i]!;
    const abs = Math.abs(s);
    if (abs > maxAbs) maxAbs = abs;
  }
  return {
    meanU: sumU / n,
    meanV: sumV / n,
    meanW: sumW / n,
    meanScrdif: sumS / n,
    maxAbsScrdif: maxAbs,
    centerX: sumX / n,
    centerY: sumY / n,
    centerZ: sumZ / n,
  };
}

/** CSV bounds 에 scrdif 신호가 없는지 판별한다. */
export function csvScrdifIsAllZero(bounds: SampleProbeBounds): boolean {
  return Math.abs(bounds.maxScrdif) < SCRDIF_EPS && Math.abs(bounds.minScrdif) < SCRDIF_EPS;
}

/** CSV 교각 배치. pierX/pierZ 지정 시 단일 기둥으로 고정한다. */
export function resolveHybridPierLayout(
  options: BuildSampleProbeDashboardOptions = {},
): PierDefinition[] {
  if (options.pierX !== undefined || options.pierZ !== undefined) {
    const pierDiameter = options.pierDiameter ?? FLUME.structure.diameterM;
    const tankHeightY = options.tankHeightY ?? FLUME.tank.heightY;
    return [
      {
        id: 'P1',
        x: options.pierX ?? structureCenterX(),
        z: options.pierZ ?? 0,
        diameter: pierDiameter,
        height: tankHeightY + 0.03,
        shape: 'circle',
      },
    ];
  }

  const params = {
    ...DEFAULT_SIM_PARAMS,
    pierCount: options.pierCount ?? DEFAULT_SIM_PARAMS.pierCount,
    pierArrangement: options.pierArrangement ?? DEFAULT_SIM_PARAMS.pierArrangement,
    pierDiameter: options.pierDiameter ?? DEFAULT_SIM_PARAMS.pierDiameter,
    tankHeightY: options.tankHeightY ?? DEFAULT_SIM_PARAMS.tankHeightY,
  };
  return buildPierLayout(params);
}

function csvLayoutParams(options: BuildSampleProbeDashboardOptions) {
  return {
    ...DEFAULT_SIM_PARAMS,
    pierCount: options.pierCount ?? DEFAULT_SIM_PARAMS.pierCount,
    pierArrangement: options.pierArrangement ?? DEFAULT_SIM_PARAMS.pierArrangement,
    pierDiameter: options.pierDiameter ?? DEFAULT_SIM_PARAMS.pierDiameter,
    tankHeightY: options.tankHeightY ?? DEFAULT_SIM_PARAMS.tankHeightY,
  };
}

function pierDefinitionsFromWorldPositions(
  worlds: Array<{ x: number; z: number }>,
  options: BuildSampleProbeDashboardOptions,
): PierDefinition[] {
  const pierDiameter = options.pierDiameter ?? FLUME.structure.diameterM;
  const tankHeightY = options.tankHeightY ?? FLUME.tank.heightY;
  return worlds.map((w, i) => ({
    id: `P${i + 1}`,
    x: w.x,
    z: w.z,
    diameter: pierDiameter,
    height: tankHeightY + 0.03,
    shape: 'circle' as const,
  }));
}

/**
 * CSV 대시보드 교각 배치.
 * 기본은 지형·CSV 데이터 중심(월드 x=0, z=0)에 둔다.
 * pierCount≥2 이고 scrdif 신호가 있으면 국소 최대 위치를 사용한다.
 */
export function resolveCsvPierLayout(
  dataset: SampleProbeDataset,
  bounds: SampleProbeBounds,
  options: BuildSampleProbeDashboardOptions = {},
): PierDefinition[] {
  if (options.pierX !== undefined || options.pierZ !== undefined) {
    return resolveHybridPierLayout(options);
  }

  const pierCount = clampPierCount(options.pierCount ?? 1);
  if (pierCount === 1) {
    return pierDefinitionsFromWorldPositions([{ x: 0, z: 0 }], options);
  }

  if (csvScrdifIsAllZero(bounds)) {
    return buildCenteredPierLayout(csvLayoutParams(options));
  }

  const pierDiameter = options.pierDiameter ?? FLUME.structure.diameterM;
  const worlds = inferPierWorldPositionsFromDataset(
    dataset,
    boundsWorldAnchor(bounds),
    pierCount,
    2.5 * pierDiameter,
  );

  if (worlds.length === 0) {
    return buildCenteredPierLayout(csvLayoutParams(options));
  }

  return pierDefinitionsFromWorldPositions(worlds, options);
}

/** 교각별 CSV 각각에서 도메인 중심(0,0)에 교각 1개씩 배치한다. */
export function resolveMultiCsvPierLayout(
  pierDatasets: SampleProbeDataset[],
  options: BuildSampleProbeDashboardOptions = {},
): PierDefinition[] {
  if (options.pierX !== undefined || options.pierZ !== undefined) {
    return resolveHybridPierLayout(options);
  }

  return pierDatasets.map(
    () => pierDefinitionsFromWorldPositions([{ x: 0, z: 0 }], options)[0]!,
  );
}

/** 세굴 프레임 한도 안에 들어오도록 시간 블록 stride 를 올린다. */
export function resolveSafeStepMultiple(
  requestedStep: number,
  totalTimeBlocks: number,
  maxFrames = MAX_SCOUR_FRAMES,
): number {
  const requested = Math.max(1, Math.floor(requestedStep));
  if (totalTimeBlocks <= 0) return requested;
  const minStep = Math.ceil(totalTimeBlocks / maxFrames);
  return Math.max(requested, minStep);
}

function resolveTerrainGrid(piers: PierDefinition[]): TerrainGrid {
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
      piers: piers.map((pier) => {
        const meta: { id: string; x: number; z: number; diameter?: number; height?: number } = {
          id: pier.id,
          x: pier.x,
          z: pier.z,
        };
        if (pier.diameter !== undefined) meta.diameter = pier.diameter;
        if (pier.height !== undefined) meta.height = pier.height;
        return meta;
      }),
    },
  };
}

function assertScourMemoryBudget(frameCount: number, terrain: TerrainGrid): void {
  if (frameCount > MAX_SCOUR_FRAMES) {
    throw new Error(
      '세굴 프레임 메모리가 너무 큽니다. 재생 간격을 늘리거나 t 블록 수가 적은 CSV를 사용해 주세요.',
    );
  }

  const vertexCount = terrain.width * terrain.height;
  const estimatedBytes = frameCount * vertexCount * Float32Array.BYTES_PER_ELEMENT;
  if (estimatedBytes > MAX_SCOUR_FRAME_BYTES) {
    throw new Error(
      '세굴 프레임 메모리가 너무 큽니다. 재생 간격을 늘리거나 t 블록 수가 적은 CSV를 사용해 주세요.',
    );
  }
}

export function computeBounds(
  columns: SampleProbeColumns,
  tankLengthX: number = FLUME.tank.lengthX,
): SampleProbeBounds {
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

  const anchor = probeWorldAnchor(tankLengthX);

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
    originDataX: anchor.originDataX,
    originDataY: anchor.originDataY,
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
  const anchor: ProbeWorldAnchor = {
    originDataX: bounds.originDataX,
    originDataY: bounds.originDataY,
  };
  return {
    x: probeDataXToWorldX(dataX, anchor),
    y: dataZ - bounds.centerDataZ,
    z: probeDataYToWorldZ(dataY, anchor),
  };
}

export function boundsWorldAnchor(bounds: SampleProbeBounds): ProbeWorldAnchor {
  return {
    originDataX: bounds.originDataX,
    originDataY: bounds.originDataY,
  };
}

export function probeDurationSeconds(timeBlockCount: number, intervalSeconds = 30): number {
  if (timeBlockCount <= 0) return 0;
  return (timeBlockCount - 1) * intervalSeconds;
}

export function timeIndexAtTime(
  timeBlockCount: number,
  timeSeconds: number,
  intervalSeconds = 30,
): number {
  if (timeBlockCount <= 0) return 0;
  return Math.min(
    timeBlockCount - 1,
    Math.max(0, Math.floor(timeSeconds / intervalSeconds)),
  );
}

/** @deprecated timeIndexAtTime 사용. */
export function rowIndexAtTime(
  rowCount: number,
  timeSeconds: number,
  intervalSeconds = 30,
): number {
  return timeIndexAtTime(rowCount, timeSeconds, intervalSeconds);
}

function isProbeDataset(
  input: SampleProbeDataset | SampleProbeColumns,
): input is SampleProbeDataset {
  return 'blocks' in input && Array.isArray((input as SampleProbeDataset).blocks);
}

function toDataset(
  input: SampleProbeDataset | SampleProbeColumns,
  baseIntervalSeconds: number,
): SampleProbeDataset {
  if (isProbeDataset(input)) return input;
  return datasetFromColumns(input, { baseIntervalSeconds });
}

/**
 * t 블록마다 한 프레임. 각 행의 scrdif 를 (x, y) 위치에 배치해 하상 변화량을 만든다.
 * scrdif 는 초기 지반 대비 누적값이므로 부호(세굴/퇴적)를 그대로 사용한다.
 */
function buildScourFramesFromBlocks(
  blocks: SampleProbeTimeBlock[],
  terrain: TerrainGrid,
  loopStep: number,
  bedAxes: BedAxes,
  anchor: ProbeWorldAnchor,
): ScourFrame[] {
  const frames: ScourFrame[] = [];
  const { width, height } = terrain;
  const bedScratch = new Float32Array(bedGridSize(bedAxes));

  for (let i = 0; i < blocks.length; i += loopStep) {
    const block = blocks[i]!;
    reduceScrdifToBed(block.columns, bedAxes.x, bedAxes.y, bedScratch);

    const delta = new Float32Array(width * height);
    resampleBedToTerrain(
      bedScratch,
      bedAxes.x,
      bedAxes.y,
      anchor,
      terrain,
      delta,
    );

    frames.push({
      timestampSeconds: block.timestampSeconds,
      deltaElevations: delta,
    });
  }

  return frames;
}

function buildProbeSamplesFromBlocks(
  blocks: SampleProbeTimeBlock[],
  bounds: SampleProbeBounds,
  loopStep: number,
): SampleProbeSample[] {
  const samples: SampleProbeSample[] = [];

  for (let i = 0; i < blocks.length; i += loopStep) {
    const block = blocks[i]!;
    const agg = blockAggregate(block.columns);
    const world = dataToWorld(agg.centerX, agg.centerY, agg.centerZ, bounds);
    samples.push({
      t: block.timestampSeconds,
      timeIndex: block.timeIndex,
      rowIndex: block.timeIndex,
      dataX: agg.centerX,
      dataY: agg.centerY,
      dataZ: agg.centerZ,
      worldX: world.x,
      worldY: world.y,
      worldZ: world.z,
      u: agg.meanU,
      v: agg.meanV,
      w: agg.meanW,
      scrdif: agg.meanScrdif,
    });
  }

  return samples;
}

/** t 블록 Dataset(또는 단일 Columns)을 세굴·프로브 시리즈로 변환한다. */
export function buildSampleProbeDashboard(
  input: SampleProbeDataset | SampleProbeColumns,
  options: BuildSampleProbeDashboardOptions = {},
): SampleProbeDashboard {
  const baseIntervalSeconds =
    options.baseIntervalSeconds ??
    ('baseIntervalSeconds' in input ? input.baseIntervalSeconds : undefined) ??
    DEFAULT_T_INTERVAL_SECONDS;
  const requestedStep = Math.max(1, Math.floor(options.stepMultiple ?? 1));
  const dataset = toDataset(input, baseIntervalSeconds);
  const totalBlocks = dataset.blocks.length;
  const loopStep = resolveSafeStepMultiple(requestedStep, totalBlocks);

  const tankLengthX = options.tankLengthX ?? FLUME.tank.lengthX;
  const bounds = computeBounds(dataset.flatColumns, tankLengthX);
  const anchor = boundsWorldAnchor(bounds);
  const pierLayout = resolveCsvPierLayout(dataset, bounds, options);
  const baseTerrain = resolveTerrainGrid(pierLayout);
  const bedAxes = buildBedAxes(dataset);

  const frameCount = Math.ceil(totalBlocks / loopStep);
  assertScourMemoryBudget(frameCount, baseTerrain);

  const frames = buildScourFramesFromBlocks(
    dataset.blocks,
    baseTerrain,
    loopStep,
    bedAxes,
    anchor,
  );

  const samples = buildProbeSamplesFromBlocks(dataset.blocks, bounds, loopStep);
  const fluid = buildProbeFluidSeries(dataset, { stepMultiple: loopStep, tankLengthX });

  return {
    scour: { baseTerrain, frames },
    fluid,
    probeSeries: {
      samples,
      rowCount: totalBlocks,
      baseIntervalSeconds: dataset.baseIntervalSeconds || baseIntervalSeconds,
      stepMultiple: loopStep,
      durationSeconds: probeDurationSeconds(
        totalBlocks,
        dataset.baseIntervalSeconds || baseIntervalSeconds,
      ),
      bounds,
    },
  };
}

/**
 * 교각별 CSV(각 t 블록 = 한 시점)로 세굴 프레임을 만든다.
 * 각 교각은 자기 CSV 의 해당 t 블록 실측 scrdif 필드를 사용한다.
 */
export function buildMultiPierScourFrames(
  pierDatasets: SampleProbeDataset[],
  terrain: TerrainGrid,
  loopStep: number,
  maxBlocks: number,
  baseIntervalSeconds: number,
  bedAxes: BedAxes,
  anchor: ProbeWorldAnchor,
): ScourFrame[] {
  const frames: ScourFrame[] = [];
  const { width, height } = terrain;
  const bedScratch = new Float32Array(bedGridSize(bedAxes));
  const pierDelta = new Float32Array(width * height);

  for (let timeIndex = 0; timeIndex < maxBlocks; timeIndex += loopStep) {
    const delta = new Float32Array(width * height);

    for (const ds of pierDatasets) {
      const block = ds.blocks[Math.min(timeIndex, Math.max(0, ds.blocks.length - 1))]!;
      reduceScrdifToBed(block.columns, bedAxes.x, bedAxes.y, bedScratch);
      resampleBedToTerrain(
        bedScratch,
        bedAxes.x,
        bedAxes.y,
        anchor,
        terrain,
        pierDelta,
      );
      mergeDeltaByMaxAbs(delta, pierDelta);
    }

    frames.push({
      timestampSeconds: timeIndex * baseIntervalSeconds,
      deltaElevations: delta,
    });
  }

  return frames;
}

/**
 * 교각 1개당 CSV 1개 입력으로 세굴·프로브 시리즈를 만든다.
 */
export function buildSampleProbeDashboardMulti(
  pierInputs: Array<SampleProbeDataset | SampleProbeColumns>,
  options: BuildSampleProbeDashboardOptions = {},
): SampleProbeDashboard {
  if (pierInputs.length === 0) {
    throw new Error('buildSampleProbeDashboardMulti: 최소 1개의 CSV 데이터가 필요합니다.');
  }

  const baseIntervalSeconds = options.baseIntervalSeconds ?? DEFAULT_T_INTERVAL_SECONDS;
  const pierDatasets = pierInputs.map((input) => toDataset(input, baseIntervalSeconds));

  if (pierDatasets.length === 1) {
    return buildSampleProbeDashboard(pierDatasets[0]!, options);
  }

  const requestedStep = Math.max(1, Math.floor(options.stepMultiple ?? 1));
  const maxBlocks = Math.max(...pierDatasets.map((d) => d.blocks.length));
  const loopStep = resolveSafeStepMultiple(requestedStep, maxBlocks);

  const pierOptions: BuildSampleProbeDashboardOptions = {
    ...options,
    pierCount: pierDatasets.length,
  };
  const pierLayout = resolveMultiCsvPierLayout(pierDatasets, pierOptions);
  const baseTerrain = resolveTerrainGrid(pierLayout);

  const tankLengthX = options.tankLengthX ?? FLUME.tank.lengthX;
  const primary = pierDatasets[0]!;
  const bounds = computeBounds(primary.flatColumns, tankLengthX);
  const anchor = boundsWorldAnchor(bounds);
  const bedAxes = buildBedAxes(primary);

  const frameCount = Math.ceil(maxBlocks / loopStep);
  assertScourMemoryBudget(frameCount, baseTerrain);

  const frames = buildMultiPierScourFrames(
    pierDatasets,
    baseTerrain,
    loopStep,
    maxBlocks,
    baseIntervalSeconds,
    bedAxes,
    anchor,
  );
  const samples = buildProbeSamplesFromBlocks(primary.blocks, bounds, loopStep);

  return {
    scour: { baseTerrain, frames },
    fluid: buildProbeFluidSeries(primary, { stepMultiple: loopStep, tankLengthX }),
    probeSeries: {
      samples,
      rowCount: maxBlocks,
      baseIntervalSeconds,
      stepMultiple: loopStep,
      durationSeconds: probeDurationSeconds(maxBlocks, baseIntervalSeconds),
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

  let timeIndex = timeIndexAtTime(rowCount, timeSeconds, baseIntervalSeconds);
  timeIndex -= timeIndex % stepMultiple;

  let sample = samples[0]!;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i]!;
    if (s.timeIndex <= timeIndex) sample = s;
    else break;
  }

  return sample;
}

/** 프로브 시계열에서 u/v/w/scrdif 중 하나의 min/max 를 구한다 (수면 색·범례·차트 범위 계산용). */
export function probeSeriesValueRange(
  series: SampleProbeSeries,
  key: 'u' | 'v' | 'w' | 'scrdif',
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const s of series.samples) {
    const v = s[key];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!isFinite(min) || !isFinite(max) || min === max) {
    return { min: 0, max: 1 };
  }
  return { min, max };
}
