import type { ScourDataSource, ScourFrame, ScourSeries, TerrainGrid } from '@/types/terrain';

export interface SyntheticScourOptions {
  // 격자 정점 개수
  width?: number;
  height?: number;
  // 격자 한 칸의 실제 길이(미터)
  cellSize?: number;
  // 시간 프레임 개수
  frameCount?: number;
  // 프레임 간 시간 간격(초)
  frameIntervalSeconds?: number;
  // 결과 재현성을 위한 시드(주의: 단순 LCG, 암호학적 용도 아님)
  seed?: number;
}

const DEFAULTS: Required<SyntheticScourOptions> = {
  width: 96,
  height: 96,
  cellSize: 0.5,
  frameCount: 60,
  frameIntervalSeconds: 1,
  seed: 1337,
};

// 결과 검증과 데모용 합성 데이터 생성기.
// 실제 FLOW-3D 데이터 어댑터가 준비되기 전까지 시각화 파이프라인을 end-to-end 로 검증할 수 있게 한다.
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

  // 부드러운 경사 + 강 단면(중앙이 깊은 U 형) 을 합성한 베이스 지형
  private buildBaseTerrain(): TerrainGrid {
    const { width, height, cellSize } = this.options;
    const elevations = new Float32Array(width * height);

    const halfW = (width - 1) / 2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        // 가로 방향 강 단면: 중앙으로 갈수록 표고가 낮아진다.
        const dx = (x - halfW) / halfW;
        const channel = -1.5 * Math.exp(-3 * dx * dx);
        // 세로 방향 흐름: 상류(y 작음) → 하류(y 큼) 로 완만한 경사
        const slope = -0.01 * y;
        // 잔잔한 표면 굴곡
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
        // 합성 데이터의 세굴공이 격자 중심에 형성되므로 교각도 동일 위치에 둔다.
        piers: [{ id: 'P1', x: 0, z: 0, diameter: 1.5, height: 8 }],
      },
    };
  }

  // 시간에 따라 교각 주변(중앙)에서 점진적으로 깊어지는 세굴공을 모사한다.
  private buildFrames(): ScourFrame[] {
    const { width, height, frameCount, frameIntervalSeconds } = this.options;
    const cx = (width - 1) / 2;
    const cy = (height - 1) / 2;
    // 격자 대각선 길이 정규화에 사용
    const diag = Math.hypot(width, height);

    const frames: ScourFrame[] = [];
    for (let f = 0; f < frameCount; f += 1) {
      // 0..1 진행률
      const t = frameCount === 1 ? 1 : f / (frameCount - 1);
      // 세굴 깊이는 시간이 지날수록 점근적으로 증가한다(로그 곡선 모사)
      const maxDepth = -1.2 * Math.log1p(3 * t);
      // 세굴공 반경도 시간에 따라 확장
      const radius = 0.05 * diag + 0.18 * diag * t;

      const delta = new Float32Array(width * height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const r = Math.hypot(x - cx, y - cy);
          if (r > radius) continue;
          // 가우시안 형태의 세굴공
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
