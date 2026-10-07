import type { PierDefinition } from '@/modules/PierMarker';
import type { ScourFrame, ScourSeries } from '@/types/terrain';
import type { Disposable } from '@/types/disposable';
import { gradeOf } from '@/constants/grade';

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

function cellMiniSvg(series: ScourSeries, cell: CellSelection, timeSeconds: number): string {
  const W = 280;
  const H = 96;
  const L = 30;
  const R = 6;
  const T = 8;
  const B = 14;
  const iw = W - L - R;
  const ih = H - T - B;
  const { width } = series.baseTerrain;
  const { frames } = series;
  const idx = cell.gridY * width + cell.gridX;
  const vals = frames.map((f) => f.deltaElevations[idx] ?? 0);
  const tMax = frames.at(-1)?.timestampSeconds ?? 1;
  const mn = Math.min(...vals, -0.001);
  const mx = Math.max(...vals, 0.001);
  const Y = (v: number): number => T + ih * (1 - (v - mn) / (mx - mn || 1));
  const X = (t: number): number => L + (iw * t) / Math.max(tMax, 1);
  const pts = vals.map((v, i) => [X(frames[i]?.timestampSeconds ?? 0), Y(v)] as const);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const cx = X(timeSeconds);
  const fi = frames.findIndex((f) => f.timestampSeconds >= timeSeconds);
  const cv = vals[Math.max(0, fi)] ?? 0;
  const cy = Y(cv);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:100%"><line x1="${L}" y1="${Y(0)}" x2="${W - R}" y2="${Y(0)}" stroke="#4E6F8C" stroke-dasharray="4 3"/>
    <path d="${path}" fill="none" stroke="#7ec8e3" stroke-width="1.8"/>
    <line x1="${cx}" y1="${T}" x2="${cx}" y2="${T + ih}" stroke="#00D4B0" stroke-width="1.2"/>
    <circle cx="${cx}" cy="${cy}" r="3.5" fill="#f4d35e"/></svg>`;
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
    this.chartHost.innerHTML = cellMiniSvg(series, cell, timeSeconds);

    const scourLabel = delta < 0 ? '세굴' : '퇴적';
    this.bodyEl.querySelectorAll('.cell-detail-popover__kv').forEach((el) => el.remove());
    const kvs: Array<[string, string]> = [
      ['좌표 (x, z)', `${cell.worldX.toFixed(2)}, ${cell.worldZ.toFixed(2)} m`],
      ['현재 하상 변화', `${scourLabel} ${delta.toFixed(3)} m`],
      ['최대 세굴 (전 구간)', `${maxScour.toFixed(3)} m`],
      ['국부 유속 (davel)', `${u.toFixed(2)} m/s`],
      ['하상 전단응력 (scrp)', `${tau.toFixed(1)} N/m²`],
      ['시각', `${timeSeconds.toFixed(0)} s`],
    ];
    for (const [k, v] of kvs) {
      const row = document.createElement('div');
      row.className = 'cell-detail-popover__kv';
      const isChange = k === '현재 하상 변화';
      row.innerHTML = `<span>${k}</span><b${isChange ? ` style="color:${g.color}"` : ''}>${v}</b>`;
      this.bodyEl.appendChild(row);
    }
  }

  public dispose(): void {
    this.element.remove();
  }
}
