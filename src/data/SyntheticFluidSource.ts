import type { FluidDataSource, FluidFrame, FluidGrid3D, FluidSeries } from '@/types/fluid';

export interface SyntheticFluidOptions {
  width?: number; // X 셀 수
  height?: number; // Y 셀 수 (연직)
  depth?: number; // Z 셀 수
  cellSize?: number;
  frameCount?: number;
  frameIntervalSeconds?: number;
  // 상류 평균 유속(m/s, +X 방향)
  inflowSpeed?: number;
  // 교각 위치(월드 좌표). 도메인 원점 기준. 합성 후류를 만든다.
  pier?: { x: number; z: number; radius: number };
  // 기준 유체 밀도
  baseDensity?: number;
}

const DEFAULTS: Required<Omit<SyntheticFluidOptions, 'pier'>> = {
  width: 48,
  height: 12,
  depth: 32,
  cellSize: 0.5,
  frameCount: 60,
  frameIntervalSeconds: 1,
  inflowSpeed: 1.2,
  baseDensity: 1000,
};

// 교각 주변 흐름을 단순 모사하는 합성 유체 데이터 소스.
// - 상류에서 +X 방향 균일류
// - 교각 주변에서 정체점 압력 상승 + 후류에서 시간에 따라 진동(와류 모사)
// - 바닥/천장 경계에서 점성 감속 (대수 분포 근사)
export class SyntheticFluidSource implements FluidDataSource {
  private readonly opts: Required<Omit<SyntheticFluidOptions, 'pier'>> & {
    pier: NonNullable<SyntheticFluidOptions['pier']>;
  };

  public constructor(options: SyntheticFluidOptions = {}) {
    const merged: Required<Omit<SyntheticFluidOptions, 'pier'>> = { ...DEFAULTS, ...options };
    this.opts = {
      ...merged,
      pier: options.pier ?? { x: 0, z: 0, radius: 0.75 },
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

  // 한 시점의 물리량 필드를 생성. 시간에 따라 후류 와류 위상이 변한다.
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
    const { inflowSpeed: U0, baseDensity: rho0, pier } = this.opts;
    // 후류 진동 주기(Strouhal 수 ~0.2 가정)
    const sheddingFreq = (0.2 * U0) / (pier.radius * 2);

    for (let zi = 0; zi < D; zi += 1) {
      const z = zi * cs - halfD;
      for (let yi = 0; yi < H; yi += 1) {
        const y = yi * cs;
        // 바닥에서 0, 위로 갈수록 1 로 다가가는 대수 경계층 근사
        const yNorm = Math.min(1, Math.max(0.05, Math.log1p((y / topY) * 10) / Math.log(11)));
        for (let xi = 0; xi < W; xi += 1) {
          const x = xi * cs - halfW;
          const dx = x - pier.x;
          const dz = z - pier.z;
          const r = Math.hypot(dx, dz);

          let u = U0 * yNorm; // 기본 +X 방향 유속
          const v = 0;
          let w = 0;

          // 교각 표면 근처: 흐름이 비껴 흐른다(2D potential flow 근사)
          if (r > pier.radius * 0.5) {
            const a2 = pier.radius * pier.radius;
            const r2 = Math.max(r * r, 1e-3);
            // ux = U(1 - a^2 (x^2 - z^2)/r^4), uz = -U(2 a^2 x z / r^4)
            u -= U0 * a2 * (dx * dx - dz * dz) * Math.pow(r2, -2);
            w -= U0 * 2 * a2 * dx * dz * Math.pow(r2, -2);
          } else {
            // 교각 내부 셀은 흐름 0
            u = 0;
          }

          // 후류 영역(교각 하류, |dz| 작음): 사인파 진동
          if (dx > pier.radius && Math.abs(dz) < 4 * pier.radius) {
            const phase = sheddingFreq * t * 2 * Math.PI - dx * 0.4;
            const decay = Math.exp(-dx * 0.05);
            w +=
              0.6 *
              U0 *
              Math.sin(phase) *
              decay *
              Math.exp(-(dz * dz) / (2 * pier.radius * pier.radius));
            u *= 1 - 0.3 * decay; // 평균 속도 감소
          }

          // 정체점 압력 (Bernoulli 근사: P = 0.5 * rho * (U^2 - u_local^2))
          const speedSq = u * u + v * v + w * w;
          const dynamicP = 0.5 * rho0 * (U0 * U0 - speedSq);
          // 교각 표면에서 가장 높음
          const stagnationBoost =
            r < pier.radius * 1.2 ? 0.5 * rho0 * U0 * U0 * (1 - r / (pier.radius * 1.2)) : 0;

          const idx = xi + yi * W + zi * W * H;
          vx[idx] = u;
          vy[idx] = v;
          vz[idx] = w;
          p[idx] = dynamicP + stagnationBoost;
          // 밀도는 거의 일정하지만 후류에서 미세한 변동 추가
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
