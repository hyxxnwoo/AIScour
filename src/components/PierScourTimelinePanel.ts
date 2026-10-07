import { GRADES, IS_THRESHOLD_PROVISIONAL, gradeDepthThresholds } from '@/constants/grade';
import type { PierDepthSeries, PierReachTimes } from '@/utils/pierTimeSeries';
import { pierSeriesColor } from '@/utils/pierTimeSeries';
import type { Disposable } from '@/types/disposable';

const CH = { grid: '#1C3650', ink2: '#6B8299', cur: '#00D4B0', foot: '#3987e5' };

function pathFrom(pts: Array<[number, number]>): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
}

function buildTsSvg(
  seriesList: PierDepthSeries[],
  timeSeconds: number,
  foundationDepthM: number,
  durationSeconds: number,
): string {
  const W = 1000;
  const H = 230;
  const L = 48;
  const R = 118;
  const T = 12;
  const B = 26;
  const iw = W - L - R;
  const ih = H - T - B;
  const fd = foundationDepthM;
  const Y = (d: number): number => T + ih * (1 - d / Math.max(fd * 1.05, 1e-9));
  const X = (tt: number): number => L + (iw * tt) / Math.max(durationSeconds, 1);

  const [th1, th2, th3] = gradeDepthThresholds(fd);
  const thresholds = [th1, th2, th3];
  let s = '';
  for (let v = 0; v <= fd; v += fd / 5) {
    const y = Y(v);
    s += `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="${CH.grid}"/>`;
    s += `<text x="${L - 7}" y="${y + 4}" fill="${CH.ink2}" font-size="11" text-anchor="end">${v.toFixed(1)}</text>`;
  }
  const tickStep = durationSeconds > 600 ? 300 : 60;
  for (let tt = 0; tt <= durationSeconds + 0.01; tt += tickStep) {
    s += `<text x="${X(tt)}" y="${H - 7}" fill="${CH.ink2}" font-size="10.5" text-anchor="middle">${Math.round(tt)}s</text>`;
  }
  thresholds.forEach((d, i) => {
    const g = GRADES[i + 1];
    if (!g) return;
    s += `<line x1="${L}" y1="${Y(d)}" x2="${W - R}" y2="${Y(d)}" stroke="${g.color}" stroke-width="1.4" stroke-dasharray="7 5"/>`;
    s += `<text x="${W - R + 7}" y="${Y(d) + 4}" fill="${g.color}" font-size="11" font-weight="700">${g.name} ${d.toFixed(2)} m</text>`;
  });
  s += `<line x1="${L}" y1="${Y(fd)}" x2="${W - R}" y2="${Y(fd)}" stroke="${CH.foot}" stroke-width="2"/>`;
  s += `<text x="${W - R + 7}" y="${Y(fd) + 9}" fill="${CH.foot}" font-size="10.5" font-weight="600">기초 근입 ${fd.toFixed(2)} m</text>`;

  for (const ps of seriesList) {
    const pts: Array<[number, number]> = ps.times.map((tt, i) => [X(tt), Y(ps.depths[i] ?? 0)]);
    s += `<path d="${pathFrom(pts)}" fill="none" stroke="${pierSeriesColor(ps.pierId)}" stroke-width="2.4" stroke-linejoin="round"/>`;
  }
  const cx = X(timeSeconds);
  s += `<line x1="${cx}" y1="${T}" x2="${cx}" y2="${T + ih}" stroke="${CH.cur}" stroke-width="1.5"/>`;
  for (const ps of seriesList) {
    let idx = 0;
    for (let i = 0; i < ps.times.length; i++) {
      if ((ps.times[i] ?? 0) <= timeSeconds) idx = i;
    }
    const d = ps.depths[idx] ?? 0;
    const cy = Y(d);
    s += `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${pierSeriesColor(ps.pierId)}" stroke="#0C2034" stroke-width="2"/>`;
    s += `<text x="${cx - 9}" y="${cy - 7}" fill="${pierSeriesColor(ps.pierId)}" font-size="11.5" font-weight="700" text-anchor="end">${ps.pierId} ${d.toFixed(2)}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%;display:block">${s}</svg>`;
}

function buildReachTable(reach: PierReachTimes[]): string {
  const head = GRADES.slice(1)
    .map((g) => `<th style="color:${g.color}">${g.name}</th>`)
    .join('');
  const rows = reach
    .map((r) => {
      const fmt = (t: number | null): string =>
        t === null ? '<span class="sub">—</span>' : `${Math.round(t)} s`;
      return `<tr><td style="font-weight:700;color:${pierSeriesColor(r.pierId)}">${r.pierId}</td>
        <td class="num">${fmt(r.caution)}</td><td class="num">${fmt(r.boundary)}</td><td class="num">${fmt(r.serious)}</td>
        <td class="num">${r.finalDepthM.toFixed(2)} m</td></tr>`;
    })
    .join('');
  return `<table class="pier-reach-table"><thead><tr><th>교각</th>${head}<th>최종</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** 8번 화면 하단 — 교각 세굴심 시계열 + 등급 도달 시각 표 */
export class PierScourTimelinePanel implements Disposable {
  public readonly element: HTMLElement;
  private readonly chartHost: HTMLElement;
  private readonly tableHost: HTMLElement;

  public constructor() {
    this.element = document.createElement('div');
    this.element.className = 'pier-timeline-panel is-hidden';
    this.element.id = 'pier-timeline-panel';

    const left = document.createElement('div');
    left.className = 'pier-timeline-panel__chart-wrap';
    const head = document.createElement('div');
    head.className = 'pier-timeline-panel__head';
    head.innerHTML = `<div class="pier-timeline-panel__title">교각별 세굴심 시계열</div>
      <span class="pier-timeline-panel__note">점선 = 등급 경계 (잔여 여유율 70/40/20 %)
      ${IS_THRESHOLD_PROVISIONAL ? '<span class="grade-legend-panel__prov">잠정</span>' : ''}</span>`;
    this.chartHost = document.createElement('div');
    this.chartHost.className = 'pier-timeline-panel__chart';
    left.append(head, this.chartHost);

    const right = document.createElement('div');
    right.className = 'pier-timeline-panel__side';
    right.innerHTML = `<div class="pier-timeline-panel__side-title">등급 도달 시각</div>`;
    this.tableHost = document.createElement('div');
    right.appendChild(this.tableHost);

    this.element.append(left, right);
  }

  public update(
    seriesList: PierDepthSeries[],
    reach: PierReachTimes[],
    timeSeconds: number,
    foundationDepthM: number,
    durationSeconds: number,
  ): void {
    this.chartHost.innerHTML = buildTsSvg(
      seriesList,
      timeSeconds,
      foundationDepthM,
      durationSeconds,
    );
    this.tableHost.innerHTML = buildReachTable(reach);
    const hint = document.createElement('div');
    hint.className = 'pier-timeline-panel__hint';
    const [a, b, c] = gradeDepthThresholds(foundationDepthM);
    hint.textContent = `경계 세굴심 ${a.toFixed(2)} / ${b.toFixed(2)} / ${c.toFixed(2)} m — 처음 도달 시각`;
    this.tableHost.appendChild(hint);
  }

  public dispose(): void {
    this.element.remove();
  }
}
