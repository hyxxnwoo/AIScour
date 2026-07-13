import { describe, expect, it } from 'vitest';
import {
  fluidQuantityColorMode,
  normalizeFluidQuantityRange,
} from '@/utils/fluidQuantityColor';

describe('fluidQuantityColor', () => {
  it('u/v/w 는 field 모드, scrdif 는 scour 모드를 사용한다', () => {
    expect(fluidQuantityColorMode('velocityX')).toBe('field');
    expect(fluidQuantityColorMode('scrdif')).toBe('scour');
    const range = normalizeFluidQuantityRange('velocityX', -0.2, 0.5);
    expect(range.min).toBe(-0.5);
    expect(range.max).toBe(0.5);
  });
});
