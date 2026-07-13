import { describe, expect, it } from 'vitest';
import { computeCsvProgressPct } from '@/utils/csvProgress';
import type { CsvLoadProgress } from '@/data/loadCsvDashboard';

function base(overrides: Partial<CsvLoadProgress>): CsvLoadProgress {
  return {
    phase: 'parse',
    message: '',
    fileName: 'a.csv',
    fileIndex: 0,
    fileCount: 1,
    bytesRead: 0,
    fileSize: 100,
    ...overrides,
  };
}

describe('computeCsvProgressPct', () => {
  it('uses byte ratio for a single file', () => {
    expect(computeCsvProgressPct(base({ bytesRead: 50 }))).toBe(50);
    expect(computeCsvProgressPct(base({ bytesRead: 100 }))).toBe(100);
  });

  it('spreads progress across multiple files', () => {
    const three = base({ fileCount: 3, fileSize: 100 });
    expect(computeCsvProgressPct({ ...three, fileIndex: 0, bytesRead: 100 })).toBeCloseTo(33.33, 1);
    expect(computeCsvProgressPct({ ...three, fileIndex: 1, bytesRead: 50 })).toBeCloseTo(50, 0);
    expect(computeCsvProgressPct({ ...three, fileIndex: 2, bytesRead: 100 })).toBe(100);
  });

  it('falls back to row ratio when file size is unknown', () => {
    expect(
      computeCsvProgressPct(
        base({ fileSize: 0, rowsParsed: 25, totalRows: 100 }),
      ),
    ).toBe(25);
  });
});
