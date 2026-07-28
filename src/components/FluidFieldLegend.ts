import type { Disposable } from '@/types/disposable';
import type { FluidQuantity } from '@/types/fluid';
import { legendGradientForFluidQuantity } from '@/utils/fluidQuantityColor';

/**
 * FluidFieldLegend: 3D 씬 위에 떠 있는 컴팩트 범례 카드.
 * 선택한 항목(u/v/w/scrdif)의 라벨·컬러바·min/0/max 수치·현재값을 한눈에 보여줘
 * "이 색이 무엇을 뜻하는지"를 즉시 이해할 수 있게 한다.
 */
export class FluidFieldLegend implements Disposable {
  public readonly element: HTMLElement;
  private readonly titleEl: HTMLDivElement;
  private readonly barEl: HTMLDivElement;
  private readonly cursorEl: HTMLDivElement;
  private readonly minEl: HTMLSpanElement;
  private readonly midEl: HTMLSpanElement;
  private readonly maxEl: HTMLSpanElement;
  private readonly currentEl: HTMLDivElement;
  private readonly noteEl: HTMLDivElement;
  private min = 0;
  private max = 1;
  private unit = '';

  public constructor() {
    this.element = document.createElement('div');
    this.element.className = 'fluid-field-legend';

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'fluid-field-legend__title';
    this.element.appendChild(this.titleEl);

    const barWrap = document.createElement('div');
    barWrap.className = 'fluid-field-legend__bar-wrap';
    this.barEl = document.createElement('div');
    this.barEl.className = 'fluid-field-legend__bar';
    this.cursorEl = document.createElement('div');
    this.cursorEl.className = 'fluid-field-legend__cursor';
    barWrap.append(this.barEl, this.cursorEl);
    this.element.appendChild(barWrap);

    const scale = document.createElement('div');
    scale.className = 'fluid-field-legend__scale';
    this.minEl = document.createElement('span');
    this.midEl = document.createElement('span');
    this.maxEl = document.createElement('span');
    scale.append(this.minEl, this.midEl, this.maxEl);
    this.element.appendChild(scale);

    this.noteEl = document.createElement('div');
    this.noteEl.className = 'fluid-field-legend__note';
    this.element.appendChild(this.noteEl);

    this.currentEl = document.createElement('div');
    this.currentEl.className = 'fluid-field-legend__current';
    this.element.appendChild(this.currentEl);
  }

  public setVisible(visible: boolean): void {
    this.element.style.display = visible ? '' : 'none';
  }

  public setQuantity(
    q: FluidQuantity,
    label: string,
    range: { min: number; max: number },
    unit: string,
    note = '',
  ): void {
    this.min = range.min;
    this.max = range.max;
    this.unit = unit;
    this.titleEl.textContent = label;
    this.barEl.style.background = legendGradientForFluidQuantity(q, 'to right');
    this.minEl.textContent = `${formatScientific(this.min)} ${unit}`;
    this.midEl.textContent =
      this.min < 0 && this.max > 0 ? '0' : formatScientific((this.min + this.max) / 2);
    this.maxEl.textContent = `${formatScientific(this.max)} ${unit}`;
    this.noteEl.textContent = note;
    this.noteEl.style.display = note ? '' : 'none';
  }

  public setCurrentValue(value: number): void {
    const span = this.max - this.min || 1;
    const frac = Math.max(0, Math.min(1, (value - this.min) / span));
    this.cursorEl.style.left = `${(frac * 100).toFixed(1)}%`;
    this.currentEl.textContent = `현재: ${formatScientific(value)} ${this.unit}`;
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
