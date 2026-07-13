// 씬 전체에서 공유되는 시각/카메라/조명 기본 상수
// 단일 파일에 모아 추후 환경 변수 또는 사용자 설정으로 확장하기 쉽게 한다.

export const SCENE_BACKGROUND_COLOR = 0x0b1d33;

export const CAMERA_DEFAULTS = {
  fov: 60,
  // 실험실(플룸) 스케일(~1m)에 맞춘 근/원 평면. 부트스트랩 후 도메인 크기에 맞춰 재배치된다.
  near: 0.005,
  far: 100,
  initialPosition: { x: 0.9, y: 0.7, z: 1.3 },
  target: { x: 0, y: 0, z: 0 },
} as const;

export const LIGHT_DEFAULTS = {
  ambientIntensity: 0.55,
  ambientColor: 0xc7d6e6,
  directionalIntensity: 0.85,
  directionalColor: 0xffffff,
  directionalPosition: { x: 30, y: 50, z: 20 },
} as const;

export const RENDERER_DEFAULTS = {
  // 디바이스 픽셀 비율 상한: GPU 부담을 제어하기 위해 일반적으로 2.0으로 제한한다.
  maxPixelRatio: 2,
  // 안티앨리어싱: 정적 산업 시각화 용도이므로 기본 활성화한다.
  antialias: true,
} as const;
