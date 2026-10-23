import { GRADES, IS_THRESHOLD_PROVISIONAL, gradeDepthThresholds } from '@/constants/grade';
import type { PierDepthSeries, PierReachTimes } from '@/utils/pierTimeSeries';
import { pierSeriesColor } from '@/utils/pierTimeSeries';
import type { Disposable } from '@/types/disposable';
import { buildGradeGanttSegments } from '@/viz/ganttHelpers';
import { renderGanttChart } from '@/viz/gantt';
import { observeWidgetTier } from '@/viz/widget';
import { viewState } from '@/state/viewState';
import { renderPierReachTable } from '@/viz/viewerScreenViz';
import { animateVizBars } from '@/viz/vizMotion';

const CH = { grid: '#1C3650', ink2: '#6B8299', cur: '#00D4B0', foot: '#3987e5' };

function pathFrom(pts: Array<[number, number]>): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
}

function buildTsSvg(
  seriesList: PierDepthSeries[],
  timeSeconds: number,
  foundationDepthM: number,
  durationSeconds: number,
  highlightPier: string | null,
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
  const Y = (d: number): number => T + ih * (d / Math.max(fd, 1e-9));
  const X = (tt: number): number => L + (iw * tt) / Math.max(durationSeconds, 1);

  const [th1, th2, th3] = gradeDepthThresholds(fd);
  const thresholds = [th1, th2, th3];
  let s = '';
  const bands: Array<[number, number, string]> = [
    [0, th1, GRADES[0].color],
    [th1, th2, GRADES[1].color],
    [th2, th3, GRADES[2].color],
    [th3, fd, GRADES[3].color],
  ];
  for (const [y0, y1, col] of bands) {
    s += `<rect x="${L}" y="${Y(y0)}" width="${iw}" height="${Y(y1) - Y(y0)}" fill="${col}" opacity="0.06"/>`;
  }
  // 실험실 규모(기초 근입 0.08 m 등)에서는 소수 한 자리로는 눈금이 전부 0.0 / 0.1 로 보이므로 자릿수를 늘린다.
  const yDecimals = fd < 0.5 ? 3 : 1;
  for (let v = 0; v <= fd + 1e-9; v += fd / 5) {
    const y = Y(v);
    s += `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="${CH.grid}"/>`;
    s += `<text x="${L - 7}" y="${y + 4}" fill="${CH.ink2}" font-size="13" text-anchor="end">${v.toFixed(yDecimals)}</text>`;
  }
  const tickStep = durationSeconds > 600 ? 300 : 60;
  for (let tt = 0; tt <= durationSeconds + 0.01; tt += tickStep) {
    s += `<text x="${X(tt)}" y="${H - 7}" fill="${CH.ink2}" font-size="12.5" text-anchor="middle">${Math.round(tt)}s</text>`;
  }
  thresholds.forEach((d, i) => {
    const g = GRADES[i + 1];
    if (!g) return;
    s += `<line x1="${L}" y1="${Y(d)}" x2="${W - R}" y2="${Y(d)}" stroke="${g.color}" stroke-width="1.4" stroke-dasharray="7 5"/>`;
    s += `<text x="${W - R + 7}" y="${Y(d) + 4}" fill="${g.color}" font-size="13" font-weight="700">${g.name} ${d.toFixed(2)} m</text>`;
  });
  s += `<line x1="${L}" y1="${Y(fd)}" x2="${W - R}" y2="${Y(fd)}" stroke="${CH.foot}" stroke-width="2"/>`;
  s += `<text x="${W - R + 7}" y="${Y(fd) + 9}" fill="${CH.foot}" font-size="12.5" font-weight="600">기초 근입 ${fd.toFixed(2)} m</text>`;

  for (const ps of seriesList) {
    const dim = highlightPier != null && highlightPier !== ps.pierId;
    const op = dim ? 0.25 : 1;
    const pts: Array<[number, number]> = ps.times.map((tt, i) => [X(tt), Y(ps.depths[i] ?? 0)]);
    const past: Array<[number, number]> = [];
    const future: Array<[number, number]> = [];
    for (let i = 0; i < pts.length; i++) {
      const t = ps.times[i] ?? 0;
      if (t <= timeSeconds) past.push(pts[i]);
      else future.push(pts[i]);
    }
    if (past.length > 1) {
      s += `<path d="${pathFrom(past)}" fill="none" stroke="${pierSeriesColor(ps.pierId)}" stroke-width="2.4" opacity="${op}" stroke-linejoin="round"/>`;
    }
    if (future.length > 1) {
      s += `<path d="${pathFrom(future)}" fill="none" stroke="${pierSeriesColor(ps.pierId)}" stroke-width="1.6" opacity="${0.35 * op}" stroke-dasharray="5 4"/>`;
    }
  }
  const cx = X(timeSeconds);
  s += `<line class="pier-timeline-panel__cursor" x1="${cx}" y1="${T}" x2="${cx}" y2="${T + ih}" stroke="${CH.cur}" stroke-width="1.5"/>`;
  for (const ps of seriesList) {
    let idx = 0;
    for (let i = 0; i < ps.times.length; i++) {
      if ((ps.times[i] ?? 0) <= timeSeconds) idx = i;
    }
    const d = ps.depths[idx] ?? 0;
    const cy = Y(d);
    s += `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${pierSeriesColor(ps.pierId)}" stroke="#0C2034" stroke-width="2"/>`;
  }
  s += `<rect class="pier-timeline-panel__hit" x="${L}" y="${T}" width="${iw}" height="${ih}" fill="transparent" data-plot-l="${L}" data-plot-t="${T}" data-plot-w="${iw}" data-plot-h="${ih}" data-duration="${durationSeconds}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%;display:block" data-ts-svg="1">${s}</svg>`;
}

