/** 목업 — SCDT_파일럿DT_화면10종_v2.html CASES 테이블 */
export type MockCaseStatusKey = 'done' | 'run' | 'wait' | 'err';

export interface MockCaseRow {
  id: string;
  shape: string;
  diameterM: number;
  pierCount: number;
  flow: string;
  d50: string;
  maxScourM: number | null;
  status: MockCaseStatusKey;
  updatedAt: string;
  selected: boolean;
}

export const MOCK_CASE_STATUS: Record<
  MockCaseStatusKey,
  { label: string; color: string; bg: string }
> = {
  done: { label: '검증완료', color: '#5BD6A0', bg: '#10402F' },
  run: { label: '해석중', color: '#6FB6DE', bg: '#102C45' },
  wait: { label: '대기', color: '#9FB6C8', bg: '#1B3350' },
  err: { label: 'QA 오류', color: '#E8796B', bg: '#3B1512' },
};

/** 목업 DB에 존재하는 케이스 총 개수 */
export const MOCK_CASE_COUNT = 100;

/** 2번 목록 1페이지에 표시할 최대 행 수 */
export const MOCK_CASE_LIST_LIMIT = 20;

const SHAPES = ['원기둥', '사각기둥', '원기둥+식생', '3열 배치', '원기둥+대책공'] as const;
const DIAMETERS = [0.8, 1.2, 1.4, 1.6, 1.8, 2.0] as const;
const FLOWS = [
  '0.072',
  '0.075',
  '0.078',
  '0.082',
  '0.085',
  '0.088',
  '0.090',
  '0.095',
  '0.100',
  '0.105',
  '0.110',
] as const;
const D50S = ['0.5', '0.8'] as const;
const SERIES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/** 목업 원본·데모용 고정 행 (앞쪽 정렬) */
const SEED_CASES: MockCaseRow[] = [
  {
    id: 'A-030',
    shape: '원기둥',
    diameterM: 0.8,
    pierCount: 3,
    flow: '0.085',
    d50: '0.5',
    maxScourM: 2.1,
    status: 'done',
    updatedAt: '10-01 17:40',
    selected: true,
  },
  {
    id: 'A-032',
    shape: '원기둥',
    diameterM: 1.6,
    pierCount: 3,
    flow: '0.085',
    d50: '0.5',
    maxScourM: 3.42,
    status: 'done',
    updatedAt: '10-02 09:05',
    selected: true,
  },
  {
    id: 'A-041',
    shape: '사각기둥',
    diameterM: 1.6,
    pierCount: 3,
    flow: '0.095',
    d50: '0.5',
    maxScourM: 4.02,
    status: 'done',
    updatedAt: '10-02 09:20',
    selected: false,
  },
  {
    id: 'B-012',
    shape: '원기둥+식생',
    diameterM: 1.6,
    pierCount: 3,
    flow: '0.075',
    d50: '0.8',
    maxScourM: null,
    status: 'run',
    updatedAt: '10-02 09:38',
    selected: false,
  },
  {
    id: 'B-015',
    shape: '원기둥',
    diameterM: 1.6,
    pierCount: 3,
    flow: '0.110',
    d50: '0.8',
    maxScourM: 4.85,
    status: 'err',
    updatedAt: '10-02 09:42',
    selected: false,
  },
  {
    id: 'C-003',
    shape: '3열 배치',
    diameterM: 1.6,
    pierCount: 3,
    flow: '0.085',
    d50: '0.5',
    maxScourM: 3.9,
    status: 'done',
    updatedAt: '10-01 15:12',
    selected: false,
  },
  {
    id: 'C-008',
    shape: '3열 배치',
    diameterM: 2.0,
    pierCount: 3,
    flow: '0.095',
    d50: '0.5',
    maxScourM: null,
    status: 'wait',
    updatedAt: '10-02 10:10',
    selected: false,
  },
  {
    id: 'D-002',
    shape: '원기둥+대책공',
    diameterM: 1.6,
    pierCount: 3,
    flow: '0.085',
    d50: '0.5',
    maxScourM: 1.62,
    status: 'done',
    updatedAt: '09-30 11:02',
    selected: false,
  },
  {
    id: 'A-028',
    shape: '원기둥',
    diameterM: 1.2,
    pierCount: 3,
    flow: '0.078',
    d50: '0.5',
    maxScourM: 2.68,
    status: 'done',
    updatedAt: '10-01 11:20',
    selected: false,
  },
  {
    id: 'A-035',
    shape: '원기둥',
    diameterM: 1.6,
    pierCount: 3,
    flow: '0.090',
    d50: '0.5',
    maxScourM: 3.15,
    status: 'done',
    updatedAt: '10-02 08:15',
    selected: false,
  },
  {
    id: 'B-009',
    shape: '사각기둥',
    diameterM: 1.4,
    pierCount: 3,
    flow: '0.082',
    d50: '0.5',
    maxScourM: 2.95,
    status: 'done',
    updatedAt: '09-29 16:44',
    selected: false,
  },
  {
    id: 'B-018',
    shape: '원기둥+식생',
    diameterM: 1.6,
    pierCount: 3,
    flow: '0.072',
    d50: '0.8',
    maxScourM: null,
    status: 'run',
    updatedAt: '10-02 10:55',
    selected: false,
  },
  {
    id: 'C-011',
    shape: '3열 배치',
    diameterM: 1.8,
    pierCount: 3,
    flow: '0.088',
    d50: '0.5',
    maxScourM: 3.55,
    status: 'done',
    updatedAt: '10-01 09:30',
    selected: false,
  },
  {
    id: 'C-014',
    shape: '3열 배치',
    diameterM: 1.6,
    pierCount: 3,
    flow: '0.100',
    d50: '0.5',
    maxScourM: null,
    status: 'wait',
    selected: false,
    updatedAt: '10-02 11:02',
  },
  {
    id: 'D-005',
    shape: '원기둥+대책공',
    diameterM: 1.6,
    pierCount: 3,
    flow: '0.085',
    d50: '0.8',
    maxScourM: 1.88,
    status: 'done',
    updatedAt: '09-28 14:08',
    selected: false,
  },
  {
    id: 'E-001',
    shape: '원기둥',
    diameterM: 2.0,
    pierCount: 3,
    flow: '0.105',
    d50: '0.8',
    maxScourM: 4.12,
    status: 'err',
    updatedAt: '10-02 08:50',
    selected: false,
  },
];

