import { gradeOf } from '@/constants/grade';
import type { PierDefinition } from '@/modules/PierMarker';
import type { ScourSeries } from '@/types/terrain';
import type { Disposable } from '@/types/disposable';
import {
  piersOnSection,
  sampleSectionProfile,
  sectionLengthM,
  sectionProfileChartYDomain,
  type SectionId,
  type SectionKpi,
  type SectionSample,
} from '@/utils/sectionProfile';

const CH = {
  plot: '#0e2235',
  gridMajor: 'rgba(126, 200, 227, 0.14)',
  gridMinor: 'rgba(255, 255, 255, 0.05)',
  ink: '#8fa4b8',
  inkDim: '#5c738a',
  cur: '#f07167',
  mid: '#4ecdc4',
  foot: '#5b9bd5',
  pier: '#8fa4b8',
  zero: 'rgba(232, 240, 250, 0.38)',
};

function pathFrom(pts: Array<[number, number]>): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
}

function fillBandToZero(
  samples: SectionSample[],
  xAt: (s: number) => number,
  yAt: (v: number) => number,
  side: 'scour' | 'deposit',
): string {
  if (samples.length < 2) return '';
  const y0 = yAt(0);
  const first = samples[0];
  const last = samples[samples.length - 1];
  let d = `M ${xAt(first.s).toFixed(1)} ${y0.toFixed(1)}`;
  for (const p of samples) {
    const v = side === 'scour' ? Math.min(0, p.deltaM) : Math.max(0, p.deltaM);
    d += ` L ${xAt(p.s).toFixed(1)} ${yAt(v).toFixed(1)}`;
  }
  d += ` L ${xAt(last.s).toFixed(1)} ${y0.toFixed(1)} Z`;
  const hasSignal = samples.some((p) => (side === 'scour' ? p.deltaM < -1e-9 : p.deltaM > 1e-9));
  return hasSignal ? d : '';
}

