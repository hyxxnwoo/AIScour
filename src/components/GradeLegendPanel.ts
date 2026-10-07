import { GRADES, IS_THRESHOLD_PROVISIONAL, gradeDepthThresholds } from '@/constants/grade';
import type { Disposable } from '@/types/disposable';

/** 7번 화면 우측 — 등급 범례 (여유율·세굴심 구간) */
export class GradeLegendPanel implements Disposable {
  public readonly element: HTMLElement;

  public constructor(foundationDepthM: number) {
    this.element = document.createElement('div');
    this.element.className = 'grade-legend-panel';
    this.render(foundationDepthM);
  }

  public setFoundationDepthM(fd: number): void {
    this.render(fd);
  }

  private render(fd: number): void {
    const [d1, d2, d3] = gradeDepthThresholds(fd);
    const rng = ['≥ 70 %', '40 – 70 %', '20 – 40 %', '< 20 %'];
    const dr = [
      `< ${d1.toFixed(2)} m`,
      `${d1.toFixed(2)} – ${d2.toFixed(2)} m`,
      `${d2.toFixed(2)} – ${d3.toFixed(2)} m`,
      `≥ ${d3.toFixed(2)} m`,
    ];
    const rows = GRADES.map(
      (g, i) => `<div class="grade-legend-panel__row">
        <span class="grade-legend-panel__swatch" style="background:${g.color}"></span>
        <b>${g.name}</b><span class="grade-legend-panel__en">${g.en}</span>
        <span class="grade-legend-panel__rng">${rng[i]}</span>
        <span class="grade-legend-panel__depth">${dr[i]}</span>
      </div>`,
    ).join('');
    this.element.innerHTML = `
      <div class="grade-legend-panel__title">교각 등급 범례 <span class="grade-legend-panel__tag">DT-160</span></div>
      ${rows}
      <div class="grade-legend-panel__hint">3D 교각 색·화면 라벨 = 현재 시각의 등급입니다.
        잔여 여유율 = (기초 근입 − 세굴심) / 기초 근입
        ${IS_THRESHOLD_PROVISIONAL ? '<span class="grade-legend-panel__prov">잠정</span>' : ''}</div>`;
  }

  public dispose(): void {
    this.element.remove();
  }
}
