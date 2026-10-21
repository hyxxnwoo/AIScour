import { CSV_STRUCTURE, FLUME } from '@/constants/experiment';
import { FOOTING_SPECS, type FlowScenario } from '@/constants/scenarios';
import type { SampleProbeBounds, SampleProbeSample, SampleProbeSeries } from '@/data/probeSeries';
import type { PierDefinitionMeta, ScourFrame, ScourSeries, TerrainGrid } from '@/types/terrain';
import type { ScrdifTimeDataset } from '@/utils/parseScrdifTimeCsv';

/** 경량화 CSV(x_m, y_m, 시간별 scrdif)를 세굴 시리즈·교각 정의로 변환한다. */

export const MAX_SCRDIF_FRAMES = 4096;
const AXIS_EPS = 1e-6;
/** Float32 좌표 오차로 격자 정점 수가 하나 늘어나지 않도록 하는 허용치(셀 단위). */
const GRID_SPAN_EPS = 1e-3;
const ZERO_EPS = 1e-12;
const MIN_PIER_CELLS = 4;
/**
 * 교각 주변 표시 범위(교각 무리 기준, m). 이 밖은 유입 경계의 '배고픈 물' 세굴·유출 경계·측벽 영향이 커서
 * 교각 국부 세굴과 섞여 보이므로 가린다. 안쪽은 그대로, 가장자리 featherM 구간에서 서서히 0으로 줄인다.
 */
export const REGION_OF_INTEREST = {
  /** 가장 상류 교각 앞쪽(-X). s01 기준 x ≥ 0.45 m. */
  upstreamM: 0.4,
  /** 가장 하류 교각 뒤쪽(+X). s01 기준 x ≤ 1.45 m. */
  downstreamM: 0.6,
  /** 바깥쪽 교각 옆(±Z). s01 기준 |y| ≤ 0.57 m. */
  lateralM: 0.3,
  featherM: 0.08,
} as const;

/** 시나리오 간격과 CSV 에서 검출한 간격이 이만큼 넘게 다르면 경고한다(m). */
const SPACING_TOLERANCE_M = 0.02;

interface PierPosition {
  x: number;
  z: number;
}

export interface BuildScrdifDashboardOptions {
  /** 시간 열 stride(1=모든 열). */
  stepMultiple?: number;
  /** 지형 격자 셀 한 변(m). 기본 FLUME.terrainCellSize. */
  cellSize?: number;
  /** FLOW-3D 시나리오(파일명 s01 → S01). 하단부 형상·기둥 간격 검증에 쓴다. */
  scenario?: FlowScenario | null;
  /** 교각 주변만 표시({@link REGION_OF_INTEREST}). 기본 true. false 면 CSV 전체를 그대로 쓴다. */
  regionOnly?: boolean;
}

export interface ScrdifDashboard {
  scour: ScourSeries;
  probeSeries: SampleProbeSeries;
  piers: PierDefinitionMeta[];
  /** 교각 위치의 출처. detected = CSV 0 셀 덩어리, scenario = 시나리오 간격으로 배치. */
  pierSource: 'detected' | 'scenario';
  /** 시나리오와 CSV가 어긋날 때의 안내 문구. */
  warnings: string[];
  /** 교각 주변만 표시하는 범위 제한을 실제로 적용했는지(교각이 없으면 false). */
  regionApplied: boolean;
  /** 원본 시간 열 수(stride 적용 전). */
  totalTimeColumns: number;
  /** 실제 적용된 stride. */
  stepMultiple: number;
  scrdifAllZero: boolean;
}

interface RectAxes {
  xs: Float64Array;
  ys: Float64Array;
}

function uniqueSorted(values: Float32Array): Float64Array {
  const sorted = Float64Array.from(values).sort();
  const out: number[] = [];
  for (const v of sorted) {
    if (out.length === 0 || v - out[out.length - 1] > AXIS_EPS) out.push(v);
  }
  return Float64Array.from(out);
}

function nearestIndex(axis: Float64Array, value: number): number {
  let lo = 0;
  let hi = axis.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (axis[mid] <= value) lo = mid;
    else hi = mid;
  }
  return Math.abs(axis[hi] - value) < Math.abs(axis[lo] - value) ? hi : lo;
}

