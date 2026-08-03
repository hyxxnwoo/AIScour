import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_PARAMS, mergePanelParams } from '@/types/simParams';

describe('mergePanelParams', () => {
  it('실행 조건 패널 값이 시뮬레이션 패널의 미편집 초기값으로 덮이지 않는다', () => {
    const base = { ...DEFAULT_SIM_PARAMS };
    const experiment = {
      ...DEFAULT_SIM_PARAMS,
      waterDepth: 0.2,
      structureShape: 'square' as const,
      pierDiameter: 0.15,
      pierCount: 3,
      pierArrangement: 'along' as const,
      bridgeEnabled: true,
      bridgeType: 'cable-stayed' as const,
    };
    const fluidPanel = {
      ...DEFAULT_SIM_PARAMS,
      fluidU: 0.4,
      fluidV: 0.05,
      fluidW: 0.2,
      scrdifMax: 0.18,
    };
    const simPanel = { ...DEFAULT_SIM_PARAMS, inflowSpeed: 0.4 };

    const merged = mergePanelParams(base, experiment, fluidPanel, simPanel);

    expect(merged.waterDepth).toBe(0.2);
    expect(merged.structureShape).toBe('square');
    expect(merged.pierDiameter).toBe(0.15);
    expect(merged.pierCount).toBe(3);
    expect(merged.pierArrangement).toBe('along');
    expect(merged.bridgeEnabled).toBe(true);
    expect(merged.bridgeType).toBe('cable-stayed');
    expect(merged.fluidU).toBe(0.4);
    expect(merged.fluidV).toBe(0.05);
    expect(merged.fluidW).toBe(0.2);
    expect(merged.scrdifMax).toBe(0.18);
    expect(merged.inflowSpeed).toBe(0.4);
  });
});
