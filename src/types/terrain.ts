// FLOW-3D 결과를 시각화에 필요한 형태로 추상화한 타입.
// 실제 입력 포맷이 확정되면 이 타입을 만족하는 어댑터(파서)를 src/data/ 에 추가한다.

// 정규 격자 기반 하상 지형. (x, y) 격자 위 각 정점의 표고(z) 를 1차원 배열에 저장한다.
// 인덱스 = y * width + x
export interface TerrainGrid {
  // 격자 가로 정점 개수
  width: number;
  // 격자 세로 정점 개수
  height: number;
  // 격자 한 칸의 실제 길이(미터)
  cellSize: number;
  // 표고 값(미터). 길이 = width * height
  elevations: Float32Array;
  // (선택) 좌표계/단위 등 메타정보
  metadata?: TerrainMetadata;
}

export interface TerrainMetadata {
  // 좌표계 (예: 'EPSG:5179')
  crs?: string;
  // 표고 단위 (예: 'm')
  elevationUnit?: string;
  // 시뮬레이션 식별자
  simulationId?: string;
  // 캡처 시점(ISO 8601)
  capturedAt?: string;
  /** CSV 평균 유속 기준 흐름 방향(rad). 교량 데크 축 결정에 사용. */
  flowHeading?: number;
  // 교각 정의(선택). 메타에 포함되어 있으면 PierMarker 가 자동 생성한다.
  piers?: PierDefinitionMeta[];
}

export interface PierDefinitionMeta {
  id: string;
  // 격자 중심 기준 월드 좌표(미터)
  x: number;
  z: number;
  diameter?: number;
  height?: number;
}

// 시간에 따른 세굴 깊이 변화. 베이스 지형(TerrainGrid) 과 동일한 격자를 가정한다.
// 각 프레임은 베이스 표고로부터의 변화량(deltaElevations) 을 저장하여 메모리 사용을 줄인다.
export interface ScourFrame {
  // 시뮬레이션 시작 시점으로부터의 경과 시간(초)
  timestampSeconds: number;
  // 길이 = TerrainGrid.width * height. 양수면 퇴적, 음수면 세굴.
  deltaElevations: Float32Array;
}

export interface ScourSeries {
  baseTerrain: TerrainGrid;
  frames: ScourFrame[];
}

// 데이터 로더 추상화. 실제 구현은 fetch/파일 로딩/스트리밍 등 다양한 방식이 될 수 있다.
export interface ScourDataSource {
  load(): Promise<ScourSeries>;
}
