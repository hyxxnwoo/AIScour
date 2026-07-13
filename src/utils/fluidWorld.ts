import type { FluidGrid3D, FluidFrame, FluidSeries } from '@/types/fluid';
import type { TerrainGrid } from '@/types/terrain';

export interface WorldVec3 {
  x: number;
  y: number;
  z: number;
}

/** 격자 셀 (0,0,0) 의 월드 좌표. origin 미지정 시 도메인 중앙 하단 정렬. */
export function fluidGridOrigin(grid: FluidGrid3D): WorldVec3 {
  const cs = grid.cellSize;
  return {
    x: grid.originX ?? (-(grid.width - 1) * cs) / 2,
    y: grid.originY ?? 0,
    z: grid.originZ ?? (-(grid.depth - 1) * cs) / 2,
  };
}

/**
 * CSV 유체 격자를 지형·교량과 동일한 좌표 규약(도메인 XZ 중심 = 월드 원점)으로 맞춘다.
 * 셀 값 배열은 그대로 두고 origin 만 조정한다.
 */
export function alignFluidSeriesToTerrain(
  fluid: FluidSeries,
  terrain: TerrainGrid,
): FluidSeries {
  const g = fluid.grid;
  const cs = g.cellSize > 0 ? g.cellSize : terrain.cellSize;

  return {
    ...fluid,
    grid: {
      ...g,
      cellSize: cs,
      originX: -((g.width - 1) * cs) / 2,
      originY: g.originY ?? 0,
      originZ: -((g.depth - 1) * cs) / 2,
    },
  };
}

/** 지형 수로 높이를 고려한 기본 유체 슬라이스 Y (m). */
export function defaultFluidSliceHeight(fluid: FluidSeries, terrain: TerrainGrid): number {
  const { min, max } = fluidHeightRange(fluid.grid);
  const cx = Math.floor(terrain.width / 2);
  const cy = Math.floor(terrain.height / 2);
  const bed = terrain.elevations[cy * terrain.width + cx] ?? -1;
  const target = bed + Math.max(0.02, (max - min) * 0.22);
  return Math.max(min, Math.min(max, target));
}

/** 지형 중심 셀의 베이스 하상 표고(미터). */
export function representativeBedElevation(terrain: TerrainGrid): number {
  const cx = Math.floor(terrain.width / 2);
  const cy = Math.floor(terrain.height / 2);
  return terrain.elevations[cy * terrain.width + cx] ?? 0;
}

/** 퇴적물 표면(하상) 위 수심으로 수면 절대 높이(미터)를 계산한다. */
export function waterSurfaceElevation(terrain: TerrainGrid, waterDepth: number): number {
  return representativeBedElevation(terrain) + waterDepth;
}

export function sceneViewRadius(terrain: TerrainGrid, fluid?: FluidSeries): number {
  const tRadius =
    (Math.hypot(terrain.width, terrain.height) * terrain.cellSize) / 2;
  const fRadius = fluid ? fluidDomainRadius(fluid.grid) : 0;
  return Math.max(tRadius, fRadius, 0.5);
}

/** 격자 인덱스 → CSV x·y·z 월드 좌표. */
export function fluidCellWorldPosition(
  grid: FluidGrid3D,
  xi: number,
  yi: number,
  zi: number,
): WorldVec3 {
  const o = fluidGridOrigin(grid);
  const cs = grid.cellSize;
  return {
    x: o.x + xi * cs,
    y: o.y + yi * cs,
    z: o.z + zi * cs,
  };
}

export function fluidDomainCenter(grid: FluidGrid3D): WorldVec3 {
  const o = fluidGridOrigin(grid);
  const cs = grid.cellSize;
  return {
    x: o.x + ((grid.width - 1) * cs) / 2,
    y: o.y + ((grid.height - 1) * cs) / 2,
    z: o.z + ((grid.depth - 1) * cs) / 2,
  };
}

export function fluidDomainRadius(grid: FluidGrid3D): number {
  const cs = grid.cellSize;
  return (
    Math.hypot((grid.width - 1) * cs, (grid.depth - 1) * cs, (grid.height - 1) * cs) / 2
  );
}

export function fluidHeightRange(grid: FluidGrid3D): { min: number; max: number } {
  const o = fluidGridOrigin(grid);
  const cs = grid.cellSize;
  return {
    min: o.y,
    max: o.y + (grid.height - 1) * cs,
  };
}

