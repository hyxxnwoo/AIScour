export type HistoryEventKind = 'issue' | 'complete' | 'cancel' | 'attach' | 'system' | 'other';

export interface ParsedHistoryRow {
  at: string;
  who: string;
  text: string;
  kind: HistoryEventKind;
  dayKey: string;
}

export function inferHistoryKind(text: string, who: string): HistoryEventKind {
  if (who === '시스템' && text.includes('발령')) return 'issue';
  if (text.includes('첨부')) return 'attach';
  if (text.includes('완료 취소') || text.includes('취소')) return 'cancel';
  if (text.includes('완료') || text.includes('종료')) return 'complete';
  if (who === '시스템') return 'system';
  return 'other';
}

export function dayKeyFromAt(at: string): string {
  const m = at.match(/^(\d{2}-\d{2})/);
  return m?.[1] ?? at.slice(0, 5);
}

export function groupHistoryByDay(rows: ParsedHistoryRow[]): Map<string, ParsedHistoryRow[]> {
  const map = new Map<string, ParsedHistoryRow[]>();
  for (const r of rows) {
    const list = map.get(r.dayKey) ?? [];
    list.push(r);
    map.set(r.dayKey, list);
  }
  return map;
}

export function kindDotColor(kind: HistoryEventKind): string {
  switch (kind) {
    case 'issue':
      return '#E8796B';
    case 'complete':
      return '#2EA36B';
    case 'cancel':
      return '#E8B21A';
    case 'attach':
      return '#6FB6DE';
    case 'system':
      return '#9FB6C8';
    default:
      return '#7E9BB5';
  }
}
