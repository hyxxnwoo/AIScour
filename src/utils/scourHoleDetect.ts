import type { TerrainGrid } from '@/types/terrain';
import { terrainDomainXZExtents, terrainGridToWorldXZ } from '@/utils/fluidWorld';

export interface ScourHole {
  x: number;
  z: number;
  maxDepthM: number;
  areaM2: number;
  cellCount: number;
}

export interface DetectScourHolesOptions {
  /** 세굴 깊이 임계 = maxDepth × 이 비율. */
  thresholdRatio?: number;
  /** 연결요소 최소 셀 수. */
  minHoleCells?: number;
  /** 교각 직경(미터). 병합·경계 클램프에 사용. */
  pierDiameter?: number;
  /** 반환할 최대 세굴공 수. */
  maxHoles?: number;
  /** 중심 간 병합 거리 = pierDiameter × 이 배수. */
  mergeSeparationFactor?: number;
}

const DEFAULT_THRESHOLD_RATIO = 0.25;
const DEFAULT_MIN_HOLE_CELLS = 4;
const DEFAULT_MERGE_SEPARATION_FACTOR = 1.5;
const DEFAULT_MAX_HOLES = 3;
const SCRDIF_EPS = 1e-12;

interface RawComponent {
  gxSum: number;
  gySum: number;
  weightSum: number;
  maxDepth: number;
  cellCount: number;
}

/** 지형 격자 Δ 배열에서 세굴공(음수 Δ)을 검출한다. */
export function detectScourHoles(
  delta: Float32Array,
  terrain: TerrainGrid,
  options: DetectScourHolesOptions = {},
): ScourHole[] {
  const thresholdRatio = options.thresholdRatio ?? DEFAULT_THRESHOLD_RATIO;
  const minHoleCells = options.minHoleCells ?? DEFAULT_MIN_HOLE_CELLS;
  const pierDiameter = options.pierDiameter ?? 0.1;
  const maxHoles = options.maxHoles ?? DEFAULT_MAX_HOLES;
  const mergeSep = pierDiameter * (options.mergeSeparationFactor ?? DEFAULT_MERGE_SEPARATION_FACTOR);

  const { width, height, cellSize } = terrain;
  const cellArea = cellSize * cellSize;

  let maxDepth = 0;
  for (let i = 0; i < delta.length; i += 1) {
    const d = -delta[i]!;
    if (d > maxDepth) maxDepth = d;
  }

  if (maxDepth <= SCRDIF_EPS) {
    return detectDepositFallback(delta, terrain, maxHoles);
  }

  const threshold = thresholdRatio * maxDepth;
  const visited = new Uint8Array(width * height);
  const components: RawComponent[] = [];

  for (let gy = 0; gy < height; gy += 1) {
    for (let gx = 0; gx < width; gx += 1) {
      const idx = gy * width + gx;
      if (visited[idx]) continue;

      const depth = -delta[idx]!;
      if (depth <= threshold) continue;

      const stack: number[] = [idx];
      visited[idx] = 1;

      let gxSum = 0;
      let gySum = 0;
      let weightSum = 0;
      let compMaxDepth = 0;
      let cellCount = 0;

      while (stack.length > 0) {
        const cur = stack.pop()!;
        const cgy = (cur / width) | 0;
        const cgx = cur % width;
        const cDepth = -delta[cur]!;

        const w = (cDepth - threshold) ** 2;
        gxSum += cgx * w;
        gySum += cgy * w;
        weightSum += w;
        if (cDepth > compMaxDepth) compMaxDepth = cDepth;
        cellCount += 1;

        const neighbors = [
          [cgx - 1, cgy],
          [cgx + 1, cgy],
          [cgx, cgy - 1],
          [cgx, cgy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (visited[nIdx]) continue;
          const nDepth = -delta[nIdx]!;
          if (nDepth <= threshold) continue;
          visited[nIdx] = 1;
          stack.push(nIdx);
        }
      }

      if (cellCount >= minHoleCells && weightSum > SCRDIF_EPS) {
        components.push({
          gxSum: gxSum / weightSum,
          gySum: gySum / weightSum,
          weightSum,
          maxDepth: compMaxDepth,
          cellCount,
        });
      }
    }
  }

  if (components.length === 0) {
    return detectDepositFallback(delta, terrain, maxHoles);
  }

  let holes = components.map((c) => {
    const { x, z } = terrainGridToWorldXZ(c.gxSum, c.gySum, terrain);
    return {
      x,
      z,
      maxDepthM: c.maxDepth,
      areaM2: c.cellCount * cellArea,
      cellCount: c.cellCount,
    };
  });

  holes.sort((a, b) => b.maxDepthM - a.maxDepthM);
  holes = mergeNearbyHoles(holes, mergeSep);
  holes = clampHolesToDomain(holes, terrain, pierDiameter);
  return holes.slice(0, maxHoles);
}

function detectDepositFallback(
  delta: Float32Array,
  terrain: TerrainGrid,
  maxHoles: number,
): ScourHole[] {
  let bestIdx = -1;
  let bestAbs = 0;
  for (let i = 0; i < delta.length; i += 1) {
    const a = Math.abs(delta[i]!);
    if (a > bestAbs) {
      bestAbs = a;
      bestIdx = i;
    }
  }
  if (bestIdx < 0 || bestAbs <= SCRDIF_EPS) return [];

  const gx = bestIdx % terrain.width;
  const gy = (bestIdx / terrain.width) | 0;
  const { x, z } = terrainGridToWorldXZ(gx, gy, terrain);
  return [
    {
      x,
      z,
      maxDepthM: bestAbs,
      areaM2: terrain.cellSize ** 2,
      cellCount: 1,
    },
  ].slice(0, maxHoles);
}

function mergeNearbyHoles(holes: ScourHole[], minSepM: number): ScourHole[] {
  if (holes.length <= 1 || minSepM <= 0) return holes;

  const merged: ScourHole[] = [];
  const used = new Set<number>();

  for (let i = 0; i < holes.length; i += 1) {
    if (used.has(i)) continue;
    let acc = { ...holes[i]! };
    used.add(i);

    for (let j = i + 1; j < holes.length; j += 1) {
      if (used.has(j)) continue;
      const other = holes[j]!;
      const dist = Math.hypot(acc.x - other.x, acc.z - other.z);
      if (dist >= minSepM) continue;

      const wA = acc.maxDepthM * acc.cellCount;
      const wB = other.maxDepthM * other.cellCount;
      const wSum = wA + wB;
      if (wSum > SCRDIF_EPS) {
        acc.x = (acc.x * wA + other.x * wB) / wSum;
        acc.z = (acc.z * wA + other.z * wB) / wSum;
      }
      acc.maxDepthM = Math.max(acc.maxDepthM, other.maxDepthM);
      acc.areaM2 += other.areaM2;
      acc.cellCount += other.cellCount;
      used.add(j);
    }

    merged.push(acc);
  }

  merged.sort((a, b) => b.maxDepthM - a.maxDepthM);
  return merged;
}

function clampHolesToDomain(
  holes: ScourHole[],
  terrain: TerrainGrid,
  pierDiameter: number,
): ScourHole[] {
  const pad = pierDiameter / 2;
  const ext = terrainDomainXZExtents(terrain);
  return holes.map((h) => ({
    ...h,
    x: Math.max(ext.minX + pad, Math.min(ext.maxX - pad, h.x)),
    z: Math.max(ext.minZ + pad, Math.min(ext.maxZ - pad, h.z)),
  }));
}
