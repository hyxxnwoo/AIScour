import { FLUME, fluidGridDims, structureCenterX } from '@/constants/experiment';
import type { FluidDataSource, FluidFrame, FluidGrid3D, FluidSeries } from '@/types/fluid';

export interface SyntheticFluidOptions {
  width?: number; // X 셀 수
  height?: number; // Y 셀 수 (연직)
  depth?: number; // Z 셀 수
  cellSize?: number;
  frameCount?: number;
  frameIntervalSeconds?: number;
  // 상류 평균 유속(m/s, +X 방향). fluidU 가 우선.
  inflowSpeed?: number;
  fluidU?: number;
  fluidV?: number;
  fluidW?: number;
  // 교각 위치(월드 좌표). 도메인 원점 기준. 합성 후류를 만든다.
  pier?: { x: number; z: number; radius: number };
  // 기준 유체 밀도
  baseDensity?: number;
  // true면 구조물 내부에서도 부분 통과(투과 구조물).
  permeable?: boolean;
}

const flumeFluid = fluidGridDims();

const DEFAULTS: Required<Omit<SyntheticFluidOptions, 'pier'>> = {
  width: flumeFluid.width,
  height: flumeFluid.height,
  depth: flumeFluid.depth,
  cellSize: flumeFluid.cellSize,
  frameCount: 90,
  frameIntervalSeconds: FLUME.totalTimeSeconds / 90,
  inflowSpeed: 0.25,
  fluidU: 0.25,
  fluidV: 0,
  fluidW: 0.15,
  baseDensity: 1000,
  permeable: false,
};

// 교각 주변 흐름을 단순 모사하는 합성 유체 데이터 소스.
export class SyntheticFluidSource implements FluidDataSource {
  private readonly opts: Required<Omit<SyntheticFluidOptions, 'pier' | 'fluidU' | 'fluidV' | 'fluidW'>> & {
    pier: NonNullable<SyntheticFluidOptions['pier']>;
    fluidU: number;
    fluidV: number;
    fluidW: number;
  };

  public constructor(options: SyntheticFluidOptions = {}) {
    const merged: Required<Omit<SyntheticFluidOptions, 'pier' | 'fluidU' | 'fluidV' | 'fluidW'>> & {
      fluidU: number;
      fluidV: number;
      fluidW: number;
    } = {
      ...DEFAULTS,
      ...options,
      fluidU: options.fluidU ?? options.inflowSpeed ?? DEFAULTS.inflowSpeed,
      fluidV: options.fluidV ?? 0,
      fluidW: options.fluidW ?? 0.15,
    };
    this.opts = {
      ...merged,
      pier: options.pier ?? {
        x: structureCenterX(),
        z: 0,
        radius: FLUME.structure.diameterM / 2,
      },
    };
  }

  public load(): Promise<FluidSeries> {
    const { width, height, depth, cellSize, frameCount, frameIntervalSeconds } = this.opts;
    const grid: FluidGrid3D = { width, height, depth, cellSize };
    const frames: FluidFrame[] = [];
    for (let f = 0; f < frameCount; f += 1) {
      frames.push(this.buildFrame(grid, f * frameIntervalSeconds));
    }
    return Promise.resolve({
      grid,
      frames,
      metadata: {
        velocityUnit: 'm/s',
        pressureUnit: 'Pa',
        densityUnit: 'kg/m^3',
        simulationId: 'synthetic-fluid',
        capturedAt: new Date().toISOString(),
      },
    });
  }

  private buildFrame(grid: FluidGrid3D, t: number): FluidFrame {
    const { width: W, height: H, depth: D, cellSize: cs } = grid;
    const total = W * H * D;
    const vx = new Float32Array(total);
    const vy = new Float32Array(total);
    const vz = new Float32Array(total);
    const p = new Float32Array(total);
    const rho = new Float32Array(total);

    const halfW = ((W - 1) * cs) / 2;
    const halfD = ((D - 1) * cs) / 2;
    const topY = (H - 1) * cs;
    const U0 = this.opts.fluidU ?? this.opts.inflowSpeed;
    const V0 = this.opts.fluidV ?? 0;
    const Wamp = this.opts.fluidW ?? 0.15;
    const { baseDensity: rho0, pier, permeable } = this.opts;
    const sheddingFreq = (0.2 * U0) / (pier.radius * 2);
    const innerPassFactor = permeable ? 0.35 : 0;

    for (let zi = 0; zi < D; zi += 1) {
      const z = zi * cs - halfD;
      for (let yi = 0; yi < H; yi += 1) {
        const y = yi * cs;
        const yNorm = Math.min(1, Math.max(0.05, Math.log1p((y / topY) * 10) / Math.log(11)));
        for (let xi = 0; xi < W; xi += 1) {
          const x = xi * cs - halfW;
          const dx = x - pier.x;
          const dz = z - pier.z;
          const r = Math.hypot(dx, dz);

          let u = U0 * yNorm;
          let v = V0;
          let w = 0;

          if (r > pier.radius * 0.5) {
            const a2 = pier.radius * pier.radius;
            const r2 = Math.max(r * r, 1e-3);
            u -= U0 * a2 * (dx * dx - dz * dz) * Math.pow(r2, -2);
            w -= U0 * 2 * a2 * dx * dz * Math.pow(r2, -2);
          } else if (permeable) {
            u = U0 * yNorm * innerPassFactor;
          } else {
            u = 0;
          }

          if (dx > pier.radius && Math.abs(dz) < 4 * pier.radius) {
            const phase = sheddingFreq * t * 2 * Math.PI - dx * 0.4;
            const decay = Math.exp(-dx * 0.05);
            w +=
              Wamp *
              Math.sin(phase) *
              decay *
              Math.exp(-(dz * dz) / (2 * pier.radius * pier.radius));
            u *= 1 - 0.3 * decay;
          }

          const speedSq = u * u + v * v + w * w;
          const dynamicP = 0.5 * rho0 * (U0 * U0 - speedSq);
          const stagnationScale = permeable ? 0.45 : 1.0;
          const stagnationBoost =
            r < pier.radius * 1.2
              ? 0.5 * rho0 * U0 * U0 * stagnationScale * (1 - r / (pier.radius * 1.2))
              : 0;

          const idx = xi + yi * W + zi * W * H;
          vx[idx] = u;
          vy[idx] = v;
          vz[idx] = w;
          p[idx] = dynamicP + stagnationBoost;
          rho[idx] = rho0 + Math.sin(0.3 * x + 0.2 * t) * 0.5;
        }
      }
    }

    return {
      timestampSeconds: t,
      velocityX: vx,
      velocityY: vy,
      velocityZ: vz,
      pressure: p,
      density: rho,
    };
  }
}
