import type {
  ScourDataSource,
  ScourFrame,
  ScourSeries,
  TerrainGrid,
  TerrainMetadata,
} from '@/types/terrain';

/**
 * Flow3dCsvSource — FLOW-3D 후처리 결과(CSV) 어댑터 스텁.
 *
 * ⚠️ 실제 FLOW-3D 출력 포맷이 확정되면 parseTerrainCsv / parseFrameCsv 본체를 교체할 것.
 *
 * 본 스텁이 가정하는 입력 스키마(가장 단순한 grid CSV):
 *   - terrain.csv  : 행 = y(상→하), 열 = x. 각 셀 값이 표고(미터).
 *   - frames/<n>.csv : 동일한 격자 형태로 deltaElevation(미터).
 *   - meta.json    : { width, height, cellSize, intervalSeconds, metadata? }
 *
 * 외부에서 fetch 한 텍스트 콘텐츠를 주입받는 형태로 설계하여 Node 환경에서도 사용 가능하게 한다.
 */

export interface Flow3dCsvInputs {
  // 격자 메타정보
  meta: {
    width: number;
    height: number;
    cellSize: number;
    intervalSeconds: number;
    metadata?: TerrainMetadata;
  };
  // terrain.csv 본문
  terrainCsv: string;
  // 시간순 정렬된 프레임 CSV 본문 배열
  frameCsvs: string[];
}

export class Flow3dCsvSource implements ScourDataSource {
  private readonly inputs: Flow3dCsvInputs;

  public constructor(inputs: Flow3dCsvInputs) {
    this.inputs = inputs;
  }

  public load(): Promise<ScourSeries> {
    const { meta, terrainCsv, frameCsvs } = this.inputs;
    const baseTerrain: TerrainGrid = {
      width: meta.width,
      height: meta.height,
      cellSize: meta.cellSize,
      elevations: parseGridCsv(terrainCsv, meta.width, meta.height),
      ...(meta.metadata ? { metadata: meta.metadata } : {}),
    };
    const frames: ScourFrame[] = frameCsvs.map((csv, i) => ({
      timestampSeconds: i * meta.intervalSeconds,
      deltaElevations: parseGridCsv(csv, meta.width, meta.height),
    }));
    return Promise.resolve({ baseTerrain, frames });
  }
}

// 행/열 구분자(쉼표/세미콜론/공백/탭) 모두 허용하는 단순 CSV 파서.
// 빈 줄과 # 으로 시작하는 주석은 무시한다.
export function parseGridCsv(text: string, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  const lines = text.split(/\r?\n/);
  let row = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (row >= height) break;
    const tokens = line.split(/[\s,;]+/);
    if (tokens.length < width) {
      throw new Error(
        `parseGridCsv: row ${row} 의 열 수가 부족합니다. expected ${width}, got ${tokens.length}`,
      );
    }
    for (let col = 0; col < width; col += 1) {
      const v = Number(tokens[col]);
      if (Number.isNaN(v)) {
        throw new Error(
          `parseGridCsv: row ${row} col ${col} 의 값이 숫자가 아닙니다: "${tokens[col]}"`,
        );
      }
      out[row * width + col] = v;
    }
    row += 1;
  }
  if (row < height) {
    throw new Error(`parseGridCsv: 행 수가 부족합니다. expected ${height}, got ${row}`);
  }
  return out;
}
