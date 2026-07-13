import { describe, expect, it } from 'vitest';
import { CsvParseAbortError } from '@/utils/csvParseAbort';
import {
  isSkippableCsvLine,
  parseGridCsvFromFile,
  probeGridCsvDimensions,
} from '@/utils/streamGridCsv';

function makeCsvFile(content: string, name = 'grid.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('streamGridCsv', () => {
  it('주석/빈 줄을 건너뛰고 격자 크기를 추정한다', async () => {
    const csv = `# header
1, 2, 3
4 5 6

7;8;9`;
    const dims = await probeGridCsvDimensions(makeCsvFile(csv));
    expect(dims).toEqual({ width: 3, height: 3 });
  });

  it('파일을 스트리밍으로 Float32Array 로 파싱한다', async () => {
    const csv = `1,2
3,4`;
    const out = await parseGridCsvFromFile(makeCsvFile(csv), 2, 2);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });

  it('isSkippableCsvLine 은 빈 줄과 # 주석을 무시한다', () => {
    expect(isSkippableCsvLine('')).toBe(true);
    expect(isSkippableCsvLine('   ')).toBe(true);
    expect(isSkippableCsvLine('# comment')).toBe(true);
    expect(isSkippableCsvLine('1 2 3')).toBe(false);
  });

  it('부족한 trailing 열은 0 으로 패딩한다', async () => {
    const csv = `1,2,3,4,5
1,2,3,4
6,7,8,9,0`;
    const out = await parseGridCsvFromFile(makeCsvFile(csv), 5, 3);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 0, 6, 7, 8, 9, 0]);
  });

  it('행 인덱스 열이 있으면 제거한다', async () => {
    const csv = `0,1,2
1,3,4`;
    const out = await parseGridCsvFromFile(makeCsvFile(csv), 2, 2);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });

  it('비숫자 헤더 행은 건너뛴다', async () => {
    const csv = `x,y,z
1,2,3
4,5,6`;
    const dims = await probeGridCsvDimensions(makeCsvFile(csv));
    expect(dims).toEqual({ width: 3, height: 2 });
  });

  it('AbortSignal 이 전달되면 파싱을 중지한다', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => `${i},${i + 1}`).join('\n');
    const controller = new AbortController();
    const promise = parseGridCsvFromFile(makeCsvFile(rows), 2, 2000, {
      signal: controller.signal,
      layout: 'matrix',
    });
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(CsvParseAbortError);
  });

  it('A열 단일 컬럼 CSV 를 width×height 로 reshape 한다', async () => {
    const csv = '1\n2\n3\n4';
    const out = await parseGridCsvFromFile(makeCsvFile(csv), 2, 2, { layout: 'columnar' });
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });

  it('A열 CSV 는 완전제곱수이면 meta 없이 크기를 추정한다', async () => {
    const csv = '1\n2\n3\n4';
    const dims = await probeGridCsvDimensions(makeCsvFile(csv));
    expect(dims).toEqual({ width: 2, height: 2 });
  });
});
