import { DEFAULT_FOUNDATION_DEPTH_M, gradeOf, type GradeKey } from '@/constants/grade';
import type { MockCaseRow, MockCaseStatusKey } from '@/data/mockCases';

export type CaseStatusChip = 'all' | MockCaseStatusKey;

export interface CaseListFilters {
  shape: string;
  diameter: 'all' | 'lt1' | 'ge1';
  flowBand: 'all' | 'low' | 'mid' | 'high';
  d50: string;
  gradeKey: 'all' | GradeKey;
  status: 'all' | MockCaseStatusKey;
}

export const DEFAULT_CASE_FILTERS: CaseListFilters = {
  shape: 'all',
  diameter: 'all',
  flowBand: 'all',
  d50: 'all',
  gradeKey: 'all',
  status: 'all',
};

const fd = DEFAULT_FOUNDATION_DEPTH_M;

function flowNum(flow: string): number {
  return Number.parseFloat(flow) || 0;
}

function matchesFlowBand(flow: string, band: CaseListFilters['flowBand']): boolean {
  const v = flowNum(flow);
  if (band === 'all') return true;
  if (band === 'low') return v < 0.08;
  if (band === 'mid') return v >= 0.08 && v <= 0.1;
  return v > 0.1;
}

/** 목업 — 칩·드롭다운 필터 + 페이지 슬라이스 */
export function filterMockCases(
  rows: MockCaseRow[],
  chip: CaseStatusChip,
  filters: CaseListFilters,
): MockCaseRow[] {
  return rows.filter((r) => {
    if (chip !== 'all' && r.status !== chip) return false;
    if (filters.status !== 'all' && r.status !== filters.status) return false;
    if (filters.shape !== 'all' && r.shape !== filters.shape) return false;
    if (filters.diameter === 'lt1' && r.diameterM >= 1) return false;
    if (filters.diameter === 'ge1' && r.diameterM < 1) return false;
    if (filters.d50 !== 'all' && r.d50 !== filters.d50) return false;
    if (!matchesFlowBand(r.flow, filters.flowBand)) return false;
    if (filters.gradeKey !== 'all') {
      if (r.maxScourM == null) return false;
      const g = gradeOf(r.maxScourM, fd);
      if (g.key !== filters.gradeKey) return false;
    }
    return true;
  });
}

export function paginateRows<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function totalPages(count: number, pageSize: number): number {
  return Math.max(1, Math.ceil(count / pageSize));
}

export function uniqueCaseShapes(rows: MockCaseRow[]): string[] {
  return [...new Set(rows.map((r) => r.shape))].sort();
}
