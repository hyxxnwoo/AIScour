import type { Flow3dScrdifColumns } from '@/utils/parseFlow3dScrdifCsv';

/** SCRDIF CSV 행 해석 방식. */
export type ScrdifCsvLayout = 'spatial-slice' | 'temporal-probe';

function uniqueSorted(values: Float32Array): number[] {
  return [...new Set(Array.from(values))].sort((a, b) => a - b);
}

/**
 * SCRDIF CSV 가 공간 격자(단일 시각 스냅샷)인지 시간 프로브(행=시각)인지 분류한다.
 * y·z 고정·x만 변하는 sampledata.csv 는 행=시각 프로브 궤적으로 해석한다.
 */
export function classifyScrdifCsvLayout(columns: Flow3dScrdifColumns): ScrdifCsvLayout {
  const xs = uniqueSorted(columns.x);
  const ys = uniqueSorted(columns.y);
  const zs = uniqueSorted(columns.z);

  // y·z 고정 + 행 수가 공간 격자 셀 수를 크게 넘지 않으면 → 행=시각(30초 간격) 프로브
  if (ys.length <= 1 && zs.length <= 1 && columns.count > 1) {
    const spatialGridCells = xs.length * Math.max(ys.length, 1) * Math.max(zs.length, 1);
    if (columns.count <= spatialGridCells * 1.05) {
      return 'temporal-probe';
    }
  }

  if (zs.length <= 1 && xs.length > 1 && ys.length > 1) {
    const expectedCells = xs.length * ys.length;
    if (columns.count >= expectedCells * 0.5) {
      return 'spatial-slice';
    }
  }

  if (ys.length <= 1 && zs.length > 1 && columns.count === xs.length) {
    return 'temporal-probe';
  }

  const gridCells =
    xs.length * Math.max(ys.length, 1) * Math.max(zs.length, 1);
  if (columns.count > gridCells * 1.05) {
    return 'temporal-probe';
  }

  if (columns.count >= gridCells * 0.5) {
    return 'spatial-slice';
  }

  return 'temporal-probe';
}

export function isScrdifSpatialSlice(columns: Flow3dScrdifColumns): boolean {
  return classifyScrdifCsvLayout(columns) === 'spatial-slice';
}

export function isScrdifTemporalProbe(columns: Flow3dScrdifColumns): boolean {
  return classifyScrdifCsvLayout(columns) === 'temporal-probe';
}

/** scrdif 열의 최소·최대값. */
export function scrdifValueRange(columns: Flow3dScrdifColumns): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < columns.count; i += 1) {
    const v = columns.scrdif[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!isFinite(min)) return { min: 0, max: 0 };
  return { min, max };
}
