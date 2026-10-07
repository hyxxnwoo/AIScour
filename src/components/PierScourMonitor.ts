import {
  GRADES,
  gradeDepthThresholds,
  gradeOf,
  IS_THRESHOLD_PROVISIONAL,
  remainPct,
} from '@/constants/grade';
import type { PierScourDepth } from '@/utils/pierScourSample';
import type { Disposable } from '@/types/disposable';

export interface PierScourMonitorOptions {
  pierIds: string[];
  foundationDepthM: number;
}

const ZONE_STOPS: Array<[number, number, string]> = [
  [0, 30, GRADES[0].color],
  [30, 60, GRADES[1].color],
  [60, 80, GRADES[2].color],
  [80, 100, GRADES[3].color],
];

/** 교각별 세굴 모니터 — 목업 pierMonitor 스타일 (등급 pill · 구간 게이지 · 노브) */
export class PierScourMonitor implements Disposable {
  public readonly element: HTMLElement;
  private foundationDepthM: number;
  private readonly scaleHost: HTMLElement;
  private readonly rows: Array<{
    pill: HTMLElement;
    depthLbl: HTMLElement;
    marginLbl: HTMLElement;
    fill: HTMLElement;
    knob: HTMLElement;
  }> = [];

  public constructor(options: PierScourMonitorOptions) {
    this.foundationDepthM = options.foundationDepthM;
    this.element = document.createElement('div');
    this.element.className = 'pier-scour-monitor';

    const head = document.createElement('div');
    head.className = 'pier-scour-monitor__head';
    head.textContent = '교각별 세굴 모니터';
    this.element.appendChild(head);

    const list = document.createElement('div');
    list.className = 'pier-scour-monitor__list';

    for (const id of options.pierIds) {
      const block = document.createElement('div');
      block.className = 'pier-scour-monitor__pier';

      const meta = document.createElement('div');
      meta.className = 'pier-scour-monitor__meta';

      const pierId = document.createElement('span');
      pierId.className = 'pier-scour-monitor__id';
      pierId.textContent = id;

      const pill = document.createElement('span');
      pill.className = 'pier-scour-monitor__pill';

      const depthLbl = document.createElement('span');
      depthLbl.className = 'pier-scour-monitor__depth';

      const marginLbl = document.createElement('span');
      marginLbl.className = 'pier-scour-monitor__margin';

      meta.append(pierId, pill, depthLbl, marginLbl);

      const gauge = document.createElement('div');
      gauge.className = 'pier-scour-monitor__gauge';

      const track = document.createElement('div');
      track.className = 'pier-scour-monitor__track';
      for (const [left, right, color] of ZONE_STOPS) {
        const zone = document.createElement('div');
        zone.className = 'pier-scour-monitor__zone';
        zone.style.left = `${left}%`;
        zone.style.width = `${right - left}%`;
        zone.style.background = color;
        track.appendChild(zone);
      }
      const fill = document.createElement('div');
      fill.className = 'pier-scour-monitor__fill';
      track.appendChild(fill);

      for (const pct of [30, 60, 80]) {
        const tick = document.createElement('span');
        tick.className = 'pier-scour-monitor__tick';
        tick.style.left = `${pct}%`;
        gauge.appendChild(tick);
      }

      const knob = document.createElement('span');
      knob.className = 'pier-scour-monitor__knob';
      gauge.append(track, knob);

      block.append(meta, gauge);
      list.appendChild(block);
      this.rows.push({ pill, depthLbl, marginLbl, fill, knob });
    }

    this.element.appendChild(list);

    this.scaleHost = document.createElement('div');
    this.scaleHost.className = 'pier-scour-monitor__scale';
    this.element.appendChild(this.scaleHost);

    const foot = document.createElement('div');
    foot.className = 'pier-scour-monitor__foot';
    foot.textContent = IS_THRESHOLD_PROVISIONAL
      ? '세굴심 / 기초 근입 · 잔여 여유율 70 / 40 / 20 % 기준 잠정'
      : '세굴심 / 기초 근입 · 잔여 여유율 70 / 40 / 20 %';
    this.element.appendChild(foot);

    this.rebuildScale();
  }

  public setFoundationDepthM(foundationDepthM: number): void {
    this.foundationDepthM = foundationDepthM;
    this.rebuildScale();
  }

  private rebuildScale(): void {
    const fd = this.foundationDepthM;
    const [d1, d2, d3] = gradeDepthThresholds(fd);
    const labels: Array<[number, string]> = [
      [0, '0'],
      [30, formatScaleDepth(d1, fd)],
      [60, formatScaleDepth(d2, fd)],
      [80, formatScaleDepth(d3, fd)],
      [100, `${formatScaleDepth(fd, fd)} m`],
    ];
    this.scaleHost.replaceChildren(
      ...labels.map(([left, text]) => {
        const span = document.createElement('span');
        span.style.left = `${left}%`;
        span.textContent = text;
        return span;
      }),
    );
    const foot = this.element.querySelector('.pier-scour-monitor__foot');
    if (foot) {
      foot.textContent = IS_THRESHOLD_PROVISIONAL
        ? `세굴심 / 기초 근입 ${fd.toFixed(2)} m · 잔여 여유율 70 / 40 / 20 % 기준 잠정`
        : `세굴심 / 기초 근입 ${fd.toFixed(2)} m · 잔여 여유율 70 / 40 / 20 %`;
    }
  }

  public update(readings: PierScourDepth[]): void {
    const fd = Math.max(this.foundationDepthM, 1e-9);
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      const reading = readings[i];
      if (!row || !reading) continue;

      const depth = Math.max(0, reading.scourDepthM);
      const pctRemain = remainPct(depth, fd);
      const grade = gradeOf(depth, fd);
      const barPct = Math.min(100, (depth / fd) * 100);

      row.pill.textContent = grade.name;
      row.pill.className = `pier-scour-monitor__pill pier-scour-monitor__pill--${grade.key}`;
      row.depthLbl.textContent = `${depth.toFixed(2)} m`;
      row.depthLbl.style.color = grade.color;
      row.marginLbl.textContent = `여유 ${pctRemain.toFixed(0)}%`;
      row.fill.style.width = `${barPct.toFixed(1)}%`;
      row.fill.style.background = grade.color;
      row.knob.style.left = `${barPct.toFixed(1)}%`;
      row.knob.style.background = grade.color;
    }
  }

  public dispose(): void {
    this.element.remove();
  }
}

function formatScaleDepth(depthM: number, foundationM: number): string {
  if (foundationM >= 1) return depthM.toFixed(2);
  if (foundationM >= 0.2) return depthM.toFixed(3);
  return depthM.toFixed(4);
}
