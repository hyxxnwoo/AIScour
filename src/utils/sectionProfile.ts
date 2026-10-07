import { sampleDeltaBilinear } from '@/data/buildScrdifBedField';
import type { PierDefinition } from '@/modules/PierMarker';
import type { ScourSeries } from '@/types/terrain';
import { remainPct } from '@/constants/grade';

export type SectionId = 'A' | 'B';

export interface SectionSample {
  /** 단면 시작점으로부터 거리(m) */
  s: number;
  /** 초기 하상 대비 변화량(m). 음수 = 세굴 */
  deltaM: number;
}

export interface SectionKpi {
  maxScourDepthM: number;
  maxDepositM: number;
  scourWidthM: number;
  scourAreaM2: number;
  marginToFootingM: number;
  marginRemainPct: number;
}

export interface PierOnSection {
  pierId: string;
  s: number;
  diameterM: number;
}

export function terrainWorldBounds(series: ScourSeries): {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
} {
  const { width, height, cellSize } = series.baseTerrain;
  const halfW = ((width - 1) * cellSize) / 2;
  const halfH = ((height - 1) * cellSize) / 2;
  return { xMin: -halfW, xMax: halfW, zMin: -halfH, zMax: halfH };
}

function frameIndexAtTime(series: ScourSeries, timeSeconds: number): number {
  const { frames } = series;
  if (frames.length === 0) return 0;
  const lastT = frames.at(-1)!.timestampSeconds;
  const clamped = Math.max(0, Math.min(timeSeconds, lastT));
  let idx = 0;
  for (let i = 0; i < frames.length; i++) {
    if ((frames[i]?.timestampSeconds ?? 0) <= clamped) idx = i;
    else break;
  }
  return idx;
}

function deltaAtWorld(
  series: ScourSeries,
  frameIdx: number,
  worldX: number,
  worldZ: number,
): number {
  const frame = series.frames[frameIdx];
  if (!frame) return 0;
  return sampleDeltaBilinear(frame.deltaElevations, series.baseTerrain, worldX, worldZ);
}

/** 단면 그래프 Y축 — 세굴(−)·퇴적(+)·기초 저면이 모두 보이도록 */
export function sectionProfileChartYDomain(
  sampleGroups: SectionSample[][],
  foundationDepthM: number,
): { yMin: number; yMax: number } {
  let dataMin = 0;
  let dataMax = 0;
  for (const samples of sampleGroups) {
    for (const p of samples) {
      dataMin = Math.min(dataMin, p.deltaM);
      dataMax = Math.max(dataMax, p.deltaM);
    }
  }

  const footY = -foundationDepthM;
  const span = dataMax - dataMin;
  const pad = Math.max(
    0.008,
    span * 0.12,
    Math.max(Math.abs(dataMin), Math.abs(dataMax), foundationDepthM) * 0.1,
  );

  let yMin = Math.min(footY * 1.04, dataMin - pad, -pad);
  let yMax = Math.max(dataMax + pad, pad);

  if (dataMax > 1e-9) yMax = Math.max(yMax, dataMax + pad);
  if (dataMin < -1e-9) yMin = Math.min(yMin, dataMin - pad);

  const minSpan = foundationDepthM > 1 ? 1.2 : Math.max(0.05, foundationDepthM * 1.8, span * 1.25);
  if (yMax - yMin < minSpan) {
    const mid = (yMax + yMin) * 0.5;
    yMin = mid - minSpan * 0.5;
    yMax = mid + minSpan * 0.5;
  }
  if (yMax <= 0) yMax = pad;
  return { yMin, yMax };
}

export function maxDepositAlongSection(samples: SectionSample[]): number {
  let max = 0;
  for (const p of samples) {
    if (p.deltaM > max) max = p.deltaM;
  }
  return max;
}

export function sectionLengthM(series: ScourSeries, section: SectionId): number {
  const b = terrainWorldBounds(series);
  return section === 'A' ? b.xMax - b.xMin : b.zMax - b.zMin;
}

