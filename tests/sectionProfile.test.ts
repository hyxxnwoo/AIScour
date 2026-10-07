import { describe, expect, it } from 'vitest';
import { structureCenterX } from '@/constants/experiment';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import {
  computeSectionKpi,
  sampleSectionProfile,
  sectionLengthM,
  sectionProfileChartYDomain,
} from '@/utils/sectionProfile';

describe('sectionProfile', () => {
  it('종단 단면 길이는 지형 X 범위와 같다', async () => {
    const series = await new SyntheticScourSource({ frameCount: 5, frameIntervalSeconds: 30 }).load();
    expect(sectionLengthM(series, 'A')).toBeGreaterThan(0);
    const samples = sampleSectionProfile(series, 'A', 0, 20);
    expect(samples.length).toBe(21);
    expect(samples[0]!.s).toBe(0);
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

  it('KPI는 세굴심·여유율을 반환한다', async () => {
    const pierX = structureCenterX();
    const series = await new SyntheticScourSource({
      frameCount: 10,
      frameIntervalSeconds: 30,
      pier: { x: pierX, z: 0 },
    }).load();
    const piers = [{ id: 'P1', x: pierX, z: 0, diameter: 0.1, height: 0.5, shape: 'circle' as const }];
    const kpi = computeSectionKpi(series, 'A', 120, 0.127, 0.05, piers);
    expect(kpi.maxScourDepthM).toBe(0.05);
    expect(kpi.marginToFootingM).toBeCloseTo(0.077, 2);
    expect(kpi.marginRemainPct).toBeGreaterThan(0);
  });
});
