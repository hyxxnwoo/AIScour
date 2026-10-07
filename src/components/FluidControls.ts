import type { FluidQuantity } from '@/types/fluid';
import type { Disposable } from '@/types/disposable';
import { fluidColorRampToCss } from '@/utils/fluidColorRamp';
import { legendGradientForFluidQuantity } from '@/utils/fluidQuantityColor';
import {
  FLUID_FIELD_META,
  FLUID_QUANTITY_PARAM_KEYS,
  type FluidDashboardQuantity,
  type NumericSimParamKey,
  type SimParams,
} from '@/types/simParams';

export interface FluidControlsHandlers {
  onQuantitiesChange: (selected: FluidQuantity[], primary: FluidQuantity) => void;
  onApply: (params: SimParams) => void;
  onSliceHeightChange: (yMeters: number) => void;
  onSliceVisibilityChange: (visible: boolean) => void;
  onTracersVisibilityChange: (visible: boolean) => void;
}

export interface FluidControlsOptions {
  initialParams: SimParams;
  initialQuantities?: FluidQuantity[];
  initialPrimary?: FluidQuantity;
  minHeight: number;
  maxHeight: number;
  initialHeight: number;
  liveApplyDebounceMs?: number;
  /** 유체 추적 입자(흐름 스트릭) 기본값 (기본 true) */
  initialTracersVisible?: boolean;
  velocityUnit?: string;
  scrdifUnit?: string;
  /** true 이면 u/v/w/scrdif 입력·적용만 비활성 (표시 옵션은 조작 가능) */
  readOnlyField?: boolean;
}

export interface ProbeReadoutValues {
  u: number;
  v: number;
  w: number;
  scrdif: number;
  t?: number;
  rowIndex?: number;
}

export interface FluidRangeEntry {
  quantity: FluidQuantity;
  label: string;
  min: number;
  max: number;
  unit: string;
  primary?: boolean;
}

const QUANTITY_LABELS: Record<FluidQuantity, string> = {
  speed: '속도 |U|',
  pressure: '압력 P',
  density: '밀도 ρ',
  velocityX: '유속 X (유입 −X)',
  velocityY: '유속 Y (연직)',
  velocityZ: '유속 Z (횡단)',
  tke: 'TKE',
  dtke: 'dTKE',
  mhyfd: '수리깊이',
  shrvel: '전단속도',
  davel: '깊이평균유속',
  ofvel: '표면유속',
  scrdif: '하상 변화 (scrdif)',
};

const QUANTITY_TOOLTIPS: Partial<Record<FluidDashboardQuantity, string>> = {
  velocityX: 'CSV u · −X 유입 방향',
  velocityY: 'CSV w · 연직(Y)',
  velocityZ: 'CSV v · 횡단(Z)',
  scrdif: '초기 지반 대비 세굴(−) / 퇴적(+)',
};

/** 유체 필드 대시보드에 표시할 물리량 */
export const FLUID_DASHBOARD_QUANTITIES: FluidDashboardQuantity[] = [
  'velocityX',
  'velocityY',
  'velocityZ',
  'scrdif',
];

// FluidControls: 유체 시각화 옵션 패널 (좌측 중간).
// - 표시 양 체크박스 + u/v/w/scrdif 값 입력
// - 슬라이스 가시성 + 높이 슬라이더
// - 컬러 범례 + 현재 데이터 범위 표시
export class FluidControls implements Disposable {
  public readonly element: HTMLElement;
  private readonly values: SimParams;
  private readonly handlers: FluidControlsHandlers;
  private readonly debounceMs: number;
  private readonly heightSlider: HTMLInputElement;
  private readonly heightLabel: HTMLSpanElement;
  private readonly rangeLabel: HTMLSpanElement;
  private readonly legendBar: HTMLElement;
  private readonly quantityInputs = new Map<FluidQuantity, HTMLInputElement>();
  private readonly valueInputs = new Map<NumericSimParamKey, HTMLInputElement>();
  private selectedQuantities!: Set<FluidQuantity>;
  private primaryQuantity!: FluidQuantity;
  private readonly sliceToggle: HTMLInputElement;
  private readonly tracersToggle: HTMLInputElement;
  private readonly tracersNoticeEl: HTMLDivElement;
  private readonly applyBtn: HTMLButtonElement;
  private readonly liveCheckbox: HTMLInputElement;
  private readonly liveRow: HTMLElement;
  private readonly readOnlyNoticeEl: HTMLDivElement;
  private readonly readoutEls = new Map<FluidQuantity, HTMLSpanElement>();
  private readonly probeMetaEl: HTMLSpanElement;
  private _probeMode = false;
  private setupMode = false;
  private readonly listenerCleanups: Array<() => void> = [];
  private isLoading = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readOnlyField = false;

