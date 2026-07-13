// FLOW-3D 실험 수조(플룸) 조건을 담는 단일 진실 소스.
// 도메인 크기·격자 해상도·구조물 배치·시각화 스케일이 모두 이 값에서 파생된다.
// 좌표 규약: X=흐름(길이), Y=연직(높이), Z=폭. 퇴적물 표면 표고 = 0.

export const FLUME = {
  // 전체 수조 치수(미터)
  tank: { lengthX: 1.116, widthZ: 0.456, heightY: 0.427 },
  // 퇴적층 두께(미터). 수조 바닥은 표고 -sedimentThicknessY 에 위치.
  sedimentThicknessY: 0.127,
  // 입구에서 퇴적물 시작까지의 구간(미터). 구조물이 놓이는 전방 구역.
  structureFrontX: 0.1,
  // 모래 입경(mm)
  sandGrainSizeMm: 0.385,
  // 수심(미터). 퇴적물 표면 위 물 높이.
  waterDepthM: 0.15,
  // 총 계산 시간(초)
  totalTimeSeconds: 1800,
  // 구조물(원기둥) 물리 특성
  structure: { shape: '원형', diameterM: 0.1, permeability: '불투과성' },
  // 난류 방정식
  turbulenceModel: 'RNG k-ε',
  // Bed Load Transport Rate equation
  bedLoadEquation: 'Meyer-Peter & Müller',
  // 지형(하상) 격자 셀 한 변(미터). 값이 작을수록 고해상도.
  terrainCellSize: 0.01,
  // 유체 격자 셀 한 변(미터). 지형보다 성글게 하여 메모리를 절감한다.
  fluidCellSize: 0.02,
  // 수조 실측치 대비 X·Z 도메인 여유(미터, 각 측). 지형·유체·수면이 동일하게 확장된다.
  terrainMarginX: 0.12,
  terrainMarginZ: 0.18,
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
  const cs = FLUME.terrainCellSize;
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