export interface PierScourTimelinePanelOptions {
  /** 그래프 드래그·클릭으로 시점 탐색 */
  onScrubTime?: (timeSeconds: number) => void;
}

/** 8번 화면 하단 — 시계열 + 등급 간트 */
export class PierScourTimelinePanel implements Disposable {
  public readonly element: HTMLElement;
  private readonly chartHost: HTMLElement;
  private readonly ganttHost: HTMLElement;
  private readonly reachHost: HTMLElement;
  private readonly legendHost: HTMLElement;
  private legendBound = false;
  private onScrubTime?: (timeSeconds: number) => void;
  private highlightPier: string | null = null;
  private scrubbing = false;
  private lastSeries: PierDepthSeries[] = [];
  private lastTime = 0;
  private lastFd = 5.2;
  private lastDuration = 1;

  public constructor(options: PierScourTimelinePanelOptions = {}) {
    if (options.onScrubTime) this.onScrubTime = options.onScrubTime;
    this.element = document.createElement('div');
    this.element.className = 'pier-timeline-panel pier-timeline-panel--viz viz-widget is-hidden';
    this.element.dataset.widgetId = 'pier-timeline';
    this.element.id = 'pier-timeline-panel';

    const left = document.createElement('div');
    left.className = 'pier-timeline-panel__chart-wrap';
    const head = document.createElement('div');
    head.className = 'pier-timeline-panel__head';
    head.innerHTML = `<div class="pier-timeline-panel__title">교각별 표시 세굴심 시계열</div>
      <span class="pier-timeline-panel__note">그래프 드래그·클릭 탐색 · 범례·도달 표 연동
      ${IS_THRESHOLD_PROVISIONAL ? '<span class="grade-legend-panel__prov">잠정</span>' : ''}</span>`;
    this.legendHost = document.createElement('div');
    this.legendHost.className = 'pier-timeline-panel__legend';
    this.chartHost = document.createElement('div');
    this.chartHost.className = 'pier-timeline-panel__chart';
    left.append(head, this.legendHost, this.chartHost);

    const right = document.createElement('div');
    right.className = 'pier-timeline-panel__side viz-tier viz-tier--detail';
    right.innerHTML = `<div class="pier-timeline-panel__side-title">등급 구간 (간트)</div>`;
    this.ganttHost = document.createElement('div');
    this.ganttHost.className = 'pier-timeline-panel__gantt';
    this.reachHost = document.createElement('div');
    this.reachHost.className = 'pier-timeline-panel__reach';
    right.append(this.ganttHost, this.reachHost);

    this.element.append(left, right);
    observeWidgetTier(this.element);
    this.bindLegendEvents();
    this.chartHost.addEventListener('pointermove', this.onChartMove);
    this.chartHost.addEventListener('pointerdown', this.onChartDown);
    this.chartHost.addEventListener('pointerup', this.onChartUp);
    this.chartHost.addEventListener('pointerleave', () => {
      this.scrubbing = false;
      this.highlightPier = null;
      viewState.setHoveredPier(null);
      this.repaintChart();
    });
  }

  private timeAtClientX(clientX: number): number | null {
    const svg = this.chartHost.querySelector('svg[data-ts-svg]');
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const relX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return relX * this.lastDuration;
  }

