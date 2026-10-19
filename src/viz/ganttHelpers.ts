import { GRADES } from '@/constants/grade';
import type { PierReachTimes } from '@/utils/pierTimeSeries';

export interface GanttSegment {
  t0: number;
  t1: number;
  gradeKey: string;
  color: string;
  label: string;
}

/** Build grade-lane segments from reach times and duration */
export function buildGradeGanttSegments(
  reach: PierReachTimes,
  durationSeconds: number,
): GanttSegment[] {
  const d = Math.max(durationSeconds, 1);
  const points: Array<{ t: number; gi: number }> = [{ t: 0, gi: 0 }];
  if (reach.caution != null) points.push({ t: reach.caution, gi: 1 });
  if (reach.boundary != null) points.push({ t: reach.boundary, gi: 2 });
  if (reach.serious != null) points.push({ t: reach.serious, gi: 3 });
  points.sort((a, b) => a.t - b.t);

  const segs: GanttSegment[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const t0 = p.t;
    const t1 = i + 1 < points.length ? points[i + 1].t : d;
    const g = GRADES[Math.min(p.gi, GRADES.length - 1)];
    segs.push({
      t0,
      t1,
      gradeKey: g.key,
      color: g.color,
      label: g.name,
    });
  }
  return segs;
}
