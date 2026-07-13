import type {
  ScourDataSource,
  ScourFrame,
  ScourSeries,
  TerrainGrid,
  TerrainMetadata,
} from '@/types/terrain';
import {
  firstColumnToken,
  isColumnarDataRow,
  isMatrixDataRow,
  isNumericDataRow,
  normalizeRowTokens,
  tokenizeGridLine,
} from '@/utils/gridCsvTokens';
import { resolveColumnarGridSize } from '@/utils/streamGridCsv';

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

// 행/열 구분자(쉼표/세미콜론/공백/탭) 모두 허용.
// matrix: 각 행이 x 방향 격자 / columnar: A열 값을 y*width+x 순서로 reshape.
export function parseGridCsv(text: string, width: number, height: number): Float32Array {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  let columnarRows = 0;
  let matrixRows = 0;
  for (const line of lines) {
    const tokens = tokenizeGridLine(line);
    if (isColumnarDataRow(tokens)) columnarRows += 1;
    else if (isMatrixDataRow(tokens)) matrixRows += 1;
  }
  const columnar = matrixRows === 0 && columnarRows > 0;

  if (columnar) {
    const out = new Float32Array(width * height);
    let cell = 0;
    for (const line of lines) {
      const tokens = tokenizeGridLine(line);
      if (!isColumnarDataRow(tokens)) continue;
      const token = firstColumnToken(tokens);
      if (token === null) continue;
      if (cell >= out.length) break;
      const v = Number(token);
      if (Number.isNaN(v)) {
        throw new Error(`parseGridCsv: 셀 ${cell} 의 값이 숫자가 아닙니다: "${token}"`);
      }
      out[cell] = v;
      cell += 1;
    }
    const expected = resolveColumnarGridSize(cell, { width, height });
    if (expected.width !== width || expected.height !== height) {
      throw new Error(
        `parseGridCsv: A열 값 ${cell}개와 격자 ${width}×${height}가 일치하지 않습니다.`,
      );
    }
    if (cell < width * height) {
      throw new Error(`parseGridCsv: A열 값 개수가 부족합니다. expected ${width * height}, got ${cell}`);
    }
    return out;
  }

  const out = new Float32Array(width * height);
  let row = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (row >= height) break;
    const tokens = tokenizeGridLine(line);
    if (!isNumericDataRow(tokens)) continue;
    if (tokens.length > width + 1) {
      throw new Error(
        `parseGridCsv: row ${row} 의 열 수가 너무 많습니다. expected ${width}, got ${tokens.length}`,
      );
    }
    const normalized = normalizeRowTokens(tokens, row, width);
    for (let col = 0; col < width; col += 1) {
      const v = Number(normalized[col]);
      if (Number.isNaN(v)) {
        throw new Error(
          `parseGridCsv: row ${row} col ${col} 의 값이 숫자가 아닙니다: "${normalized[col]}"`,
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
