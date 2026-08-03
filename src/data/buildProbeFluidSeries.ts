import { FLUME } from '@/constants/experiment';
import type { FluidFrame, FluidGrid3D, FluidQuantity, FluidSeries } from '@/types/fluid';
import { normalizeFluidQuantityRange } from '@/utils/fluidQuantityColor';
import {
  buildDataAxis,
  nearestIndex,
  type DataAxis,
} from '@/utils/probeDataAxis';
import type { SampleProbeColumns, SampleProbeDataset } from '@/utils/parseSampleProbeCsv';

/**
 * t 블록의 행 단위 공간 데이터를 3D 유체 필드로 변환한다.
 *
 * 좌표 규약 변환 (FLOW-3D CSV → 월드):
 *   CSV x = 흐름       → 월드 X (velocityX = u)
 *   CSV z = 연직       → 월드 Y (velocityY = w)
 *   CSV y = 횡단(폭)   → 월드 Z (velocityZ = v)
 *
 * 격자는 CSV 좌표에 실제로 존재하는 값들로 만든다. 합성 격자에 흩뿌리면
 * 여러 행이 같은 셀에 뭉쳐 평균되어 공간 변화가 사라지므로, CSV 자체의
 * 측정점 간격을 기준 셀 크기로 삼아 행 값이 1:1로 남게 한다.
 */

/** 프레임 1개당 셀 수 상한. */
const MAX_CELLS_PER_FRAME = 360_000;
/** 유체 시리즈 전체 메모리 상한(바이트). 세굴 프레임과 함께 올라가므로 넉넉히 잡지 않는다. */
const MAX_TOTAL_BYTES = 48 * 1024 * 1024;
/** 유체 프레임 수 상한. t 블록이 더 많으면 균등 간격으로 추출한다. */
export const MAX_PROBE_FLUID_FRAMES = 180;
/** 프레임당 셀 1개가 쓰는 바이트 = (u, w, v, scrdif) × Float32. */
const BYTES_PER_CELL = 4 * Float32Array.BYTES_PER_ELEMENT;
const MAX_AXIS_CELLS = 2048;
const MIN_CELL_SIZE = 1e-4;
const COARSEN_FACTOR = 1.3;

export interface BuildProbeFluidSeriesOptions {
  /** 시간 블록 stride. 세굴 프레임과 같은 값을 넘겨 시각을 맞춘다. */
  stepMultiple?: number;
  maxCellsPerFrame?: number;
  maxFrames?: number;
  /** CSV x → 월드 X 앵커(수조 길이). */
  tankLengthX?: number;
}

/** 네이티브 좌표 인덱스 → 균일 격자 인덱스 구간(양끝 포함). -1 이면 격자에서 탈락. */
interface AxisMapping {
  start: Int32Array;
  end: Int32Array;
}

function axisCellCount(span: number, cellSize: number): number {
  if (!(span > 0)) return 2;
  return Math.max(2, Math.min(MAX_AXIS_CELLS, Math.round(span / cellSize) + 1));
}

/**
 * 균일 격자 인덱스마다 가장 가까운 측정 좌표를 찾아, 그 역방향 구간을 만든다.
 * 측정면이 1개인 축은 전 구간이 그 값 하나로 채워진다(측정된 변화가 없음).
 */
function buildAxisMapping(axis: DataAxis, cellSize: number, uniformCount: number): AxisMapping {
  const nativeCount = axis.values.length;
  const start = new Int32Array(nativeCount).fill(-1);
  const end = new Int32Array(nativeCount).fill(-1);

  for (let i = 0; i < uniformCount; i += 1) {
    const j = nativeCount === 1 ? 0 : nearestIndex(axis.values, axis.min + i * cellSize);
    if (start[j]! < 0) start[j] = i;
    end[j] = i;
  }

  return { start, end };
}

interface ResolvedGrid {
  grid: FluidGrid3D;
  cellCount: number;
}

