import type { ScreenId } from '@/app/ScreenRouter';
import type { GradeKey } from '@/constants/grade';
import { GRADES, gradeOf } from '@/constants/grade';
import type { PierReachTimes } from '@/utils/pierTimeSeries';
import { viewState } from '@/state/viewState';
import { animateVizBars, bindVizCountUps, pulseElement } from '@/viz/vizMotion';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function formatReachTime(t: number | null): string {
  if (t == null) return '—';
  if (t < 60) return `${Math.round(t)} s`;
  const m = Math.floor(t / 60);
  const s = Math.round(t % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** 8번 — 등급 최초 도달 시각 표 */
export function renderPierReachTable(
  reach: PierReachTimes[],
  durationSeconds: number,
  selectedPierId: string | null,
): string {
  const gradeCols = GRADES.slice(1);
  const head = gradeCols.map((g) => `<th style="--c:${g.color}">${g.name}</th>`).join('');
  const rows = reach
    .map((r) => {
      const sel = r.pierId === selectedPierId ? ' is-selected' : '';
      const cells = [
        formatReachTime(r.caution),
        formatReachTime(r.boundary),
        formatReachTime(r.serious),
      ]
        .map(
          (txt, i) =>
            `<td><button type="button" class="viewer-reach__cell" data-act="reach-time" data-pier="${esc(r.pierId)}" data-grade="${gradeCols[i].key}" data-time="${[r.caution, r.boundary, r.serious][i] ?? ''}" ${[r.caution, r.boundary, r.serious][i] == null ? 'disabled' : ''}>${txt}</button></td>`,
        )
        .join('');
      return `<tr class="viewer-reach__row${sel}" data-pier="${esc(r.pierId)}">
        <th scope="row"><button type="button" class="viewer-reach__pier" data-act="reach-pier" data-pier="${esc(r.pierId)}">${esc(r.pierId)}</button></th>
        ${cells}
        <td class="viewer-reach__final">${r.finalDepthM.toFixed(2)} m</td>
      </tr>`;
    })
    .join('');
  return `<div class="viewer-reach-table viewer-reach-table--enter" data-widget-id="pier-reach">
    <div class="viewer-reach-table__head">
      <h4 class="viewer-reach-table__title">등급 도달 시각</h4>
      <span class="viewer-reach-table__hint">셀 클릭 → 해당 시점 · 교각 행 → 선택</span>
    </div>
    <div class="viewer-reach-table__scroll">
      <table class="viewer-reach-table__grid">
        <thead><tr><th>교각</th>${head}<th>평형</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="viewer-reach-table__foot">해석 길이 ${Math.round(durationSeconds)} s · 잠정 경계 기준</p>
  </div>`;
}

export interface ViewerScreenVizTargets {
  viewerStage: HTMLElement;
  getScreen: () => ScreenId;
  sectionPanel: HTMLElement;
  timelinePanel: HTMLElement;
  gradeLegend: HTMLElement;
  riskPanel: HTMLElement;
  pierMonitor: HTMLElement;
  fluidControls: HTMLElement;
  cellPopover?: HTMLElement;
  onReachScrub?: (timeSeconds: number) => void;
}

function clearSpotlights(root: Element): void {
  root.querySelectorAll('.is-spotlight').forEach((el) => el.classList.remove('is-spotlight'));
}

function linkPierSpotlight(root: Element, pierId: string | null): void {
  if (!pierId) return;
  root.querySelectorAll<HTMLElement>('[data-pier-id]').forEach((el) => {
    el.classList.toggle('is-spotlight', el.dataset.pierId === pierId);
  });
  root.querySelectorAll<HTMLElement>('[data-pier]').forEach((el) => {
    if (el.closest('.viewer-reach-table')) return;
    el.classList.toggle('is-spotlight', el.dataset.pier === pierId);
  });
}

/** 패널 진입·갱신 후 모션 */
export function refreshViewerScreenMotion(root: HTMLElement): () => void {
  root.classList.add('viewer-screen--motion');
  animateVizBars(root);
  const stops = bindVizCountUps(root, 'viewer');
  return () => {
    stops.forEach((s) => s());
  };
}

export function bindViewerScreenViz(targets: ViewerScreenVizTargets): () => void {
  const { viewerStage, getScreen } = targets;

  const onReachClick = (e: Event): void => {
    const t = e.target as HTMLElement;
    const pierBtn = t.closest('[data-act="reach-pier"]');
    if (pierBtn instanceof HTMLElement && pierBtn.dataset.pier) {
      viewState.setSelectedPier(pierBtn.dataset.pier);
      return;
    }
    const cell = t.closest('[data-act="reach-time"]');
    if (cell instanceof HTMLButtonElement && !cell.disabled) {
      const timeRaw = cell.dataset.time;
      const tSec = timeRaw != null && timeRaw !== '' ? Number.parseFloat(timeRaw) : NaN;
      if (Number.isFinite(tSec)) {
        targets.onReachScrub?.(tSec);
        pulseElement(cell);
      }
      if (cell.dataset.pier) viewState.setSelectedPier(cell.dataset.pier);
    }
  };

  const onGradeLegendClick = (e: Event): void => {
    const thermo = (e.target as HTMLElement).closest('[data-pier-id]');
    if (thermo instanceof HTMLElement && thermo.dataset.pierId) {
      viewState.setSelectedPier(thermo.dataset.pierId);
      return;
    }
    const row = (e.target as HTMLElement).closest('[data-act="grade-row"]');
    if (!(row instanceof HTMLElement)) return;
    const pier = row.dataset.pierPick;
    if (pier) {
      viewState.setSelectedPier(pier);
      return;
    }
    const key = row.dataset.gradeKey as GradeKey | undefined;
    if (!key) return;
    const pick = targets.gradeLegend.querySelector<HTMLElement>(
      `[data-act="grade-pier"][data-grade-key="${key}"]`,
    );
    if (pick?.dataset.pierId) viewState.setSelectedPier(pick.dataset.pierId);
  };

  const onOver = (e: Event): void => {
    const screen = getScreen();
    if (screen < 6 || screen > 9) return;
    const t = e.target as HTMLElement;

    const kpi = t.closest('.section-profile-panel__kpi--viz');
    if (kpi instanceof HTMLElement) {
      clearSpotlights(targets.sectionPanel);
      kpi.classList.add('is-spotlight');
      return;
    }

    const gradeRow = t.closest('[data-act="grade-row"]');
    if (gradeRow instanceof HTMLElement) {
      clearSpotlights(targets.gradeLegend);
      gradeRow.classList.add('is-spotlight');
      const key = gradeRow.dataset.gradeKey;
      targets.gradeLegend
        .querySelectorAll<HTMLElement>('[data-act="grade-pier"]')
        .forEach((chip) => {
          chip.classList.toggle('is-spotlight', chip.dataset.gradeKey === key);
        });
      return;
    }

    const pierChip = t.closest('[data-act="grade-pier"]');
    if (pierChip instanceof HTMLElement) {
      clearSpotlights(targets.gradeLegend);
      pierChip.classList.add('is-spotlight');
      if (pierChip.dataset.pierId) viewState.setHoveredPier(pierChip.dataset.pierId);
      return;
    }

    const riskCard = t.closest('.risk-judgment-panel__card');
    if (riskCard instanceof HTMLElement) {
      clearSpotlights(targets.riskPanel);
      riskCard.classList.add('is-spotlight');
      return;
    }

    const reachRow = t.closest('.viewer-reach__row');
    if (reachRow instanceof HTMLElement) {
      clearSpotlights(targets.timelinePanel);
      reachRow.classList.add('is-spotlight');
    }
  };

  const onOut = (e: Event): void => {
    const rel = (e as MouseEvent).relatedTarget;
    if (rel instanceof Node && viewerStage.contains(rel)) return;
    clearSpotlights(viewerStage);
  };

  const syncViewState = (): void => {
    const id = viewState.selectedPierId;
    linkPierSpotlight(viewerStage, id);
    for (const card of targets.riskPanel.querySelectorAll<HTMLElement>(
      '.risk-judgment-panel__card',
    )) {
      card.classList.toggle('is-linked-highlight', card.dataset.pierId === id);
    }
    for (const row of targets.timelinePanel.querySelectorAll<HTMLElement>('.viewer-reach__row')) {
      row.classList.toggle('is-selected', row.dataset.pier === id);
    }
  };

  targets.timelinePanel.addEventListener('click', onReachClick);
  targets.gradeLegend.addEventListener('click', onGradeLegendClick);
  viewerStage.addEventListener('mouseover', onOver);
  viewerStage.addEventListener('mouseout', onOut);
  viewerStage.addEventListener('focusin', onOver);
  viewerStage.addEventListener('focusout', onOut);
  const unsubView = viewState.subscribe(syncViewState);
  syncViewState();

  return () => {
    targets.timelinePanel.removeEventListener('click', onReachClick);
    targets.gradeLegend.removeEventListener('click', onGradeLegendClick);
    viewerStage.removeEventListener('mouseover', onOver);
    viewerStage.removeEventListener('mouseout', onOut);
    viewerStage.removeEventListener('focusin', onOver);
    viewerStage.removeEventListener('focusout', onOut);
    unsubView();
  };
}

/** 등급 범례 — 교각 칩 HTML */
export function renderGradePierChips(
  readings: Array<{ pierId: string; scourDepthM: number }>,
  foundationDepthM: number,
  selectedPierId: string | null,
): string {
  if (readings.length === 0) return '';
  const chips = readings
    .map((r) => {
      const g = gradeOf(r.scourDepthM, foundationDepthM);
      const on = r.pierId === selectedPierId ? ' is-on' : '';
      return `<button type="button" class="grade-legend-panel__pier-chip${on}" data-act="grade-pier" data-pier-id="${esc(r.pierId)}" data-grade-key="${g.key}" style="--c:${g.color}" data-tip="${esc(`${r.pierId} · ${r.scourDepthM.toFixed(2)} m · ${g.name}`)}">
        <span class="grade-legend-panel__pier-chip-id">${esc(r.pierId)}</span>
        <span class="grade-legend-panel__pier-chip-grade">${g.name}</span>
      </button>`;
    })
    .join('');
  return `<div class="grade-legend-panel__pier-row">${chips}</div>`;
}
