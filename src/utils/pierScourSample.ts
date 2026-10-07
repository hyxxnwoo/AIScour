import type { PierDefinition } from '@/modules/PierMarker';
import type { ScourSeries } from '@/types/terrain';

export interface PierScourRatio {
  ratio: number;
}

export interface PierScourDepth {
  pierId: string;
  scourDepthM: number;
}

/** 교각 발 아래 Δ 필드에서 최대 세굴 깊이(m). */
export function maxErosionAtPierFootprint(
  delta: Float32Array,
  terrain: ScourSeries['baseTerrain'],
  pier: PierDefinition,
  pierDiameter = pier.diameter,
): number {
  const { width, height, cellSize } = terrain;
  const halfW = ((width - 1) * cellSize) / 2;
  const halfH = ((height - 1) * cellSize) / 2;
  const cx = Math.round((pier.x + halfW) / cellSize);
  const cy = Math.round((pier.z + halfH) / cellSize);
  const searchRadius = pierDiameter / 2 + cellSize * 2;
  const rCells = Math.ceil(searchRadius / cellSize) + 1;

  let maxErosion = 0;
  for (let gy = Math.max(0, cy - rCells); gy <= Math.min(height - 1, cy + rCells); gy += 1) {
    for (let gx = Math.max(0, cx - rCells); gx <= Math.min(width - 1, cx + rCells); gx += 1) {
      const dx = (gx - cx) * cellSize;
      const dz = (gy - cy) * cellSize;
      if (dx * dx + dz * dz > searchRadius * searchRadius) continue;
      const erosion = -(delta[gy * width + gx] ?? 0);
      if (erosion > maxErosion) maxErosion = erosion;
    }
  }
  return maxErosion;
}

function sampleScourAtPier(
  series: ScourSeries,
  pier: PierDefinition,
  pierDiameter: number,
  timeSeconds: number,
): number {
  const { frames } = series;
  if (frames.length === 0) return 0;

  const lastT = frames.at(-1)!.timestampSeconds;
  const clamped = Math.max(0, Math.min(timeSeconds, lastT));
  let frameIdx = 0;
  for (let i = 0; i < frames.length; i++) {
    if ((frames[i]?.timestampSeconds ?? 0) <= clamped) frameIdx = i;
    else break;
  }

  const frame = frames[frameIdx];
  if (!frame) return 0;

  return maxErosionAtPierFootprint(frame.deltaElevations, series.baseTerrain, pier, pierDiameter);
}

/** 교각 주변 최대 세굴 깊이(m) */
export function pierScourDepths(
  series: ScourSeries,
  piers: PierDefinition[],
  timeSeconds: number,
): PierScourDepth[] {
  return piers.map((pier) => {
    const diameter = pier.diameter ?? 1.0;
    const scourDepthM = sampleScourAtPier(series, pier, diameter, timeSeconds);
    return { pierId: pier.id, scourDepthM };
  });
}

/** 교각 주변 최대 세굴 깊이를 기준 깊이 대비 비율(0~1)로 반환한다. */
export function pierScourRatios(
  series: ScourSeries,
  piers: PierDefinition[],
  timeSeconds: number,
  criticalDepth: number,
): PierScourRatio[] {
  const depth = Math.max(criticalDepth, 1e-9);
  return piers.map((pier) => {
    const diameter = pier.diameter ?? 1.0;
    const scour = sampleScourAtPier(series, pier, diameter, timeSeconds);
    return { ratio: Math.min(1, scour / depth) };
  });
}
