import type { Disposable } from '@/types/disposable';

export interface FluidTimeSeriesInput {
  /** 초 단위 시각(오름차순). */
  times: number[];
  /** times 와 같은 길이의 값. */
  values: number[];
  /** 예: "u (x 방향 유속)" */
  label: string;
  /** 예: "m/s" */
  unit: string;
  /** 라인·마커 색상(CSS). */
  colorHex: string;
}

/**
 * FluidTimeSeriesChart: CSV 프로브 시계열(u/v/w/scrdif)을 SVG 라인 차트로 오버레이한다.
 * 재생 중인 현재 시점을 세로선 + 점 마커로 표시해 "지금 어디까지 진행됐는지"를 직관적으로 보여준다.
 */
export class FluidTimeSeriesChart implements Disposable {
  public readonly element: HTMLElement;
  private readonly titleEl: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly axis: SVGLineElement;
  private readonly path: SVGPathElement;
  private readonly cursorLine: SVGLineElement;
  private readonly marker: SVGCircleElement;
  private readonly currentEl: HTMLDivElement;
  private readonly width: number;
  private readonly height: number;
  private readonly padding = 6;

  private times: number[] = [];
  private values: number[] = [];
  private unit = '';
  private vMin = 0;
  private vMax = 1;
  private tMin = 0;
  private tMax = 1;

  public constructor(options: { width?: number; height?: number } = {}) {
    this.width = options.width ?? 360;
    this.height = options.height ?? 88;

    this.element = document.createElement('div');
    this.element.className = 'fluid-timeseries';

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'fluid-timeseries__title';
    this.element.appendChild(this.titleEl);

    const NS = 'http://www.w3.org/2000/svg';
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.svg.setAttribute('width', String(this.width));
    this.svg.setAttribute('height', String(this.height));
    this.svg.classList.add('fluid-timeseries__svg');

    this.axis = document.createElementNS(NS, 'line');
    this.axis.setAttribute('stroke', 'rgba(255,255,255,0.22)');
    this.axis.setAttribute('stroke-dasharray', '2 3');

    this.path = document.createElementNS(NS, 'path');
    this.path.setAttribute('fill', 'none');
    this.path.setAttribute('stroke-width', '1.6');

    this.cursorLine = document.createElementNS(NS, 'line');
    this.cursorLine.setAttribute('stroke', 'rgba(244, 211, 94, 0.55)');
    this.cursorLine.setAttribute('stroke-width', '1');

    this.marker = document.createElementNS(NS, 'circle');
    this.marker.setAttribute('r', '3.2');
    this.marker.setAttribute('fill', '#f4d35e');

    this.svg.append(this.axis, this.path, this.cursorLine, this.marker);
    this.element.appendChild(this.svg);

    this.currentEl = document.createElement('div');
    this.currentEl.className = 'fluid-timeseries__current';
    this.element.appendChild(this.currentEl);
  }

  public setVisible(visible: boolean): void {
    this.element.style.display = visible ? '' : 'none';
  }

  /** 선택 항목의 전체 시계열을 다시 그린다. */
  public setSeries(input: FluidTimeSeriesInput): void {
    this.times = input.times;
    this.values = input.values;
    this.unit = input.unit;
    this.titleEl.textContent = `${input.label} — 시간에 따른 변화`;
    this.path.setAttribute('stroke', input.colorHex);
    this.marker.setAttribute('fill', input.colorHex);

    this.tMin = this.times[0] ?? 0;
    this.tMax = this.times[this.times.length - 1] ?? 1;
    if (this.tMax <= this.tMin) this.tMax = this.tMin + 1;

    this.vMin = Infinity;
    this.vMax = -Infinity;
    for (const v of this.values) {
      if (v < this.vMin) this.vMin = v;
      if (v > this.vMax) this.vMax = v;
    }
    if (!isFinite(this.vMin) || !isFinite(this.vMax) || this.vMin === this.vMax) {
      this.vMin = 0;
      this.vMax = 1;
    }

    const w = this.width - this.padding * 2;
    const h = this.height - this.padding * 2;
    const xAt = (t: number): number =>
      this.padding + ((t - this.tMin) / (this.tMax - this.tMin)) * w;
    const yAt = (v: number): number =>
      this.padding + h - ((v - this.vMin) / (this.vMax - this.vMin)) * h;

    if (this.vMin <= 0 && this.vMax >= 0) {
      const y0 = yAt(0);
      this.axis.setAttribute('x1', String(this.padding));
      this.axis.setAttribute('y1', String(y0));
      this.axis.setAttribute('x2', String(this.padding + w));
      this.axis.setAttribute('y2', String(y0));
      this.axis.style.display = '';
    } else {
      this.axis.style.display = 'none';
    }

    let d = '';
    for (let i = 0; i < this.values.length; i += 1) {
      const x = xAt(this.times[i]!);
      const y = yAt(this.values[i]!);
      d += i === 0 ? `M${x.toFixed(1)} ${y.toFixed(1)}` : ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    this.path.setAttribute('d', d);
  }

  /** 현재 재생 시각으로 세로 커서·마커·현재값 라벨을 갱신한다. */
  public setTime(timeSeconds: number): void {
    if (this.values.length === 0) return;
    const t = Math.max(this.tMin, Math.min(this.tMax, timeSeconds));

    let idx = 0;
    for (let i = 0; i < this.times.length; i += 1) {
      if (this.times[i]! <= t) idx = i;
      else break;
    }

    const w = this.width - this.padding * 2;
    const h = this.height - this.padding * 2;
    const x = this.padding + ((t - this.tMin) / (this.tMax - this.tMin)) * w;
    const value = this.values[idx]!;
    const y = this.padding + h - ((value - this.vMin) / (this.vMax - this.vMin)) * h;

    this.cursorLine.setAttribute('x1', x.toFixed(1));
    this.cursorLine.setAttribute('y1', String(this.padding));
    this.cursorLine.setAttribute('x2', x.toFixed(1));
    this.cursorLine.setAttribute('y2', String(this.padding + h));
    this.marker.setAttribute('cx', x.toFixed(1));
    this.marker.setAttribute('cy', y.toFixed(1));

    this.currentEl.textContent = `현재값: ${formatScientific(value)} ${this.unit} · t=${t.toFixed(0)}s`;
  }

  public dispose(): void {
    this.element.remove();
  }
}

function formatScientific(v: number): string {
  if (!isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 0.01 || abs >= 1000)) {
    return v.toExponential(2);
  }
  return v.toFixed(3);
}