  public constructor(options: FluidControlsOptions, handlers: FluidControlsHandlers) {
    this.values = { ...options.initialParams };
    this.handlers = handlers;
    this.debounceMs = Math.max(0, options.liveApplyDebounceMs ?? 380);

    this.element = document.createElement('section');
    this.element.className = 'fluid-controls';

    const title = document.createElement('div');
    title.className = 'fluid-controls__title';
    title.textContent = '유체 필드';
    this.element.appendChild(title);

    const initialSelected = new Set(
      options.initialQuantities?.length
        ? options.initialQuantities
        : [FLUID_DASHBOARD_QUANTITIES[0]],
    );
    if (initialSelected.size === 0) {
      initialSelected.add(FLUID_DASHBOARD_QUANTITIES[0]);
    }
    this.selectedQuantities = new Set(initialSelected);
    this.primaryQuantity =
      options.initialPrimary && initialSelected.has(options.initialPrimary)
        ? options.initialPrimary
        : FLUID_DASHBOARD_QUANTITIES.find((q) => initialSelected.has(q))!;

    const quantityGroup = document.createElement('div');
    quantityGroup.className = 'fluid-controls__fields';
    for (const q of FLUID_DASHBOARD_QUANTITIES) {
      const paramKey = FLUID_QUANTITY_PARAM_KEYS[q];
      const meta = FLUID_FIELD_META.find((m) => m.key === paramKey)!;
      const row = document.createElement('div');
      row.className = 'fluid-controls__field-row';

      const id = `fluid-q-${q}`;
      const wrap = document.createElement('label');
      wrap.htmlFor = id;
      wrap.className = 'fluid-controls__check';
      wrap.dataset.quantity = q;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      input.value = q;
      input.checked = this.selectedQuantities.has(q);
      const onChange = (): void => {
        this.handleQuantityToggle(q, input, handlers);
      };
      input.addEventListener('change', onChange);
      this.listenerCleanups.push(() => input.removeEventListener('change', onChange));
      this.quantityInputs.set(q, input);
      const text = document.createElement('span');
      text.textContent = QUANTITY_LABELS[q];
      const tip = QUANTITY_TOOLTIPS[q];
      if (tip) text.title = tip;
      wrap.append(input, text);
      row.appendChild(wrap);

      const numInput = document.createElement('input');
      numInput.type = 'number';
      numInput.className = 'fluid-controls__value-input';
      numInput.min = String(meta.min);
      numInput.max = String(meta.max);
      numInput.step = String(meta.step);
      numInput.value = String(this.values[paramKey]);
      this.valueInputs.set(paramKey, numInput);

      const readout = document.createElement('span');
      readout.className = 'fluid-controls__readout';
      readout.hidden = true;
      readout.textContent = formatScientific(this.values[paramKey]);
      this.readoutEls.set(q, readout);

      const applyNumValue = (): void => {
        if (numInput.value.trim() === '') return;
        const raw = Number(numInput.value);
        if (!Number.isFinite(raw)) return;
        const clamped = Math.min(meta.max, Math.max(meta.min, raw));
        this.values[paramKey] = clamped;
        numInput.value = String(clamped);
        this.scheduleLiveApply();
      };
      numInput.addEventListener('change', applyNumValue);
      this.listenerCleanups.push(() => numInput.removeEventListener('change', applyNumValue));
      numInput.addEventListener('input', applyNumValue);
      this.listenerCleanups.push(() => numInput.removeEventListener('input', applyNumValue));

      const unitEl = document.createElement('span');
      unitEl.className = 'fluid-controls__unit';
      unitEl.textContent = meta.unit;
      row.append(numInput, readout, unitEl);
      quantityGroup.appendChild(row);
    }
    this.syncPrimaryMarkers();
    this.element.appendChild(quantityGroup);

    this.probeMetaEl = document.createElement('span');
    this.probeMetaEl.className = 'fluid-controls__probe-meta';
    this.probeMetaEl.hidden = true;
    this.element.appendChild(this.probeMetaEl);

    const liveRow = document.createElement('label');
    liveRow.className = 'fluid-controls__live';
    this.liveRow = liveRow;
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
    this.listenerCleanups.push(() => this.liveCheckbox.removeEventListener('change', onLiveChange));
    this.element.appendChild(liveRow);

    this.readOnlyNoticeEl = document.createElement('div');
    this.readOnlyNoticeEl.className = 'fluid-controls__read-only-notice';
    this.readOnlyNoticeEl.hidden = true;
    this.readOnlyNoticeEl.textContent =
      '뷰어 모드 — u/v/w·scrdif 변경과 재시뮬은 4번 「조건 설정」에서 합니다.';
    this.element.appendChild(this.readOnlyNoticeEl);

    this.applyBtn = document.createElement('button');
    this.applyBtn.className = 'fluid-controls__apply';
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
    this.listenerCleanups.push(() => this.applyBtn.removeEventListener('click', onApplyClick));
    this.element.appendChild(this.applyBtn);

    const hint = document.createElement('div');
    hint.className = 'fluid-controls__hint';
    hint.textContent = '● 굵게 표시된 체크 = 수면·플로팅 범례의 기준 항목';
    this.element.appendChild(hint);

    // ── 슬라이스 토글 + 높이 슬라이더
    const sliceRow = document.createElement('div');
    sliceRow.className = 'fluid-controls__row';
    const sliceLabel = document.createElement('label');
    sliceLabel.className = 'fluid-controls__toggle';
    this.sliceToggle = document.createElement('input');
    this.sliceToggle.type = 'checkbox';
    this.sliceToggle.checked = true;
    const sliceText = document.createElement('span');
    sliceText.textContent = '지형 위 수면';
    sliceLabel.append(this.sliceToggle, sliceText);
    sliceRow.appendChild(sliceLabel);
    {
      const onChange = (): void => handlers.onSliceVisibilityChange(this.sliceToggle.checked);
      this.sliceToggle.addEventListener('change', onChange);
      this.listenerCleanups.push(() => this.sliceToggle.removeEventListener('change', onChange));
    }
    this.element.appendChild(sliceRow);

    const heightRow = document.createElement('div');
    heightRow.className = 'fluid-controls__row';
    this.heightSlider = document.createElement('input');
    this.heightSlider.type = 'range';
    this.heightSlider.min = String(options.minHeight);
    this.heightSlider.max = String(options.maxHeight);
    this.heightSlider.step = '0.1';
    this.heightSlider.value = String(options.initialHeight);
    this.heightSlider.className = 'fluid-controls__slider';
    this.heightLabel = document.createElement('span');
    this.heightLabel.className = 'fluid-controls__value';
    this.heightLabel.textContent = `Y = ${options.initialHeight.toFixed(1)} m`;
    {
      const onInput = (): void => {
        const v = Number(this.heightSlider.value);
        this.heightLabel.textContent = `Y = ${v.toFixed(1)} m`;
        handlers.onSliceHeightChange(v);
      };
      this.heightSlider.addEventListener('input', onInput);
      this.listenerCleanups.push(() => this.heightSlider.removeEventListener('input', onInput));
    }
    heightRow.append(this.heightSlider, this.heightLabel);
    this.element.appendChild(heightRow);

    const tracersRow = document.createElement('div');
    tracersRow.className = 'fluid-controls__row';
    const tracersLabel = document.createElement('label');
    tracersLabel.className = 'fluid-controls__toggle';
    this.tracersToggle = document.createElement('input');
    this.tracersToggle.type = 'checkbox';
    this.tracersToggle.checked = options.initialTracersVisible ?? false;
    const tracersText = document.createElement('span');
    tracersText.textContent = '유체 추적 입자 (흐름)';
    tracersLabel.append(this.tracersToggle, tracersText);
    tracersRow.appendChild(tracersLabel);
    {
      const onChange = (): void => handlers.onTracersVisibilityChange(this.tracersToggle.checked);
      this.tracersToggle.addEventListener('change', onChange);
      this.listenerCleanups.push(() => this.tracersToggle.removeEventListener('change', onChange));
    }
    this.element.appendChild(tracersRow);

    this.tracersNoticeEl = document.createElement('div');
    this.tracersNoticeEl.className = 'fluid-controls__tracers-notice';
    this.tracersNoticeEl.hidden = true;
    this.element.appendChild(this.tracersNoticeEl);

    // ── 범례 + 현재 범위
    this.legendBar = document.createElement('div');
    this.legendBar.className = 'fluid-controls__legend';
    this.legendBar.style.background = fluidColorRampToCss('to right');
    this.element.appendChild(this.legendBar);

    this.rangeLabel = document.createElement('span');
    this.rangeLabel.className = 'fluid-controls__range';
    this.rangeLabel.textContent = '— / —';
    this.element.appendChild(this.rangeLabel);

    // 단위 메모
    const unitsLine = document.createElement('div');
    unitsLine.className = 'fluid-controls__units';
    unitsLine.textContent = `u,v,w ${options.velocityUnit ?? 'm/s'} · scrdif ${options.scrdifUnit ?? 'm'}`;
    this.element.appendChild(unitsLine);

    this.setReadOnlyField(options.readOnlyField ?? false);
  }

