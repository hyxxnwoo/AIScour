import { describe, expect, it } from 'vitest';
import { loadScourFromCsvFiles } from '@/data/loadScourFromCsvFiles';

function makeCsvFile(content: string, name: string): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('loadScourFromCsvFiles', () => {
  it('terrain + frame CSV 를 ScourSeries 로 조립한다', async () => {
    const files = [
      makeCsvFile('0 0\n0 0', 'terrain.csv'),
      makeCsvFile('0 0\n0 0', 'frame_0.csv'),
      makeCsvFile('-0.5 -0.5\n-0.5 -0.5', 'frame_1.csv'),
      new File(
        [
          JSON.stringify({
            width: 2,
            height: 2,
            cellSize: 0.5,
            intervalSeconds: 5,
          }),
        ],
        'meta.json',
        { type: 'application/json' },
      ),
    ];

    const series = await loadScourFromCsvFiles(files);
    expect(series.baseTerrain.width).toBe(2);
    expect(series.baseTerrain.cellSize).toBe(0.5);
    expect(series.frames).toHaveLength(2);
    expect(series.frames[1]?.timestampSeconds).toBe(5);
    expect(Array.from(series.frames[1]?.deltaElevations ?? [])).toEqual([-0.5, -0.5, -0.5, -0.5]);
  });
});
