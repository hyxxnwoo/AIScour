import type { Disposable } from '@/types/disposable';
import { SCENE_BACKGROUND_COLOR } from '@/constants/scene';

export interface DashboardCustomizeHandlers {
  onBackgroundHex: (hex: string) => void;
  onFluidSliceOpacity: (v: number) => void;
}

function hexNumToCss(hex: number): string {
  const n = hex >>> 0;
  return `#${n.toString(16).padStart(6, '0')}`;
}

// 즉시 반영되는 시각 설정(배경·유체 불투명도)
export class DashboardCustomizePanel implements Disposable {
  public readonly element: HTMLElement;
  private readonly handlers: DashboardCustomizeHandlers;
  private readonly cleanups: Array<() => void> = [];

  public constructor(handlers: DashboardCustomizeHandlers) {
    this.handlers = handlers;
    this.element = document.createElement('div');
    this.element.className = 'dashboard-customize';
    this.element.appendChild(this.buildVisualSection(hexNumToCss(SCENE_BACKGROUND_COLOR)));
  }

  private buildVisualSection(initialBg: string): HTMLElement {
    const section = document.createElement('div');
    section.className = 'dashboard-customize__section';

    const bgRow = document.createElement('div');
    bgRow.className = 'dashboard-customize__row';
    const bgLab = document.createElement('label');
    bgLab.className = 'dashboard-customize__label';
    bgLab.textContent = '배경색';
    const bgInput = document.createElement('input');
    bgInput.type = 'color';
    bgInput.className = 'dashboard-customize__color';
    bgInput.value = initialBg;
    const onBg = (): void => this.handlers.onBackgroundHex(bgInput.value);
    
    // 배경색 변경 시 즉시 반영
    bgInput.addEventListener('input', onBg);
    this.cleanups.push(() => bgInput.removeEventListener('input', onBg));
    bgRow.append(bgLab, bgInput);
    section.appendChild(bgRow);

    section.appendChild(
      this.sliderRow({
        label: '유체 단면 불투명도',
        min: 0.1,
        max: 1,
        step: 0.05,
        initial: 0.92,
        onInput: (v) => this.handlers.onFluidSliceOpacity(v),
      }),
    );

    return section;
  }

  private sliderRow(opts: {
    label: string;
    min: number;
    max: number;
    step: number;
    initial: number;
    format?: (v: number) => string;
    onInput: (v: number) => void;
  }): HTMLElement {
    const row = document.createElement('div');
    row.className = 'dashboard-customize__row dashboard-customize__row--slider';

    const labWrap = document.createElement('div');
    labWrap.className = 'dashboard-customize__row-head';
    const lab = document.createElement('span');
    lab.className = 'dashboard-customize__label';
    lab.textContent = opts.label;
    const val = document.createElement('span');
    val.className = 'dashboard-customize__value';
    const fmt = opts.format ?? ((v: number) => v.toFixed(2));
    val.textContent = fmt(opts.initial);
    labWrap.append(lab, val);

    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(opts.min);
    range.max = String(opts.max);
    range.step = String(opts.step);
    range.value = String(opts.initial);
    range.className = 'dashboard-customize__slider';

    const onIn = (): void => {
      const v = Number(range.value);
      val.textContent = fmt(v);
      opts.onInput(v);
    };
    range.addEventListener('input', onIn);
    this.cleanups.push(() => range.removeEventListener('input', onIn));

    row.append(labWrap, range);
    return row;
  }

  public dispose(): void {
    for (const fn of this.cleanups) fn();
    this.element.remove();
  }
}