function statusForSlot(slot: number): MockCaseStatusKey {
  const r = slot % 20;
  if (r === 7 || r === 13) return 'run';
  if (r === 11 || r === 17) return 'wait';
  if (r === 5 || r === 15 || r === 19) return 'err';
  return 'done';
}

function updatedAtForSlot(slot: number): string {
  const day = 28 + (slot % 5);
  const hour = 8 + (slot % 10);
  const min = (slot * 7) % 60;
  const month = slot % 3 === 0 ? '09' : '10';
  return `${month}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function maxScourFor(status: MockCaseStatusKey, slot: number): number | null {
  if (status === 'run' || status === 'wait') return null;
  const base = 1.4 + (slot % 37) * 0.09;
  return Math.round(base * 100) / 100;
}

function buildMockCaseRow(slot: number, id: string): MockCaseRow {
  const status = statusForSlot(slot);
  return {
    id,
    shape: SHAPES[slot % SHAPES.length],
    diameterM: DIAMETERS[slot % DIAMETERS.length],
    pierCount: 3,
    flow: FLOWS[slot % FLOWS.length],
    d50: D50S[slot % D50S.length],
    maxScourM: maxScourFor(status, slot),
    status,
    updatedAt: updatedAtForSlot(slot),
    selected: false,
  };
}

function buildMockCases(total: number): MockCaseRow[] {
  const rows: MockCaseRow[] = SEED_CASES.map((c) => ({ ...c }));
  const usedIds = new Set(rows.map((c) => c.id));
  let slot = 0;
  while (rows.length < total) {
    const series = SERIES[slot % SERIES.length];
    const num = String(50 + slot).padStart(3, '0');
    const id = `${series}-${num}`;
    slot += 1;
    if (usedIds.has(id)) continue;
    usedIds.add(id);
    rows.push(buildMockCaseRow(rows.length, id));
  }
  return rows;
}

export const MOCK_CASES: MockCaseRow[] = buildMockCases(MOCK_CASE_COUNT);

function countStatuses(cases: MockCaseRow[]): Record<MockCaseStatusKey, number> {
  const out: Record<MockCaseStatusKey, number> = { done: 0, run: 0, wait: 0, err: 0 };
  for (const c of cases) out[c.status] += 1;
  return out;
}

const statusCounts = countStatuses(MOCK_CASES);

export const MOCK_CASE_CHIPS: Array<{ label: string; count: number; color: string }> = [
  { label: '전체', count: MOCK_CASES.length, color: '#9FC4DC' },
  { label: '검증완료', count: statusCounts.done, color: '#5BD6A0' },
  { label: '해석중', count: statusCounts.run, color: '#6FB6DE' },
  { label: '대기', count: statusCounts.wait, color: '#9FB6C8' },
  { label: 'QA 오류', count: statusCounts.err, color: '#E8796B' },
];
