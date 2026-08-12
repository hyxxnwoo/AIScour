import type { FluidFrame, FluidGrid3D, FluidSeries } from '@/types/fluid';

export interface EmptyFluidSeriesOptions {
  width: number;
  height: number;
  depth: number;
  cellSize: number;
  frameCount: number;
  frameIntervalSeconds: number;
}

/** CSV 적용 전 기본 유체장 — 모든 물리량·스칼라를 0으로 둔다. */
export function createEmptyFluidSeries(options: EmptyFluidSeriesOptions): FluidSeries {
  const { width, height, depth, cellSize, frameCount, frameIntervalSeconds } = options;
  const grid: FluidGrid3D = { width, height, depth, cellSize };
  const cellCount = width * height * depth;
  const frames: FluidFrame[] = [];

  for (let f = 0; f < Math.max(1, frameCount); f += 1) {
    frames.push({
      timestampSeconds: f * frameIntervalSeconds,
      velocityX: new Float32Array(cellCount),
      velocityY: new Float32Array(cellCount),
      velocityZ: new Float32Array(cellCount),
      pressure: new Float32Array(cellCount),
      density: new Float32Array(cellCount),
      scalars: { scrdif: new Float32Array(cellCount) },
    });
  }

  return {
    grid,
    frames,
    metadata: {
      velocityUnit: 'm/s',
      pressureUnit: 'Pa',
      densityUnit: 'kg/m^3',
      simulationId: 'empty-fluid',
    },
  };
}
