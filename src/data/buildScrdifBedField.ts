import { terrainGridDims } from '@/constants/experiment';
import type { TerrainGrid } from '@/types/terrain';
import { terrainGridToWorldXZ } from '@/utils/fluidWorld';
import { buildDataAxis, nearestIndex, type DataAxis } from '@/utils/probeDataAxis';
import {
  probeWorldXToDataX,
  probeWorldZToDataY,
  type ProbeWorldAnchor,
} from '@/utils/probeWorldCoords';
import { detectScourHoles, type ScourHole } from '@/utils/scourHoleDetect';
import { applyInflowBoundaryMaskToBed, isHungryWaterScourDataX } from '@/utils/flumeInflowBoundary';
import type { SampleProbeColumns, SampleProbeDataset } from '@/utils/parseSampleProbeCsv';

export interface BedAxes {
  x: DataAxis;
  y: DataAxis;
}

/** Dataset 전체에서 하상 (x, y) 좌표축을 한 번만 만든다. */
export function buildBedAxes(dataset: SampleProbeDataset): BedAxes {
  const reference = dataset.blocks.reduce((best, block) =>
    block.columns.count > best.columns.count ? block : best,
  );
  return {
    x: buildDataAxis(reference.columns.x, reference.columns.count),
    y: buildDataAxis(reference.columns.y, reference.columns.count),
  };
}

export function bedGridSize(axes: BedAxes): number {
  return axes.x.values.length * axes.y.values.length;
}

/**
 * t 블록 공간 행을 (x, y) 하상 격자로 축약한다.
 * 같은 (x, y) 에 z 가 다른 행이 여러 개면 |scrdif| 가 가장 큰 행의 부호 있는 값을 남긴다.
 */
export function reduceScrdifToBed(
  columns: SampleProbeColumns,
  xAxis: DataAxis,
  yAxis: DataAxis,
  out: Float32Array,
  maskInflowBoundary = false,
): void {
  out.fill(0);
  const nx = xAxis.values.length;

  for (let r = 0; r < columns.count; r += 1) {
    const dataX = columns.x[r];
    if (maskInflowBoundary && isHungryWaterScourDataX(dataX)) continue;
    const xi = nearestIndex(xAxis.values, dataX);
    const yi = nearestIndex(yAxis.values, columns.y[r]);
    const idx = yi * nx + xi;
    const s = columns.scrdif[r];
    if (Math.abs(s) > Math.abs(out[idx])) {
      out[idx] = s;
    }
  }

  if (maskInflowBoundary) {
    applyInflowBoundaryMaskToBed(out, { x: xAxis, y: yAxis });
  }
}

function findBracket(
  values: Float64Array,
  v: number,
): { i0: number; i1: number; t: number } | null {
  if (values.length === 0) return null;
  if (values.length === 1) return { i0: 0, i1: 0, t: 0 };
  if (v < values[0] || v > values[values.length - 1]) return null;

  let lo = 0;
  let hi = values.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (values[mid] <= v) lo = mid;
    else hi = mid;
  }

  const i0 = lo;
  const i1 = Math.min(values.length - 1, lo + 1);
  const span = values[i1] - values[i0];
  const t = span > 0 ? (v - values[i0]) / span : 0;
  return { i0, i1, t };
}

function sampleBedBilinear(
  bed: Float32Array,
  xAxis: DataAxis,
  yAxis: DataAxis,
  dataX: number,
  dataY: number,
  terrainCellSize: number,
): number {
  const nx = xAxis.values.length;
  const ny = yAxis.values.length;
  if (nx === 0 || ny === 0) return 0;

  const marginX = Math.max(xAxis.spacing * 0.5, terrainCellSize * 0.51);
  const marginY = Math.max(yAxis.spacing * 0.5, terrainCellSize * 0.51);
  const minX = xAxis.values[0];
  const maxX = xAxis.values[nx - 1];
  const minY = yAxis.values[0];
  const maxY = yAxis.values[ny - 1];

  if (dataX < minX - marginX || dataX > maxX + marginX) return 0;
  if (dataY < minY - marginY || dataY > maxY + marginY) return 0;

  const clampedX = Math.max(minX, Math.min(maxX, dataX));
  const clampedY = Math.max(minY, Math.min(maxY, dataY));

  const xBracket = findBracket(xAxis.values, clampedX);
  const yBracket = findBracket(yAxis.values, clampedY);
  if (!xBracket || !yBracket) return 0;

  const { i0: x0, i1: x1, t: tx } = xBracket;
  const { i0: y0, i1: y1, t: ty } = yBracket;

  const c00 = bed[y0 * nx + x0] ?? 0;
  const c10 = bed[y0 * nx + x1] ?? 0;
  const c01 = bed[y1 * nx + x0] ?? 0;
  const c11 = bed[y1 * nx + x1] ?? 0;
  const c0 = c00 * (1 - tx) + c10 * tx;
  const c1 = c01 * (1 - tx) + c11 * tx;
  return c0 * (1 - ty) + c1 * ty;
}

