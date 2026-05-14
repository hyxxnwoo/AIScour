import type { ScourDataSource, ScourFrame, ScourSeries, TerrainGrid } from '@/types/terrain';

export interface SyntheticScourOptions {
  width?: number;
  height?: number;
  cellSize?: number;
  frameCount?: number;
  frameIntervalSeconds?: number;
  seed?: number;
  // 교각 직경(미터). 세굴공 폭과 초기 반경에 영향.
  pierDiameter?: number;
  // 세굴 진행 속도 배율 (1.0 = 기본). 클수록 빠르게 깊어짐.
  scourRate?: number;
}

const DEFAULTS: Required<SyntheticScourOptions> = {
  width: 96,
  height: 96,
  cellSize: 0.5,
  frameCount: 60,
  frameIntervalSeconds: 1,
  seed: 1337,
  pierDiameter: 1.5,
  scourRate: 1.0,
};

export class SyntheticScourSource implements ScourDataSource {
  private readonly options: Required<SyntheticScourOptions>;

  public constructor(options: SyntheticScourOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  public load(): Promise<ScourSeries> {
    const baseTerrain = this.buildBaseTerrain();
    const frames = this.buildFrames();
    return Promise.resolve({ baseTerrain, frames });
  }

  private buildBaseTerrain(): TerrainGrid {
    const { width, height, cellSize, pierDiameter } = this.options;
    const elevations = new Float32Array(width * height);

    const halfW = (width - 1) / 2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = (x - halfW) / halfW;
        const channel = -1.5 * Math.exp(-3 * dx * dx);
        const slope = -0.01 * y;
        const ripple = 0.05 * Math.sin(0.3 * x) * Math.cos(0.3 * y);
        elevations[y * width + x] = channel + slope + ripple;
      }
    }

    return {
      width,
      height,
      cellSize,
      elevations,
      metadata: {
        elevationUnit: 'm',
        simulationId: 'synthetic-demo',
        capturedAt: new Date().toISOString(),
        piers: [{ id: 'P1', x: 0, z: 0, diameter: pierDiameter, height: 8 }],
      },
    };
  }

  private buildFrames(): ScourFrame[] {
    const { width, height, frameCount, frameIntervalSeconds, pierDiameter, scourRate, cellSize } =
      this.options;
    const cx = (width - 1) / 2;
    const cy = (height - 1) / 2;
    const diag = Math.hypot(width, height);
    // 교각 반경(격자 단위). 세굴공 초기 크기의 기준.
    const pierRadiusCells = pierDiameter / 2 / cellSize;

    const frames: ScourFrame[] = [];
    for (let f = 0; f < frameCount; f += 1) {
      const t = frameCount === 1 ? 1 : f / (frameCount - 1);
      // scourRate 로 진행 속도 조절 (로그 곡선 → 빠를수록 초반 급상승)
      const maxDepth = -1.2 * scourRate * Math.log1p(3 * t);
      // 세굴공 반경: 교각 크기 + 시간 확장 성분
      const radius = pierRadiusCells * 1.5 + 0.18 * diag * t;

      const delta = new Float32Array(width * height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const r = Math.hypot(x - cx, y - cy);
          if (r > radius) continue;
          const k = (r / radius) * 2.5;
          delta[y * width + x] = maxDepth * Math.exp(-k * k);
        }
      }

      frames.push({
        timestampSeconds: f * frameIntervalSeconds,
        deltaElevations: delta,
      });
    }
    return frames;
  }
}
