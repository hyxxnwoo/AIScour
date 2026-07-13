import { describe, expect, it } from 'vitest';
import type { FluidSeries } from '@/types/fluid';
import {
  alignFluidSeriesToTerrain,
  fluidCellWorldPosition,
  fluidGridOrigin,
  isInsideFluidDomainXZ,
  sampleFluidVelocityAtWorld,
} from '@/utils/fluidWorld';

function makeFluid(originX = 100, originY = 0, originZ = 200): FluidSeries {
  return {
    grid: {
      width: 4,
      height: 3,
      depth: 4,
      cellSize: 1,
      originX,
      originY,
      originZ,
    },
    frames: [
      {
        timestampSeconds: 0,
        velocityX: new Float32Array(48),
        velocityY: new Float32Array(48),
        velocityZ: new Float32Array(48),
        pressure: new Float32Array(48),
        density: new Float32Array(48),
      },
    ],
  };
}

describe('isInsideFluidDomainXZ', () => {
  it('depth=1(단층) 격자에서도 중심 XZ 를 도메인 안으로 인정한다', () => {
    const grid = {
      width: 3,
      height: 2,
      depth: 1,
      cellSize: 1,
    };
    expect(isInsideFluidDomainXZ(grid, 0, 0, 0.5)).toBe(true);
    expect(isInsideFluidDomainXZ(grid, 10, 0, 0.5)).toBe(false);
  });
});

describe('alignFluidSeriesToTerrain', () => {
  it('CSV origin 을 지형 중심 좌표계로 재정렬한다', () => {
    const aligned = alignFluidSeriesToTerrain(makeFluid(100, 0, 200), {
      width: 96,
      height: 96,
      cellSize: 0.5,
      elevations: new Float32Array(96 * 96),
    });

    expect(aligned.grid.originX).toBe(-1.5);
    expect(aligned.grid.originZ).toBe(-1.5);
    expect(fluidGridOrigin(aligned.grid).x).toBe(-1.5);
    expect(fluidCellWorldPosition(aligned.grid, 0, 0, 0)).toEqual({ x: -1.5, y: 0, z: -1.5 });
    expect(fluidCellWorldPosition(aligned.grid, 3, 0, 3)).toEqual({ x: 1.5, y: 0, z: 1.5 });
  });
});

describe('sampleFluidVelocityAtWorld', () => {
  it('삼선형 보간으로 격자 속도를 샘플한다', () => {
    const fluid = makeFluid(-1.5, 0, -1.5);
    const frame = fluid.frames[0]!;
    for (let i = 0; i < frame.velocityX.length; i += 1) {
      frame.velocityX[i] = 0.25;
      frame.velocityZ[i] = 0.05;
    }
    const v = sampleFluidVelocityAtWorld(fluid.grid, frame, 0, 0, 0);
    expect(v).not.toBeNull();
    expect(v!.vx).toBeCloseTo(0.25, 2);
    expect(v!.vz).toBeCloseTo(0.05, 2);
  });
});