function resolveGrid(
  flow: DataAxis,
  vertical: DataAxis,
  lateral: DataAxis,
  frameCount: number,
  maxCellsPerFrame: number,
  tankLengthX: number,
): ResolvedGrid {
  // 측정면이 1개뿐인 축은 수조 치수로 확장해 렌더링 가능한 두께를 준다.
  const spanX = flow.span > 0 ? flow.span : FLUME.tank.lengthX;
  const spanZ = lateral.span > 0 ? lateral.span : FLUME.tank.widthZ;
  // 연직은 최소한 하상(표고 0) 위 수심까지 덮어야 수면·추적 입자가 격자 안에 들어온다.
  // 측정 구간을 넘는 셀은 최상단 측정면 값이 위로 연장된다.
  const spanY = Math.max(vertical.span, FLUME.waterDepthM - Math.min(0, vertical.min));

  const spacings = [flow.spacing, vertical.spacing, lateral.spacing].filter((s) => s > 0);
  let cellSize = Math.max(
    MIN_CELL_SIZE,
    spacings.length > 0 ? Math.min(...spacings) : FLUME.fluidCellSize,
  );

  const budgetCells = Math.max(
    8,
    Math.min(
      maxCellsPerFrame,
      Math.floor(MAX_TOTAL_BYTES / (BYTES_PER_CELL * Math.max(1, frameCount))),
    ),
  );

  let width = axisCellCount(spanX, cellSize);
  let height = axisCellCount(spanY, cellSize);
  let depth = axisCellCount(spanZ, cellSize);
  for (let guard = 0; guard < 64 && width * height * depth > budgetCells; guard += 1) {
    cellSize *= COARSEN_FACTOR;
    width = axisCellCount(spanX, cellSize);
    height = axisCellCount(spanY, cellSize);
    depth = axisCellCount(spanZ, cellSize);
    if (width === 2 && height === 2 && depth === 2) break;
  }

  return {
    grid: {
      width,
      height,
      depth,
      cellSize,
      // CSV x=0 → 수조 입구(-lengthX/2). 격자 xi=0 은 flow.min 에 대응한다.
      originX: flow.min - tankLengthX / 2,
      // CSV z 는 이미 퇴적물 표면(표고 0) 기준 표고이므로 그대로 월드 Y 로 쓴다.
      originY: vertical.min,
      // CSV y → 월드 Z. 격자 zi=0 은 lateral.min 에 대응한다.
      originZ: lateral.min,
    },
    cellCount: width * height * depth,
  };
}

/** stride 적용 후에도 프레임 상한을 넘으면 균등 간격으로 다시 추린다. */
function resolveBlockIndices(
  blockCount: number,
  stepMultiple: number,
  maxFrames: number,
): number[] {
  const step = Math.max(1, Math.floor(stepMultiple));
  const picked: number[] = [];
  for (let i = 0; i < blockCount; i += step) picked.push(i);
  if (picked.length <= maxFrames) return picked;

  const thin = Math.ceil(picked.length / maxFrames);
  return picked.filter((_, i) => i % thin === 0);
}

interface FrameBuffers {
  velocityX: Float32Array;
  velocityY: Float32Array;
  velocityZ: Float32Array;
  scrdif: Float32Array;
}

function fillFrameFromColumns(
  columns: SampleProbeColumns,
  grid: FluidGrid3D,
  axes: { flow: DataAxis; vertical: DataAxis; lateral: DataAxis },
  maps: { flow: AxisMapping; vertical: AxisMapping; lateral: AxisMapping },
  out: FrameBuffers,
): void {
  const { width: W, height: H } = grid;

  for (let r = 0; r < columns.count; r += 1) {
    const ix = nearestIndex(axes.flow.values, columns.x[r]!);
    const iy = nearestIndex(axes.vertical.values, columns.z[r]!);
    const iz = nearestIndex(axes.lateral.values, columns.y[r]!);

    const x0 = maps.flow.start[ix]!;
    const y0 = maps.vertical.start[iy]!;
    const z0 = maps.lateral.start[iz]!;
    if (x0 < 0 || y0 < 0 || z0 < 0) continue;
    const x1 = maps.flow.end[ix]!;
    const y1 = maps.vertical.end[iy]!;
    const z1 = maps.lateral.end[iz]!;

    const u = columns.u[r]!;
    const v = columns.v[r]!;
    const w = columns.w[r]!;
    const s = columns.scrdif[r]!;

    for (let zi = z0; zi <= z1; zi += 1) {
      for (let yi = y0; yi <= y1; yi += 1) {
        const base = yi * W + zi * W * H;
        for (let xi = x0; xi <= x1; xi += 1) {
          const idx = base + xi;
          out.velocityX[idx] = u;
          out.velocityY[idx] = w;
          out.velocityZ[idx] = v;
          out.scrdif[idx] = s;
        }
      }
    }
  }
}

/**
 * t 블록 Dataset → 3D 유체 시리즈. 블록 1개가 프레임 1개이고,
 * 블록 안의 각 행이 자기 좌표의 셀 값(u·v·w·scrdif)이 된다.
 */