  /** 5번 뷰어: 유체 필드 값은 읽기 전용, 표시 옵션만 조작 */
  public setReadOnlyField(readOnly: boolean): void {
    this.readOnlyField = readOnly;
    for (const input of this.valueInputs.values()) {
      input.disabled = readOnly;
    }
    this.applyBtn.disabled = readOnly || this.isLoading;
    if (readOnly) {
      this.liveCheckbox.checked = false;
      this.liveCheckbox.disabled = true;
      this.liveRow.hidden = true;
      this.applyBtn.hidden = true;
      this.readOnlyNoticeEl.hidden = false;
    } else {
      this.liveCheckbox.disabled = this.debounceMs <= 0;
      this.readOnlyNoticeEl.hidden = true;
      if (!this._probeMode) {
        this.liveRow.hidden = false;
        this.applyBtn.hidden = false;
      }
    }
    this.element.classList.toggle('fluid-controls--read-only-field', readOnly);
    this.applySetupChrome();
  }

  /** 4번 조건 설정: 값은 고를 수 있지만 장면 생성은 오른쪽 적용 버튼만 한다. */
  public setSetupMode(setup: boolean): void {
    this.setupMode = setup;
    this.applySetupChrome();
  }

  private applySetupChrome(): void {
    if (!this.setupMode || this.readOnlyField) return;
    this.liveCheckbox.checked = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.liveRow.hidden = true;
    this.applyBtn.hidden = true;
    this.readOnlyNoticeEl.hidden = false;
    this.readOnlyNoticeEl.textContent =
      '이 값은 CSV 영역 아래 「적용하고 결과 보기」를 눌렀을 때 반영됩니다.';
  }