/** 구간 [axis[i], axis[i+1]] 와 보간 비율. 범위 밖은 끝 값으로 고정한다. */
function bracket(axis: Float64Array, value: number): { i0: number; t: number } {
  const last = axis.length - 1;
  if (last === 0 || value <= axis[0]) return { i0: 0, t: 0 };
  if (value >= axis[last]) return { i0: Math.max(0, last - 1), t: 1 };
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (axis[mid] <= value) lo = mid;
    else hi = mid;
  }
  return { i0: lo, t: (value - axis[lo]) / (axis[hi] - axis[lo]) };
}

function buildAxes(dataset: ScrdifTimeDataset): RectAxes {
  return { xs: uniqueSorted(dataset.x), ys: uniqueSorted(dataset.y) };
}

/** 행 인덱스 → 직사각 격자 인덱스(yi * nx + xi). */
function mapRowsToGrid(dataset: ScrdifTimeDataset, axes: RectAxes): Int32Array {
  const nx = axes.xs.length;
  const out = new Int32Array(dataset.count);
  for (let row = 0; row < dataset.count; row += 1) {
    const xi = nearestIndex(axes.xs, dataset.x[row]);
    const yi = nearestIndex(axes.ys, dataset.y[row]);
    out[row] = yi * nx + xi;
  }
  return out;
}

interface Resampler {
  width: number;
  height: number;
  /** 지형 정점마다 CSV 격자 보간 정보. */
  ix0: Int32Array;
  tx: Float32Array;
  iy0: Int32Array;
  ty: Float32Array;
}

function createResampler(
  axes: RectAxes,
  width: number,
  height: number,
  cellSize: number,
  centerX: number,
  centerY: number,
): Resampler {
  const ix0 = new Int32Array(width);
  const tx = new Float32Array(width);
  const iy0 = new Int32Array(height);
  const ty = new Float32Array(height);
  const halfW = ((width - 1) * cellSize) / 2;
  const halfH = ((height - 1) * cellSize) / 2;
  for (let gx = 0; gx < width; gx += 1) {
    const b = bracket(axes.xs, gx * cellSize - halfW + centerX);
    ix0[gx] = b.i0;
    tx[gx] = b.t;
  }
  for (let gy = 0; gy < height; gy += 1) {
    const b = bracket(axes.ys, gy * cellSize - halfH + centerY);
    iy0[gy] = b.i0;
    ty[gy] = b.t;
  }
  return { width, height, ix0, tx, iy0, ty };
}

/** Catmull-Rom 가중치(p0..p3, t∈[0,1]). 보간 곡선이 1차 미분까지 이어져 셀 경계 꺾임이 생기지 않는다. */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/**
 * CSV 격자 → 지형 격자 bicubic(Catmull-Rom) 보간 후 3×3 이항 필터를 한 번 적용한다.
 * 쌍선형 보간만 쓰면 CSV 셀 경계가 능선처럼 보여 깎인 영역이 격자 모양으로 드러난다.
 */
function resampleBed(
  bed: Float32Array,
  nx: number,
  ny: number,
  r: Resampler,
  out: Float32Array,
  scratch: Float32Array,
): void {
  const col = [0, 0, 0, 0];
  for (let gy = 0; gy < r.height; gy += 1) {
    const y0 = r.iy0[gy];
    const wy = r.ty[gy];
    const rows = [
      Math.max(0, y0 - 1) * nx,
      y0 * nx,
      Math.min(ny - 1, y0 + 1) * nx,
      Math.min(ny - 1, y0 + 2) * nx,
    ];
    for (let gx = 0; gx < r.width; gx += 1) {
      const x0 = r.ix0[gx];
      const wx = r.tx[gx];
      const xs = [Math.max(0, x0 - 1), x0, Math.min(nx - 1, x0 + 1), Math.min(nx - 1, x0 + 2)];
      for (let k = 0; k < 4; k += 1) {
        const o = rows[k];
        col[k] = catmullRom(bed[o + xs[0]], bed[o + xs[1]], bed[o + xs[2]], bed[o + xs[3]], wx);
      }
      scratch[gy * r.width + gx] = catmullRom(col[0], col[1], col[2], col[3], wy);
    }
  }
  smooth3x3(scratch, r.width, r.height, out);
}

