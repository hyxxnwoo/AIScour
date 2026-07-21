import type { Disposable } from '@/types/disposable';
import {
  EXPERIMENT_NUMERIC_META,
  EXPERIMENT_SELECT_META,
  type NumericSimParamKey,
  type SelectSimParamKey,
  type SimParams,
  type SimParamMeta,
  type SimSelectMeta,
  type PierArrangement,
  type BridgeType,
} from '@/types/simParams';

export interface ExperimentInfoPanelHandlers {
  onApply: (params: SimParams) => void;
}

export interface ExperimentInfoPanelOptions {
  liveApplyDebounceMs?: number;
}

interface RowControls {
  slider: HTMLInputElement;
  numInput: HTMLInputElement;
}

// ExperimentInfoPanel: FLOW-3D 실험 수조(플룸) 초기 조건을 편집하고 재시뮬레이션한다.
export class ExperimentInfoPanel implements Disposable {
  public readonly element: HTMLElement;
  private readonly values: SimParams;
  private readonly handlers: ExperimentInfoPanelHandlers;
  private readonly debounceMs: number;
  private readonly cleanups: Array<() => void> = [];
  private readonly numericRows = new Map<NumericSimParamKey, RowControls>();
  private readonly selectRows = new Map<SelectSimParamKey, HTMLSelectElement>();
  private pierCountButtons: HTMLButtonElement[] = [];
  private pierArrangementButtons: HTMLButtonElement[] = [];
  private bridgeTypeButtons: HTMLButtonElement[] = [];
  private bridgeCheckbox!: HTMLInputElement;
  private bridgeTypeRow!: HTMLElement;
  private isLoading = false;
  private applyBtn!: HTMLButtonElement;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private liveCheckbox!: HTMLInputElement;