/**
 * CSV 하상 격자를 지형 격자로 이중선형 보간한다.
 * CSV 발자국 밖은 0(변화 없음), 외삽은 하지 않는다.
 */
export function resampleBedToTerrain(
  bed: Float32Array,
  xAxis: DataAxis,
  yAxis: DataAxis,
  anchor: ProbeWorldAnchor,
  terrain: TerrainGrid,
  out: Float32Array,
): void {
  const { width, height } = terrain;
  out.fill(0);

  for (let gy = 0; gy < height; gy += 1) {
    for (let gx = 0; gx < width; gx += 1) {
      const { x: worldX, z: worldZ } = terrainGridToWorldXZ(gx, gy, terrain);
      const dataX = probeWorldXToDataX(worldX, anchor);
      const dataY = probeWorldZToDataY(worldZ, anchor);
      out[gy * width + gx] = sampleBedBilinear(bed, xAxis, yAxis, dataX, dataY, terrain.cellSize);
    }
  }
}

/** 겹치는 격자 셀마다 |값| 이 더 큰 쪽을 남긴다. */
export function mergeDeltaByMaxAbs(dst: Float32Array, src: Float32Array): void {
  for (let i = 0; i < dst.length; i += 1) {
    if (Math.abs(src[i]) > Math.abs(dst[i])) {
      dst[i] = src[i]!;
    }
  }
}

/** 월드 XZ에서 지형 Δ 격자를 bilinear 보간 (단면·프로브 공용). */
export function sampleDeltaBilinear(
  delta: Float32Array,
  terrain: TerrainGrid,
  worldX: number,
  worldZ: number,
): number {
  const { width, height, cellSize } = terrain;
  const halfW = ((width - 1) * cellSize) / 2;
  const halfH = ((height - 1) * cellSize) / 2;
  const fx = (worldX + halfW) / cellSize;
  const fy = (worldZ + halfH) / cellSize;
  if (fx < 0 || fy < 0 || fx > width - 1 || fy > height - 1) return 0;

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const c00 = delta[y0 * width + x0] ?? 0;
  const c10 = delta[y0 * width + x1] ?? 0;
  const c01 = delta[y1 * width + x0] ?? 0;
  const c11 = delta[y1 * width + x1] ?? 0;
  const c0 = c00 * (1 - tx) + c10 * tx;
  const c1 = c01 * (1 - tx) + c11 * tx;
  return c0 * (1 - ty) + c1 * ty;
}

function deltaWeightedCentroidWorld(
  delta: Float32Array,
  terrain: TerrainGrid,
  cellWeight: (v: number) => number,
): { x: number; z: number } {
  const { width, height } = terrain;
  let sumW = 0;
  let sumX = 0;
  let sumZ = 0;
  for (let gy = 0; gy < height; gy += 1) {
    for (let gx = 0; gx < width; gx += 1) {
      const v = delta[gy * width + gx] ?? 0;
      const w = cellWeight(v);
      if (w < 1e-9) continue;
      const { x, z } = terrainGridToWorldXZ(gx, gy, terrain);
      sumW += w;
      sumX += x * w;
      sumZ += z * w;
    }
  }
  if (sumW < 1e-12) return { x: 0, z: 0 };
  return { x: sumX / sumW, z: sumZ / sumW };
}

/** 지형 Δ 필드의 |값| 가중 중심(월드 XZ). */
export function deltaCentroidWorld(
  delta: Float32Array,
  terrain: TerrainGrid,
): { x: number; z: number } {
  return deltaWeightedCentroidWorld(delta, terrain, (v) => Math.abs(v));
}

/** 세굴(Δ<0) 중심 — 퇴적 꼬리가 교각 정렬을 끌어당기지 않게 한다. */
export function deltaScourCentroidWorld(
  delta: Float32Array,
  terrain: TerrainGrid,
): { x: number; z: number } {
  const { width, height } = terrain;
  let sumW = 0;
  let sumX = 0;
  let sumZ = 0;
  for (let gy = 0; gy < height; gy += 1) {
    for (let gx = 0; gx < width; gx += 1) {
      const v = delta[gy * width + gx] ?? 0;
      if (v >= 0) continue;
      const w = -v;
      const { x, z } = terrainGridToWorldXZ(gx, gy, terrain);
      sumW += w;
      sumX += x * w;
      sumZ += z * w;
    }
  }
  if (sumW >= 1e-12) return { x: sumX / sumW, z: sumZ / sumW };
  return deltaCentroidWorld(delta, terrain);
}