  private onChartDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.scrubbing = true;
    this.chartHost.setPointerCapture(e.pointerId);
    const t = this.timeAtClientX(e.clientX);
    if (t != null) this.onScrubTime?.(t);
    if (this.highlightPier) viewState.setSelectedPier(this.highlightPier);
  };

  private onChartUp = (e: PointerEvent): void => {
    if (this.scrubbing) {
      this.scrubbing = false;
      this.chartHost.releasePointerCapture(e.pointerId);
    }
  };

  private onChartMove = (e: PointerEvent): void => {
    const svg = this.chartHost.querySelector('svg[data-ts-svg]');
    if (!svg || this.lastSeries.length === 0) return;
    const t = this.timeAtClientX(e.clientX);
    if (t == null) return;
    if (this.scrubbing) this.onScrubTime?.(t);
    let best: string | null = null;
    let bestD = Infinity;
    for (const ps of this.lastSeries) {
      let idx = 0;
      for (let i = 0; i < ps.times.length; i++) {
        if ((ps.times[i] ?? 0) <= t) idx = i;
      }
      const d = ps.depths[idx] ?? 0;
      if (d < bestD) {
        bestD = d;
        best = ps.pierId;
      }
    }
    this.highlightPier = best;
    if (best) viewState.setHoveredPier(best);
    this.repaintChart();
    svg.setAttribute('data-tip', `t ≈ ${Math.round(t)} s`);
  };

  private bindLegendEvents(): void {
    if (this.legendBound) return;
    this.legendBound = true;
    this.legendHost.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-pier]');
      if (!btn?.dataset.pier) return;
      this.highlightPier = btn.dataset.pier;
      viewState.setSelectedPier(btn.dataset.pier);
      this.repaintChart();
    });
    this.legendHost.addEventListener('mouseover', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-pier]');
      if (!btn?.dataset.pier) return;
      this.highlightPier = btn.dataset.pier;
      viewState.setHoveredPier(btn.dataset.pier);
      this.repaintChart();
    });
    this.legendHost.addEventListener('mouseleave', () => {
      if (this.scrubbing) return;
      this.highlightPier = viewState.selectedPierId;
      viewState.setHoveredPier(null);
      this.repaintChart();
    });
  }

  private repaintChart(): void {
    if (this.lastSeries.length === 0) return;
    this.chartHost.innerHTML = buildTsSvg(
      this.lastSeries,
      this.lastTime,
      this.lastFd,
      this.lastDuration,
      this.highlightPier ?? viewState.selectedPierId,
    );
    const focus = this.highlightPier ?? viewState.selectedPierId;
    this.legendHost.innerHTML = this.lastSeries
      .map(
        (ps) =>
          `<button type="button" class="pier-timeline-panel__leg ${focus === ps.pierId ? 'is-on' : ''}" data-pier="${ps.pierId}" style="--c:${pierSeriesColor(ps.pierId)}">${ps.pierId}</button>`,
      )
      .join('');
  }

  public setScrubHandler(handler: (timeSeconds: number) => void): void {
    this.onScrubTime = handler;
  }

  public update(
    seriesList: PierDepthSeries[],
    reach: PierReachTimes[],
    timeSeconds: number,
    foundationDepthM: number,
    durationSeconds: number,
  ): void {
    this.lastSeries = seriesList;
    this.lastTime = timeSeconds;
    this.lastFd = foundationDepthM;
    this.lastDuration = durationSeconds;
    this.repaintChart();

    const lanes = reach.map((r) => ({
      id: r.pierId,
      label: r.pierId,
      color: pierSeriesColor(r.pierId),
      segments: buildGradeGanttSegments(r, durationSeconds),
    }));
    this.ganttHost.innerHTML = renderGanttChart({
      lanes,
      durationSeconds,
      cursorTime: timeSeconds,
      width: 340,
    });
    const hint = document.createElement('div');
    hint.className = 'pier-timeline-panel__hint';
    const [a, b, c] = gradeDepthThresholds(foundationDepthM);
    hint.textContent = `경계 세굴심 ${a.toFixed(2)} / ${b.toFixed(2)} / ${c.toFixed(2)} m — 간트는 등급 구간`;
    this.ganttHost.appendChild(hint);

    this.reachHost.innerHTML = renderPierReachTable(
      reach,
      durationSeconds,
      viewState.selectedPierId,
    );
    animateVizBars(this.reachHost);
  }

  public dispose(): void {
    this.chartHost.removeEventListener('pointermove', this.onChartMove);
    this.chartHost.removeEventListener('pointerdown', this.onChartDown);
    this.chartHost.removeEventListener('pointerup', this.onChartUp);
    this.element.remove();
  }
}