  private scheduleLiveApply(): void {
    if (this.readOnlyField || this.setupMode) return;
    if (!this.liveCheckbox.checked || this.debounceMs <= 0 || this.isLoading) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (!this.isLoading) this.handlers.onApply({ ...this.values });
    }, this.debounceMs);
  }

  private handleQuantityToggle(
    q: FluidQuantity,
    input: HTMLInputElement,
    handlers: FluidControlsHandlers,
  ): void {
    if (input.checked) {
      this.selectedQuantities.add(q);
      this.primaryQuantity = q;
    } else {
      if (this.selectedQuantities.size <= 1) {
        input.checked = true;
        return;
      }
      this.selectedQuantities.delete(q);
      if (this.primaryQuantity === q) {
        this.primaryQuantity = FLUID_DASHBOARD_QUANTITIES.find((item) =>
          this.selectedQuantities.has(item),
        )!;
      }
    }
    this.syncPrimaryMarkers();
    handlers.onQuantitiesChange(this.getSelectedQuantities(), this.primaryQuantity);
  }

  private syncPrimaryMarkers(): void {
    for (const q of FLUID_DASHBOARD_QUANTITIES) {
      const input = this.quantityInputs.get(q);
      const wrap = input?.closest('.fluid-controls__check');
      if (!wrap) continue;
      wrap.classList.toggle('fluid-controls__check--primary', q === this.primaryQuantity);
    }
  }

  public getSelectedQuantities(): FluidQuantity[] {
    return FLUID_DASHBOARD_QUANTITIES.filter((q) => this.selectedQuantities.has(q));
  }

  public setLegendForQuantity(q: FluidQuantity): void {
    this.legendBar.style.background = legendGradientForFluidQuantity(q, 'to right');
  }

  public getPrimaryQuantity(): FluidQuantity {
    return this.primaryQuantity;
  }

  public getParams(): SimParams {
    return { ...this.values };
  }

  public setParams(params: SimParams): void {
    Object.assign(this.values, params);
    for (const meta of FLUID_FIELD_META) {
      const input = this.valueInputs.get(meta.key);
      if (input) input.value = String(this.values[meta.key]);
    }
  }

  public setLoading(loading: boolean): void {
    if (loading && this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.isLoading = loading;
    this.applyBtn.disabled = loading || this.readOnlyField;
    this.applyBtn.textContent = loading ? '시뮬레이션 생성 중…' : '적용 (재시뮬레이션)';
  }

  public setRanges(entries: FluidRangeEntry[]): void {
    if (entries.length === 0) {
      this.rangeLabel.textContent = '— / —';
      return;
    }
    this.rangeLabel.textContent = entries
      .map((e) => {
        const marker = e.primary ? ' ●' : '';
        return `${e.label}: ${formatScientific(e.min)} ~ ${formatScientific(e.max)} ${e.unit}${marker}`;
      })
      .join('\n');
  }

  public setRange(min: number, max: number, unit: string, label = ''): void {
    this.setRanges([{ quantity: this.primaryQuantity, label, min, max, unit, primary: true }]);
  }

  public setHeightRange(min: number, max: number): void {
    this.heightSlider.min = String(min);
    this.heightSlider.max = String(max);
  }

  public setSliceHeight(yMeters: number): void {
    this.heightSlider.value = String(yMeters);
    this.heightLabel.textContent = `Y = ${yMeters.toFixed(1)} m`;
  }

  public setProbeMode(enabled: boolean): void {
    this._probeMode = enabled;
    this.probeMetaEl.hidden = !enabled;
    this.liveRow.hidden = enabled || this.readOnlyField || this.setupMode;
    this.applyBtn.hidden = enabled || this.readOnlyField || this.setupMode;
    if (enabled && this.readOnlyField) {
      this.readOnlyNoticeEl.textContent =
        '실측 CSV — 표시·재생만 조정합니다. 파일·간격 변경은 4번 「조건 설정」.';
    } else if (this.readOnlyField) {
      this.readOnlyNoticeEl.textContent =
        '뷰어 모드 — u/v/w·scrdif 변경과 재시뮬은 4번 「조건 설정」에서 합니다.';
    }
    for (const q of FLUID_DASHBOARD_QUANTITIES) {
      const paramKey = FLUID_QUANTITY_PARAM_KEYS[q];
      const input = this.valueInputs.get(paramKey);
      const readout = this.readoutEls.get(q);
      if (input) input.hidden = enabled;
      if (readout) readout.hidden = !enabled;
    }
    this.applySetupChrome();
  }

  public setProbeReadout(values: ProbeReadoutValues): void {
    // 월드 축 기준 배치 — Y(연직)는 CSV w, Z(횡단)는 CSV v.
    const map: Record<FluidQuantity, number> = {
      velocityX: values.u,
      velocityY: values.w,
      velocityZ: values.v,
      scrdif: values.scrdif,
      speed: 0,
      pressure: 0,
      density: 0,
      tke: 0,
      dtke: 0,
      mhyfd: 0,
      shrvel: 0,
      davel: 0,
      ofvel: 0,
    };
    for (const q of FLUID_DASHBOARD_QUANTITIES) {
      const readout = this.readoutEls.get(q);
      if (readout) readout.textContent = formatScientific(map[q]);
    }
    if (values.t !== undefined && values.rowIndex !== undefined) {
      this.probeMetaEl.textContent = `t = ${values.t.toFixed(0)}s · 시점 ${values.rowIndex + 1}`;
    } else if (values.t !== undefined) {
      this.probeMetaEl.textContent = `t = ${values.t.toFixed(0)}s`;
    } else {
      this.probeMetaEl.textContent = '';
    }
  }

  public isProbeMode(): boolean {
    return this._probeMode;
  }

  public setTracersVisible(visible: boolean): void {
    if (this.tracersToggle.checked === visible) return;
    this.tracersToggle.checked = visible;
    this.tracersToggle.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** 재생 종료 등 자동 해제 안내 (null 이면 숨김) */
  public setTracersNotice(message: string | null): void {
    if (!message) {
      this.tracersNoticeEl.hidden = true;
      this.tracersNoticeEl.textContent = '';
      return;
    }
    this.tracersNoticeEl.textContent = message;
    this.tracersNoticeEl.hidden = false;
  }

  public isTracersVisible(): boolean {
    return this.tracersToggle.checked;
  }

  public isSliceVisible(): boolean {
    return this.sliceToggle.checked;
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const cleanup of this.listenerCleanups) cleanup();
    this.element.remove();
  }
}

export function fluidDashboardLabel(q: FluidQuantity): string {
  return QUANTITY_LABELS[q];
}

function formatScientific(v: number): string {
  if (!isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 0.01 || abs >= 1000)) {
    return v.toExponential(2);
  }
  return v.toFixed(2);
}