function buildProfSvg(
  series: ScourSeries,
  section: SectionId,
  timeSeconds: number,
  midTimeSeconds: number,
  foundationDepthM: number,
  piers: PierDefinition[],
  viewAspect?: number,
): string {
  const H = 280;
  const baseAspect = 960 / H;
  const aspect = Math.max(
    viewAspect !== undefined && Number.isFinite(viewAspect) ? viewAspect : baseAspect,
    baseAspect * 0.75,
  );
  const W = Math.round(H * aspect);
  const L = 56;
  const R = 24;
  const T = 28;
  const B = 44;
  const iw = W - L - R;
  const ih = H - T - B;
  const len = sectionLengthM(series, section);
  const cur = sampleSectionProfile(series, section, timeSeconds, 160, piers);
  const mid = sampleSectionProfile(series, section, midTimeSeconds, 160, piers);
  const { yMin, yMax } = sectionProfileChartYDomain([cur, mid], foundationDepthM);
  const ySpan = Math.max(yMax - yMin, 1e-9);
  const Y = (v: number): number => T + ih * (1 - (v - yMin) / ySpan);
  const X = (s: number): number => L + (iw * s) / Math.max(len, 1e-9);
  const P = (a: typeof cur): string => pathFrom(a.map((p) => [X(p.s), Y(p.deltaM)]));
  const scourFill = fillBandToZero(cur, X, Y, 'scour');
  const depositFill = fillBandToZero(cur, X, Y, 'deposit');
  const plotH = ih;
  const plotW = iw;

  let gridH = '';
  let yLabels = '';
  const yStep = foundationDepthM > 1 ? 1 : 0.02;
  const yMinor = yStep / (foundationDepthM > 1 ? 2 : 5);
  for (let v = Math.ceil(yMin / yMinor) * yMinor; v <= yMax + 1e-9; v += yMinor) {
    const y = Y(v);
    const major = Math.abs(v / yStep - Math.round(v / yStep)) < 1e-6 || Math.abs(v) < 1e-9;
    gridH += `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="${major ? CH.gridMajor : CH.gridMinor}" stroke-width="${major ? 1 : 0.75}"/>`;
    if (major) {
      yLabels += `<text x="${L - 10}" y="${y + 4}" fill="${CH.ink}" font-size="10.5" font-family="system-ui,sans-serif" text-anchor="end">${v.toFixed(foundationDepthM > 1 ? 0 : 2)}</text>`;
    }
  }
  let gridV = '';
  let xLabels = '';
  const xTickCount = 6;
  const xStep = len / xTickCount;
  for (let i = 0; i <= xTickCount; i += 1) {
    const s = i * xStep;
    const x = X(s);
    gridV += `<line x1="${x}" y1="${T}" x2="${x}" y2="${T + plotH}" stroke="${CH.gridMinor}" stroke-width="0.75"/>`;
    xLabels += `<text x="${x}" y="${H - 18}" fill="${CH.ink}" font-size="10" font-family="system-ui,sans-serif" text-anchor="middle">${s.toFixed(len > 10 ? 0 : 2)}</text>`;
  }

  const pierSvg = piersOnSection(series, section, piers)
    .map((p) => {
      const halfD = p.diameterM * 0.5;
      const s0 = Math.max(0, p.s - halfD);
      const s1 = Math.min(len, p.s + halfD);
      const xLeft = X(s0);
      const w = Math.max(4, X(s1) - xLeft);
      const yTop = T;
      const h = Y(-foundationDepthM) - T;
      return `<rect x="${xLeft}" y="${yTop}" width="${w}" height="${h}" rx="2" fill="${CH.pier}" opacity="0.28" stroke="rgba(207,224,236,0.35)" stroke-width="1"/>
      <text x="${X(p.s)}" y="${T + 14}" fill="#e8f0fa" font-size="10.5" font-weight="600" font-family="system-ui,sans-serif" text-anchor="middle">${p.pierId}</text>`;
    })
    .join('');

  const y0 = Y(0);
  const yFoot = Y(-foundationDepthM);

  return `<svg class="section-profile-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="단면 하상 변화">
    <defs>
      <linearGradient id="sec-scour-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(91,155,213,0.08)"/>
        <stop offset="100%" stop-color="rgba(91,155,213,0.32)"/>
      </linearGradient>
      <linearGradient id="sec-deposit-fill" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="rgba(196,165,116,0.1)"/>
        <stop offset="100%" stop-color="rgba(196,165,116,0.35)"/>
      </linearGradient>
      <clipPath id="sec-plot-clip"><rect x="${L}" y="${T}" width="${plotW}" height="${plotH}" rx="4"/></clipPath>
    </defs>
    <rect x="${L}" y="${T}" width="${plotW}" height="${plotH}" rx="6" fill="${CH.plot}" stroke="rgba(126,200,227,0.12)" stroke-width="1"/>
    <g clip-path="url(#sec-plot-clip)">${gridH}${gridV}${pierSvg}
    ${scourFill ? `<path d="${scourFill}" fill="url(#sec-scour-fill)" stroke="none"/>` : ''}
    ${depositFill ? `<path d="${depositFill}" fill="url(#sec-deposit-fill)" stroke="none"/>` : ''}
    <line x1="${L}" y1="${y0}" x2="${W - R}" y2="${y0}" stroke="${CH.zero}" stroke-width="1.25" stroke-dasharray="5 4"/>
    <line x1="${L}" y1="${yFoot}" x2="${W - R}" y2="${yFoot}" stroke="${CH.foot}" stroke-width="2" stroke-linecap="round"/>
    <path d="${P(mid)}" fill="none" stroke="${CH.mid}" stroke-width="2" stroke-dasharray="6 5" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
    <path d="${P(cur)}" fill="none" stroke="${CH.cur}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    ${yLabels}${xLabels}
    <text x="${L - 10}" y="${T - 10}" fill="${CH.inkDim}" font-size="10" font-family="system-ui,sans-serif" text-anchor="end">Δz (m)</text>
    <text x="${L + plotW / 2}" y="${H - 6}" fill="${CH.inkDim}" font-size="10" font-family="system-ui,sans-serif" text-anchor="middle">단면 거리 (m)</text>
    <text x="${W - R - 4}" y="${y0 - 6}" fill="${CH.ink}" font-size="9.5" font-family="system-ui,sans-serif" text-anchor="end">초기 하상 0 m</text>
    <text x="${W - R - 4}" y="${yFoot + 14}" fill="${CH.foot}" font-size="9.5" font-weight="600" font-family="system-ui,sans-serif" text-anchor="end">기초 −${foundationDepthM.toFixed(2)} m</text>
  </svg>`;
}

export interface SectionProfilePanelHandlers {
  onSectionChange: (section: SectionId) => void;
}

/** 6번 화면 하단 — 단면 그래프 + KPI 카드 */
export class SectionProfilePanel implements Disposable {
  public readonly element: HTMLElement;
  private section: SectionId = 'A';
  private readonly chartHost: HTMLElement;
  private readonly kpiHost: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly midLabel: HTMLElement;
  private readonly curLabel: HTMLElement;
  private readonly handlers: SectionProfilePanelHandlers;
  private resizeObserver: ResizeObserver | null = null;
  private lastSeries: ScourSeries | null = null;
  private lastTime = 0;
  private lastFoundation = 0;
  private lastPiers: PierDefinition[] = [];
  private lastKpi: SectionKpi | null = null;

  public constructor(handlers: SectionProfilePanelHandlers) {
    this.handlers = handlers;
    this.element = document.createElement('div');
    this.element.className = 'section-profile-panel';
    this.element.id = 'section-panel';

    const head = document.createElement('div');
    head.className = 'section-profile-panel__head';

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'section-profile-panel__title';

    const seg = document.createElement('div');
    seg.className = 'section-profile-panel__seg';
    for (const [id, label] of [
      ['A', 'A–A′ 종단'],
      ['B', 'B–B′ 횡단'],
    ] as const) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.dataset.section = id;
      btn.addEventListener('click', () => {
        this.section = id;
        this.syncSeg();
        this.handlers.onSectionChange(id);
      });
      seg.appendChild(btn);
    }