/** [1 2 1]⊗[1 2 1]/16 필터(가장자리는 가장 가까운 값으로 복제). */
function smooth3x3(src: Float32Array, width: number, height: number, out: Float32Array): void {
  for (let gy = 0; gy < height; gy += 1) {
    const ya = Math.max(0, gy - 1) * width;
    const yb = gy * width;
    const yc = Math.min(height - 1, gy + 1) * width;
    for (let gx = 0; gx < width; gx += 1) {
      const xa = Math.max(0, gx - 1);
      const xc = Math.min(width - 1, gx + 1);
      out[yb + gx] =
        (src[ya + xa] +
          2 * src[ya + gx] +
          src[ya + xc] +
          2 * (src[yb + xa] + 2 * src[yb + gx] + src[yb + xc]) +
          src[yc + xa] +
          2 * src[yc + gx] +
          src[yc + xc]) /
        16;
    }
  }
}

/**
 * 모든 시간 열(t0 제외)에서 값이 0 인 셀 덩어리를 구조물 점유 영역으로 보고 교각을 검출한다.
 * 격자 가장자리에 닿거나 {@link MIN_PIER_CELLS} 미만인 덩어리는 제외한다.
 */
export function detectPierPositions(
  dataset: ScrdifTimeDataset,
  axes: RectAxes,
  rowToGrid: Int32Array,
  centerX: number,
  centerY: number,
): PierPosition[] {
  if (dataset.frames.length < 2) return [];
  const nx = axes.xs.length;
  const ny = axes.ys.length;
  const mask = new Uint8Array(nx * ny);
  for (let row = 0; row < dataset.count; row += 1) {
    let allZero = true;
    for (let t = 1; t < dataset.frames.length; t += 1) {
      if (Math.abs(dataset.frames[t][row]) > ZERO_EPS) {
        allZero = false;
        break;
      }
    }
    if (allZero) mask[rowToGrid[row]] = 1;
  }

  const visited = new Uint8Array(nx * ny);
  const piers: PierPosition[] = [];
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let minXi = nx;
    let maxXi = -1;
    let minYi = ny;
    let maxYi = -1;
    let size = 0;
    stack.push(start);
    visited[start] = 1;
    while (stack.length > 0) {
      const cur = stack.pop() as number;
      const xi = cur % nx;
      const yi = (cur - xi) / nx;
      size += 1;
      if (xi < minXi) minXi = xi;
      if (xi > maxXi) maxXi = xi;
      if (yi < minYi) minYi = yi;
      if (yi > maxYi) maxYi = yi;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nxi = xi + dx;
          const nyi = yi + dy;
          if (nxi < 0 || nyi < 0 || nxi >= nx || nyi >= ny) continue;
          const ni = nyi * nx + nxi;
          if (mask[ni] && !visited[ni]) {
            visited[ni] = 1;
            stack.push(ni);
          }
        }
      }
    }
    const touchesBorder = minXi === 0 || minYi === 0 || maxXi === nx - 1 || maxYi === ny - 1;
    if (size < MIN_PIER_CELLS || touchesBorder) continue;

    piers.push({
      x: (axes.xs[minXi] + axes.xs[maxXi]) / 2 - centerX,
      z: (axes.ys[minYi] + axes.ys[maxYi]) / 2 - centerY,
    });
  }

  piers.sort((a, b) => a.z - b.z || a.x - b.x);
  return piers;
}

/** 시나리오 간격 S 로 배치한 기둥 위치. 중앙 기둥은 CSV 범위의 중앙(월드 원점)이다. */
export function scenarioPierPositions(spacingM: number, count: number): PierPosition[] {
  const first = -((count - 1) / 2) * spacingM;
  return Array.from({ length: count }, (_, i) => ({ x: 0, z: first + i * spacingM }));
}

/** 위치 목록에 직경·높이·하단부·세굴 탐색 반경을 붙여 교각 정의로 만든다. */
function toPierDefinitions(
  positions: PierPosition[],
  scenario: FlowScenario | null | undefined,
): PierDefinitionMeta[] {
  const { diameterM, exposedHeightM, scourSearchRadiusFactor, footingExposedM } = CSV_STRUCTURE;
  const spec = FOOTING_SPECS[scenario?.footingShape ?? 'square'];
  // 이웃 교각의 세굴 구덩이까지 같이 세지 않도록 탐색 반경을 교각 간격의 절반으로 제한한다.
  let radius = diameterM * scourSearchRadiusFactor;
  for (let i = 1; i < positions.length; i += 1) {
    radius = Math.min(radius, (positions[i].z - positions[i - 1].z) / 2);
  }
  return positions.map((p, i) => ({
    id: `P${i + 1}`,
    x: p.x,
    z: p.z,
    diameter: diameterM,
    height: exposedHeightM,
    scourSearchRadius: radius,
    footing: {
      shape: scenario?.footingShape ?? 'square',
      lengthX: spec.lengthX,
      widthZ: spec.widthZ,
      height: footingExposedM,
    },
  }));
}

