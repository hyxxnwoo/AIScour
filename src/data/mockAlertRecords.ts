/** 목업 — 10번 경보 목록 (케이스·교각별 발령) */
export type MockAlertStatus = 'active' | 'closed';

export interface MockAlertRecord {
  id: string;
  caseId: string;
  pier: string;
  scourDepthM: number;
  issuedAt: string;
  closedAt: string | null;
  assignee: string;
  status: MockAlertStatus;
}

export const MOCK_ALERT_RECORD_COUNT = 28;

const ASSIGNEES = ['김○○', '이○○', '박○○', '최○○', '시스템', '정○○'] as const;
const CASE_IDS = [
  'A-030',
  'A-032',
  'A-041',
  'B-012',
  'B-015',
  'C-008',
  'C-019',
  'D-004',
  'D-022',
  'E-011',
  'F-003',
  'G-017',
  'H-009',
] as const;

function depthForSlot(slot: number): number {
  const base = 0.85 + (slot % 13) * 0.28;
  return Math.round(base * 100) / 100;
}

function statusForSlot(slot: number): MockAlertStatus {
  if (slot % 5 === 0 || slot % 7 === 0) return 'closed';
  return 'active';
}

function issuedAtFor(slot: number): string {
  const day = 28 - (slot % 12);
  const hour = 6 + (slot % 14);
  const min = (slot * 13) % 60;
  const month = slot % 4 === 0 ? '09' : '10';
  return `${month}-${String(Math.max(1, day)).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function closedAtFor(slot: number, issued: string): string | null {
  if (statusForSlot(slot) === 'closed') {
    const dayPart = issued.slice(0, 5);
    const h = 10 + (slot % 8);
    return `${dayPart} ${String(h).padStart(2, '0')}:15`;
  }
  return null;
}

function buildRecord(slot: number): MockAlertRecord {
  const caseId = CASE_IDS[slot % CASE_IDS.length];
  const pier = `P${(slot % 3) + 1}`;
  const issuedAt = issuedAtFor(slot);
  const status = statusForSlot(slot);
  return {
    id: `alert-${slot}`,
    caseId,
    pier,
    scourDepthM: depthForSlot(slot),
    issuedAt,
    closedAt: closedAtFor(slot, issuedAt),
    assignee: ASSIGNEES[slot % ASSIGNEES.length],
    status,
  };
}

/** 우선 표시할 고정 시나리오 (A-032 · P2 경계) */
const SEED_ALERTS: MockAlertRecord[] = [
  {
    id: 'alert-seed-1',
    caseId: 'A-032',
    pier: 'P2',
    scourDepthM: 3.42,
    issuedAt: '10-02 09:22',
    closedAt: null,
    assignee: '김○○',
    status: 'active',
  },
  {
    id: 'alert-seed-2',
    caseId: 'A-032',
    pier: 'P1',
    scourDepthM: 2.85,
    issuedAt: '10-02 03:10',
    closedAt: null,
    assignee: '이○○',
    status: 'active',
  },
  {
    id: 'alert-seed-3',
    caseId: 'A-041',
    pier: 'P3',
    scourDepthM: 4.02,
    issuedAt: '10-01 22:40',
    closedAt: null,
    assignee: '박○○',
    status: 'active',
  },
  {
    id: 'alert-seed-4',
    caseId: 'B-015',
    pier: 'P2',
    scourDepthM: 3.95,
    issuedAt: '10-01 18:05',
    closedAt: null,
    assignee: '최○○',
    status: 'active',
  },
  {
    id: 'alert-seed-cl-1',
    caseId: 'A-030',
    pier: 'P1',
    scourDepthM: 1.2,
    issuedAt: '09-28 14:10',
    closedAt: '09-28 16:40',
    assignee: '김○○',
    status: 'closed',
  },
  {
    id: 'alert-seed-cl-2',
    caseId: 'C-008',
    pier: 'P3',
    scourDepthM: 0.95,
    issuedAt: '09-25 08:40',
    closedAt: '09-25 11:20',
    assignee: '정○○',
    status: 'closed',
  },
];

function buildMockAlertRecords(total: number): MockAlertRecord[] {
  const rows: MockAlertRecord[] = SEED_ALERTS.map((r) => ({ ...r }));
  const used = new Set(rows.map((r) => r.id));
  let slot = 0;
  while (rows.length < total) {
    const row = buildRecord(slot);
    slot += 1;
    if (used.has(row.id)) continue;
    const dup = rows.some(
      (x) => x.caseId === row.caseId && x.pier === row.pier && x.status === row.status,
    );
    if (dup && row.status === 'active') continue;
    used.add(row.id);
    rows.push(row);
  }
  return rows;
}

export const MOCK_ALERT_RECORDS: MockAlertRecord[] = buildMockAlertRecords(MOCK_ALERT_RECORD_COUNT);

export function countAlertsByStatus(status: MockAlertStatus | 'all'): number {
  if (status === 'all') return MOCK_ALERT_RECORDS.length;
  return MOCK_ALERT_RECORDS.filter((r) => r.status === status).length;
}
