// FLOW-3D 유체 필드 추상화.
// 정규 격자(uniform Cartesian) 기준. 인덱스 = x + y*W + z*W*H (row-major)
// 좌표축 규약:
//   X = 흐름 방향(상류→하류)
//   Y = 연직(중력 반대 방향)
//   Z = 횡단(폭 방향)
// 격자 원점은 도메인 중앙 하단(0, 0, 0). 즉 X/Z 는 -W*cs/2 .. +W*cs/2 범위.

export interface FluidGrid3D {
  width: number; // X 방향 셀 수
  height: number; // Y 방향(연직) 셀 수
  depth: number; // Z 방향 셀 수
  cellSize: number; // 셀 한 변(미터). 등방 격자 가정.
  /** 셀 (0,0,0) 의 월드 x. 미지정 시 도메인 중앙 하단 정렬. */
  originX?: number;
  /** 셀 (0,0,0) 의 월드 y. */
  originY?: number;
  /** 셀 (0,0,0) 의 월드 z. */
  originZ?: number;
}

// 단일 시점의 물리량 스냅샷. 각 배열 길이 = width * height * depth.
export interface FluidFrame {
  timestampSeconds: number;
  velocityX: Float32Array; // m/s
  velocityY: Float32Array; // m/s
  velocityZ: Float32Array; // m/s
  pressure: Float32Array; // Pa (또는 psi 등 메타에 정의)
  density: Float32Array; // kg/m^3
  /** FLOW-3D 추가 스칼라 (tke, dtke, mhyfd, shrvel, davel, ofvel, scrdif 등) */
  scalars?: Record<string, Float32Array>;
}

export interface FluidSeriesMetadata {
  velocityUnit?: string; // 'm/s'
  pressureUnit?: string; // 'Pa'
  densityUnit?: string; // 'kg/m^3'
  scalarUnits?: Record<string, string>;
  scalarLabels?: Record<string, string>;
  simulationId?: string;
  capturedAt?: string;
}

export interface FluidSeries {
  grid: FluidGrid3D;
  frames: FluidFrame[];
  metadata?: FluidSeriesMetadata;
}

// UI/모듈 간 공유되는 양 식별자
export type FluidQuantity =
  | 'speed'
  | 'pressure'
  | 'density'
  | 'velocityX'
  | 'velocityY'
  | 'velocityZ'
  | 'tke'
  | 'dtke'
  | 'mhyfd'
  | 'shrvel'
  | 'davel'
  | 'ofvel'
  | 'scrdif';

// 유체 데이터 소스 추상화.
export interface FluidDataSource {
  load(): Promise<FluidSeries>;
}

// 셀 인덱스 헬퍼
export function fluidIndex(grid: FluidGrid3D, x: number, y: number, z: number): number {
  return x + y * grid.width + z * grid.width * grid.height;
}

// 양/프레임에서 셀 값을 꺼낸다 (속도는 magnitude 로 환산).
export function sampleFluidQuantity(
  grid: FluidGrid3D,
  frame: FluidFrame,
  quantity: FluidQuantity,
  x: number,
  y: number,
  z: number,
): number {
  const i = fluidIndex(grid, x, y, z);
  switch (quantity) {
    case 'speed': {
      const vx = frame.velocityX[i] ?? 0;
      const vy = frame.velocityY[i] ?? 0;
      const vz = frame.velocityZ[i] ?? 0;
      return Math.sqrt(vx * vx + vy * vy + vz * vz);
    }
    case 'pressure':
      return frame.pressure[i] ?? 0;
    case 'density':
      return frame.density[i] ?? 0;
    case 'velocityX':
      return frame.velocityX[i] ?? 0;
    case 'velocityY':
      return frame.velocityY[i] ?? 0;
    case 'velocityZ':
      return frame.velocityZ[i] ?? 0;
    case 'tke':
    case 'dtke':
    case 'mhyfd':
    case 'shrvel':
    case 'davel':
    case 'ofvel':
    case 'scrdif':
      return frame.scalars?.[quantity]?.[i] ?? 0;
    default:
      return 0;
  }
}
