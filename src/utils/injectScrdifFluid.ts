import type { FluidGrid3D, FluidSeries } from '@/types/fluid';
import type { ScourSeries, TerrainGrid } from '@/types/terrain';
import { fluidGridOrigin, fluidYiAtWorldY, worldXZToTerrainGrid } from '@/utils/fluidWorld';

function sampleTerrainDelta(
  grid: TerrainGrid,
  delta: Float32Array,
  gx: number,
  gy: number,
): number {
  const ix = Math.max(0, Math.min(grid.width - 1, Math.round(gx)));
  const iy = Math.max(0, Math.min(grid.height - 1, Math.round(gy)));
  return delta[iy * grid.width + ix] ?? 0;
}

/** 합성 유체 프레임에 지형 세굴/퇴적 변화량(scrdif) 스칼라를 주입한다. */
export function injectScrdifFromScour(
  fluid: FluidSeries,
  scour: ScourSeries,
  waterLevelY: number,
  amplitudeScale = 1,
): void {
  const { grid } = fluid;
  const terrain = scour.baseTerrain;
  const yi = fluidYiAtWorldY(grid, waterLevelY);
  const o = fluidGridOrigin(grid);
  const cs = grid.cellSize;

  for (let fi = 0; fi < fluid.frames.length; fi += 1) {
    const frame = fluid.frames[fi];
    if (!frame) continue;
    const scourFrame = scour.frames[Math.min(fi, scour.frames.length - 1)];
    if (!scourFrame) continue;

    const scrdif = new Float32Array(grid.width * grid.height * grid.depth);
    fillScrdifSlice(
      scrdif,
      grid,
      terrain,
      scourFrame.deltaElevations,
      yi,
      o.x,
      o.z,
      cs,
      amplitudeScale,
    );
    frame.scalars = { ...frame.scalars, scrdif };
  }
}

function fillScrdifSlice(
  out: Float32Array,
  grid: FluidGrid3D,
  terrain: TerrainGrid,
  delta: Float32Array,
  yi: number,
  originX: number,
  originZ: number,
  cellSize: number,
  amplitudeScale: number,
): void {
  const { width: W, height: H, depth: D } = grid;
  for (let zi = 0; zi < D; zi += 1) {
    for (let y = 0; y < H; y += 1) {
      for (let xi = 0; xi < W; xi += 1) {
        const idx = xi + y * W + zi * W * H;
        if (y !== yi) {
          out[idx] = 0;
          continue;
        }
        const worldX = originX + xi * cellSize;
        const worldZ = originZ + zi * cellSize;
        const { gx, gy } = worldXZToTerrainGrid(worldX, worldZ, terrain);
        out[idx] = sampleTerrainDelta(terrain, delta, gx, gy) * amplitudeScale;
      }
    }
  }
}
