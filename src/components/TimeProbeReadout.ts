import type { Disposable } from '@/types/disposable';
import type { InterpolatedProbeState } from '@/data/buildTimeProbeSeries';
import type { Flow3dScrdifColumns } from '@/utils/parseFlow3dScrdifCsv';
import { scrdifValueRange } from '@/utils/scrdifCsvLayout';

export interface TimeProbeReadoutOptions {
  /** scrdif 범례용 최소·최대 (m). */
  scrdifMin?: number;
  scrdifMax?: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}분 ${s.toFixed(0)}초`;
  return `${s.toFixed(1)}초`;
}

/** CSV 시간 프로브의 현재 시각·위치·유속·scrdif 를 화면에 표시한다. */
export class TimeProbeReadout implements Disposable {
  public readonly element: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly posEl: HTMLElement;
  private readonly velEl: HTMLElement;
  private readonly scrdifEl: HTMLElement;
  private readonly rowEl: HTMLElement;

  public constructor(_options: TimeProbeReadoutOptions = {}) {
    this.element = document.createElement('div');
    this.element.className = 'time-probe-readout';
    this.element.hidden = true;

    const title = document.createElement('div');
    title.className = 'time-probe-readout__title';
    title.textContent = '시간 프로브';

    this.timeEl = document.createElement('div');
    this.timeEl.className = 'time-probe-readout__row';

    this.rowEl = document.createElement('div');
    this.rowEl.className = 'time-probe-readout__row time-probe-readout__row--muted';

    this.posEl = document.createElement('div');
    this.posEl.className = 'time-probe-readout__row';

    this.velEl = document.createElement('div');
    this.velEl.className = 'time-probe-readout__row';

    this.scrdifEl = document.createElement('div');
    this.scrdifEl.className = 'time-probe-readout__row';

    this.element.append(title, this.timeEl, this.rowEl, this.posEl, this.velEl, this.scrdifEl);
  }

  public setActive(active: boolean): void {
    this.element.hidden = !active;
  }

  /** 공간 슬라이스 CSV — 단일 시각 격자, 시간 프로브 애니메이션 없음. */
  public updateSpatialSlice(columns: Flow3dScrdifColumns): void {
    const { min, max } = scrdifValueRange(columns);
    this.setActive(true);
    this.timeEl.textContent = '공간 슬라이스 (단일 시각 스냅샷)';
    this.rowEl.textContent = `${columns.count}개 격자점 · 행=공간 좌표 (시간 아님)`;
    this.posEl.textContent = '수면·유체 필드로 scrdif·유속 확인';
    this.velEl.textContent = '시간 슬라이더: 유속 입자·수면 애니메이션 루프';
    this.scrdifEl.textContent = `scrdif ${min.toExponential(3)} ~ ${max.toExponential(3)} m`;
  }

  public update(state: InterpolatedProbeState | null, durationSeconds = 0): void {
    if (!state) {
      this.setActive(false);
      return;
    }
    this.setActive(true);
    this.timeEl.textContent = `시각 ${formatTime(state.t)} / ${formatTime(durationSeconds)}`;
    this.rowEl.textContent =
      `CSV 행 ${state.rowIndex + 1} → ${state.rowIndex + 1 + (state.alpha > 0 ? 1 : 0)} (보간 ${(state.alpha * 100).toFixed(0)}%)`;
    this.posEl.textContent =
      `위치 x=${state.dataX.toExponential(3)} y=${state.dataY.toExponential(3)} z=${state.dataZ.toExponential(3)} m`;
    this.velEl.textContent =
      `유속 u=${state.u.toExponential(3)} v=${state.v.toExponential(3)} w=${state.w.toExponential(3)} m/s  |U|=${state.speed.toExponential(3)}`;
    this.scrdifEl.textContent = `scrdif=${state.scrdif.toExponential(3)} m`;
  }

  public dispose(): void {
    this.element.remove();
  }
}