  public constructor(
    initialParams: SimParams,
    handlers: ExperimentInfoPanelHandlers,
    options?: ExperimentInfoPanelOptions,
  ) {
    this.values = { ...initialParams };
    this.handlers = handlers;
    this.debounceMs = Math.max(0, options?.liveApplyDebounceMs ?? 380);

    this.element = document.createElement('div');
    this.element.className = 'experiment-info-panel';

    const title = document.createElement('div');
    title.className = 'experiment-info-panel__title';
    title.textContent = '실행 조건';
    this.element.appendChild(title);

    const hint = document.createElement('div');
    hint.className = 'experiment-info-panel__hint';
    hint.textContent = '초기 설정값 — 변경 후 적용 시 3D 재생성';
    this.element.appendChild(hint);

    const liveRow = document.createElement('label');
    liveRow.className = 'experiment-info-panel__live';
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

    const waterDepthMeta = EXPERIMENT_NUMERIC_META.find((m) => m.key === 'waterDepth')!;
    const pierMeta = EXPERIMENT_NUMERIC_META.find((m) => m.key === 'pierDiameter')!;
    const shapeMeta = EXPERIMENT_SELECT_META.find((m) => m.key === 'structureShape')!;
    this.element.appendChild(this.buildNumericRow(waterDepthMeta));
    this.element.appendChild(this.buildSelectRow(shapeMeta));
    this.element.appendChild(this.buildNumericRow(pierMeta));
    this.element.appendChild(this.buildPierCountRow());
    this.element.appendChild(this.buildPierArrangementRow());
    this.element.appendChild(this.buildBridgeToggleRow());
    this.bridgeTypeRow = this.buildBridgeTypeRow();
    this.element.appendChild(this.bridgeTypeRow);

    const structureHint = document.createElement('div');
    structureHint.className = 'experiment-info-panel__hint experiment-info-panel__hint--inline';
    structureHint.textContent = '기둥 배치·세굴은 재생성 / 교량은 시각만';
    this.element.appendChild(structureHint);

    this.applyBtn = document.createElement('button');
    this.applyBtn.className = 'experiment-info-panel__apply';
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

  private buildNumericRow(meta: SimParamMeta): HTMLElement {
    const row = document.createElement('div');
    row.className = 'experiment-info-panel__row';

    const header = document.createElement('div');
    header.className = 'experiment-info-panel__row-header';

    const labelEl = document.createElement('span');
    labelEl.className = 'experiment-info-panel__label';
    labelEl.textContent = meta.label;

    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.className = 'experiment-info-panel__number';
    numInput.min = String(meta.min);
    numInput.max = String(meta.max);
    numInput.step = String(meta.step);
    numInput.value = String(this.values[meta.key]);

    const unitEl = document.createElement('span');
    unitEl.className = 'experiment-info-panel__unit';
    unitEl.textContent = meta.unit;

    header.append(labelEl, numInput, unitEl);
    row.appendChild(header);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'experiment-info-panel__slider';
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

  private buildSelectRow(meta: SimSelectMeta): HTMLElement {
    const row = document.createElement('div');
    row.className = 'experiment-info-panel__row experiment-info-panel__row--select';

    const labelEl = document.createElement('span');
    labelEl.className = 'experiment-info-panel__label';
    labelEl.textContent = meta.label;

    const select = document.createElement('select');
    select.className = 'experiment-info-panel__select';
    for (const opt of meta.options) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      select.appendChild(option);
    }

    if (meta.key === 'structureShape') {
      select.value = this.values.structureShape;
    }

    this.selectRows.set(meta.key, select);

    const onChange = (): void => {
      this.values.structureShape = select.value as SimParams['structureShape'];
      this.scheduleLiveApply();
    };
    select.addEventListener('change', onChange);
    this.cleanups.push(() => select.removeEventListener('change', onChange));

    row.append(labelEl, select);
    return row;
  }

  private buildPierCountRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'experiment-info-panel__row experiment-info-panel__row--segments';

    const labelEl = document.createElement('span');
    labelEl.className = 'experiment-info-panel__label';
    labelEl.textContent = '기둥 개수';

    const segments = document.createElement('div');
    segments.className = 'experiment-info-panel__segments';
    segments.setAttribute('role', 'group');
    segments.setAttribute('aria-label', '기둥 개수');

    this.pierCountButtons = [];
    for (const count of [1, 2, 3] as const) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'experiment-info-panel__segment';
      btn.textContent = String(count);
      btn.setAttribute('aria-pressed', String(this.values.pierCount === count));
      if (this.values.pierCount === count) btn.classList.add('is-active');

      const onClick = (): void => {
        this.values.pierCount = count;
        this.syncPierCountButtons();
        this.scheduleLiveApply();
      };
      btn.addEventListener('click', onClick);
      this.cleanups.push(() => btn.removeEventListener('click', onClick));
      this.pierCountButtons.push(btn);
      segments.appendChild(btn);
    }

