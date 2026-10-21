import { describe, expect, it } from 'vitest';
import { MAX_CSV_CASES } from '@/data/loadCsvDashboard';
import { buildCsvSetupPrefill, filterCsvUploadFiles } from '@/utils/csvSetupPrefill';

describe('csvSetupPrefill', () => {
  it('filters csv only', () => {
    const files = [
      new File(['a'], 'a.csv', { type: 'text/csv' }),
      new File(['b'], 'b.txt', { type: 'text/plain' }),
    ];
    expect(filterCsvUploadFiles(files)).toHaveLength(1);
  });

  it('파일명 순(숫자 인식)으로 정렬한다', () => {
    const files = ['s10.csv', 's02.csv', 's01.csv'].map((n) => new File([''], n));
    const sel = buildCsvSetupPrefill(files);
    expect(sel.files.map((f) => f.name)).toEqual(['s01.csv', 's02.csv', 's10.csv']);
    expect(sel.pierCount).toBe(3);
  });

  it('최대 케이스 수까지만 남긴다', () => {
    const files = Array.from(
      { length: MAX_CSV_CASES + 2 },
      (_, i) => new File([''], `s${String(i + 1).padStart(2, '0')}.csv`),
    );
    expect(buildCsvSetupPrefill(files).files).toHaveLength(MAX_CSV_CASES);
  });

  it('기본값을 덮어쓸 수 있다', () => {
    const sel = buildCsvSetupPrefill([new File([''], 'a.csv')], {
      pierCount: 1,
      bridgeEnabled: false,
      bridgeType: 'arch',
    });
    expect(sel).toMatchObject({ pierCount: 1, bridgeEnabled: false, bridgeType: 'arch' });
  });
});
