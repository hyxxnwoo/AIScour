import type { FluidQuantity } from '@/types/fluid';
import type { Disposable } from '@/types/disposable';
import { fluidColorRampToCss } from '@/utils/fluidColorRamp';

export interface FluidControlsHandlers {
  onQuantityChange: (q: FluidQuantity) => void;
  onSliceHeightChange: (yMeters: number) => void;
  onSliceVisibilityChange: (visible: boolean) => void;
  onArrowsVisibilityChange: (visible: boolean) => void;
}

export interface FluidControlsOptions {
  initialQuantity: FluidQuantity;
  // 슬라이스 높이 범위(미터)
  minHeight: number;
  maxHeight: number;
  initialHeight: number;
  // 단위 표시
  units: { speed: string; pressure: string; density: string };
}

const QUANTITY_LABELS: Record<FluidQuantity, string> = {
  speed: '속도 |U|',
  pressure: '압력 P',
  density: '밀도 ρ',
  velocityX: 'U_x',
  velocityY: 'U_y',
  velocityZ: 'U_z',
};

// FluidControls: 유체 시각화 옵션 패널 (좌측 중간).
// - 표시 양 라디오 (speed / pressure / density / Ux/Uy/Uz)
// - 슬라이스 가시성 + 높이 슬라이더
// - 화살표 가시성
// - 컬러 범례 + 현재 데이터 범위 표시
export class FluidControls implements Disposable {
  public readonly element: HTMLElement;
  private readonly heightSlider: HTMLInputElement;
  private readonly heightLabel: HTMLSpanElement;
  private readonly rangeLabel: HTMLSpanElement;
  private readonly quantityInputs: HTMLInputElement[] = [];
  private readonly sliceToggle: HTMLInputElement;
  private readonly arrowsToggle: HTMLInputElement;
  private readonly listenerCleanups: Array<() => void> = [];

  public constructor(options: FluidControlsOptions, handlers: FluidControlsHandlers) {
    this.element = document.createElement('section');
    this.element.className = 'fluid-controls';

    const title = document.createElement('div');
    title.className = 'fluid-controls__title';
    title.textContent = '유체 필드';
    this.element.appendChild(title);

    // ── Quantity 라디오 그룹
    const quantityGroup = document.createElement('div');
    quantityGroup.className = 'fluid-controls__group';
    const quantities: FluidQuantity[] = [
      'speed',
      'pressure',
      'density',
      'velocityX',
      'velocityY',
      'velocityZ',
    ];
    for (const q of quantities) {
      const id = `fluid-q-${q}`;
      const wrap = document.createElement('label');
      wrap.htmlFor = id;
      wrap.className = 'fluid-controls__radio';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'fluid-quantity';
      input.id = id;
      input.value = q;
      input.checked = q === options.initialQuantity;
      const onChange = (): void => {
        if (input.checked) handlers.onQuantityChange(q);
      };
      input.addEventListener('change', onChange);
      this.listenerCleanups.push(() => input.removeEventListener('change', onChange));
      this.quantityInputs.push(input);
      const text = document.createElement('span');
      text.textContent = QUANTITY_LABELS[q];
      wrap.append(input, text);
      quantityGroup.appendChild(wrap);
    }
    this.element.appendChild(quantityGroup);

    // ── 슬라이스 토글 + 높이 슬라이더
    const sliceRow = document.createElement('div');
    sliceRow.className = 'fluid-controls__row';
    const sliceLabel = document.createElement('label');
    sliceLabel.className = 'fluid-controls__toggle';
    this.sliceToggle = document.createElement('input');
    this.sliceToggle.type = 'checkbox';
    this.sliceToggle.checked = true;
    const sliceText = document.createElement('span');
    sliceText.textContent = '수평 슬라이스';
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

    // ── 화살표 토글
    const arrowsRow = document.createElement('div');
    arrowsRow.className = 'fluid-controls__row';
    const arrowsLabel = document.createElement('label');
    arrowsLabel.className = 'fluid-controls__toggle';
    this.arrowsToggle = document.createElement('input');
    this.arrowsToggle.type = 'checkbox';
    this.arrowsToggle.checked = true;
    const arrowsText = document.createElement('span');
    arrowsText.textContent = '속도 벡터 화살표';
    arrowsLabel.append(this.arrowsToggle, arrowsText);
    arrowsRow.appendChild(arrowsLabel);
    {
      const onChange = (): void => handlers.onArrowsVisibilityChange(this.arrowsToggle.checked);
      this.arrowsToggle.addEventListener('change', onChange);
      this.listenerCleanups.push(() => this.arrowsToggle.removeEventListener('change', onChange));
    }
    this.element.appendChild(arrowsRow);

    // ── 범례 (viridis) + 현재 범위
    const legendBar = document.createElement('div');
    legendBar.className = 'fluid-controls__legend';
    legendBar.style.background = fluidColorRampToCss('to right');
    this.element.appendChild(legendBar);

    this.rangeLabel = document.createElement('span');
    this.rangeLabel.className = 'fluid-controls__range';
    this.rangeLabel.textContent = '— / —';
    this.element.appendChild(this.rangeLabel);

    // 단위 메모
    const unitsLine = document.createElement('div');
    unitsLine.className = 'fluid-controls__units';
    unitsLine.textContent = `|U| ${options.units.speed} · P ${options.units.pressure} · ρ ${options.units.density}`;
    this.element.appendChild(unitsLine);
  }

  public setRange(min: number, max: number, unit: string): void {
    this.rangeLabel.textContent = `${formatScientific(min)} ~ ${formatScientific(max)} ${unit}`;
  }

  public dispose(): void {
    for (const cleanup of this.listenerCleanups) cleanup();
    this.element.remove();
  }
}

function formatScientific(v: number): string {
  if (!isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 0.01 || abs >= 1000)) {
    return v.toExponential(2);
  }
  return v.toFixed(2);
}
