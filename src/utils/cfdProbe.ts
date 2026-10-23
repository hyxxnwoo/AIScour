// CFD 모드 클릭 프로브: 하상 한 점의 좌표·표고 변화·유속·전단응력을 모은다.

import type { CfdFlowSource, FlowVelocity } from '@/data/cfdFlowField';

export interface CfdProbeSample {
  /** 월드 좌표(m): x=흐름, z=횡단, y=연직(표고) */
  x: number;
  y: number;
  z: number;
  /** 초기 하상 대비 표고 변화(m, 음수=세굴·양수=퇴적) */
  deltaElevation: number;
  /** 수심 중간 높이의 유속 성분(m/s, 월드 축 기준)과 크기 */
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  /** 하상 전단응력(Pa, 잠정) */
  shearStress: number;
  /** 유속을 구할 수 없는 지점(교각 내부 등) */
  noFlow: boolean;
}

export interface CfdProbeInput {
  flow: CfdFlowSource;
  x: number;
  z: number;
  /** 히트 지점 표고(m) */
  elevation: number;
  deltaElevation: number;
  /** 초기 하상 표고(m)와 수면 높이(m) — 유속을 읽을 수심 중간 높이 계산용 */
  baseElevation: number;
  waterLevelY: number;
  t: number;
}

const tmp: FlowVelocity = { vx: 0, vy: 0, vz: 0 };

export function computeCfdProbe(input: CfdProbeInput): CfdProbeSample {
  const midY = input.baseElevation + 0.5 * Math.max(1e-3, input.waterLevelY - input.baseElevation);
  const ok = input.flow.sample(input.x, midY, input.z, input.t, tmp);
  return {
    x: input.x,
    y: input.elevation,
    z: input.z,
    deltaElevation: input.deltaElevation,
    vx: ok ? tmp.vx : 0,
    vy: ok ? tmp.vy : 0,
    vz: ok ? tmp.vz : 0,
    speed: ok ? Math.hypot(tmp.vx, tmp.vy, tmp.vz) : 0,
    shearStress: input.flow.bedShearStress(input.x, input.z, input.t),
    noFlow: !ok,
  };
}