/** 검출한 교각을 시나리오와 맞춰 본다. 개수가 다르면 시나리오 배치로 대체하고, 간격이 다르면 경고한다. */
function resolvePiers(
  detected: PierPosition[],
  scenario: FlowScenario | null | undefined,
): { piers: PierDefinitionMeta[]; source: 'detected' | 'scenario'; warnings: string[] } {
  const warnings: string[] = [];
  if (!scenario) {
    return { piers: toPierDefinitions(detected, null), source: 'detected', warnings };
  }
  const expectedCount = CSV_STRUCTURE.pierCount;
  if (detected.length !== expectedCount) {
    warnings.push(
      `${scenario.id}: CSV 에서 교각 ${detected.length}개를 찾아 시나리오 배치(${expectedCount}개, 간격 ${scenario.pierSpacingM} m)를 썼습니다.`,
    );
    return {
      piers: toPierDefinitions(
        scenarioPierPositions(scenario.pierSpacingM, expectedCount),
        scenario,
      ),
      source: 'scenario',
      warnings,
    };
  }
  const spacing = (detected[expectedCount - 1].z - detected[0].z) / (expectedCount - 1);
  if (Math.abs(spacing - scenario.pierSpacingM) > SPACING_TOLERANCE_M) {
    warnings.push(
      `${scenario.id}: 교각 간격이 CSV ${spacing.toFixed(3)} m, 시나리오 ${scenario.pierSpacingM} m 로 다릅니다. CSV 값을 따릅니다.`,
    );
  }
  return { piers: toPierDefinitions(detected, scenario), source: 'detected', warnings };
}

function smoothstep01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** [min, max] 안이면 1, 바깥으로 featherM 만큼 나가는 동안 0으로 줄어드는 가중치. */
function intervalWeight(v: number, min: number, max: number, feather: number): number {
  const edge = Math.max(feather, 1e-9);
  return smoothstep01((v - min) / edge + 1) * smoothstep01((max - v) / edge + 1);
}

/** 행(격자점)마다 교각 주변 범위 가중치(0~1). 월드 좌표는 CSV 범위 중심 기준이다. */
function regionWeights(
  dataset: ScrdifTimeDataset,
  piers: PierDefinitionMeta[],
  centerX: number,
  centerY: number,
): Float32Array {
  const { upstreamM, downstreamM, lateralM, featherM } = REGION_OF_INTEREST;
  const xMin = Math.min(...piers.map((p) => p.x)) - upstreamM;
  const xMax = Math.max(...piers.map((p) => p.x)) + downstreamM;
  const zMin = Math.min(...piers.map((p) => p.z)) - lateralM;
  const zMax = Math.max(...piers.map((p) => p.z)) + lateralM;
  const out = new Float32Array(dataset.count);
  for (let row = 0; row < dataset.count; row += 1) {
    const wx = dataset.x[row] - centerX;
    const wz = dataset.y[row] - centerY;
    out[row] = intervalWeight(wx, xMin, xMax, featherM) * intervalWeight(wz, zMin, zMax, featherM);
  }
  return out;
}

