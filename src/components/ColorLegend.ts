import { colorRampToCssGradient } from '@/utils/colorRamp';
import type { Disposable } from '@/types/disposable';

export interface ColorLegendOptions {
  // 표시 단위 (예: 'm')
  unit?: string;
  // 초기 절댓값 최댓값. 좌우 라벨이 -absMax / +absMax 로 표시된다.
  initialAbsMax?: number;
  // 범례 제목
  title?: string;
}

// ColorLegend: colorRamp 와 동일한 그라디언트 + 좌(세굴) / 중앙(0) / 우(퇴적) 눈금을 표시한다.
// 절댓값 최댓값(absMax)은 시간에 따라 바뀌므로 setRange() 로 동적 갱신한다.
export class ColorLegend implements Disposable {
  public readonly element: HTMLElement;
  private readonly minLabel: HTMLSpanElement;
  private readonly maxLabel: HTMLSpanElement;
  private readonly midLabel: HTMLSpanElement;
  private readonly unit: string;

  public constructor(options: ColorLegendOptions = {}) {
    this.unit = options.unit ?? 'm';

    this.element = document.createElement('div');
    this.element.className = 'color-legend';

    if (options.title) {
      const title = document.createElement('div');
      title.className = 'color-legend__title';
      title.textContent = options.title;
      this.element.appendChild(title);
    }

    const bar = document.createElement('div');
    bar.className = 'color-legend__bar';
    bar.style.background = colorRampToCssGradient('to right');
    this.element.appendChild(bar);

    const scale = document.createElement('div');
    scale.className = 'color-legend__scale';
    this.minLabel = document.createElement('span');
    this.midLabel = document.createElement('span');
    this.maxLabel = document.createElement('span');
    scale.append(this.minLabel, this.midLabel, this.maxLabel);
    this.element.appendChild(scale);

    this.setRange(options.initialAbsMax ?? 1);
  }

  // 좌측은 -absMax(세굴), 우측은 +absMax(퇴적), 중앙은 0
  public setRange(absMax: number): void {
    const v = Math.max(0, absMax);
    this.minLabel.textContent = `-${v.toFixed(2)} ${this.unit}`;
    this.midLabel.textContent = `0`;
    this.maxLabel.textContent = `+${v.toFixed(2)} ${this.unit}`;
  }

  public dispose(): void {
    this.element.remove();
  }
}
