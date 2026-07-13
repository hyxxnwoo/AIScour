import { FLUME } from '@/constants/experiment';
import type { FluidFrame, FluidGrid3D, FluidSeries } from '@/types/fluid';
import type { ScourFrame, ScourSeries, TerrainGrid } from '@/types/terrain';
import { FLOW3D_VARIABLE_DEFS } from '@/data/flow3dVariableDefs';
import type { ParsedFlow3dVariable } from '@/utils/parseFlow3dVariableCsv';

export interface Flow3dGridMeta {
  width?: number;
  height?: number;
  depth?: number;
  cellSize?: number;
  intervalSeconds?: number;
  originX?: number;
  originY?: number;
  originZ?: number;
  /** 퇴적물 표면 위 물 높이(m). CSV scrdif 슬라이스 배치에 사용. */
  waterDepth?: number;
}

function resolveCellCount(meta: Flow3dGridMeta, valueCount: number): {
  width: number;
  height: number;
  depth: number;
} {
  const depth = meta.depth ?? 1;
  if (meta.width !== undefined && meta.height !== undefined) {
    const expected = meta.width * meta.height * depth;
    if (expected !== valueCount) {
      throw new Error(
        `격자 ${meta.width}×${meta.height}×${depth}=${expected} 와 값 개수 ${valueCount} 가 일치하지 않습니다.`,
      );
    }
    return { width: meta.width, height: meta.height, depth };
  }

  if (meta.width !== undefined) {
    if (valueCount % (meta.width * depth) !== 0) {
      throw new Error(`값 ${valueCount}개를 width=${meta.width}, depth=${depth} 로 나눌 수 없습니다.`);
    }
    return { width: meta.width, height: valueCount / (meta.width * depth), depth };
  }

  if (meta.height !== undefined) {
    if (valueCount % (meta.height * depth) !== 0) {
      throw new Error(`값 ${valueCount}개를 height=${meta.height}, depth=${depth} 로 나눌 수 없습니다.`);
    }
    return { width: valueCount / (meta.height * depth), height: meta.height, depth };
  }

  const planar = valueCount / depth;
  const side = Math.sqrt(planar);
  if (Number.isInteger(side)) {
    return { width: side, height: side, depth };
  }

  throw new Error(
    `meta.json 에 width·height(·depth) 가 필요합니다. (값 ${valueCount}개)`,
  );
}

function emptyFrame(grid: FluidGrid3D, t: number): FluidFrame {
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

export interface Flow3dBuiltSeries {
  scour: ScourSeries | null;
  fluid: FluidSeries | null;
  variables: ParsedFlow3dVariable[];
}

/** 파싱된 FLOW-3D 변수들을 ScourSeries / FluidSeries 로 조립한다. */
export function buildSeriesFromFlow3dVariables(
  variables: ParsedFlow3dVariable[],
  meta: Flow3dGridMeta = {},
): Flow3dBuiltSeries {
  if (variables.length === 0) {
    throw new Error('조립할 변수가 없습니다.');
  }

  const cellCount = variables[0].values.length;
  const { width, height, depth } = resolveCellCount(meta, cellCount);
  const cellSize = meta.cellSize ?? FLUME.fluidCellSize;
  const intervalSeconds = meta.intervalSeconds ?? 1;

  const byId = new Map(variables.map((v) => [v.id, v]));

  // ── 세굴 (scrp → 퇴적/세굴 변화량)
  let scour: ScourSeries | null = null;
  const scrp = byId.get('scrp');
  if (scrp) {
    const baseTerrain: TerrainGrid = {
      width,
      height,
      cellSize,
      elevations: new Float32Array(width * height),
    };
    const frames: ScourFrame[] = [
      {
        timestampSeconds: 0,
        deltaElevations: depth > 1 ? sliceHorizontal(scrp.values, width, height, depth, 0) : scrp.values,
      },
    ];
    scour = { baseTerrain, frames };
    byId.delete('scrp');
  }

  // ── 유체 (ux/vy/vz + 기타 스칼라)
  const hasFluid =
    byId.has('ux') ||
    byId.has('vy') ||
    byId.has('vz') ||
    [...byId.keys()].some((id) => id !== 'scrp');

  let fluid: FluidSeries | null = null;
  if (hasFluid) {
    const grid: FluidGrid3D = {
      width,
      height,
      depth,
      cellSize,
      ...(meta.originX !== undefined ? { originX: meta.originX } : {}),
      ...(meta.originY !== undefined ? { originY: meta.originY } : {}),
      ...(meta.originZ !== undefined ? { originZ: meta.originZ } : {}),
    };
    const frame = emptyFrame(grid, 0);

    const ux = byId.get('ux');
    const vy = byId.get('vy');
    const vz = byId.get('vz');
    if (ux) frame.velocityX = ux.values;
    if (vy) frame.velocityY = vy.values;
    if (vz) frame.velocityZ = vz.values;
    if (ux) byId.delete('ux');
    if (vy) byId.delete('vy');
    if (vz) byId.delete('vz');

    const scalarUnits: Record<string, string> = {};
    const scalarLabels: Record<string, string> = {};
    const scrdif = byId.get('scrdif');
    if (scrdif) {
      frame.scalars!.scrdif = scrdif.values;
      if (scrdif.unit) scalarUnits.scrdif = scrdif.unit;
      scalarLabels.scrdif = scrdif.label;
      byId.delete('scrdif');
    }

    for (const [id, variable] of byId) {
      const def = FLOW3D_VARIABLE_DEFS[id];
      if (def?.category === 'scour') continue;
      frame.scalars![id] = variable.values;
      if (variable.unit) scalarUnits[id] = variable.unit;
      scalarLabels[id] = variable.label;
    }

    fluid = {
      grid,
      frames: [frame],
      metadata: {
        velocityUnit: ux?.unit ?? 'm/s',
        pressureUnit: 'Pa',
        densityUnit: 'kg/m^3',
        scalarUnits,
        scalarLabels,
        simulationId: 'flow3d-csv',
      },
    };
  }

  return { scour, fluid, variables };
}

/** 3D 필드에서 수평 슬라이스(z=0)만 2D 로 추출 */
function sliceHorizontal(
  values: Float32Array,
  width: number,
  height: number,
  depth: number,
  z: number,
): Float32Array {
  const out = new Float32Array(width * height);
  const zOff = z * width * height;
  for (let i = 0; i < width * height; i += 1) {
    out[i] = values[zOff + i] ?? 0;
  }
  return out;
}
