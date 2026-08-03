import { describe, expect, it } from 'vitest';
import { sampleColorRamp, sampleTerrainSandColor } from '@/utils/colorRamp';

describe('sampleColorRamp', () => {
  it('범위 내 0 값은 모래 톤을 반환한다', () => {
    const out = { r: 0, g: 0, b: 0 };
    sampleColorRamp(0, -1, 1, out);
    expect(out.r).toBeCloseTo(214 / 255, 3);
    expect(out.g).toBeCloseTo(178 / 255, 3);
    expect(out.b).toBeCloseTo(118 / 255, 3);
  });

  it('범위를 벗어나는 음수 값은 가장 어두운 청색으로 클램프된다', () => {
    const out = { r: 0, g: 0, b: 0 };
    sampleColorRamp(-10, -1, 1, out);
    expect(out.r).toBeCloseTo(12 / 255, 3);
    expect(out.g).toBeCloseTo(36 / 255, 3);
    expect(out.b).toBeCloseTo(86 / 255, 3);
  });

  it('범위가 0이면 안전하게 0 정규화로 동작한다', () => {
    const out = { r: 0, g: 0, b: 0 };
    sampleColorRamp(0, 0, 0, out);
    // 어떤 값이든 NaN 이 아니어야 한다
    expect(Number.isFinite(out.r)).toBe(true);
    expect(Number.isFinite(out.g)).toBe(true);
    expect(Number.isFinite(out.b)).toBe(true);
  });
});

describe('sampleTerrainSandColor', () => {
  it('변화 없음(Δ=0)은 따뜻한 모래색을 반환한다', () => {
    const out = { r: 0, g: 0, b: 0 };
    sampleTerrainSandColor(0, 0.05, 3, 7, out);
    expect(out.r).toBeGreaterThan(0.8);
    expect(out.g).toBeGreaterThan(0.65);
    expect(out.b).toBeLessThan(0.55);
  });

  it('퇴적(+)은 기본 모래보다 어둡고 채도가 높다', () => {
    const base = { r: 0, g: 0, b: 0 };
    const deposit = { r: 0, g: 0, b: 0 };
    sampleTerrainSandColor(0, 0.05, 2, 4, base);
    sampleTerrainSandColor(0.05, 0.05, 2, 4, deposit);
    expect(deposit.r).toBeLessThan(base.r);
    expect(deposit.g).toBeLessThan(base.g);
    expect(deposit.b).toBeLessThan(base.b);
  });
});
