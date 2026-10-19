import {
  GRADES,
  IS_THRESHOLD_PROVISIONAL,
  gradeDepthThresholds,
  gradeOf,
  remainPct,
} from '@/constants/grade';
import type { Disposable } from '@/types/disposable';
import { renderGradePierChips } from '@/viz/viewerScreenViz';
import { viewState } from '@/state/viewState';

/** 7번 화면 우측 — 온도계형 등급 범례 + 교각 마커 */
export class GradeLegendPanel implements Disposable {
  public readonly element: HTMLElement;
  private thermoHost: HTMLElement;
  private listHost: HTMLElement;
  private pierChipHost: HTMLElement;
  private foundationDepthM: number;
  private lastChipKey = '';

  public constructor(foundationDepthM: number) {
    this.foundationDepthM = foundationDepthM;
    this.element = document.createElement('div');
    this.element.className = 'grade-legend-panel grade-legend-panel--viz viz-widget';
    this.element.dataset.widgetId = 'grade-legend';
    this.thermoHost = document.createElement('div');
    this.thermoHost.className = 'grade-legend-panel__thermo-wrap';
    this.pierChipHost = document.createElement('div');
    this.pierChipHost.className = 'grade-legend-panel__chips-host';
    this.listHost = document.createElement('div');
    this.listHost.className = 'grade-legend-panel__list';
    this.element.innerHTML = `<div class="grade-legend-panel__title">교각 등급 범례 <span class="grade-legend-panel__tag">DT-160</span></div>
      <p class="grade-legend-panel__sub">등급·교각 칩 클릭 → 3D · 라벨 연동</p>`;
    this.element.append(this.thermoHost, this.pierChipHost, this.listHost);
    this.renderList(foundationDepthM);
    this.renderThermo([]);
  }

  public setFoundationDepthM(fd: number): void {
    this.foundationDepthM = fd;
    this.renderList(fd);
    this.renderThermo([]);
  }

  /** pierId → scour depth at current time */
  public updatePierMarkers(readings: Array<{ pierId: string; scourDepthM: number }>): void {
    this.renderThermo(readings);
    this.updatePierChips(readings);
  }

  private updatePierChips(readings: Array<{ pierId: string; scourDepthM: number }>): void {
    const key = readings.map((r) => `${r.pierId}:${r.scourDepthM.toFixed(3)}`).join('|');
    if (key === this.lastChipKey) {
      for (const btn of this.pierChipHost.querySelectorAll<HTMLElement>('[data-pier-id]')) {
        btn.classList.toggle('is-on', btn.dataset.pierId === viewState.selectedPierId);
      }
      return;
    }
    this.lastChipKey = key;
    this.pierChipHost.innerHTML = renderGradePierChips(
      readings,
      this.foundationDepthM,
      viewState.selectedPierId,
    );
    this.patchGradeRowPicks(readings);
    for (const btn of this.pierChipHost.querySelectorAll<HTMLButtonElement>('[data-pier-id]')) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.pierId;
        if (id) viewState.setSelectedPier(id);
      });
    }
  }

  private renderThermo(readings: Array<{ pierId: string; scourDepthM: number }>): void {
    const fd = this.foundationDepthM;
    let markers = '';
    for (const r of readings) {
      const pct = 100 - remainPct(r.scourDepthM, fd);
      const top = Math.min(98, Math.max(2, pct));
      const g = gradeOf(r.scourDepthM, fd);
      markers += `<button type="button" class="viz-thermo__marker grade-legend-panel__thermo-hit" style="top:${top}%;background:${g.color}" data-pier-id="${r.pierId}" data-tip="${r.pierId} · ${r.scourDepthM.toFixed(2)} m · ${g.name}" aria-label="${r.pierId}"></button>
        <span class="grade-legend-panel__marker-label" style="top:${top}%">${r.pierId}</span>`;
    }
    this.thermoHost.innerHTML = `<div class="viz-thermo">${markers}</div>
      <div class="grade-legend-panel__thermo-hint">↓ 세굴 깊어짐 · 마커 클릭</div>`;
  }

  private renderList(fd: number): void {
    const [d1, d2, d3] = gradeDepthThresholds(fd);
    const rng = ['≥ 70 %', '40 – 70 %', '20 – 40 %', '< 20 %'];
    const dr = [
      `< ${d1.toFixed(2)} m`,
      `${d1.toFixed(2)} – ${d2.toFixed(2)} m`,
      `${d2.toFixed(2)} – ${d3.toFixed(2)} m`,
      `≥ ${d3.toFixed(2)} m`,
    ];
    this.listHost.innerHTML =
      GRADES.map(
        (
          g,
          i,
        ) => `<button type="button" class="grade-legend-panel__row" data-act="grade-row" data-grade-key="${g.key}" data-pier-pick="">
        <span class="grade-legend-panel__swatch" style="background:${g.color}"></span>
        <b>${g.name}</b><span class="grade-legend-panel__en">${g.en}</span>
        <span class="grade-legend-panel__rng">${rng[i]}</span>
        <span class="grade-legend-panel__depth">${dr[i]}</span>
      </button>`,
      ).join('') +
      `<div class="grade-legend-panel__hint">3D 교각 색 = 현재 등급 · 행 클릭 → 해당 등급 교각
        ${IS_THRESHOLD_PROVISIONAL ? '<span class="grade-legend-panel__prov">잠정</span>' : ''}</div>`;
  }

  private patchGradeRowPicks(readings: Array<{ pierId: string; scourDepthM: number }>): void {
    const fd = this.foundationDepthM;
    for (const g of GRADES) {
      const row = this.listHost.querySelector<HTMLElement>(`[data-grade-key="${g.key}"]`);
      if (!row) continue;
      const match = readings.find((r) => gradeOf(r.scourDepthM, fd).key === g.key);
      row.dataset.pierPick = match?.pierId ?? '';
    }
  }

  public dispose(): void {
    this.element.remove();
  }
}
