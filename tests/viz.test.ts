import { describe, expect, it } from 'vitest';
import { describeDonutSegment, linearScale, pathFrom } from '@/viz/svg';
import { binValues, binMaxCount } from '@/viz/histogram';
import { buildGradeGanttSegments } from '@/viz/ganttHelpers';
import {
  dayKeyFromAt,
  groupHistoryByDay,
  inferHistoryKind,
  type ParsedHistoryRow,
} from '@/viz/eventTimelineHelpers';

describe('viz svg', () => {
  it('linearScale maps domain to range', () => {
    const s = linearScale([0, 100], [10, 110]);
    expect(s(0)).toBe(10);
    expect(s(50)).toBe(60);
    expect(s(100)).toBe(110);
  });

  it('pathFrom builds M/L path', () => {
    expect(pathFrom([
      [0, 0],
      [10, 5],
    ])).toBe('M0.00 0.00 L10.00 5.00');
  });

  it('describeDonutSegment returns closed path', () => {
    const d = describeDonutSegment(50, 50, 40, 25, 0, Math.PI / 2);
    expect(d).toContain('M ');
    expect(d).toContain('Z');
  });
});

describe('viz histogram', () => {
  it('bins values in domain', () => {
    const bins = binValues([0, 0.5, 1, 1.5], 4, [0, 2]);
    expect(bins.length).toBe(4);
    expect(binMaxCount(bins)).toBeGreaterThan(0);
  });
});

describe('viz gantt helpers', () => {
  it('builds grade segments from reach times', () => {
    const segs = buildGradeGanttSegments(
      {
        pierId: 'P2',
        caution: 100,
        boundary: 200,
        serious: null,
        finalDepthM: 3,
      },
      500,
    );
    expect(segs.length).toBeGreaterThan(0);
    expect(segs[0]!.t0).toBe(0);
    expect(segs.some((s) => s.gradeKey === 'a2')).toBe(true);
  });
});

describe('viz event timeline helpers', () => {
  it('infers history kind', () => {
    expect(inferHistoryKind('경보 자동 발령', '시스템')).toBe('issue');
    expect(inferHistoryKind('SOP 완료', 'admin')).toBe('complete');
  });

  it('groups by day', () => {
    const rows: ParsedHistoryRow[] = [
      { at: '10-02 09:22', who: 'a', text: 'x', kind: 'system', dayKey: '10-02' },
      { at: '10-02 10:00', who: 'b', text: 'y', kind: 'other', dayKey: '10-02' },
      { at: '10-01 12:00', who: 'c', text: 'z', kind: 'other', dayKey: '10-01' },
    ];
    expect(dayKeyFromAt('10-02 09:22')).toBe('10-02');
    const g = groupHistoryByDay(rows);
    expect(g.get('10-02')?.length).toBe(2);
  });
});
