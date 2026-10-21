import { describe, expect, it } from 'vitest';
import { structureCenterX } from '@/constants/experiment';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import {
  computeSectionKpi,
  piersOnSection,
  sampleSectionProfile,
  sectionLengthM,
  sectionPointAtDistance,
  sectionProfileChartYDomain,
  terrainWorldBounds,
} from '@/utils/sectionProfile';

describe('sectionProfile', () => {
  it('단면 거리는 평면의 종단·횡단 좌표로 대응한다', async () => {
    const series = await new SyntheticScourSource({
      frameCount: 3,
      frameIntervalSeconds: 30,
    }).load();
    const bounds = terrainWorldBounds(series);
    const piers = [
      { id: 'P2', x: 0.4, z: -0.2, diameter: 0.1, height: 0.5, shape: 'circle' as const },
    ];
    const alongS = (bounds.xMax - bounds.xMin) * 0.35;
    const along = sectionPointAtDistance(series, 'A', alongS, piers);
    expect(along.worldX).toBeCloseTo(bounds.xMin + alongS);
    expect(along.worldZ).toBeCloseTo(-0.2);
    const pastEnd = sectionPointAtDistance(series, 'A', 100, piers);
    expect(pastEnd.worldX).toBeCloseTo(bounds.xMax);
    const acrossS = (bounds.zMax - bounds.zMin) * 0.4;
    const across = sectionPointAtDistance(series, 'B', acrossS, piers);
    expect(across.worldX).toBeCloseTo(0.4);
    expect(across.worldZ).toBeCloseTo(bounds.zMin + acrossS);
  });

  it('종단 단면 길이는 지형 X 범위와 같다', async () => {
    const series = await new SyntheticScourSource({
      frameCount: 5,
      frameIntervalSeconds: 30,
    }).load();
    expect(sectionLengthM(series, 'A')).toBeGreaterThan(0);
    const samples = sampleSectionProfile(series, 'A', 0, 20);
    expect(samples.length).toBe(21);
    expect(samples[0].s).toBe(0);
  });

  it('Y축 도메인은 퇴적(+) 샘플을 포함한다', () => {
    const scourOnly = [{ s: 0, deltaM: -0.12 }];
    const withDeposit = [
      { s: 0, deltaM: -0.05 },
      { s: 1, deltaM: 0.04 },
    ];
    const narrow = sectionProfileChartYDomain([scourOnly], 0.127);
    const wide = sectionProfileChartYDomain([withDeposit], 0.127);
    expect(wide.yMax).toBeGreaterThan(narrow.yMax);
    expect(wide.yMax).toBeGreaterThan(0.03);
  });

  it('횡단 B–B′는 교각 개수만큼 x 위치에서 각각 한 기둥을 잡는다', async () => {
    const series = await new SyntheticScourSource({
      frameCount: 3,
      frameIntervalSeconds: 30,
    }).load();
    const piers = [
      { id: 'P1', x: -0.5, z: 0, diameter: 0.12, height: 0.5, shape: 'circle' as const },
      { id: 'P2', x: 0, z: 0, diameter: 0.12, height: 0.5, shape: 'circle' as const },
      { id: 'P3', x: 0.5, z: 0, diameter: 0.12, height: 0.5, shape: 'circle' as const },
    ];
    expect(piersOnSection(series, 'B', piers, 'P1')).toEqual([
      expect.objectContaining({ pierId: 'P1' }),
    ]);
    expect(piersOnSection(series, 'B', piers, 'P3')).toEqual([
      expect.objectContaining({ pierId: 'P3' }),
    ]);
    expect(piersOnSection(series, 'A', piers)).toHaveLength(3);
  });

  it('KPI는 세굴심·여유율을 반환한다', async () => {
    const pierX = structureCenterX();
    const series = await new SyntheticScourSource({
      frameCount: 10,
      frameIntervalSeconds: 30,
      pier: { x: pierX, z: 0 },
    }).load();
    const piers = [
      { id: 'P1', x: pierX, z: 0, diameter: 0.1, height: 0.5, shape: 'circle' as const },
    ];
    const kpi = computeSectionKpi(series, 'A', 120, 0.127, 0.05, piers);
    expect(kpi.maxScourDepthM).toBe(0.05);
    expect(kpi.marginToFootingM).toBeCloseTo(0.077, 2);
    expect(kpi.marginRemainPct).toBeGreaterThan(0);
  });
});

describe('종단 A–A′ 교각 선택', () => {
  const mk = (id: string, z: number) => ({
    id,
    x: 0,
    z,
    diameter: 0.0625,
    height: 0.3,
    shape: 'circle' as const,
  });
  const piers = [mk('P1', -0.27), mk('P2', 0), mk('P3', 0.27)];

  it('고른 교각의 Z 를 지나고 그 교각만 단면에 표시한다', async () => {
    const series = await new SyntheticScourSource({
      frameCount: 2,
      frameIntervalSeconds: 30,
    }).load();
    for (const p of piers) {
      expect(sectionPointAtDistance(series, 'A', 0.5, piers, p.id).worldZ).toBeCloseTo(p.z);
      const on = piersOnSection(series, 'A', piers, p.id);
      expect(on.map((o) => o.pierId)).toEqual([p.id]);
    }
  });

  it('교각을 지정하지 않으면 기존처럼 전체 교각 평균 Z 를 쓴다', async () => {
    const series = await new SyntheticScourSource({
      frameCount: 2,
      frameIntervalSeconds: 30,
    }).load();
    expect(piersOnSection(series, 'A', piers)).toHaveLength(3);
  });
});
