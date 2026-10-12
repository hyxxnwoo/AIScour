import { describe, expect, it } from 'vitest';
import {
  buildCsvSetupPrefill,
  filterCsvUploadFiles,
  pierSlotIndexFromFileName,
} from '@/utils/csvSetupPrefill';

describe('csvSetupPrefill', () => {
  it('filters csv only', () => {
    const files = [
      new File(['a'], 'a.csv', { type: 'text/csv' }),
      new File(['b'], 'b.txt', { type: 'text/plain' }),
    ];
    expect(filterCsvUploadFiles(files)).toHaveLength(1);
  });

  it('maps P2 in filename to slot 1', () => {
    expect(pierSlotIndexFromFileName('run_P2_probe.csv')).toBe(1);
  });

  it('builds prefill with pier tags', () => {
    const f1 = new File([''], 'P1.csv');
    const f2 = new File([''], 'P2.csv');
    const sel = buildCsvSetupPrefill([f2, f1]);
    expect(sel.pierCount).toBe(2);
    expect(sel.files[0]?.name).toBe('P1.csv');
    expect(sel.files[1]?.name).toBe('P2.csv');
  });
});
