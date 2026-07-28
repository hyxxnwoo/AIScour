import type { FluidQuantity } from '@/types/fluid';
import { sampleColorRamp, colorRampToCssGradient } from '@/utils/colorRamp';
import {
  fluidColorRampToCss,
  sampleFluidColor,
  type ColorRGB,
} from '@/utils/fluidColorRamp';

export type FluidQuantityColorMode = 'field' | 'scour';

export function fluidQuantityColorMode(q: FluidQuantity): FluidQuantityColorMode {
  if (q === 'scrdif') return 'scour';
  return 'field';
}

/**
 * u/v/w·scrdif 는 0 기준 대칭 범위, 나머지는 데이터 min/max.
 * scrdif 도 대칭화해야 하는 이유: sampleColorRamp 가 항상
 * range = max(|min|,|max|) 기준으로 색을 매핑하므로(0=베이지 고정),
 * 범례에 표시하는 min/max 도 그 대칭 범위와 일치해야 색-숫자가 어긋나지 않는다.
 */
export function normalizeFluidQuantityRange(
  q: FluidQuantity,
  min: number,
  max: number,
): { min: number; max: number } {
  if (!isFinite(min) || !isFinite(max) || min === max) return { min: 0, max: 1 };
  if (q === 'velocityX' || q === 'velocityY' || q === 'velocityZ' || q === 'scrdif') {
    const abs = Math.max(Math.abs(min), Math.abs(max), 1e-6);
    return { min: -abs, max: abs };
  }
  return { min, max };
}

export function colorForFluidQuantity(
  q: FluidQuantity,
  value: number,
  vMin: number,
  vMax: number,
  out: ColorRGB,
): void {
  if (fluidQuantityColorMode(q) === 'scour') {
    sampleColorRamp(value, vMin, vMax, out);
    return;
  }
  sampleFluidColor(value, vMin, vMax, out);
}

export function legendGradientForFluidQuantity(q: FluidQuantity, direction = 'to right'): string {
  if (fluidQuantityColorMode(q) === 'scour') return colorRampToCssGradient(direction);
  return fluidColorRampToCss(direction);
}
