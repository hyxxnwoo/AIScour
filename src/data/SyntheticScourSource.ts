import { FLUME, structureCenterX, terrainGridDims } from '@/constants/experiment';
import type { ScourDataSource, ScourFrame, ScourSeries, TerrainGrid } from '@/types/terrain';
import { flowScourDelta } from '@/utils/scourShape';

export interface SyntheticScourOptions {
  width?: number;
  height?: number;
  cellSize?: number;
  frameCount?: number;
  frameIntervalSeconds?: number;
  seed?: number;
  pierDiameter?: number;
  scourRate?: number;
  sandGrainSizeMm?: number;
  pier?: { x: number; z: number };
  tankHeightY?: number;
  permeable?: boolean;
  /** 상류 유속(m/s). 클수록 세굴이 강해진다. */
  inflowSpeed?: number;
}

const flumeTerrain = terrainGridDims();

const DEFAULTS: Required<Omit<SyntheticScourOptions, 'pier'>> = {
  width: flumeTerrain.width,
  height: flumeTerrain.height,
  cellSize: flumeTerrain.cellSize,
  frameCount: 90,
  frameIntervalSeconds: FLUME.totalTimeSeconds / 90,
  seed: 1337,
  pierDiameter: FLUME.structure.diameterM,
  scourRate: 1.0,
  sandGrainSizeMm: FLUME.sandGrainSizeMm,
  tankHeightY: FLUME.tank.heightY,
  permeable: false,
  inflowSpeed: 0.25,
};

export class SyntheticScourSource implements ScourDataSource {
  private readonly options: Required<Omit<SyntheticScourOptions, 'pier'>> & {
    pier: NonNullable<SyntheticScourOptions['pier']>;
  };

  public constructor(options: SyntheticScourOptions = {}) {
    const merged: Required<Omit<SyntheticScourOptions, 'pier'>> = { ...DEFAULTS, ...options };
    this.options = {
      ...merged,
      pier: options.pier ?? { x: structureCenterX(), z: 0 },
    };
  }

  public load(): Promise<ScourSeries> {
    const baseTerrain = this.buildBaseTerrain();
    const frames = this.buildFrames();
    return Promise.resolve({ baseTerrain, frames });
  }

  private buildBaseTerrain(): TerrainGrid {
    const { width, height, cellSize, pierDiameter, pier, tankHeightY } = this.options;
    const elevations = new Float32Array(width * height);

    const rippleAmp = 0.002;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        elevations[y * width + x] = rippleAmp * Math.sin(0.6 * x) * Math.cos(0.6 * y);
      }
    }

    const pierHeight = tankHeightY + 0.03;

    return {
      width,
      height,
      cellSize,
      elevations,
      metadata: {
        elevationUnit: 'm',
        simulationId: 'flume-synthetic-demo',
        capturedAt: new Date().toISOString(),
        piers: [{ id: 'P1', x: pier.x, z: pier.z, diameter: pierDiameter, height: pierHeight }],
      },
    };
  }

  private buildFrames(): ScourFrame[] {
    const {
      width,
      height,
      cellSize,
      frameCount,
      frameIntervalSeconds,
      pierDiameter,
      scourRate,
      sandGrainSizeMm,
      pier,
      permeable,
      inflowSpeed,
    } = this.options;

    const halfW = ((width - 1) * cellSize) / 2;
    const halfH = ((height - 1) * cellSize) / 2;
    const pierRadius = pierDiameter / 2;

    const grainFactor = Math.min(
      1.4,
      Math.max(0.7, Math.pow(FLUME.sandGrainSizeMm / Math.max(0.05, sandGrainSizeMm), 0.2)),
    );
    const speedFactor = Math.min(1.5, Math.max(0.6, inflowSpeed / 0.25));
    const permeabilityFactor = permeable ? 0.6 : 1.0;
    const equilibriumDepth =
      1.3 * pierDiameter * scourRate * grainFactor * permeabilityFactor * speedFactor;

    const frames: ScourFrame[] = [];
    for (let f = 0; f < frameCount; f += 1) {
      const timeProgress = frameCount === 1 ? 1 : f / (frameCount - 1);
      const delta = new Float32Array(width * height);

      for (let gy = 0; gy < height; gy += 1) {
        for (let gx = 0; gx < width; gx += 1) {
          const worldX = gx * cellSize - halfW;
          const worldZ = gy * cellSize - halfH;
          delta[gy * width + gx] = flowScourDelta(
            worldX,
            worldZ,
            pier.x,
            pier.z,
            pierRadius,
            equilibriumDepth,
            timeProgress,
          );
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