    row.append(labelEl, segments);
    return row;
  }

  private buildPierArrangementRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'experiment-info-panel__row experiment-info-panel__row--segments';

    const labelEl = document.createElement('span');
    labelEl.className = 'experiment-info-panel__label';
    labelEl.textContent = '배치 방향';

    const segments = document.createElement('div');
    segments.className = 'experiment-info-panel__segments';
    segments.setAttribute('role', 'group');
    segments.setAttribute('aria-label', '기둥 배치 방향');

    const options: Array<{ value: PierArrangement; label: string }> = [
      { value: 'across', label: '세로' },
      { value: 'along', label: '가로' },
    ];

    this.pierArrangementButtons = [];
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'experiment-info-panel__segment';
      btn.textContent = opt.label;
      btn.dataset.value = opt.value;
      btn.setAttribute('aria-pressed', String(this.values.pierArrangement === opt.value));
      if (this.values.pierArrangement === opt.value) btn.classList.add('is-active');

      const onClick = (): void => {
        this.values.pierArrangement = opt.value;
        this.syncPierArrangementButtons();
        this.scheduleLiveApply();
      };
      btn.addEventListener('click', onClick);
      this.cleanups.push(() => btn.removeEventListener('click', onClick));
      this.pierArrangementButtons.push(btn);
      segments.appendChild(btn);
    }

    row.append(labelEl, segments);
    return row;
  }

  private buildBridgeToggleRow(): HTMLElement {
    const row = document.createElement('label');
    row.className = 'experiment-info-panel__row experiment-info-panel__row--toggle';

    const labelEl = document.createElement('span');
    labelEl.className = 'experiment-info-panel__label';
    labelEl.textContent = '교량';

    this.bridgeCheckbox = document.createElement('input');
    this.bridgeCheckbox.type = 'checkbox';
    this.bridgeCheckbox.checked = this.values.bridgeEnabled;

    const toggleText = document.createElement('span');
    toggleText.className = 'experiment-info-panel__toggle-text';
    toggleText.textContent = '설치';

    const onChange = (): void => {
      this.values.bridgeEnabled = this.bridgeCheckbox.checked;
      this.syncBridgeTypeRowVisibility();
      this.scheduleLiveApply();
    };
    this.bridgeCheckbox.addEventListener('change', onChange);
    this.cleanups.push(() => this.bridgeCheckbox.removeEventListener('change', onChange));

    row.append(labelEl, this.bridgeCheckbox, toggleText);
    return row;
  }

  private buildBridgeTypeRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'experiment-info-panel__row experiment-info-panel__row--segments';

    const labelEl = document.createElement('span');
    labelEl.className = 'experiment-info-panel__label';
    labelEl.textContent = '교량 형식';

    const segments = document.createElement('div');
    segments.className = 'experiment-info-panel__segments experiment-info-panel__segments--bridge-type';
    segments.setAttribute('role', 'group');
    segments.setAttribute('aria-label', '교량 형식');

    const options: Array<{ value: BridgeType; label: string }> = [
      { value: 'suspension', label: '현수교' },
      { value: 'cable-stayed', label: '사장교' },
      { value: 'arch', label: '아치교' },
      { value: 'girder', label: '거더교' },
    ];

    this.bridgeTypeButtons = [];
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'experiment-info-panel__segment';
      btn.textContent = opt.label;
      btn.dataset.value = opt.value;
      btn.setAttribute('aria-pressed', String(this.values.bridgeType === opt.value));
      if (this.values.bridgeType === opt.value) btn.classList.add('is-active');

      const onClick = (): void => {
        this.values.bridgeType = opt.value;
        if (!this.values.bridgeEnabled) {
          this.values.bridgeEnabled = true;
          this.bridgeCheckbox.checked = true;
        }
        this.syncBridgeTypeButtons();
        this.syncBridgeTypeRowVisibility();
        this.scheduleLiveApply();
      };
      btn.addEventListener('click', onClick);
      this.cleanups.push(() => btn.removeEventListener('click', onClick));
      this.bridgeTypeButtons.push(btn);
      segments.appendChild(btn);
    }

    row.append(labelEl, segments);
    this.syncBridgeTypeRowVisibility();
    return row;
  }

  private syncBridgeTypeButtons(): void {
    for (const btn of this.bridgeTypeButtons) {
      const value = btn.dataset.value as BridgeType;
      const active = this.values.bridgeType === value;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  private syncBridgeTypeRowVisibility(): void {
    if (!this.bridgeTypeRow) return;
    this.bridgeTypeRow.style.opacity = this.values.bridgeEnabled ? '1' : '0.55';
    for (const btn of this.bridgeTypeButtons) {
      btn.disabled = !this.values.bridgeEnabled;
    }
  }

  private syncPierCountButtons(): void {
    for (const btn of this.pierCountButtons) {
      const count = Number(btn.textContent);
      const active = this.values.pierCount === count;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  private syncPierArrangementButtons(): void {
    for (const btn of this.pierArrangementButtons) {
      const value = btn.dataset.value as PierArrangement;
      const active = this.values.pierArrangement === value;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  public setParams(params: SimParams): void {
    Object.assign(this.values, params);
    for (const meta of EXPERIMENT_NUMERIC_META) {
      const controls = this.numericRows.get(meta.key);
      if (!controls) continue;
      const v = this.values[meta.key];
      controls.slider.value = String(v);
      controls.numInput.value = String(v);
    }
    const shapeSelect = this.selectRows.get('structureShape');
    if (shapeSelect) shapeSelect.value = this.values.structureShape;
    this.syncPierCountButtons();
    this.syncPierArrangementButtons();
    this.syncBridgeTypeButtons();
    this.syncBridgeTypeRowVisibility();
    if (this.bridgeCheckbox) this.bridgeCheckbox.checked = this.values.bridgeEnabled;
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
