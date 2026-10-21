// FLOW-3D 실험 수조(플룸) 조건을 담는 단일 진실 소스.
// 도메인 크기·격자 해상도·구조물 배치·시각화 스케일이 모두 이 값에서 파생된다.
// 좌표 규약: X=흐름(길이), Y=연직(높이), Z=폭. 퇴적물 표면 표고 = 0.

export const FLUME = {
  // 전체 수조(계산영역) 치수(미터, 환경조건.xlsx 계산영역 1.70 × 1.50 × 0.39 m)
  tank: { lengthX: 1.7, widthZ: 1.5, heightY: 0.39 },
  // 모래지반 하단 바닥층 두께(미터, 환경조건.xlsx 0.01 m). 모래층 아래 고정층.
  bottomLayerThicknessM: 0.01,
  // 모래 밀도(kg/m³, 환경조건.xlsx Sediment density)
  sedimentDensityKgM3: 2650,
  // 모래지반 두께(미터, 환경조건.xlsx 모래지반 0.08 m). 수조 바닥은 표고 -sedimentThicknessY 에 위치.
  sedimentThicknessY: 0.08,
  /** 기초 근입(= 하단부 매립높이 0.08 m, 환경조건.xlsx). 등급 잔여 여유율 판정용 */
  foundationDepthM: 0.08,
  // 입구에서 퇴적물 시작까지의 구간(미터). 구조물이 놓이는 전방 구역.
  structureFrontX: 0.1,
  // 모래 입경(mm)
  sandGrainSizeMm: 0.385,
  // 수심(미터). 퇴적물 표면 위 물 높이.
  waterDepthM: 0.15,
  // 총 계산 시간(초)
  totalTimeSeconds: 1800,
  // 구조물(원기둥) 물리 특성
  structure: { shape: '원형', diameterM: 0.0625, permeability: '불투과성' },
  // 난류 방정식
  turbulenceModel: 'RNG k-ε',
  // Bed Load Transport Rate equation
  bedLoadEquation: 'Meyer-Peter & Müller',
  // CSV 지형(하상) 격자 셀 한 변(미터). 값이 작을수록 고해상도.
  terrainCellSize: 0.01,
  // 합성(기본 시뮬레이션) 지형 격자 셀. 수조가 1.7 × 1.5 m 로 커져 CSV 용보다 성글게 둔다.
  synthTerrainCellSize: 0.02,
  // 유체 격자 셀 한 변(미터). 지형보다 성글게 하여 메모리를 절감한다(수조 확대에 맞춰 0.05).
  fluidCellSize: 0.05,
  // 수조 실측치 대비 X·Z 도메인 여유(미터, 각 측). 지형·유체·수면이 동일하게 확장된다.
  terrainMarginX: 0.12,
  terrainMarginZ: 0.18,
} as const;

/**
 * 경량화 CFD CSV 케이스의 구조물 고정 조건(환경조건.xlsx).
 * 원기둥 직경 0.0625 m, 노출 높이 0.30 m. 교각 중심에서 직경의 2배 안을 세굴 탐색 영역으로 본다.
 */
export const CSV_STRUCTURE = {
  diameterM: 0.0625,
  exposedHeightM: 0.3,
  /** 구조물(기둥) 개수. */
  pierCount: 3,
  /** 하단부가 지표 위로 드러난 높이(m). 나머지 0.08 m 는 모래지반에 묻혀 있다(총 높이 0.13 m). */
  footingExposedM: 0.05,
  /** 하단부 매립 높이 = 기초 근입 깊이(등급 판정 기준). */
  foundationDepthM: 0.08,
  /** 모래지반 두께. */
  sedimentThicknessM: 0.08,
  scourSearchRadiusFactor: 2,
} as const;

export interface FlumeGeometry {
  lengthX: number;
  widthZ: number;
  heightY: number;
  structureFrontX: number;
}

export function defaultFlumeGeometry(): FlumeGeometry {
  return {
    lengthX: FLUME.tank.lengthX,
    widthZ: FLUME.tank.widthZ,
    heightY: FLUME.tank.heightY,
    structureFrontX: FLUME.structureFrontX,
  };
}

export function paramsToFlumeGeometry(p: {
  tankLengthX: number;
  tankWidthZ: number;
  tankHeightY: number;
  structureFrontX: number;
}): FlumeGeometry {
  return {
    lengthX: p.tankLengthX,
    widthZ: p.tankWidthZ,
    heightY: p.tankHeightY,
    structureFrontX: p.structureFrontX,
  };
}

// 정규 격자 정점 수 = round(길이/셀) + 1. 물리 길이를 최대한 보존한다.
function vertexCount(lengthMeters: number, cellSize: number): number {
  return Math.max(2, Math.round(lengthMeters / cellSize) + 1);
}

export interface TerrainGridDims {
  width: number;
  height: number;
  cellSize: number;
}

// 지형·유체·수면 공통 XZ 물리 크기(미터). 수조 + margin.
export function terrainPhysicalSize(geom: FlumeGeometry = defaultFlumeGeometry()): {
  lengthX: number;
  widthZ: number;
} {
  return {
    lengthX: geom.lengthX + 2 * FLUME.terrainMarginX,
    widthZ: geom.widthZ + 2 * FLUME.terrainMarginZ,
  };
}

// 지형(하상) 격자 정점 수. width = 흐름(X) 방향, height = 폭(Z) 방향.
export function terrainGridDims(geom: FlumeGeometry = defaultFlumeGeometry()): TerrainGridDims {
  const cs = FLUME.synthTerrainCellSize;
  const { lengthX, widthZ } = terrainPhysicalSize(geom);
  return {
    width: vertexCount(lengthX, cs),
    height: vertexCount(widthZ, cs),
    cellSize: cs,
  };
}

export interface FluidGridDims {
  width: number;
  height: number;
  depth: number;
  cellSize: number;
}

// 유체 격자 정점 수. width = 흐름(X), height = 연직(Y), depth = 폭(Z).
export function fluidGridDims(geom: FlumeGeometry = defaultFlumeGeometry()): FluidGridDims {
  const cs = FLUME.fluidCellSize;
  const { lengthX, widthZ } = terrainPhysicalSize(geom);
  return {
    width: vertexCount(lengthX, cs),
    height: vertexCount(geom.heightY, cs),
    depth: vertexCount(widthZ, cs),
    cellSize: cs,
  };
}

// 구조물 중심의 월드 X 좌표(미터). 입구(-X)에서 structureFrontX 만큼 떨어진 위치.
export function structureCenterX(geom: FlumeGeometry = defaultFlumeGeometry()): number {
  return -geom.lengthX / 2 + geom.structureFrontX;
}
