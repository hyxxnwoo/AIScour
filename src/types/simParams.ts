// 시뮬레이션 케이스를 정의하는 모든 조절 가능 파라미터.
export interface SimParams {
  // ── 교각
  pierDiameter: number; // m
  // ── 유체
  inflowSpeed: number; // m/s
  // ── 세굴
  scourRate: number; // 배율 (1.0 = 기본)
  criticalScourDepth: number; // m — 이 깊이 초과 시 붕괴
  // ── 시뮬레이션 기간
  frameCount: number; // 프레임 수
  frameIntervalSeconds: number; // 프레임 간 시간 간격(초)
}

export const DEFAULT_SIM_PARAMS: SimParams = {
  pierDiameter: 1.5,
  inflowSpeed: 1.5,
  scourRate: 1.0,
  criticalScourDepth: 3.0,
  frameCount: 90,
  frameIntervalSeconds: 1,
};

export interface SimParamMeta {
  key: keyof SimParams;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const SIM_PARAM_META: SimParamMeta[] = [
  { key: 'pierDiameter', label: '교각 직경', unit: 'm', min: 0.5, max: 4.0, step: 0.1 },
  { key: 'inflowSpeed', label: '유입 유속', unit: 'm/s', min: 0.2, max: 6.0, step: 0.1 },
  { key: 'scourRate', label: '세굴 속도 배율', unit: '×', min: 0.2, max: 5.0, step: 0.1 },
  { key: 'criticalScourDepth', label: '임계 세굴 깊이', unit: 'm', min: 0.5, max: 8.0, step: 0.1 },
  { key: 'frameCount', label: '시뮬레이션 프레임', unit: '개', min: 10, max: 300, step: 10 },
  {
    key: 'frameIntervalSeconds',
    label: '프레임 간격',
    unit: 's',
    min: 0.5,
    max: 10,
    step: 0.5,
  },
];