    const legend = document.createElement('div');
    legend.className = 'section-profile-panel__legend';
    const mkLeg = (cls: string, label: string): HTMLElement => {
      const item = document.createElement('span');
      item.className = `section-profile-panel__legend-item ${cls}`;
      item.append(document.createElement('i'), document.createTextNode(label));
      return item;
    };
    this.midLabel = mkLeg('is-mid', '');
    this.curLabel = mkLeg('is-cur', '');
    legend.append(
      mkLeg('is-scour', '세굴'),
      mkLeg('is-deposit', '퇴적'),
      this.midLabel,
      this.curLabel,
      mkLeg('is-foot', '기초 저면'),
    );

    head.append(this.titleEl, seg, legend);
    this.chartHost = document.createElement('div');
    this.chartHost.className = 'section-profile-panel__chart';
    this.kpiHost = document.createElement('div');
    this.kpiHost.className = 'section-profile-panel__kpis';

    this.element.append(head, this.chartHost, this.kpiHost);
    this.syncSeg();
    this.setTitle();

    this.resizeObserver = new ResizeObserver(() => {
      if (this.lastSeries && this.lastKpi) {
        this.paintChart(this.lastSeries, this.lastTime, this.lastFoundation, this.lastPiers);
      }
    });
    this.resizeObserver.observe(this.chartHost);
  }

  /** 레이아웃 전환(6번 진입) 직후 차트가 컨테이너 크기를 다시 잡도록 */
  public notifyLayout(): void {
    if (this.lastSeries && this.lastKpi) {
      this.paintChart(this.lastSeries, this.lastTime, this.lastFoundation, this.lastPiers);
    }
  }

  private paintChart(
    series: ScourSeries,
    timeSeconds: number,
    foundationDepthM: number,
    piers: PierDefinition[],
  ): void {
    const midT = timeSeconds / 4;
    const cw = this.chartHost.clientWidth;
    const ch = Math.max(this.chartHost.clientHeight, 80);
    const viewAspect = cw > 0 && ch > 0 ? cw / ch : undefined;
    this.chartHost.innerHTML = buildProfSvg(
      series,
      this.section,
      timeSeconds,
      midT,
      foundationDepthM,
      piers,
      viewAspect,
    );
  }

  public getSection(): SectionId {
    return this.section;
  }

  public setSection(section: SectionId): void {
    this.section = section;
    this.syncSeg();
    this.setTitle();
  }

  public update(
    series: ScourSeries,
    timeSeconds: number,
    foundationDepthM: number,
    piers: PierDefinition[],
    kpi: SectionKpi,
  ): void {
    const midT = timeSeconds / 4;
    this.midLabel.lastChild!.textContent = `t = ${Math.round(midT)} s`;
    this.curLabel.lastChild!.textContent = `t = ${Math.round(timeSeconds)} s · 현재`;
    this.lastSeries = series;
    this.lastTime = timeSeconds;
    this.lastFoundation = foundationDepthM;
    this.lastPiers = piers;
    this.lastKpi = kpi;
    this.paintChart(series, timeSeconds, foundationDepthM, piers);
    const g = gradeOf(kpi.maxScourDepthM, foundationDepthM);
    const cards: Array<[string, string, string]> = [
      ['최대 세굴 깊이 (P2)', `${kpi.maxScourDepthM.toFixed(2)} m`, g.color],
      [
        '단면 최대 퇴적',
        kpi.maxDepositM > 1e-5 ? `${kpi.maxDepositM.toFixed(3)} m` : '—',
        '#C4A574',
      ],
      ['세굴폭 (P2 세굴공)', `${kpi.scourWidthM.toFixed(2)} m`, '#fff'],
      ['세굴공 단면적', `${kpi.scourAreaM2.toFixed(3)} m²`, '#fff'],
      [
        '기초 저면까지 여유',
        `${kpi.marginToFootingM.toFixed(2)} m (${kpi.marginRemainPct.toFixed(0)} %)`,
        g.color,
      ],
    ];
    this.kpiHost.innerHTML = cards
      .map(
        ([label, value, color]) =>
          `<div class="section-profile-panel__kpi"><div class="section-profile-panel__kpi-label">${label}</div><div class="section-profile-panel__kpi-value" style="color:${color}">${value}</div></div>`,
      )
      .join('');
  }

  private syncSeg(): void {
    for (const btn of this.element.querySelectorAll<HTMLButtonElement>(
      '.section-profile-panel__seg button',
    )) {
      btn.classList.toggle('is-on', btn.dataset.section === this.section);
    }
  }

  private setTitle(): void {
    this.titleEl.textContent =
      this.section === 'A'
        ? '단면 A–A′ · 흐름 방향 종단 (P1·P2·P3 관통)'
        : '단면 B–B′ · 횡단 (P2 관통)';
  }

  public dispose(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.element.remove();
  }
}
