import { FLUME } from '@/constants/experiment';

export type StructureShape = 'circle' | 'square';

/** 기둥 배열 방향. across=폭(Z·세로), along=흐름(X·가로) */
export type PierArrangement = 'across' | 'along';

/** 교량 형식(시각 전용). */
export type BridgeType = 'suspension' | 'cable-stayed' | 'arch' | 'girder';

export type SelectSimParamKey = 'structureShape' | 'structurePermeable';

// 시뮬레이션 케이스를 정의하는 모든 조절 가능 파라미터.
export interface SimParams {
  // ── 수조·배치
  tankLengthX: number; // m — 흐름(X) 방향 길이
  tankWidthZ: number; // m — 폭(Z)
  tankHeightY: number; // m — 연직(Y) 높이
  structureFrontX: number; // m — 입구측 전방 구간(구조물 배치)
  // ── 구조물(교각)
  pierCount: number; // 1~3
  pierArrangement: PierArrangement;
  pierDiameter: number; // m
  structureShape: StructureShape;
  structurePermeable: boolean;
  bridgeEnabled: boolean; // 교량 시각 표시
  bridgeType: BridgeType;
  // ── 유체
  inflowSpeed: number; // m/s — 하위 호환(미사용 시 fluidU 와 동기)
  fluidU: number; // m/s — 기준 x방향 유속
  fluidV: number; // m/s — 기준 y방향 유속
  fluidW: number; // m/s — 기준 z방향 유속(후류 진폭)
  scrdifMax: number; // m — 세굴/퇴적 변화량 스케일
  waterDepth: number; // m — 퇴적물 표면 위 물 높이
  // ── 하상 재료
  sandGrainSizeMm: number; // mm — 모래 입경(세굴 진행 속도에 약하게 반영)
  sedimentThickness: number; // m — 퇴적층 두께(표면 y=0 아래)
  // ── 세굴
  scourRate: number; // 배율 (1.0 = 기본)
  criticalScourDepth: number; // m — 세굴 모니터 기준 깊이
  // ── 시뮬레이션 기간
  totalTimeSeconds: number; // s — 총 계산 시간
  frameCount: number; // 프레임 수
}

export type NumericSimParamKey = {
  [K in keyof SimParams]: SimParams[K] extends number ? K : never;
}[keyof SimParams];

export const DEFAULT_SIM_PARAMS: SimParams = {
  tankLengthX: FLUME.tank.lengthX,
  tankWidthZ: FLUME.tank.widthZ,
  tankHeightY: FLUME.tank.heightY,
  structureFrontX: FLUME.structureFrontX,
  pierCount: 1,
  pierArrangement: 'along',
  pierDiameter: FLUME.structure.diameterM,
  structureShape: 'circle',
  structurePermeable: false,
  bridgeEnabled: true,
  bridgeType: 'suspension',
  inflowSpeed: 0.25,
  fluidU: 0.25,
  fluidV: 0,
  fluidW: 0.15,
  scrdifMax: 0.12,
  waterDepth: FLUME.waterDepthM,
  sandGrainSizeMm: FLUME.sandGrainSizeMm,
  sedimentThickness: FLUME.sedimentThicknessY,
  scourRate: 1.0,
  criticalScourDepth: 0.12,
  totalTimeSeconds: FLUME.totalTimeSeconds,
  frameCount: 90,
};

/** 프레임 간 시간 간격(초) = 총 계산 시간 / 프레임 수 */
export function frameIntervalSeconds(params: SimParams): number {
  return params.totalTimeSeconds / Math.max(1, params.frameCount);
}

