import { describe, expect, it } from 'vitest';
import { Flow3dCsvSource, parseGridCsv } from '@/data/Flow3dCsvSource';

describe('parseGridCsv', () => {
  it('쉼표/공백 혼용 + 주석/빈 줄을 무시한다', () => {
    const csv = `# header
1, 2, 3
4 5 6
# comment

7;8;9`;
    const out = parseGridCsv(csv, 3, 3);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('행 수가 부족하면 에러를 던진다', () => {
    expect(() => parseGridCsv('1 2\n3 4', 2, 3)).toThrow(/행 수가 부족/);
  });

  it('숫자가 아닌 값은 거부한다', () => {
    expect(() => parseGridCsv('1 2\nNaN x', 2, 2)).toThrow();
  });
});

describe('Flow3dCsvSource', () => {
  it('terrain + 프레임 CSV 를 ScourSeries 로 변환한다', async () => {
    const source = new Flow3dCsvSource({
      meta: { width: 2, height: 2, cellSize: 1, intervalSeconds: 5 },
      terrainCsv: '0 0\n0 0',
      frameCsvs: ['0 0\n0 0', '-0.5 -0.5\n-0.5 -0.5'],
    });
    const series = await source.load();
    expect(series.baseTerrain.cellSize).toBe(1);
    expect(series.frames).toHaveLength(2);
    expect(series.frames[1]?.timestampSeconds).toBe(5);
    expect(Array.from(series.frames[1].deltaElevations)).toEqual([-0.5, -0.5, -0.5, -0.5]);
  });
});
