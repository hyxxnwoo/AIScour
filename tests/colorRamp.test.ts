import { describe, expect, it } from 'vitest';
import { sampleColorRamp } from '@/utils/colorRamp';

describe('sampleColorRamp', () => {
  it('범위 내 0 값은 베이지 톤을 반환한다', () => {
    const out = { r: 0, g: 0, b: 0 };
    sampleColorRamp(0, -1, 1, out);
    expect(out.r).toBeCloseTo(220 / 255, 3);
    expect(out.g).toBeCloseTo(210 / 255, 3);
    expect(out.b).toBeCloseTo(180 / 255, 3);
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
