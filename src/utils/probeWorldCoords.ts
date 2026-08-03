import { FLUME } from '@/constants/experiment';

/**
 * FLOW-3D CSV (dataX, dataY) → Three.js 월드 (X, Z) 앵커.
 *
 * X: CSV x=0 을 수조 입구(-lengthX/2)에 맞춘다 (bbox 중심이 아님).
 * Z: CSV y=0 을 수로 횡단 중심(world Z=0)에 둔다.
 */
export interface ProbeWorldAnchor {
  originDataX: number;
  originDataY: number;
}

export function probeWorldAnchor(tankLengthX: number = FLUME.tank.lengthX): ProbeWorldAnchor {
  return {
    originDataX: tankLengthX / 2,
    originDataY: 0,
  };
}

export function probeDataXToWorldX(dataX: number, anchor: ProbeWorldAnchor): number {
  return dataX - anchor.originDataX;
}

export function probeDataYToWorldZ(dataY: number, anchor: ProbeWorldAnchor): number {
  return dataY - anchor.originDataY;
}

export function probeWorldXToDataX(worldX: number, anchor: ProbeWorldAnchor): number {
  return worldX + anchor.originDataX;
}

export function probeWorldZToDataY(worldZ: number, anchor: ProbeWorldAnchor): number {
  return worldZ + anchor.originDataY;
}
