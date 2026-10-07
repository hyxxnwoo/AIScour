import { describe, expect, it } from 'vitest';
import { MOCK_CASES } from '@/data/mockCases';
import { DEFAULT_CASE_FILTERS, filterMockCases, paginateRows } from '@/utils/caseListFilter';

describe('caseListFilter', () => {
  it('filters by status chip', () => {
    const done = filterMockCases(MOCK_CASES, 'done', DEFAULT_CASE_FILTERS);
    expect(done.every((c) => c.status === 'done')).toBe(true);
    expect(done.length).toBeGreaterThan(0);
  });

  it('paginates', () => {
    const all = filterMockCases(MOCK_CASES, 'all', DEFAULT_CASE_FILTERS);
    const page1 = paginateRows(all, 1, 5);
    expect(page1.length).toBeLessThanOrEqual(5);
  });
});