/** 월드 Y(수위) → 유체 격자 연직 인덱스. */
export function fluidYiAtWorldY(grid: FluidGrid3D, worldY: number): number {
  const o = fluidGridOrigin(grid);
  const cs = grid.cellSize;
  const yi = Math.round((worldY - o.y) / cs);
  return Math.max(0, Math.min(grid.height - 1, yi));
}

export interface FluidDomainXZ {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  sizeX: number;
  sizeZ: number;
  centerX: number;
  centerZ: number;
}

/** 지형(하상) 격자가 차지하는 XZ 월드 범위. 수면 메쉬는 이 범위를 따른다. */
export function terrainDomainXZExtents(terrain: TerrainGrid): FluidDomainXZ {
  const halfW = ((terrain.width - 1) * terrain.cellSize) / 2;
  const halfH = ((terrain.height - 1) * terrain.cellSize) / 2;
  const sizeX = (terrain.width - 1) * terrain.cellSize;
  const sizeZ = (terrain.height - 1) * terrain.cellSize;
  return {
    minX: -halfW,
    maxX: halfW,
    minZ: -halfH,
    maxZ: halfH,
    sizeX,
    sizeZ,
    centerX: 0,
    centerZ: 0,
  };
}

/** 렌더링용 지형 XZ 크기 — 1×1 격자에서 0 폭 메쉬를 방지한다. */
export function terrainDomainRenderSizeXZ(terrain: TerrainGrid): { sizeX: number; sizeZ: number } {
  const cs = terrain.cellSize;
  const e = terrainDomainXZExtents(terrain);
  return {
    sizeX: Math.max(e.sizeX, cs),
    sizeZ: Math.max(e.sizeZ, cs),
  };
}

/** 유체 격자가 차지하는 XZ 월드 범위. */
export function fluidDomainXZExtents(grid: FluidGrid3D): FluidDomainXZ {
  const o = fluidGridOrigin(grid);
  const cs = grid.cellSize;
  const sizeX = (grid.width - 1) * cs;
  const sizeZ = (grid.depth - 1) * cs;
  return {
    minX: o.x,
    maxX: o.x + sizeX,
    minZ: o.z,
    maxZ: o.z + sizeZ,
    sizeX,
    sizeZ,
    centerX: o.x + sizeX / 2,
    centerZ: o.z + sizeZ / 2,
  };
}

/** 렌더링용 XZ 크기 — width/depth=1 일 때 0 폭 메쉬를 방지한다. */
export function fluidDomainRenderSizeXZ(grid: FluidGrid3D): { sizeX: number; sizeZ: number } {
  const cs = grid.cellSize;
  const e = fluidDomainXZExtents(grid);
  return {
    sizeX: Math.max(e.sizeX, cs),
    sizeZ: Math.max(e.sizeZ, cs),
  };
}

function axisInsideDomain(
  world: number,
  min: number,
  max: number,
  span: number,
  margin: number,
): boolean {
  if (span <= margin * 2) {
    const center = (min + max) / 2;
    const half = Math.max(span * 0.5, margin);
    return world >= center - half && world <= center + half;
  }
  return world >= min + margin && world <= max - margin;
}

export function isInsideFluidDomainXZ(
  grid: FluidGrid3D,
  worldX: number,
  worldZ: number,
  marginCells = 0,
): boolean {
  const e = fluidDomainXZExtents(grid);
  const m = marginCells * grid.cellSize;
  return (
    axisInsideDomain(worldX, e.minX, e.maxX, e.sizeX, m) &&
    axisInsideDomain(worldZ, e.minZ, e.maxZ, e.sizeZ, m)
  );
}

/** 지형 격자 좌표(실수) → 월드 XZ. */
export function terrainGridToWorldXZ(
  gx: number,
  gy: number,
  terrain: TerrainGrid,
): { x: number; z: number } {
  const halfW = ((terrain.width - 1) * terrain.cellSize) / 2;
  const halfH = ((terrain.height - 1) * terrain.cellSize) / 2;
  return {
    x: gx * terrain.cellSize - halfW,
    z: gy * terrain.cellSize - halfH,
  };
}

