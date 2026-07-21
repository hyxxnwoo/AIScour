import type { Disposable } from '@/types/disposable';

export interface ScourWarningOptions {
  pierCount: number;
  pierIds: string[];
  criticalDepthM: number;
}

// ScourWarning: 교각별 세굴 깊이 게이지를 표시하는 오버레이 패널.
export class ScourWarning implements Disposable {
  public readonly element: HTMLElement;
  private readonly barFills: HTMLElement[] = [];
  private readonly barLabels: HTMLElement[] = [];

  public constructor(options: ScourWarningOptions) {
    this.element = document.createElement('div');
    this.element.className = 'scour-warning';

    const title = document.createElement('div');
    title.className = 'scour-warning__title';
    title.textContent = '교각 세굴 모니터';
    this.element.appendChild(title);

    const critLine = document.createElement('div');
    critLine.className = 'scour-warning__crit';
    critLine.textContent = `기준 세굴 깊이: ${options.criticalDepthM.toFixed(1)} m`;
    this.element.appendChild(critLine);

    for (let i = 0; i < options.pierCount; i++) {
      const row = document.createElement('div');
      row.className = 'scour-warning__row';

      const label = document.createElement('span');
      label.className = 'scour-warning__pier-id';
      label.textContent = options.pierIds[i] ?? `P${i + 1}`;
      row.appendChild(label);

      const track = document.createElement('div');
      track.className = 'scour-warning__track';

      const fill = document.createElement('div');
      fill.className = 'scour-warning__fill';
      track.appendChild(fill);
      row.appendChild(track);

      const barLabel = document.createElement('span');
      barLabel.className = 'scour-warning__bar-label';
      barLabel.textContent = '0.0 m';
      row.appendChild(barLabel);

      this.element.appendChild(row);
      this.barFills.push(fill);
      this.barLabels.push(barLabel);
    }
  }

  public update(ratios: { ratio: number }[], criticalDepthM: number): void {
    for (let i = 0; i < ratios.length; i++) {
      const entry = ratios[i];
      const fill = this.barFills[i];
      const lbl = this.barLabels[i];
      if (!entry || !fill || !lbl) continue;

      const pct = Math.min(1, entry.ratio) * 100;
      fill.style.width = `${pct.toFixed(1)}%`;

      if (entry.ratio > 0.75) {
        fill.className = 'scour-warning__fill is-danger';
      } else if (entry.ratio > 0.45) {
        fill.className = 'scour-warning__fill is-warning';
      } else {
        fill.className = 'scour-warning__fill';
      }

      const depthM = entry.ratio * criticalDepthM;
      lbl.textContent = `${depthM.toFixed(1)} m`;
    }
  }

  public dispose(): void {
    this.element.remove();
  }
}