/** 월드 XZ 기준으로 Δ 필드를 평행 이동(형상 유지). */
export function relocateDeltaFieldByWorldShift(
  source: Float32Array,
  terrain: TerrainGrid,
  fromWorld: { x: number; z: number },
  toWorld: { x: number; z: number },
): Float32Array {
  const { width, height } = terrain;
  const shiftX = toWorld.x - fromWorld.x;
  const shiftZ = toWorld.z - fromWorld.z;
  const out = new Float32Array(width * height);

  for (let gy = 0; gy < height; gy += 1) {
    for (let gx = 0; gx < width; gx += 1) {
      const { x, z } = terrainGridToWorldXZ(gx, gy, terrain);
      out[gy * width + gx] = sampleDeltaBilinear(source, terrain, x - shiftX, z - shiftZ);
    }
  }
  return out;
}

/** Δ 필드를 교각 위치로 평행 이동(세굴 중심 → pier). */
export function relocateDeltaFieldToPier(
  source: Float32Array,
  terrain: TerrainGrid,
  pier: { x: number; z: number },
): Float32Array {
  const from = deltaScourCentroidWorld(source, terrain);
  return relocateDeltaFieldByWorldShift(source, terrain, from, pier);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * 유량 +X 기준 타원형 페더: 교각 앞(세굴) · 뒤(퇴적 꼬리) 길이를 다르게, 경계는 부드럽게 0으로.
 */
export function featherDeltaAtPierFootprint(
  delta: Float32Array,
  terrain: TerrainGrid,
  pier: { x: number; z: number; diameter: number },
  flowHeadingRad = 0,
): void {
  const d = Math.max(pier.diameter, 0.05);
  const cos = Math.cos(flowHeadingRad);
  const sin = Math.sin(flowHeadingRad);
  const upstream = 1.55 * d;
  const downstream = 3.4 * d;
  const lateral = 2.1 * d;
  const { width, height } = terrain;

  for (let gy = 0; gy < height; gy += 1) {
    for (let gx = 0; gx < width; gx += 1) {
      const idx = gy * width + gx;
      const v = delta[idx] ?? 0;
      if (Math.abs(v) < 1e-12) continue;

      const { x, z } = terrainGridToWorldXZ(gx, gy, terrain);
      const dx = x - pier.x;
      const dz = z - pier.z;
      const along = dx * cos + dz * sin;
      const cross = -dx * sin + dz * cos;

      const alongExtent = along < 0 ? upstream : downstream;
      const nx = along / alongExtent;
      const nz = cross / lateral;
      const r = Math.hypot(nx, nz);
      const w = r <= 0.65 ? 1 : 1 - smoothstep(0.78, 1.02, r);
      delta[idx] = v * w;
    }
  }
}

/** @deprecated featherDeltaAtPierFootprint 사용 */
export function maskDeltaToPierFootprint(
  delta: Float32Array,
  terrain: TerrainGrid,
  pier: { x: number; z: number; diameter: number },
  _radiusFactor = 2.75,
): void {
  featherDeltaAtPierFootprint(delta, terrain, pier, 0);
}

const SCRDIF_SIGNAL_EPS = 1e-12;

/** 모든 t 블록을 훑어 (x, y) 셀마다 |scrdif| 최대(부호 유지) 하상장을 만든다. */
export function buildMaxAbsScrdifBed(
  dataset: SampleProbeDataset,
  bedAxes: BedAxes,
  maskInflowBoundary = false,
): Float32Array {
  const bed = new Float32Array(bedGridSize(bedAxes));
  const scratch = new Float32Array(bedGridSize(bedAxes));

  for (const block of dataset.blocks) {
    reduceScrdifToBed(block.columns, bedAxes.x, bedAxes.y, scratch, maskInflowBoundary);
    for (let i = 0; i < bed.length; i += 1) {
      if (Math.abs(scratch[i]) > Math.abs(bed[i])) {
        bed[i] = scratch[i]!;
      }
    }
  }

  return bed;
}

/** 모든 t 블록을 훑어 (x, y) 셀마다 가장 깊은 세굴(최소 Δ) 하상장을 만든다. */
export function buildDeepestScourBed(
  dataset: SampleProbeDataset,
  bedAxes: BedAxes,
  maskInflowBoundary = false,
): Float32Array {
  const size = bedGridSize(bedAxes);
  const bed = new Float32Array(size);
  bed.fill(0);
  const scratch = new Float32Array(size);

  for (const block of dataset.blocks) {
    reduceScrdifToBed(block.columns, bedAxes.x, bedAxes.y, scratch, maskInflowBoundary);
    for (let i = 0; i < bed.length; i += 1) {
      const s = scratch[i];
      if (s < bed[i]) bed[i] = s;
    }
  }

  return bed;
}

export interface PierWorldCandidate {
  x: number;
  z: number;
  maxDepthM: number;
}

export interface ScrdifCentroid {
  dataX: number;
  dataY: number;
  weight: number;
}

interface BedPeakCandidate {
  dataX: number;
  dataY: number;
  weight: number;
}

function dataDistanceM(a: BedPeakCandidate, b: BedPeakCandidate): number {
  return Math.hypot(a.dataX - b.dataX, a.dataY - b.dataY);
}

/**
 * 하상 scrdif 장에서 교각 후보 위치를 찾는다.
 * pierCount=1 이면 |scrdif| 최대 셀, 2+ 이면 국소 최대값을 greedy 로 고른다.
 */
export function inferScrdifCentroids(
  bed: Float32Array,
  bedAxes: BedAxes,
  pierCount: number,
  minSeparationM: number,
): ScrdifCentroid[] {
  const nx = bedAxes.x.values.length;
  const ny = bedAxes.y.values.length;
  const candidates: BedPeakCandidate[] = [];

  for (let yi = 0; yi < ny; yi += 1) {
    for (let xi = 0; xi < nx; xi += 1) {
      const weight = Math.abs(bed[yi * nx + xi]);
      if (weight <= SCRDIF_SIGNAL_EPS) continue;
      candidates.push({
        dataX: bedAxes.x.values[xi],
        dataY: bedAxes.y.values[yi],
        weight,
      });
    }
  }

  if (candidates.length === 0) return [];

  if (pierCount <= 1) {
    let best = candidates[0];
    for (const c of candidates) {
      if (c.weight > best.weight) best = c;
    }
    return [best];
  }

  candidates.sort((a, b) => b.weight - a.weight);
  const minSep = Math.max(minSeparationM, 0);
  const picked: BedPeakCandidate[] = [];

  for (const c of candidates) {
    if (picked.length >= pierCount) break;
    const tooClose = picked.some((p) => dataDistanceM(p, c) < minSep);
    if (!tooClose) picked.push(c);
  }

  while (picked.length < pierCount && picked.length < candidates.length) {
    const next = candidates.find(
      (c) => !picked.includes(c) && !picked.some((p) => dataDistanceM(p, c) < minSep),
    );
    if (!next) break;
    picked.push(next);
  }

  return picked.map((c) => ({
    dataX: c.dataX,
    dataY: c.dataY,
    weight: c.weight,
  }));
}

/** Dataset 전체 scrdif 신호에서 교각 (dataX, dataY) 후보를 추정한다. */
export function inferScrdifCentroidsFromDataset(
  dataset: SampleProbeDataset,
  pierCount: number,
  minSeparationM: number,
  maskInflowBoundary = false,
): ScrdifCentroid[] {
  const bedAxes = buildBedAxes(dataset);
  const bed = buildMaxAbsScrdifBed(dataset, bedAxes, maskInflowBoundary);
  return inferScrdifCentroids(bed, bedAxes, pierCount, minSeparationM);
}

/** 지형 격자 해상도용 빈 TerrainGrid (교각 배치 추정 전용). */
export function createTerrainShell(): TerrainGrid {
  const dims = terrainGridDims();
  return {
    width: dims.width,
    height: dims.height,
    cellSize: dims.cellSize,
    elevations: new Float32Array(dims.width * dims.height),
  };
}

/**
 * scrdif 를 지형 격자에 보간한 뒤 세굴공 중심의 월드 XZ 를 반환한다.
 * 렌더링되는 세굴/퇴적 위치와 교각이 일치하도록 지형 격자 기준으로 찾는다.
 */
export function inferPierWorldPositionsFromDataset(
  dataset: SampleProbeDataset,
  anchor: ProbeWorldAnchor,
  pierCount: number,
  minSeparationM: number,
  terrain: TerrainGrid = createTerrainShell(),
  pierDiameter = 0.1,
  maskInflowBoundary = false,
): PierWorldCandidate[] {
  const bedAxes = buildBedAxes(dataset);
  const bed = buildDeepestScourBed(dataset, bedAxes, maskInflowBoundary);
  const delta = new Float32Array(terrain.width * terrain.height);

  resampleBedToTerrain(bed, bedAxes.x, bedAxes.y, anchor, terrain, delta);

  const holes = detectScourHoles(delta, terrain, {
    pierDiameter,
    maxHoles: pierCount,
    mergeSeparationFactor: minSeparationM / Math.max(pierDiameter, 1e-9),
  });

  return holes.map((h: ScourHole) => ({
    x: h.x,
    z: h.z,
    maxDepthM: h.maxDepthM,
  }));
}
