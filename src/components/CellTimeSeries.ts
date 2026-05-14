import type { ScourSeries } from '@/types/terrain';
import type { Disposable } from '@/types/disposable';

export interface CellTimeSeriesOptions {
  series: ScourSeries;
  width?: number;
  height?: number;
}

// CellTimeSeries: 특정 격자 셀의 시간별 deltaElevation 변화를 SVG sparkline 으로 표시한다.
// setCell(gridX, gridY) 으로 갱신, clear() 로 비활성화.
export class CellTimeSeries implements Disposable {
  public readonly element: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly path: SVGPathElement;
  private readonly axis: SVGLineElement;
  private readonly marker: SVGCircleElement;
  private readonly title: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private readonly empty: HTMLDivElement;
  private readonly width: number;
  private readonly height: number;
  private series: ScourSeries;
  private currentTime = 0;
  private currentCell: { gridX: number; gridY: number } | null = null;

  public constructor(options: CellTimeSeriesOptions) {
    this.series = options.series;
    this.width = options.width ?? 280;
    this.height = options.height ?? 80;

    this.element = document.createElement('div');
    this.element.className = 'cell-time-series';

    this.title = document.createElement('div');
    this.title.className = 'cell-time-series__title';
    this.title.textContent = '셀 시계열 (클릭으로 선택)';
    this.element.appendChild(this.title);

    const NS = 'http://www.w3.org/2000/svg';
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.svg.setAttribute('width', String(this.width));
    this.svg.setAttribute('height', String(this.height));
    this.svg.classList.add('cell-time-series__svg');

    this.axis = document.createElementNS(NS, 'line');
    this.axis.setAttribute('stroke', 'rgba(255,255,255,0.25)');
    this.axis.setAttribute('stroke-dasharray', '2 3');

    this.path = document.createElementNS(NS, 'path');
    this.path.setAttribute('fill', 'none');
    this.path.setAttribute('stroke', '#7ec8e3');
    this.path.setAttribute('stroke-width', '1.5');

    this.marker = document.createElementNS(NS, 'circle');
    this.marker.setAttribute('r', '3');
    this.marker.setAttribute('fill', '#f4d35e');

    this.svg.append(this.axis, this.path, this.marker);
    this.element.appendChild(this.svg);

    this.stats = document.createElement('div');
    this.stats.className = 'cell-time-series__stats';
    this.element.appendChild(this.stats);

    this.empty = document.createElement('div');
    this.empty.className = 'cell-time-series__empty';
    this.empty.textContent = '지형 위 셀을 클릭하면 시간별 깊이 변화가 표시됩니다.';
    this.element.appendChild(this.empty);

    this.renderEmpty();
  }

  public setCell(gridX: number, gridY: number): void {
    this.currentCell = { gridX, gridY };
    this.render();
  }

  public clear(): void {
    this.currentCell = null;
    this.renderEmpty();
  }

  // 현재 시간을 갱신하면 마커가 시계열 상에서 따라 이동한다.
  public setTime(timeSeconds: number): void {
    this.currentTime = timeSeconds;
    this.updateMarker();
  }

  private renderEmpty(): void {
    this.path.setAttribute('d', '');
    this.marker.setAttribute('cx', '-10');
    this.marker.setAttribute('cy', '-10');
    this.stats.textContent = '';
    this.empty.style.display = '';
  }

  private render(): void {
    const cell = this.currentCell;
    if (!cell) {
      this.renderEmpty();
      return;
    }
    this.empty.style.display = 'none';
    this.title.textContent = `셀 (${cell.gridX}, ${cell.gridY}) Δelevation 시계열`;

    const { width, frames } = { width: this.series.baseTerrain.width, frames: this.series.frames };
    const idx = cell.gridY * width + cell.gridX;
    if (frames.length === 0) {
      this.renderEmpty();
      return;
    }

    const values = frames.map((f) => f.deltaElevations[idx] ?? 0);
    const tMin = frames[0].timestampSeconds;
    const tMax = frames[frames.length - 1].timestampSeconds;
    const tSpan = tMax - tMin || 1;

    let vMin = Infinity;
    let vMax = -Infinity;
    for (const v of values) {
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    const padding = 4;
    const w = this.width - padding * 2;
    const h = this.height - padding * 2;
    const vSpan = Math.max(1e-6, vMax - vMin);

    const xAt = (i: number): number => padding + ((frames[i].timestampSeconds - tMin) / tSpan) * w;
    const yAt = (v: number): number => padding + h - ((v - vMin) / vSpan) * h;

    // y=0 축선
    if (vMin <= 0 && vMax >= 0) {
      const y0 = yAt(0);
      this.axis.setAttribute('x1', String(padding));
      this.axis.setAttribute('y1', String(y0));
      this.axis.setAttribute('x2', String(padding + w));
      this.axis.setAttribute('y2', String(y0));
    } else {
      this.axis.setAttribute('x1', '0');
      this.axis.setAttribute('y1', '-1');
      this.axis.setAttribute('x2', '0');
      this.axis.setAttribute('y2', '-1');
    }

    let d = '';
    for (let i = 0; i < values.length; i += 1) {
      const x = xAt(i);
      const y = yAt(values[i]);
      d += i === 0 ? `M${x.toFixed(1)} ${y.toFixed(1)}` : ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    this.path.setAttribute('d', d);

    this.stats.textContent = `min ${vMin.toFixed(2)}m · max ${vMax.toFixed(2)}m · final ${values[values.length - 1].toFixed(2)}m`;
    this.updateMarker();
  }

  private updateMarker(): void {
    const cell = this.currentCell;
    if (!cell) return;
    const frames = this.series.frames;
    if (frames.length === 0) return;

    const tMin = frames[0].timestampSeconds;
    const tMax = frames[frames.length - 1].timestampSeconds;
    const tSpan = tMax - tMin || 1;
    const t = Math.max(tMin, Math.min(tMax, this.currentTime));

    // 가장 가까운 프레임 찾기 (단조 증가 가정)
    let idx = 0;
    for (let i = 0; i < frames.length; i += 1) {
      if (frames[i].timestampSeconds <= t) idx = i;
      else break;
    }

    const padding = 4;
    const w = this.width - padding * 2;
    const h = this.height - padding * 2;

    const arr = frames.map(
      (f) => f.deltaElevations[cell.gridY * this.series.baseTerrain.width + cell.gridX] ?? 0,
    );
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const v of arr) {
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    const vSpan = Math.max(1e-6, vMax - vMin);

    const x = padding + ((t - tMin) / tSpan) * w;
    const y = padding + h - ((arr[idx] - vMin) / vSpan) * h;
    this.marker.setAttribute('cx', x.toFixed(1));
    this.marker.setAttribute('cy', y.toFixed(1));
  }

  public updateSeries(series: ScourSeries): void {
    this.series = series;
    this.currentCell = null;
    this.clear();
  }

  public dispose(): void {
    this.element.remove();
  }
}
