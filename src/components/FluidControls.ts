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
  onPointsVisibilityChange: (visible: boolean) => void;
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
  /** x·y·z 좌표 점 표시 기본값 */
  initialPointsVisible?: boolean;
  velocityUnit?: string;
  scrdifUnit?: string;
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
  velocityX: 'X 흐름 방향 유속 (CSV u)',
  velocityY: 'Y 연직 방향 유속 (CSV w)',
  velocityZ: 'Z 횡단 방향 유속 (CSV v)',
  tke: 'TKE',
  dtke: 'dTKE',
  mhyfd: '수리깊이',
  shrvel: '전단속도',
  davel: '깊이평균유속',
  ofvel: '표면유속',
  scrdif: 'scrdif (초기 지반 대비 세굴/퇴적 변화량)',
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
  private readonly pointsToggle: HTMLInputElement;
  private readonly applyBtn: HTMLButtonElement;
  private readonly liveCheckbox: HTMLInputElement;
  private readonly liveRow: HTMLElement;
  private readonly readoutEls = new Map<FluidQuantity, HTMLSpanElement>();
  private readonly probeMetaEl: HTMLSpanElement;
  private _probeMode = false;
  private readonly listenerCleanups: Array<() => void> = [];
  private isLoading = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

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
        : [FLUID_DASHBOARD_QUANTITIES[0]!],
    );
    if (initialSelected.size === 0) {
      initialSelected.add(FLUID_DASHBOARD_QUANTITIES[0]!);
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
    hint.textContent = '● 표시 항목이 수면 색상에 사용됩니다';
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
    this.tracersToggle.checked = options.initialTracersVisible ?? true;
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

    const pointsRow = document.createElement('div');
    pointsRow.className = 'fluid-controls__row';
    const pointsLabel = document.createElement('label');
    pointsLabel.className = 'fluid-controls__toggle';
    this.pointsToggle = document.createElement('input');
    this.pointsToggle.type = 'checkbox';
    this.pointsToggle.checked = options.initialPointsVisible ?? false;
    const pointsText = document.createElement('span');
    pointsText.textContent = 'x·y·z 좌표 점';
    pointsLabel.append(this.pointsToggle, pointsText);
    pointsRow.appendChild(pointsLabel);
    {
      const onChange = (): void => handlers.onPointsVisibilityChange(this.pointsToggle.checked);
      this.pointsToggle.addEventListener('change', onChange);
      this.listenerCleanups.push(() => this.pointsToggle.removeEventListener('change', onChange));
    }
    this.element.appendChild(pointsRow);

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
  }

  private scheduleLiveApply(): void {
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
    this.applyBtn.disabled = loading;
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
    this.liveRow.hidden = enabled;
    this.applyBtn.hidden = enabled;
    for (const q of FLUID_DASHBOARD_QUANTITIES) {
      const paramKey = FLUID_QUANTITY_PARAM_KEYS[q];
      const input = this.valueInputs.get(paramKey);
      const readout = this.readoutEls.get(q);
      if (input) input.hidden = enabled;
      if (readout) readout.hidden = !enabled;
    }
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

  public setPointsVisible(visible: boolean): void {
    this.pointsToggle.checked = visible;
  }

  public setTracersVisible(visible: boolean): void {
    this.tracersToggle.checked = visible;
  }

  public isTracersVisible(): boolean {
    return this.tracersToggle.checked;
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
