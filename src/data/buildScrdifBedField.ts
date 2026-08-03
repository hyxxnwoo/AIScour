import { terrainGridDims } from '@/constants/experiment';
import type { TerrainGrid } from '@/types/terrain';
import { terrainGridToWorldXZ } from '@/utils/fluidWorld';
import {
  buildDataAxis,
  nearestIndex,
  type DataAxis,
} from '@/utils/probeDataAxis';
import {
  probeDataXToWorldX,
  probeDataYToWorldZ,
  probeWorldXToDataX,
  probeWorldZToDataY,
  type ProbeWorldAnchor,
} from '@/utils/probeWorldCoords';
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
): void {
  out.fill(0);
  const nx = xAxis.values.length;

  for (let r = 0; r < columns.count; r += 1) {
    const xi = nearestIndex(xAxis.values, columns.x[r]!);
    const yi = nearestIndex(yAxis.values, columns.y[r]!);
    const idx = yi * nx + xi;
    const s = columns.scrdif[r]!;
    if (Math.abs(s) > Math.abs(out[idx]!)) {
      out[idx] = s;
    }
  }
}

function findBracket(
  values: Float64Array,
  v: number,
): { i0: number; i1: number; t: number } | null {
  if (values.length === 0) return null;
  if (values.length === 1) return { i0: 0, i1: 0, t: 0 };
  if (v < values[0]! || v > values[values.length - 1]!) return null;

  let lo = 0;
  let hi = values.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (values[mid]! <= v) lo = mid;
    else hi = mid;
  }

  const i0 = lo;
  const i1 = Math.min(values.length - 1, lo + 1);
  const span = values[i1]! - values[i0]!;
  const t = span > 0 ? (v - values[i0]!) / span : 0;
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
  const minX = xAxis.values[0]!;
  const maxX = xAxis.values[nx - 1]!;
  const minY = yAxis.values[0]!;
  const maxY = yAxis.values[ny - 1]!;

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
      out[gy * width + gx] = sampleBedBilinear(
        bed,
        xAxis,
        yAxis,
        dataX,
        dataY,
        terrain.cellSize,
      );
    }
  }
}

/** 겹치는 격자 셀마다 |값| 이 더 큰 쪽을 남긴다. */
export function mergeDeltaByMaxAbs(dst: Float32Array, src: Float32Array): void {
  for (let i = 0; i < dst.length; i += 1) {
    if (Math.abs(src[i]!) > Math.abs(dst[i]!)) {
      dst[i] = src[i]!;
    }
  }
}

const SCRDIF_SIGNAL_EPS = 1e-12;

/** 모든 t 블록을 훑어 (x, y) 셀마다 |scrdif| 최대(부호 유지) 하상장을 만든다. */
export function buildMaxAbsScrdifBed(
  dataset: SampleProbeDataset,
  bedAxes: BedAxes,
): Float32Array {
  const bed = new Float32Array(bedGridSize(bedAxes));
  const scratch = new Float32Array(bedGridSize(bedAxes));

  for (const block of dataset.blocks) {
    reduceScrdifToBed(block.columns, bedAxes.x, bedAxes.y, scratch);
    for (let i = 0; i < bed.length; i += 1) {
      if (Math.abs(scratch[i]!) > Math.abs(bed[i]!)) {
        bed[i] = scratch[i]!;
      }
    }
  }

  return bed;
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
      const weight = Math.abs(bed[yi * nx + xi]!);
      if (weight <= SCRDIF_SIGNAL_EPS) continue;
      candidates.push({
        dataX: bedAxes.x.values[xi]!,
        dataY: bedAxes.y.values[yi]!,
        weight,
      });
    }
  }

  if (candidates.length === 0) return [];

  if (pierCount <= 1) {
    let best = candidates[0]!;
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
): ScrdifCentroid[] {
  const bedAxes = buildBedAxes(dataset);
  const bed = buildMaxAbsScrdifBed(dataset, bedAxes);
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
 * scrdif 를 지형 격자에 보간한 뒤 |Δ| 최대 셀(단일 기둥) 또는 국소 최대(복수)의 월드 XZ 를 반환한다.
 * 렌더링되는 세굴/퇴적 위치와 교각이 일치하도록 지형 격자 기준으로 찾는다.
 */
export function inferPierWorldPositionsFromDataset(
  dataset: SampleProbeDataset,
  anchor: ProbeWorldAnchor,
  pierCount: number,
  minSeparationM: number,
  terrain: TerrainGrid = createTerrainShell(),
): Array<{ x: number; z: number }> {
  const bedAxes = buildBedAxes(dataset);
  const bed = buildMaxAbsScrdifBed(dataset, bedAxes);

  if (pierCount <= 1) {
    const delta = new Float32Array(terrain.width * terrain.height);
    resampleBedToTerrain(
      bed,
      bedAxes.x,
      bedAxes.y,
      anchor,
      terrain,
      delta,
    );

    let bestIdx = -1;
    let bestAbs = 0;
    for (let i = 0; i < delta.length; i += 1) {
      const a = Math.abs(delta[i]!);
      if (a > bestAbs) {
        bestAbs = a;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestAbs <= SCRDIF_SIGNAL_EPS) return [];

    const gx = bestIdx % terrain.width;
    const gy = (bestIdx / terrain.width) | 0;
    const { x, z } = terrainGridToWorldXZ(gx, gy, terrain);
    return [{ x, z }];
  }

  const centroids = inferScrdifCentroids(bed, bedAxes, pierCount, minSeparationM);
  return centroids.map((c) => ({
    x: probeDataXToWorldX(c.dataX, anchor),
    z: probeDataYToWorldZ(c.dataY, anchor),
  }));
}
