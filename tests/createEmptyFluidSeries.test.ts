import { describe, expect, it } from 'vitest';
import { createEmptyFluidSeries } from '@/data/createEmptyFluidSeries';
import { sampleFluidQuantity } from '@/types/fluid';

describe('createEmptyFluidSeries', () => {
  it('모든 유체 물리량·scrdif 가 0 이다', () => {
    const series = createEmptyFluidSeries({
      width: 4,
      height: 3,
      depth: 5,
      cellSize: 0.02,
      frameCount: 2,
      frameIntervalSeconds: 30,
    });

    expect(series.frames).toHaveLength(2);
    expect(series.metadata?.simulationId).toBe('empty-fluid');

    const frame = series.frames[0]!;
    expect(frame.velocityX.every((v) => v === 0)).toBe(true);
    expect(frame.velocityY.every((v) => v === 0)).toBe(true);
    expect(frame.velocityZ.every((v) => v === 0)).toBe(true);
    expect(frame.pressure.every((v) => v === 0)).toBe(true);
    expect(frame.density.every((v) => v === 0)).toBe(true);
    expect(frame.scalars?.scrdif?.every((v) => v === 0)).toBe(true);
    expect(sampleFluidQuantity(series.grid, frame, 'velocityX', 1, 1, 1)).toBe(0);
  });
});
