import type { PierDefinition } from '@/modules/PierMarker';
import type { ScourFrame, ScourSeries } from '@/types/terrain';
import type { Disposable } from '@/types/disposable';
import { gradeOf } from '@/constants/grade';
import { renderRingGauge } from '@/viz/gauge';
import { renderSignedBar, renderSparkline } from '@/viz/sparkline';

export interface CellSelection {
  gridX: number;
  gridY: number;
  worldX: number;
  worldZ: number;
}

function scourFrameAtTime(frames: ScourFrame[], timeSeconds: number): ScourFrame | undefined {
  if (frames.length === 0) return undefined;
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const f = frames[i];
    if (f.timestampSeconds <= timeSeconds) return f;
  }
  return frames[0];
}

function estimateCellVelocity(worldX: number, worldZ: number, piers: PierDefinition[]): number {
  let m = Infinity;
  for (const p of piers) {
    m = Math.min(m, Math.hypot(worldX - p.x, worldZ - p.z));
  }
  return 0.85 + 1.0 * Math.exp(-(m * m) / 4);
}

/** 7번 — 하상 클릭 셀 상세 팝업 */
export class CellDetailPopover implements Disposable {
  public readonly element: HTMLElement;
  private selection: CellSelection | null = null;
  private chartHost: HTMLElement;
  private bodyEl: HTMLElement;
  private onClose: (() => void) | null = null;

  public constructor() {
    this.element = document.createElement('div');
    this.element.className = 'cell-detail-popover is-hidden';
    this.element.innerHTML = `
      <div class="cell-detail-popover__head">
        <span class="cell-detail-popover__title">셀 상세</span>
        <button type="button" class="cell-detail-popover__close" aria-label="닫기">✕</button>
      </div>
      <div class="cell-detail-popover__body"></div>`;
    this.bodyEl = this.element.querySelector('.cell-detail-popover__body')!;
    this.chartHost = document.createElement('div');
    this.chartHost.className = 'cell-detail-popover__chart';
    this.bodyEl.prepend(this.chartHost);
    this.element.querySelector('.cell-detail-popover__close')?.addEventListener('click', () => {
      this.clear();
      this.onClose?.();
    });
  }

  public setOnClose(fn: () => void): void {
    this.onClose = fn;
  }

  public setCell(cell: CellSelection): void {
    this.selection = cell;
    this.element.classList.remove('is-hidden');
  }

  public clear(): void {
    this.selection = null;
    this.element.classList.add('is-hidden');
  }

  public getSelection(): CellSelection | null {
    return this.selection;
  }

  public update(
    series: ScourSeries,
    timeSeconds: number,
    piers: PierDefinition[],
    foundationDepthM: number,
  ): void {
    if (!this.selection) return;
    const cell = this.selection;
    const { width } = series.baseTerrain;
    const { frames } = series;
    const idx = cell.gridY * width + cell.gridX;
    const frame = scourFrameAtTime(frames, timeSeconds);
    const delta: number = frame ? (frame.deltaElevations[idx] ?? 0) : 0;
    const allVals = frames.map((f) => f.deltaElevations[idx] ?? 0);
    const maxScour = Math.min(...allVals);
    const u = estimateCellVelocity(cell.worldX, cell.worldZ, piers);
    const tau = 1000 * 0.0035 * u * u;
    const g = gradeOf(Math.max(0, -delta), foundationDepthM);

    this.element.querySelector('.cell-detail-popover__title')!.textContent =
      `셀 (${cell.gridX}, ${cell.gridY}) 하상 표고 변화`;

    this.bodyEl.querySelectorAll('.cell-detail-popover__viz').forEach((el) => el.remove());
    const viz = document.createElement('div');
    viz.className = 'cell-detail-popover__viz';
    const maxAbs = Math.max(Math.abs(maxScour), Math.abs(delta), 0.5);
    viz.innerHTML = `
      <div class="cell-detail-popover__viz-row">${renderSignedBar(delta, maxAbs)}</div>
      <div class="cell-detail-popover__viz-row cell-detail-popover__viz-gauges">
        ${renderRingGauge({ value: u, max: 2.5, size: 44, color: '#7ec8e3', label: `${u.toFixed(2)}` })}
        ${renderRingGauge({ value: tau, max: 15, size: 44, color: '#E8B21A', label: `${tau.toFixed(0)}` })}
      </div>
      <div class="cell-detail-popover__viz-hint" data-tip="좌표 ${cell.worldX.toFixed(2)}, ${cell.worldZ.toFixed(2)} m · t=${timeSeconds.toFixed(0)} s">
        유속 · 전단(N/m²) · 최대 세굴 ${maxScour.toFixed(3)} m
      </div>`;
    this.bodyEl.appendChild(viz);
    this.chartHost.innerHTML = renderSparkline({
      values: allVals,
      currentIndex: frames.findIndex((f) => f.timestampSeconds >= timeSeconds),
      width: 260,
      height: 48,
      stroke: g.color,
    });
  }

  public dispose(): void {
    this.element.remove();
  }
}
