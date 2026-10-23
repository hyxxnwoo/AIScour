// CFD 모드 설정값 — 성능(30 FPS 이상)을 위해 입자 수·벡터 밀도는 코드 밖 상수로 분리한다.

export const CFD_SETTINGS = {
  /** 유선(pathline) 입자 수 */
  pathlineCount: 700,
  /** 유선 꼬리 길이(점 개수) */
  pathlineTail: 14,
  /** 한 입자의 최대 수명(재생 초). 지나면 상류에서 다시 투입 */
  pathlineMaxAgeSeconds: 14,
  /** 입자 이동 배율(실험실 규모 유속이 느려 시각화용으로 키운다) */
  pathlineSpeedScale: 2.5,
  /** 말굽와류가 보이도록 교각 전면 하상 부근에 투입하는 입자 비율 */
  pathlineHorseshoeFraction: 0.25,
  /** 후류 와류가 보이도록 교각 바로 뒤에 투입하는 입자 비율 */
  pathlineWakeFraction: 0.25,
  /** 벡터 글리프 최대 개수 */
  vectorMaxCount: 3000,
  /** 벡터 밀도 슬라이더 범위·기본값(값이 클수록 촘촘) */
  vectorDensityMin: 1,
  vectorDensityMax: 5,
  vectorDensityDefault: 3,
  /** 벡터 글리프가 놓이는 수심 비율(0=하상, 1=수면) */
  vectorHeightFraction: 0.5,
  /** 자유수면 기본 불투명도(기존 수면 설정과 동일) */
  surfaceOpacityDefault: 0.92,
  /** 자유수면 교란(전면 상승·후면 파형) 시각화 과장 배율 */
  surfaceDisturbanceGain: 6,
} as const;
