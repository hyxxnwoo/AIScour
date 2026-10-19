import type { GanttSegment } from '@/viz/ganttHelpers';
import { linearScale } from '@/viz/svg';

export interface GanttLane {
  id: string;
  label: string;
  color?: string;
  segments: GanttSegment[];
}

export interface GanttChartOptions {
  lanes: GanttLane[];
  durationSeconds: number;
  cursorTime?: number;
  width?: number;
  laneHeight?: number;
}

export function renderGanttChart(opts: GanttChartOptions): string {
  const w = opts.width ?? 320;
  const lh = opts.laneHeight ?? 28;
  const padL = 36;
  const padR = 8;
  const iw = w - padL - padR;
  const d = Math.max(opts.durationSeconds, 1);
  const x = linearScale([0, d], [padL, padL + iw]);
  const lanes = opts.lanes;
  const h = lanes.length * lh + 8;
  let body = '';
  for (let i = 0; i < lanes.length; i++) {
    const lane = lanes[i];
    const y = 4 + i * lh;
    body += `<text x="4" y="${y + lh * 0.65}" fill="${lane.color ?? '#9FC4DC'}" font-size="12" font-weight="700">${lane.label}</text>`;
    body += `<rect x="${padL}" y="${y + 4}" width="${iw}" height="${lh - 8}" fill="#15293D" rx="3"/>`;
    for (const seg of lane.segments) {
      const x0 = x(seg.t0);
      const x1 = x(seg.t1);
      const sw = Math.max(x1 - x0, 2);
      body += `<rect x="${x0}" y="${y + 5}" width="${sw}" height="${lh - 10}" fill="${seg.color}" opacity="0.55" rx="2">
        <title>${seg.label} ${Math.round(seg.t0)}–${Math.round(seg.t1)} s</title>
      </rect>`;
    }
  }
  if (opts.cursorTime != null) {
    const cx = x(opts.cursorTime);
    body += `<line x1="${cx}" y1="2" x2="${cx}" y2="${h - 2}" stroke="#00D4B0" stroke-width="1.5"/>`;
  }
  return `<svg class="viz-gantt" viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${body}</svg>`;
}
