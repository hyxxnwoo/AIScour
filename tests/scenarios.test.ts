import { describe, expect, it } from 'vitest';
import {
  BASELINE_SCENARIO,
  FLOW_SCENARIOS,
  FOOTING_SPECS,
  scenarioFromCaseName,
} from '@/constants/scenarios';

describe('FLOW_SCENARIOS', () => {
  it('S01~S30 30개가 순서대로 들어 있다', () => {
    expect(FLOW_SCENARIOS).toHaveLength(30);
    FLOW_SCENARIOS.forEach((s, i) => {
      expect(s.index).toBe(i + 1);
      expect(s.id).toBe(`S${String(i + 1).padStart(2, '0')}`);
    });
  });

  it('기준 S01 은 d50 0.385 mm · 수심 0.15 m · 유속 0.25 m/s · 간격 0.27 m · 정사각', () => {
    expect(BASELINE_SCENARIO).toMatchObject({
      id: 'S01',
      variable: '기준조건',
      d50Mm: 0.385,
      waterDepthM: 0.15,
      velocityMS: 0.25,
      pierSpacingM: 0.27,
      footingShape: 'square',
    });
  });

  it('OFAT: 각 시나리오는 기준에서 변수 한 종류만 다르다', () => {
    for (const s of FLOW_SCENARIOS.slice(1)) {
      const changed = [
        s.d50Mm !== BASELINE_SCENARIO.d50Mm,
        s.waterDepthM !== BASELINE_SCENARIO.waterDepthM,
        s.velocityMS !== BASELINE_SCENARIO.velocityMS,
        s.pierSpacingM !== BASELINE_SCENARIO.pierSpacingM,
        s.footingShape !== BASELINE_SCENARIO.footingShape,
      ].filter(Boolean).length;
      expect(changed, s.id).toBe(1);
    }
  });

  it('하단부 형상: 원형 D=0.13, 타원·직사각형 L=0.26(+X) × B=0.13', () => {
    expect(FOOTING_SPECS.square).toMatchObject({ lengthX: 0.13, widthZ: 0.13 });
    expect(FOOTING_SPECS.circle).toMatchObject({ lengthX: 0.13, widthZ: 0.13 });
    expect(FOOTING_SPECS.ellipse).toMatchObject({ lengthX: 0.26, widthZ: 0.13 });
    expect(FOOTING_SPECS.rectangle).toMatchObject({ lengthX: 0.26, widthZ: 0.13 });
    expect(FLOW_SCENARIOS.filter((s) => s.footingShape !== 'square').map((s) => s.id)).toEqual([
      'S28',
      'S29',
      'S30',
    ]);
  });
});

describe('scenarioFromCaseName', () => {
  it('s01 · S2 · s030 형태를 번호로 찾는다', () => {
    expect(scenarioFromCaseName('s01')?.id).toBe('S01');
    expect(scenarioFromCaseName('S2')?.id).toBe('S02');
    expect(scenarioFromCaseName('s30')?.id).toBe('S30');
    expect(scenarioFromCaseName(' s09 ')?.id).toBe('S09');
  });

  it('범위 밖이거나 시나리오 이름이 아니면 null', () => {
    expect(scenarioFromCaseName('s00')).toBeNull();
    expect(scenarioFromCaseName('s31')).toBeNull();
    expect(scenarioFromCaseName('run_a')).toBeNull();
    expect(scenarioFromCaseName('s01_all_timesteps')).toBeNull();
  });
});
