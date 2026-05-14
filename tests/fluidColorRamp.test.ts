import { describe, expect, it } from 'vitest';
import { fluidColorRampToCss, sampleFluidColor, FLUID_STOPS } from '@/utils/fluidColorRamp';

describe('sampleFluidColor', () => {
  it('vMin 에서는 첫 stop, vMax 에서는 마지막 stop 색을 반환한다', () => {
    const out = { r: 0, g: 0, b: 0 };
    sampleFluidColor(0, 0, 1, out);
    expect(out.r).toBeCloseTo(FLUID_STOPS[0].r / 255, 3);
    sampleFluidColor(1, 0, 1, out);
    expect(out.b).toBeCloseTo(FLUID_STOPS[FLUID_STOPS.length - 1].b / 255, 3);
  });

  it('vMin = vMax 일 때 NaN 없이 안전하다', () => {
    const out = { r: 0, g: 0, b: 0 };
    sampleFluidColor(5, 5, 5, out);
    expect(Number.isFinite(out.r)).toBe(true);
    expect(Number.isFinite(out.g)).toBe(true);
    expect(Number.isFinite(out.b)).toBe(true);
  });
});

describe('fluidColorRampToCss', () => {
  it('linear-gradient 문자열에 모든 stop 의 색이 포함된다', () => {
    const css = fluidColorRampToCss('to right');
    for (const s of FLUID_STOPS) {
      expect(css).toContain(`rgb(${s.r}, ${s.g}, ${s.b})`);
    }
  });
});
