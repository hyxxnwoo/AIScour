/**
 * 영역(컨테이너) inline 크기 기준 3단계 표출 경계 — em 단위 (루트 font-size 대비).
 * CSS 변수 `--viz-tier-basic-em` / `--viz-tier-detail-em` 와 동기화한다.
 */
export const VIZ_TIER_BASIC_EM = 14;
export const VIZ_TIER_DETAIL_EM = 22;

export type DisplayTier = 'core' | 'basic' | 'detail';

/** 컨테이너 너비(px)와 기준 글자 크기(px)로 표출 단계를 계산한다. */
export function displayTierForWidth(widthPx: number, fontSizePx: number): DisplayTier {
  const em = widthPx / Math.max(fontSizePx, 10);
  if (em < VIZ_TIER_BASIC_EM) return 'core';
  if (em < VIZ_TIER_DETAIL_EM) return 'basic';
  return 'detail';
}