/** 프레임의 최소·최대와, |값|이 가장 큰 값(부호 유지, 그 시점의 대표 세굴/퇴적). */
function frameStats(frame: Float32Array): { min: number; max: number; extreme: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < frame.length; i += 1) {
    const v = frame[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return { min: 0, max: 0, extreme: 0 };
  return { min, max, extreme: Math.abs(min) >= Math.abs(max) ? min : max };
}

export function buildScrdifDashboard(
  dataset: ScrdifTimeDataset,
  options: BuildScrdifDashboardOptions = {},
): ScrdifDashboard {
  const totalTimeColumns = dataset.frames.length;
  const requestedStep = Math.max(1, Math.floor(options.stepMultiple ?? 1));
  const stepMultiple = Math.max(requestedStep, Math.ceil(totalTimeColumns / MAX_SCRDIF_FRAMES));
  const cellSize = options.cellSize ?? FLUME.terrainCellSize;

  const axes = buildAxes(dataset);
  const nx = axes.xs.length;
  const ny = axes.ys.length;
  const minX = axes.xs[0];
  const maxX = axes.xs[nx - 1];
  const minY = axes.ys[0];
  const maxY = axes.ys[ny - 1];
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const width = Math.max(2, Math.ceil((maxX - minX) / cellSize - GRID_SPAN_EPS) + 1);
  const height = Math.max(2, Math.ceil((maxY - minY) / cellSize - GRID_SPAN_EPS) + 1);

  const rowToGrid = mapRowsToGrid(dataset, axes);
  const detected = detectPierPositions(dataset, axes, rowToGrid, centerX, centerY);
  const resolved = resolvePiers(detected, options.scenario);
  const piers = resolved.piers;
  const resampler = createResampler(axes, width, height, cellSize, centerX, centerY);
  const weights =
    (options.regionOnly ?? true) && piers.length > 0
      ? regionWeights(dataset, piers, centerX, centerY)
      : null;
  const masked = new Float32Array(dataset.count);

  const terrain: TerrainGrid = {
    width,
    height,
    cellSize,
    elevations: new Float32Array(width * height),
    metadata: {
      elevationUnit: 'm',
      simulationId: 'scrdif-time-csv',
      piers,
    },
  };

  const bed = new Float32Array(nx * ny);
  const scratch = new Float32Array(width * height);
  const frames: ScourFrame[] = [];
  const samples: SampleProbeSample[] = [];
  let minScrdif = Infinity;
  let maxScrdif = -Infinity;

  for (let t = 0; t < totalTimeColumns; t += stepMultiple) {
    const source = dataset.frames[t];
    for (let row = 0; row < dataset.count; row += 1) {
      masked[row] = weights ? source[row] * weights[row] : source[row];
    }
    bed.fill(0);
    for (let row = 0; row < dataset.count; row += 1) bed[rowToGrid[row]] = masked[row];

    const delta = new Float32Array(width * height);
    resampleBed(bed, nx, ny, resampler, delta, scratch);
    frames.push({ timestampSeconds: dataset.times[t], deltaElevations: delta });

    const stats = frameStats(masked);
    if (stats.min < minScrdif) minScrdif = stats.min;
    if (stats.max > maxScrdif) maxScrdif = stats.max;
    samples.push({
      t: dataset.times[t],
      timeIndex: t,
      rowIndex: t,
      dataX: centerX,
      dataY: centerY,
      dataZ: 0,
      worldX: 0,
      worldY: 0,
      worldZ: 0,
      u: 0,
      v: 0,
      w: 0,
      scrdif: stats.extreme,
    });
  }

  const baseIntervalSeconds =
    totalTimeColumns > 1 ? dataset.times[1] - dataset.times[0] : FLUME.totalTimeSeconds;
  const bounds: SampleProbeBounds = {
    minDataX: minX,
    maxDataX: maxX,
    minDataY: minY,
    maxDataY: maxY,
    minDataZ: 0,
    maxDataZ: 0,
    centerDataX: centerX,
    centerDataY: centerY,
    centerDataZ: 0,
    originDataX: centerX,
    originDataY: centerY,
    minScrdif: Number.isFinite(minScrdif) ? minScrdif : 0,
    maxScrdif: Number.isFinite(maxScrdif) ? maxScrdif : 0,
  };

  return {
    scour: { baseTerrain: terrain, frames },
    probeSeries: {
      samples,
      rowCount: totalTimeColumns,
      baseIntervalSeconds,
      stepMultiple,
      durationSeconds: dataset.times[totalTimeColumns - 1] - dataset.times[0],
      bounds,
    },
    piers,
    pierSource: resolved.source,
    warnings: resolved.warnings,
    regionApplied: weights !== null,
    totalTimeColumns,
    stepMultiple,
    scrdifAllZero: Math.abs(bounds.minScrdif) < ZERO_EPS && Math.abs(bounds.maxScrdif) < ZERO_EPS,
  };
}
