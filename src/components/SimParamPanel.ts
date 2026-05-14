import type { Disposable } from '@/types/disposable';
import { SIM_PARAM_META, type SimParams } from '@/types/simParams';

export interface SimParamPanelHandlers {
  onApply: (params: SimParams) => void;
}

// SimParamPanel: 시뮬레이션 파라미터를 슬라이더 + 숫자 입력으로 직접 조절하고
// "적용" 버튼으로 시뮬레이션을 재실행하는 컨트롤 패널.
export class SimParamPanel implements Disposable {
  public readonly element: HTMLElement;
  private readonly values: SimParams;
  private readonly cleanups: Array<() => void> = [];
  private isLoading = false;
  private applyBtn!: HTMLButtonElement;

  public constructor(initialParams: SimParams, handlers: SimParamPanelHandlers) {
    this.values = { ...initialParams };

    this.element = document.createElement('div');
    this.element.className = 'sim-param-panel';

    const title = document.createElement('div');
    title.className = 'sim-param-panel__title';
    title.textContent = '시뮬레이션 파라미터';
    this.element.appendChild(title);

    for (const meta of SIM_PARAM_META) {
      this.element.appendChild(this.buildRow(meta));
    }

    this.applyBtn = document.createElement('button');
    this.applyBtn.className = 'sim-param-panel__apply';
    this.applyBtn.textContent = '적용 (재시뮬레이션)';
    const onApply = (): void => {
      if (this.isLoading) return;
      handlers.onApply({ ...this.values });
    };
    this.applyBtn.addEventListener('click', onApply);
    this.cleanups.push(() => this.applyBtn.removeEventListener('click', onApply));
    this.element.appendChild(this.applyBtn);
  }

  private buildRow(meta: (typeof SIM_PARAM_META)[number]): HTMLElement {
    const row = document.createElement('div');
    row.className = 'sim-param-panel__row';

    const header = document.createElement('div');
    header.className = 'sim-param-panel__row-header';

    const labelEl = document.createElement('span');
    labelEl.className = 'sim-param-panel__label';
    labelEl.textContent = meta.label;

    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.className = 'sim-param-panel__number';
    numInput.min = String(meta.min);
    numInput.max = String(meta.max);
    numInput.step = String(meta.step);
    numInput.value = String(this.values[meta.key]);

    const unitEl = document.createElement('span');
    unitEl.className = 'sim-param-panel__unit';
    unitEl.textContent = meta.unit;

    header.append(labelEl, numInput, unitEl);
    row.appendChild(header);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'sim-param-panel__slider';
    slider.min = String(meta.min);
    slider.max = String(meta.max);
    slider.step = String(meta.step);
    slider.value = String(this.values[meta.key]);
    row.appendChild(slider);

    // 슬라이더 → 숫자 입력 동기화
    const onSlider = (): void => {
      const v = Number(slider.value);
      this.values[meta.key] = v;
      numInput.value = String(v);
    };
    slider.addEventListener('input', onSlider);
    this.cleanups.push(() => slider.removeEventListener('input', onSlider));

    // 숫자 입력 → 슬라이더 동기화
    const onNum = (): void => {
      const raw = Number(numInput.value);
      const clamped = Math.min(meta.max, Math.max(meta.min, raw));
      this.values[meta.key] = clamped;
      slider.value = String(clamped);
    };
    numInput.addEventListener('change', onNum);
    this.cleanups.push(() => numInput.removeEventListener('change', onNum));

    return row;
  }

  // 재시뮬레이션 진행 중 버튼 비활성화
  public setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.applyBtn.disabled = loading;
    this.applyBtn.textContent = loading ? '시뮬레이션 생성 중…' : '적용 (재시뮬레이션)';
  }

  public dispose(): void {
    for (const fn of this.cleanups) fn();
    this.element.remove();
  }
}