export interface SimParamMeta {
  key: NumericSimParamKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

/** 시뮬레이션 파라미터 패널용 수치 슬라이더 메타 */
export const SIM_PARAM_META: SimParamMeta[] = [
  { key: 'inflowSpeed', label: '유입 유속', unit: 'm/s', min: 0.05, max: 1.0, step: 0.01 },
  { key: 'sandGrainSizeMm', label: '모래 입경', unit: 'mm', min: 0.1, max: 2.0, step: 0.005 },
  { key: 'sedimentThickness', label: '퇴적층 두께', unit: 'm', min: 0.03, max: 0.25, step: 0.005 },
  { key: 'scourRate', label: '세굴 속도 배율', unit: '×', min: 0.2, max: 5.0, step: 0.1 },
  { key: 'criticalScourDepth', label: '기준 세굴 깊이', unit: 'm', min: 0.02, max: 0.3, step: 0.005 },
  { key: 'frameCount', label: '시뮬레이션 프레임', unit: '개', min: 10, max: 300, step: 10 },
];

/** 실행 조건 패널용 수치 슬라이더 메타 */
export const EXPERIMENT_NUMERIC_META: SimParamMeta[] = [
  { key: 'waterDepth', label: '수심', unit: 'm', min: 0.05, max: 0.4, step: 0.005 },
  { key: 'pierDiameter', label: '구조물 지름', unit: 'm', min: 0.02, max: 0.4, step: 0.005 },
];

export interface SimSelectMeta {
  key: SelectSimParamKey;
  label: string;
  options: Array<{ value: string; label: string }>;
}

/** 실행 조건 패널용 선택형 메타 */
export const EXPERIMENT_SELECT_META: SimSelectMeta[] = [
  {
    key: 'structureShape',
    label: '구조물 모양',
    options: [
      { value: 'circle', label: '원형' },
      { value: 'square', label: '사각' },
    ],
  },
];

/** 유체 필드 패널용 수치 입력 메타 */
export const FLUID_FIELD_META: SimParamMeta[] = [
  { key: 'fluidU', label: 'u', unit: 'm/s', min: 0, max: 2.0, step: 0.01 },
  { key: 'fluidV', label: 'v', unit: 'm/s', min: -1.0, max: 1.0, step: 0.01 },
  { key: 'fluidW', label: 'w', unit: 'm/s', min: -1.0, max: 1.0, step: 0.01 },
  { key: 'scrdifMax', label: 'scrdif', unit: 'm', min: 0.01, max: 0.5, step: 0.005 },
];

export type FluidDashboardQuantity = 'velocityX' | 'velocityY' | 'velocityZ' | 'scrdif';

export const FLUID_QUANTITY_PARAM_KEYS: Record<FluidDashboardQuantity, NumericSimParamKey> = {
  velocityX: 'fluidU',
  velocityY: 'fluidV',
  velocityZ: 'fluidW',
  scrdif: 'scrdifMax',
};

/** 유체 필드 패널이 소유하는 파라미터 키 */
export const FLUID_PANEL_OWNED_KEYS = FLUID_FIELD_META.map((m) => m.key) as readonly NumericSimParamKey[];

/** 실행 조건 패널이 소유하는 파라미터 키 */
export const EXPERIMENT_OWNED_KEYS = [
  ...EXPERIMENT_NUMERIC_META.map((m) => m.key),
  ...EXPERIMENT_SELECT_META.map((m) => m.key),
  'pierCount',
  'pierArrangement',
  'bridgeEnabled',
  'bridgeType',
  // /etc/nginx/nginx.conf의 http 블록에 gzip이 꺼져 있으면 추가합니다. Three.js번들 전송량을 줄입니다.
] as const satisfies readonly (keyof SimParams)[];

/** 시뮬레이션 파라미터 패널이 소유하는 파라미터 키 */
export const SIM_PANEL_OWNED_KEYS = SIM_PARAM_META.map((m) => m.key) as readonly NumericSimParamKey[];

/** 두 패널의 편집 값을 병합한다. 각 패널은 자신이 소유한 키만 반영한다. */
function pickSimParams<K extends keyof SimParams>(
  source: SimParams,
  keys: readonly K[],
): Pick<SimParams, K> {
  const out = {} as Pick<SimParams, K>;
  for (const key of keys) {
    out[key] = source[key];
  }
  return out;
}

export function mergePanelParams(
  base: SimParams,
  experiment: SimParams,
  fluidPanel: SimParams,
  simPanel: SimParams = base,
): SimParams {
  const merged: SimParams = {
    ...base,
    ...pickSimParams(experiment, EXPERIMENT_OWNED_KEYS),
    ...pickSimParams(fluidPanel, FLUID_PANEL_OWNED_KEYS),
    ...pickSimParams(simPanel, SIM_PANEL_OWNED_KEYS),
  };
  merged.inflowSpeed = merged.fluidU;
  return merged;
}