export function buildProbeFluidSeries(
  dataset: SampleProbeDataset,
  options: BuildProbeFluidSeriesOptions = {},
): FluidSeries | null {
  const blocks = dataset.blocks;
  if (blocks.length === 0 || dataset.flatColumns.count === 0) return null;

  // 측정 좌표 격자는 시점마다 같다 — 행이 가장 많은 블록을 기준으로 잡는다.
  const reference = blocks.reduce((best, b) => (b.columns.count > best.columns.count ? b : best));
  const axes = {
    flow: buildDataAxis(reference.columns.x, reference.columns.count),
    vertical: buildDataAxis(reference.columns.z, reference.columns.count),
    lateral: buildDataAxis(reference.columns.y, reference.columns.count),
  };

  const indices = resolveBlockIndices(
    blocks.length,
    options.stepMultiple ?? 1,
    Math.max(1, options.maxFrames ?? MAX_PROBE_FLUID_FRAMES),
  );

  const tankLengthX = options.tankLengthX ?? FLUME.tank.lengthX;

  const { grid, cellCount } = resolveGrid(
    axes.flow,
    axes.vertical,
    axes.lateral,
    indices.length,
    options.maxCellsPerFrame ?? MAX_CELLS_PER_FRAME,
    tankLengthX,
  );

  const maps = {
    flow: buildAxisMapping(axes.flow, grid.cellSize, grid.width),
    vertical: buildAxisMapping(axes.vertical, grid.cellSize, grid.height),
    lateral: buildAxisMapping(axes.lateral, grid.cellSize, grid.depth),
  };

  // CSV 에는 압력·밀도가 없다. 프레임마다 0 배열을 새로 만들지 않고 하나를 공유한다.
  const emptyScalar = new Float32Array(cellCount);

  const frames: FluidFrame[] = indices.map((blockIndex) => {
    const block = blocks[blockIndex]!;
    const buffers: FrameBuffers = {
      velocityX: new Float32Array(cellCount),
      velocityY: new Float32Array(cellCount),
      velocityZ: new Float32Array(cellCount),
      scrdif: new Float32Array(cellCount),
    };
    fillFrameFromColumns(block.columns, grid, axes, maps, buffers);
    return {
      timestampSeconds: block.timestampSeconds,
      velocityX: buffers.velocityX,
      velocityY: buffers.velocityY,
      velocityZ: buffers.velocityZ,
      pressure: emptyScalar,
      density: emptyScalar,
      scalars: { scrdif: buffers.scrdif },
    };
  });

  return {
    grid,
    frames,
    metadata: {
      velocityUnit: 'm/s',
      scalarUnits: { scrdif: 'm' },
      scalarLabels: { scrdif: '초기 지반 대비 세굴/퇴적 변화량' },
      simulationId: 'sample-probe-csv',
      capturedAt: new Date().toISOString(),
    },
  };
}

/** 색 범위 계산에 쓸 최대 표본 수 — 전 프레임을 균등 stride 로 훑는다. */
const RANGE_MAX_SAMPLES = 120_000;

function valueAtIndex(frame: FluidFrame, quantity: FluidQuantity, i: number): number {
  switch (quantity) {
    case 'velocityX':
      return frame.velocityX[i] ?? 0;
    case 'velocityY':
      return frame.velocityY[i] ?? 0;
    case 'velocityZ':
      return frame.velocityZ[i] ?? 0;
    case 'speed':
      return Math.hypot(
        frame.velocityX[i] ?? 0,
        frame.velocityY[i] ?? 0,
        frame.velocityZ[i] ?? 0,
      );
    default:
      return frame.scalars?.[quantity]?.[i] ?? 0;
  }
}

/**
 * 재생 구간 전체(모든 프레임)에서 한 항목의 min/max 를 구한다.
 * 프레임마다 범위를 다시 재면 같은 색이 시각마다 다른 값을 뜻하므로,
 * 수면 색·범례가 공유할 고정 범위를 여기서 한 번만 계산한다.
 */
export function probeFluidQuantityRange(
  series: FluidSeries,
  quantity: FluidQuantity,
): { min: number; max: number } {
  const cellCount = series.grid.width * series.grid.height * series.grid.depth;
  const frameCount = series.frames.length;
  if (cellCount === 0 || frameCount === 0) return { min: 0, max: 1 };

  const stride = Math.max(1, Math.ceil((cellCount * frameCount) / RANGE_MAX_SAMPLES));
  let min = Infinity;
  let max = -Infinity;

  for (const frame of series.frames) {
    for (let i = 0; i < cellCount; i += stride) {
      const v = valueAtIndex(frame, quantity, i);
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  if (!isFinite(min) || !isFinite(max) || min === max) return { min: 0, max: 1 };
  return normalizeFluidQuantityRange(quantity, min, max);
}
