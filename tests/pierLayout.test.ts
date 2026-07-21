import { describe, expect, it } from 'vitest';
import { paramsToFlumeGeometry, terrainPhysicalSize } from '@/constants/experiment';
import { DEFAULT_SIM_PARAMS } from '@/types/simParams';
import {
  buildPierLayout,
  clampPierCount,
  pierSpacingX,
  pierSpacingZ,
  pierXPositions,
  pierZPositions,
} from '@/utils/pierLayout';

describe('pierLayout', () => {
  it('clampPierCount 는 1~3 으로 보정한다', () => {
    expect(clampPierCount(0)).toBe(1);
    expect(clampPierCount(2.4)).toBe(2);
    expect(clampPierCount(5)).toBe(3);
  });

  it('기둥 1개는 z=0 에 놓인다', () => {
    const layout = buildPierLayout({ ...DEFAULT_SIM_PARAMS, pierCount: 1 });
    expect(layout).toHaveLength(1);
    expect(layout[0]?.id).toBe('P1');
    expect(layout[0]?.z).toBe(0);
  });

  it('기둥 2·3개는 z=0 대칭 배치다', () => {
    const params = { ...DEFAULT_SIM_PARAMS, pierCount: 2 };
    const z2 = pierZPositions(params);
    expect(z2).toHaveLength(2);
    expect(z2[0]).toBeCloseTo(-z2[1]!, 5);

    const z3 = pierZPositions({ ...DEFAULT_SIM_PARAMS, pierCount: 3 });
    expect(z3).toHaveLength(3);
    expect(z3[1]).toBeCloseTo(0, 5);
    expect(z3[0]).toBeCloseTo(-z3[2]!, 5);
  });

  it('기둥 간격은 지름·수조 폭을 고려한다', () => {
    const spacing = pierSpacingZ({ ...DEFAULT_SIM_PARAMS, pierCount: 3, pierDiameter: 0.1 });
    expect(spacing).toBeGreaterThanOrEqual(0.25);
  });

  it('buildPierLayout 은 P1…Pn ID 와 공통 형상을 부여한다', () => {
    const layout = buildPierLayout({
      ...DEFAULT_SIM_PARAMS,
      pierCount: 3,
      pierArrangement: 'across',
      structureShape: 'square',
      pierDiameter: 0.12,
    });
    expect(layout.map((p) => p.id)).toEqual(['P1', 'P2', 'P3']);
    expect(layout.every((p) => p.shape === 'square')).toBe(true);
    expect(layout.every((p) => p.diameter === 0.12)).toBe(true);
    expect(new Set(layout.map((p) => p.x)).size).toBe(1);
  });

  it('가로(along) 배치는 x 가 달라지고 z=0 이다', () => {
    const layout = buildPierLayout({
      ...DEFAULT_SIM_PARAMS,
      pierCount: 3,
      pierArrangement: 'along',
    });
    expect(layout).toHaveLength(3);
    expect(layout.every((p) => p.z === 0)).toBe(true);
    expect(new Set(layout.map((p) => p.x)).size).toBe(3);
    expect(layout[0]!.x).toBeLessThan(layout[1]!.x);
    expect(layout[1]!.x).toBeLessThan(layout[2]!.x);
  });

  it('흐름 방향 배치는 structureCenterX 에서 하류로만 이어진다', () => {
    const params = { ...DEFAULT_SIM_PARAMS, pierCount: 3, pierArrangement: 'along' as const };
    const xs = pierXPositions(params);
    const startX = xs[0]!;
    expect(startX).toBeCloseTo(-DEFAULT_SIM_PARAMS.tankLengthX / 2 + DEFAULT_SIM_PARAMS.structureFrontX, 5);
    expect(xs[1]).toBeGreaterThan(xs[0]!);
    expect(xs[2]).toBeGreaterThan(xs[1]!);
  });

  it('흐름 방향 간격은 수조 길이를 고려한다', () => {
    const spacing = pierSpacingX({ ...DEFAULT_SIM_PARAMS, pierCount: 3, pierArrangement: 'along' });
    expect(spacing).toBeGreaterThanOrEqual(0.25);
  });

  it('pierXPositions 는 지형 X 범위 안에 있다', () => {
    const params = { ...DEFAULT_SIM_PARAMS, pierCount: 3, pierArrangement: 'along' as const };
    const xs = pierXPositions(params);
    const { lengthX } = terrainPhysicalSize(paramsToFlumeGeometry(params));
    const halfX = lengthX / 2;
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(-halfX);
      expect(x).toBeLessThanOrEqual(halfX);
    }
  });
});
