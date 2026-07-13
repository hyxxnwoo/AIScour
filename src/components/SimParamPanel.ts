import type { Disposable } from '@/types/disposable';
import { SIM_PARAM_META, type NumericSimParamKey, type SimParams } from '@/types/simParams';

export interface SimParamPanelHandlers {
  onApply: (params: SimParams) => void;
}

export interface SimParamPanelOptions {
  /** 실시간 적용 디바운스(ms). 기본 380 */
  liveApplyDebounceMs?: number;
}

// SimParamPanel: 시뮬레이션 파라미터를 슬라이더 + 숫자 입력으로 직접 조절하고
// "적용" 버튼 또는 실시간(디바운스) 모드로 시뮬레이션을 재실행하는 컨트롤 패널.
export class SimParamPanel implements Disposable {
  public readonly element: HTMLElement;
  private readonly values: SimParams;
  private readonly handlers: SimParamPanelHandlers;
  private readonly debounceMs: number;
  private readonly cleanups: Array<() => void> = [];
  private readonly numericRows = new Map<NumericSimParamKey, { slider: HTMLInputElement; numInput: HTMLInputElement }>();
  private isLoading = false;
  private applyBtn!: HTMLButtonElement;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private liveCheckbox!: HTMLInputElement;

  public constructor(
    initialParams: SimParams,
    handlers: SimParamPanelHandlers,
    options?: SimParamPanelOptions,
  ) {
    this.values = { ...initialParams };
    this.handlers = handlers;
    this.debounceMs = Math.max(0, options?.liveApplyDebounceMs ?? 380);

    this.element = document.createElement('div');
    this.element.className = 'sim-param-panel';

    const title = document.createElement('div');
    title.className = 'sim-param-panel__title';
    title.textContent = '시뮬레이션 파라미터';
    this.element.appendChild(title);

    const liveRow = document.createElement('label');
    liveRow.className = 'sim-param-panel__live';
    this.liveCheckbox = document.createElement('input');
    this.liveCheckbox.type = 'checkbox';
    this.liveCheckbox.checked = this.debounceMs > 0;
    if (this.debounceMs <= 0) {
      this.liveCheckbox.checked = false;
      this.liveCheckbox.disabled = true;
    }
    const liveText = document.createElement('span');
    liveText.textContent =
      this.debounceMs > 0
        ? `값 변경 시 자동 재생성 (${this.debounceMs}ms 디바운스)`
        : '자동 재생성 비활성 — 적용 버튼만 사용';
    liveRow.append(this.liveCheckbox, liveText);
    const onLiveChange = (): void => {
      if (!this.liveCheckbox.checked && this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
    };
    this.liveCheckbox.addEventListener('change', onLiveChange);
    this.cleanups.push(() => this.liveCheckbox.removeEventListener('change', onLiveChange));
    this.element.appendChild(liveRow);

    for (const meta of SIM_PARAM_META) {
      this.element.appendChild(this.buildRow(meta));
    }

    this.applyBtn = document.createElement('button');
    this.applyBtn.className = 'sim-param-panel__apply';
    this.applyBtn.textContent = '적용 (재시뮬레이션)';
    const onApplyClick = (): void => {
      if (this.isLoading) return;
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this.handlers.onApply({ ...this.values });
    };
    this.applyBtn.addEventListener('click', onApplyClick);
    this.cleanups.push(() => this.applyBtn.removeEventListener('click', onApplyClick));
    this.element.appendChild(this.applyBtn);
  }

  private scheduleLiveApply(): void {
    if (!this.liveCheckbox.checked || this.debounceMs <= 0 || this.isLoading) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (!this.isLoading) this.handlers.onApply({ ...this.values });
    }, this.debounceMs);
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

    this.numericRows.set(meta.key, { slider, numInput });

    const syncNumFromSlider = (): void => {
      const v = Number(slider.value);
      this.values[meta.key] = v;
      numInput.value = String(v);
    };

    const applyNumValue = (): void => {
      if (numInput.value.trim() === '') return;
      const raw = Number(numInput.value);
      if (!Number.isFinite(raw)) return;
      const clamped = Math.min(meta.max, Math.max(meta.min, raw));
      this.values[meta.key] = clamped;
      slider.value = String(clamped);
      numInput.value = String(clamped);
      this.scheduleLiveApply();
    };

    const onSlider = (): void => {
      syncNumFromSlider();
      this.scheduleLiveApply();
    };
    slider.addEventListener('input', onSlider);
    this.cleanups.push(() => slider.removeEventListener('input', onSlider));

    numInput.addEventListener('change', applyNumValue);
    this.cleanups.push(() => numInput.removeEventListener('change', applyNumValue));

    numInput.addEventListener('input', applyNumValue);
    this.cleanups.push(() => numInput.removeEventListener('input', applyNumValue));

    return row;
  }

  public setParams(params: SimParams): void {
    Object.assign(this.values, params);
    for (const meta of SIM_PARAM_META) {
      const controls = this.numericRows.get(meta.key);
      if (!controls) continue;
      const v = this.values[meta.key];
      controls.slider.value = String(v);
      controls.numInput.value = String(v);
    }
  }

  public getParams(): SimParams {
    return { ...this.values };
  }

  public setLoading(loading: boolean): void {
    if (loading && this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.isLoading = loading;
    this.applyBtn.disabled = loading;
    this.applyBtn.textContent = loading ? '시뮬레이션 생성 중…' : '적용 (재시뮬레이션)';
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const fn of this.cleanups) fn();
    this.element.remove();
  }
}