/** 월드 XZ → 지형 격자 좌표(실수). */
export function worldXZToTerrainGrid(
  worldX: number,
  worldZ: number,
  terrain: TerrainGrid,
): { gx: number; gy: number } {
  const halfW = ((terrain.width - 1) * terrain.cellSize) / 2;
  const halfH = ((terrain.height - 1) * terrain.cellSize) / 2;
  return {
    gx: (worldX + halfW) / terrain.cellSize,
    gy: (worldZ + halfH) / terrain.cellSize,
  };
}

function trilinearSample(
  field: Float32Array,
  width: number,
  height: number,
  depth: number,
  fx: number,
  fy: number,
  fz: number,
): number {
  const x0 = Math.max(0, Math.min(width - 2, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(height - 2, Math.floor(fy)));
  const z0 = Math.max(0, Math.min(depth - 2, Math.floor(fz)));
  const tx = fx - x0;
  const ty = fy - y0;
  const tz = fz - z0;
  const W = width;
  const H = height;

  const idx = (x: number, y: number, z: number): number => x + y * W + z * W * H;

  const c000 = field[idx(x0, y0, z0)] ?? 0;
  const c100 = field[idx(x0 + 1, y0, z0)] ?? 0;
  const c010 = field[idx(x0, y0 + 1, z0)] ?? 0;
  const c110 = field[idx(x0 + 1, y0 + 1, z0)] ?? 0;
  const c001 = field[idx(x0, y0, z0 + 1)] ?? 0;
  const c101 = field[idx(x0 + 1, y0, z0 + 1)] ?? 0;
  const c011 = field[idx(x0, y0 + 1, z0 + 1)] ?? 0;
  const c111 = field[idx(x0 + 1, y0 + 1, z0 + 1)] ?? 0;

  const c00 = c000 * (1 - tx) + c100 * tx;
  const c10 = c010 * (1 - tx) + c110 * tx;
  const c01 = c001 * (1 - tx) + c101 * tx;
  const c11 = c011 * (1 - tx) + c111 * tx;
  const c0 = c00 * (1 - ty) + c10 * ty;
  const c1 = c01 * (1 - ty) + c11 * ty;
  return c0 * (1 - tz) + c1 * tz;
}

/** 월드 좌표에서 유체 속도(m/s)를 삼선형 보간. 격자 밖이면 null. */
export function sampleFluidVelocityAtWorld(
  grid: FluidGrid3D,
  frame: FluidFrame,
  worldX: number,
  worldY: number,
  worldZ: number,
): { vx: number; vy: number; vz: number } | null {
  const o = fluidGridOrigin(grid);
  const cs = grid.cellSize;
  const { width: W, height: H, depth: D } = grid;
  const fx = (worldX - o.x) / cs;
  const fy = (worldY - o.y) / cs;
  const fz = (worldZ - o.z) / cs;

  if (fx < 0 || fy < 0 || fz < 0 || fx > W - 1 || fy > H - 1 || fz > D - 1) {
    return null;
  }

  return {
    vx: trilinearSample(frame.velocityX, W, H, D, fx, fy, fz),
    vy: trilinearSample(frame.velocityY, W, H, D, fx, fy, fz),
    vz: trilinearSample(frame.velocityZ, W, H, D, fx, fy, fz),
  };
}

/** 지형 격자에서 하상 표고(세굴 Δ 반영)를 bilinear 샘플. */
export function sampleTerrainBedAtWorld(
  terrain: TerrainGrid,
  delta: Float32Array | undefined,
  worldX: number,
  worldZ: number,
  verticalExaggeration = 1,
): number | null {
  const { gx, gy } = worldXZToTerrainGrid(worldX, worldZ, terrain);
  const { width, height } = terrain;
  if (gx < 0 || gy < 0 || gx > width - 1 || gy > height - 1) return null;

  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = gx - x0;
  const ty = gy - y0;
  const sample = (ix: number, iy: number): number => {
    const idx = iy * width + ix;
    const d = delta ? delta[idx] : 0;
    return terrain.elevations[idx] + d * verticalExaggeration;
  };

  const z00 = sample(x0, y0);
  const z10 = sample(Math.min(width - 1, x0 + 1), y0);
  const z01 = sample(x0, Math.min(height - 1, y0 + 1));
  const z11 = sample(Math.min(width - 1, x0 + 1), Math.min(height - 1, y0 + 1));
  return z00 * (1 - tx) * (1 - ty) + z10 * tx * (1 - ty) + z01 * (1 - tx) * ty + z11 * tx * ty;
}
