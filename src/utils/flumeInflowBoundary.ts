import { FLUME } from '@/constants/experiment';
import type { BedAxes } from '@/data/buildScrdifBedField';

/**
 * FLOW-3D 수조 유입 경계(고정상·맑은 물 유입·이동상 시작)로 인한
 * "배고픈 물" 세굴 — 교량 세굴과 구분해 가시화·교각 추정에서 제외한다.
 *
 * 좌표는 CSV/FLOW-3D data x (흐름 방향, m).
 */
export const FLUME_INFLOW_BOUNDARY = {
  /** x < 0.09 m: 하상 변화 0 (고정상). */
  fixedBedMaxDataX: 0.09,
  /** 이동상(모래 바닥) 시작. */
  mobileBedStartDataX: 0.1,
  /**
   * 배고픈 물 세굴 구간 상한(≈ t=90s x 0.10–0.21 m + 여유).
   * structureFrontX(0.1 m)와 겹치지만, 교량 세굴은 보통 이보다 하류(data x)에 있다.
   */
  hungryWaterScourMaskMaxDataX: 0.22,
} as const;

export function inflowBoundaryMaskEnabled(options?: {
  maskInflowBoundaryScour?: boolean;
}): boolean {
  return options?.maskInflowBoundaryScour !== false;
}

export function isHungryWaterScourDataX(dataX: number): boolean {
  return dataX <= FLUME_INFLOW_BOUNDARY.hungryWaterScourMaskMaxDataX;
}

/** 하상 격자에서 유입 경계 구간 scrdif 를 0 으로 만든다. */
export function applyInflowBoundaryMaskToBed(bed: Float32Array, bedAxes: BedAxes): void {
  const nx = bedAxes.x.values.length;
  const ny = bedAxes.y.values.length;
  const maxX = FLUME_INFLOW_BOUNDARY.hungryWaterScourMaskMaxDataX;

  for (let yi = 0; yi < ny; yi += 1) {
    for (let xi = 0; xi < nx; xi += 1) {
      if (bedAxes.x.values[xi] <= maxX) {
        bed[yi * nx + xi] = 0;
      }
    }
  }
}

export function inflowBoundaryLegendNote(): string {
  const { fixedBedMaxDataX, mobileBedStartDataX, hungryWaterScourMaskMaxDataX } =
    FLUME_INFLOW_BOUNDARY;
  return (
    `유입 경계: data x≤${fixedBedMaxDataX} m 고정상, 이동상 ${mobileBedStartDataX} m~. ` +
    `맑은 물 유입(배고픈 물) 세굴 x≤${hungryWaterScourMaskMaxDataX} m 구간은 교량 분석·색상에서 제외했습니다.`
  );
}

/** 상태바·짧은 힌트용 */
export function inflowBoundaryLegendNoteShort(): string {
  const { hungryWaterScourMaskMaxDataX } = FLUME_INFLOW_BOUNDARY;
  return `유입부(x≤${hungryWaterScourMaskMaxDataX} m) 세굴은 색·분석에서 제외`;
}

/** 수조 길이와 동일한 플룸 CSV 가시화인지(유입 마스크 기본 적용). */
export function defaultMaskForTankLength(tankLengthX: number): boolean {
  return Math.abs(tankLengthX - FLUME.tank.lengthX) < 1e-6;
}
