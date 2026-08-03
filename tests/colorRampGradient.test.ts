import { describe, expect, it } from 'vitest';
import { COLOR_STOPS, colorRampToCssGradient } from '@/utils/colorRamp';

describe('colorRampToCssGradient', () => {
  it('CSS linear-gradient 문자열에 모든 stop 의 색이 포함된다', () => {
    const css = colorRampToCssGradient('to right');
    expect(css.startsWith('linear-gradient(to right,')).toBe(true);
    for (const stop of COLOR_STOPS) {
      expect(css).toContain(`rgb(${stop.r}, ${stop.g}, ${stop.b})`);
    }
  });

  it('t=-1 stop 은 0%, t=+1 stop 은 100% 에 위치한다', () => {
    const css = colorRampToCssGradient();
    expect(css).toMatch(/rgb\(12, 36, 86\) 0\.0%/);
    expect(css).toMatch(/rgb\(92, 62, 26\) 100\.0%/);
  });
});