/** 단면 A: z≈교각 중심 종단(X). B: x≈P2(또는 도메인 중심) 횡단(Z) */
export function sampleSectionProfile(
  series: ScourSeries,
  section: SectionId,
  timeSeconds: number,
  sampleCount = 160,
  piers: PierDefinition[] = [],
): SectionSample[] {
  const b = terrainWorldBounds(series);
  const frameIdx = frameIndexAtTime(series, timeSeconds);
  const len = sectionLengthM(series, section);
  const zLine = piers.length > 0 ? piers.reduce((a, p) => a + p.z, 0) / piers.length : 0;
  const p2 = piers.find((p) => p.id === 'P2') ?? piers[Math.floor(piers.length / 2)];
  const xLine = p2?.x ?? 0;

  const out: SectionSample[] = [];
  for (let i = 0; i <= sampleCount; i++) {
    const s = (len * i) / sampleCount;
    let worldX: number;
    let worldZ: number;
    if (section === 'A') {
      worldX = b.xMin + s;
      worldZ = zLine;
    } else {
      worldX = xLine;
      worldZ = b.zMin + s;
    }
    out.push({ s, deltaM: deltaAtWorld(series, frameIdx, worldX, worldZ) });
  }
  return out;
}

export function piersOnSection(
  series: ScourSeries,
  section: SectionId,
  piers: PierDefinition[],
): PierOnSection[] {
  const b = terrainWorldBounds(series);
  const p2 = piers.find((p) => p.id === 'P2') ?? piers[Math.floor(piers.length / 2)];
  const xLine = p2?.x ?? 0;

  if (section === 'A') {
    return [...piers]
      .sort((a, b) => a.x - b.x)
      .map((p) => ({
        pierId: p.id,
        s: p.x - b.xMin,
        diameterM: p.diameter ?? 0.1,
      }));
  }
  const tol = Math.max(0.04, (p2?.diameter ?? 0.1) * 0.55);
  return piers
    .filter((p) => Math.abs(p.x - xLine) <= tol)
    .sort((a, b) => a.z - b.z)
    .map((p) => ({
      pierId: p.id,
      s: p.z - b.zMin,
      diameterM: p.diameter ?? 0.1,
    }));
}

/** P2(또는 중앙 교각) 기준 단면 KPI — 목업 sectionKPI 근사 */
export function computeSectionKpi(
  series: ScourSeries,
  section: SectionId,
  timeSeconds: number,
  foundationDepthM: number,
  pierScourDepthM: number,
  piers: PierDefinition[] = [],
): SectionKpi {
  const samples = sampleSectionProfile(series, section, timeSeconds, 300, piers);
  const len = sectionLengthM(series, section);
  const ds = len / Math.max(1, samples.length - 1);
  const onSec = piersOnSection(series, section, piers);
  const focus =
    onSec.find((p) => p.pierId === 'P2') ??
    onSec[Math.floor(onSec.length / 2)] ??
    ({ s: len / 2, diameterM: 0.1 } as PierOnSection);
  const ci = Math.round(focus.s / ds);
  const r0 = Math.max(1, Math.round(0.8 / ds));
  let l = Math.max(0, ci - r0);
  let r = Math.min(samples.length - 1, ci + r0);
  const lim = Math.round(3.6 / ds);
  const scourThreshold = foundationDepthM > 1 ? -0.15 : -0.002;
  while (l > 0 && ci - l < lim && (samples[l - 1]?.deltaM ?? 0) < scourThreshold) l--;
  while (r < samples.length - 1 && r - ci < lim && (samples[r + 1]?.deltaM ?? 0) < scourThreshold)
    r++;

  let area = 0;
  for (let k = l; k <= r; k++) {
    const v = samples[k]?.deltaM ?? 0;
    area += Math.max(0, -v) * ds;
  }
  const width = (r - l) * ds;
  const margin = Math.max(0, foundationDepthM - pierScourDepthM);
  return {
    maxScourDepthM: pierScourDepthM,
    maxDepositM: maxDepositAlongSection(samples),
    scourWidthM: width,
    scourAreaM2: area,
    marginToFootingM: margin,
    marginRemainPct: remainPct(pierScourDepthM, foundationDepthM),
  };
}
