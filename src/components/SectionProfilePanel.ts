import { gradeOf } from '@/constants/grade';
import type { PierDefinition } from '@/modules/PierMarker';
import type { ScourSeries } from '@/types/terrain';
import type { Disposable } from '@/types/disposable';
import { observeWidgetTier } from '@/viz/widget';
import { animateVizBars } from '@/viz/vizMotion';
import { tweenNumber } from '@/viz/tween';
import {
  defaultTransversePierId,
  piersOnSection,
  sampleSectionProfile,
  sectionLengthM,
  sectionPointAtDistance,
  sectionProfileChartYDomain,
  type SectionId,
  type SectionKpi,
  type SectionSample,
  type SectionWorldPoint,
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
  scour: '#7fb3e0',
  deposit: '#d4b88a',
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
  hoverS: number | null = null,
  transversePierId?: string,
): string {
  const tid = transversePierId ?? defaultTransversePierId(piers);
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
  const cur = sampleSectionProfile(series, section, timeSeconds, 160, piers, tid);
  const mid = sampleSectionProfile(series, section, midTimeSeconds, 160, piers, tid);
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
      yLabels += `<text x="${L - 10}" y="${y + 4}" fill="${CH.ink}" font-size="12.5" font-family="system-ui,sans-serif" text-anchor="end">${v.toFixed(foundationDepthM > 1 ? 0 : 2)}</text>`;
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
    xLabels += `<text x="${x}" y="${H - 18}" fill="${CH.ink}" font-size="12" font-family="system-ui,sans-serif" text-anchor="middle">${s.toFixed(len > 10 ? 0 : 2)}</text>`;
  }

  const pierSvg = piersOnSection(series, section, piers, tid)
    .map((p) => {
      const halfD = p.diameterM * 0.5;
      const s0 = Math.max(0, p.s - halfD);
      const s1 = Math.min(len, p.s + halfD);
      const xLeft = X(s0);
      const w = Math.max(4, X(s1) - xLeft);
      const yTop = T;
      const h = Y(-foundationDepthM) - T;
      return `<rect x="${xLeft}" y="${yTop}" width="${w}" height="${h}" rx="2" fill="${CH.pier}" opacity="0.28" stroke="rgba(207,224,236,0.35)" stroke-width="1"/>
      <text x="${X(p.s)}" y="${T + 14}" fill="#e8f0fa" font-size="12.5" font-weight="600" font-family="system-ui,sans-serif" text-anchor="middle">${p.pierId}</text>`;
    })
    .join('');

  const y0 = Y(0);
  const yFoot = Y(-foundationDepthM);
  let hoverSvg = '';
  if (hoverS !== null && cur.length > 0) {
    const clamped = Math.max(0, Math.min(hoverS, len));
    const nearest = cur.reduce((best, p) =>
      Math.abs(p.s - clamped) < Math.abs(best.s - clamped) ? p : best,
    );
    const hx = X(clamped);
    const hy = Y(nearest.deltaM);
    hoverSvg = `<line x1="${hx}" y1="${T}" x2="${hx}" y2="${T + plotH}" stroke="${CH.cur}" stroke-width="1.25" stroke-dasharray="3 3"/>
    <circle cx="${hx}" cy="${hy}" r="4.5" fill="${CH.cur}" stroke="#fff" stroke-width="1.5"/>`;
  }

  return `<svg class="section-profile-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="초기 하상 대비 단면 하상 높이 변화" data-plot-l="${L}" data-plot-t="${T}" data-plot-w="${plotW}" data-plot-h="${plotH}" data-len="${len}">
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
    ${hoverSvg}
    </g>
    ${yLabels}${xLabels}
    <text x="${L - 10}" y="${T - 10}" fill="${CH.inkDim}" font-size="12" font-family="system-ui,sans-serif" text-anchor="end">Δz (m)</text>
    <text x="${L + 8}" y="${Math.max(T + 12, y0 - 24)}" fill="${CH.deposit}" font-size="12" font-family="system-ui,sans-serif">▲ 퇴적 (+) · 하상이 쌓임</text>
    <text x="${L + 8}" y="${Math.min(T + plotH - 8, y0 + 32)}" fill="${CH.scour}" font-size="12" font-family="system-ui,sans-serif">▼ 세굴 (−) · 하상이 깎임</text>
    <text x="${L + plotW / 2}" y="${H - 6}" fill="${CH.inkDim}" font-size="12" font-family="system-ui,sans-serif" text-anchor="middle">단면 거리 (m)</text>
    <text x="${W - R - 4}" y="${y0 - 6}" fill="${CH.ink}" font-size="12.5" font-family="system-ui,sans-serif" text-anchor="end">초기 하상 (t = 0 s) · 변화 0</text>
    <text x="${W - R - 4}" y="${yFoot + 14}" fill="${CH.foot}" font-size="12.5" font-weight="600" font-family="system-ui,sans-serif" text-anchor="end">기초 바닥 −${foundationDepthM.toFixed(2)} m (하단부 매립 깊이) · 여기까지 깎이면 기초 노출</text>
  </svg>`;
}

export interface SectionProfilePanelHandlers {
  onSectionChange: (section: SectionId) => void;
  /** B–B′ 교각 전환 — 평면 단면선·KPI 동기화 */
  onTransversePierChange?: (pierId: string) => void;
  /** 그래프 가로 위치 → 단면선 위의 월드 좌표. 벗어나면 null */
  onHover?: (point: SectionWorldPoint | null) => void;
}

/** 6번 화면 하단 — 단면 그래프 + KPI 카드 */
export class SectionProfilePanel implements Disposable {
  public readonly element: HTMLElement;
  private section: SectionId = 'A';
  private transversePierId = 'P2';
  private readonly chartHost: HTMLElement;
  private readonly kpiHost: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly pierSegHost: HTMLElement;
  private readonly midLabel: HTMLElement;
  private readonly curLabel: HTMLElement;
  private readonly handlers: SectionProfilePanelHandlers;
  private resizeObserver: ResizeObserver | null = null;
  private lastSeries: ScourSeries | null = null;
  private lastTime = 0;
  private lastFoundation = 0;
  private lastPiers: PierDefinition[] = [];
  private lastKpi: SectionKpi | null = null;
  private hoverS: number | null = null;
  private pierSegBuiltKey = '';
  private kpiShellReady = false;

  public constructor(handlers: SectionProfilePanelHandlers) {
    this.handlers = handlers;
    this.element = document.createElement('div');
    this.element.className = 'section-profile-panel section-profile-panel--viz viz-widget';
    this.element.dataset.widgetId = 'section-profile';
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
        this.syncPierSeg();
        this.clearHover();
        this.handlers.onSectionChange(id);
        this.setTitle();
        if (this.lastSeries) {
          this.paintChart(this.lastSeries, this.lastTime, this.lastFoundation, this.lastPiers);
        }
      });
      seg.appendChild(btn);
    }

    const legend = document.createElement('div');
    legend.className = 'section-profile-panel__legend';
    const mkLeg = (cls: string, label: string, tip: string): HTMLElement => {
      const item = document.createElement('span');
      item.className = `section-profile-panel__legend-item ${cls}`;
      item.title = tip;
      item.append(document.createElement('i'), document.createTextNode(label));
      return item;
    };
    this.midLabel = mkLeg(
      'is-mid',
      '',
      '비교용 과거 하상 — 지금 재생 시각의 1/4 지점에서 하상이 얼마나 변해 있었는지 점선으로 보여 줍니다.',
    );
    this.curLabel = mkLeg(
      'is-cur',
      '',
      '지금 재생 시각의 하상 — 시간 슬라이더를 움직이면 이 선이 따라 움직입니다.',
    );
    legend.append(
      mkLeg(
        'is-scour',
        '세굴 (하상이 깎인 곳)',
        '현재 하상이 초기 하상(0 m 선)보다 낮아진 구간입니다. 파란 면적이 깎여 나간 모래의 단면입니다.',
      ),
      mkLeg(
        'is-deposit',
        '퇴적 (하상이 쌓인 곳)',
        '현재 하상이 초기 하상(0 m 선)보다 높아진 구간입니다. 갈색 면적이 쌓인 모래의 단면입니다.',
      ),
      this.midLabel,
      this.curLabel,
      mkLeg(
        'is-foot',
        '기초 바닥 (매립 깊이)',
        '하단부(총 높이 0.13 m) 중 모래에 묻힌 깊이(매립높이 0.08 m, 환경조건)입니다. 세굴 깊이가 이 선에 닿으면 기초가 완전히 노출됩니다.',
      ),
    );
    const caption = document.createElement('div');
    caption.className = 'section-profile-panel__caption';
    this.pierSegHost = document.createElement('div');
    this.pierSegHost.className = 'section-profile-panel__pier-seg';
    head.append(this.titleEl, seg, this.pierSegHost, legend, caption);
    this.chartHost = document.createElement('div');
    this.chartHost.className = 'section-profile-panel__chart viz-tier viz-tier--basic';
    this.kpiHost = document.createElement('div');
    this.kpiHost.className = 'section-profile-panel__kpis';

    this.chartHost.addEventListener('pointermove', this.onChartPointer);
    this.chartHost.addEventListener('pointerleave', this.onChartLeave);
    this.element.append(head, this.chartHost, this.kpiHost);
    observeWidgetTier(this.element);
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
      this.hoverS,
      this.transversePierId,
    );
  }

  private onChartPointer = (event: PointerEvent): void => {
    if (!this.lastSeries) return;
    const svg = this.chartHost.querySelector('svg');
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const plotL = Number(svg.dataset.plotL);
    const plotT = Number(svg.dataset.plotT);
    const plotW = Number(svg.dataset.plotW);
    const plotH = Number(svg.dataset.plotH);
    const len = Number(svg.dataset.len);
    if (![plotL, plotT, plotW, plotH, len].every((n) => Number.isFinite(n)) || plotW <= 0) return;

    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    const inside =
      local.x >= plotL && local.x <= plotL + plotW && local.y >= plotT && local.y <= plotT + plotH;
    if (!inside) {
      this.clearHover();
      return;
    }
    const s = ((local.x - plotL) / plotW) * len;
    this.hoverS = s;
    this.handlers.onHover?.(
      sectionPointAtDistance(
        this.lastSeries,
        this.section,
        s,
        this.lastPiers,
        this.transversePierId,
      ),
    );
  };

  private onChartLeave = (): void => {
    this.clearHover();
  };

  private clearHover(): void {
    if (this.hoverS === null) return;
    this.hoverS = null;
    this.handlers.onHover?.(null);
  }

  public getSection(): SectionId {
    return this.section;
  }

  public getTransversePierId(): string {
    return this.transversePierId;
  }

  public setTransversePierId(pierId: string): void {
    if (!this.lastPiers.some((p) => p.id === pierId)) return;
    this.transversePierId = pierId;
    this.syncPierSeg();
    this.setTitle();
    this.clearHover();
    this.handlers.onTransversePierChange?.(pierId);
    if (this.lastSeries) {
      this.paintChart(this.lastSeries, this.lastTime, this.lastFoundation, this.lastPiers);
    }
  }

  public setSection(section: SectionId): void {
    this.section = section;
    this.syncSeg();
    this.syncPierSeg();
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
    const atStart = timeSeconds < 0.5;
    this.midLabel.hidden = atStart;
    this.midLabel.lastChild!.textContent = `t = ${Math.round(midT)} s 하상 (비교 · 현재의 1/4 시점)`;
    this.curLabel.lastChild!.textContent = atStart
      ? 't = 0 s 하상 (현재 · 초기 상태)'
      : `t = ${Math.round(timeSeconds)} s 하상 (현재)`;
    this.lastSeries = series;
    this.lastTime = timeSeconds;
    this.lastFoundation = foundationDepthM;
    this.lastPiers = piers;
    this.lastKpi = kpi;
    if (!piers.some((p) => p.id === this.transversePierId)) {
      this.transversePierId = defaultTransversePierId(piers);
    }
    this.syncPierSeg();
    this.setTitle();
    this.paintChart(series, timeSeconds, foundationDepthM, piers);
    this.ensureKpiShell();
    this.paintKpiValues(kpi, foundationDepthM);
  }

  private ensureKpiShell(): void {
    if (this.kpiShellReady) return;
    this.kpiShellReady = true;
    const mk = (idx: number, tier: string): string =>
      `<div class="section-profile-panel__kpi section-profile-panel__kpi--viz viz-kpi-visual ${tier}" data-kpi-idx="${idx}">
        <div class="viz-kpi-visual__label" data-kpi-label></div>
        <div class="viz-kpi-visual__value" data-kpi-value></div>
        <div class="viz-kpi-visual__viz" data-kpi-viz></div>
      </div>`;
    this.kpiHost.innerHTML = `<div class="viz-tier viz-tier--core section-profile-panel__kpis-row">${mk(0, '')}${mk(1, '')}</div>
      <div class="viz-tier viz-tier--detail section-profile-panel__kpis-row">${mk(2, '')}${mk(3, '')}${mk(4, '')}</div>`;
  }

  private paintKpiValues(kpi: SectionKpi, foundationDepthM: number): void {
    const g = gradeOf(kpi.maxScourDepthM, foundationDepthM);
    const focusPier = this.transversePierId;
    const specs: Array<{
      label: string;
      num: number | null;
      suffix: string;
      decimals: number;
      color: string;
      barPct?: number;
      area?: boolean;
    }> = [
      {
        label: `최대 세굴 깊이 (${focusPier})`,
        num: kpi.maxScourDepthM,
        suffix: ' m',
        decimals: 2,
        color: g.color,
      },
      {
        label: '단면 최대 퇴적',
        num: kpi.maxDepositM > 1e-5 ? kpi.maxDepositM : null,
        suffix: ' m',
        decimals: 3,
        color: '#C4A574',
      },
      {
        label: '세굴폭 (P2 세굴공)',
        num: kpi.scourWidthM,
        suffix: ' m',
        decimals: 2,
        color: '#e8f0fa',
        barPct: Math.min(100, (kpi.scourWidthM / 12) * 100),
      },
      {
        label: '세굴공 단면적',
        num: kpi.scourAreaM2,
        suffix: ' m²',
        decimals: 3,
        color: '#e8f0fa',
        area: true,
      },
      {
        label: '기초 저면까지 여유',
        num: kpi.marginToFootingM,
        suffix: ` m (${kpi.marginRemainPct.toFixed(0)}%)`,
        decimals: 2,
        color: g.color,
        barPct: kpi.marginRemainPct,
      },
    ];

    specs.forEach((spec, idx) => {
      const card = this.kpiHost.querySelector<HTMLElement>(`[data-kpi-idx="${idx}"]`);
      if (!card) return;
      const labelEl = card.querySelector('[data-kpi-label]') as HTMLElement;
      const valueEl = card.querySelector('[data-kpi-value]') as HTMLElement;
      const vizEl = card.querySelector('[data-kpi-viz]') as HTMLElement;
      labelEl.textContent = spec.label;
      valueEl.style.color = spec.color;
      if (spec.num == null) {
        valueEl.textContent = '—';
        vizEl.innerHTML = '';
        return;
      }
      const from = Number.parseFloat(valueEl.dataset.vizNum ?? String(spec.num));
      tweenNumber(
        from,
        spec.num,
        (v) => {
          valueEl.dataset.vizNum = String(v);
          if (idx === 4) {
            valueEl.textContent = `${v.toFixed(spec.decimals)} m (${kpi.marginRemainPct.toFixed(0)} %)`;
          } else {
            valueEl.textContent = `${v.toFixed(spec.decimals)}${spec.suffix}`;
          }
        },
        undefined,
        { key: `sec-kpi-${idx}`, durationMs: 320 },
      );
      if (spec.barPct != null) {
        vizEl.innerHTML = `<div class="viz-progress-bar section-profile-panel__kpi-bar"><i data-bar-pct="${spec.barPct.toFixed(1)}" style="width:0;background:${spec.color}"></i></div>`;
        animateVizBars(vizEl);
      } else if (spec.area) {
        vizEl.innerHTML = `<svg width="44" height="22" viewBox="0 0 40 20" aria-hidden="true"><path d="M4 16 Q20 4 36 16 Z" fill="${spec.color}33" stroke="${spec.color}"/></svg>`;
      } else {
        vizEl.innerHTML = '';
      }
    });
  }

  private syncSeg(): void {
    for (const btn of this.element.querySelectorAll<HTMLButtonElement>(
      '.section-profile-panel__seg button',
    )) {
      btn.classList.toggle('is-on', btn.dataset.section === this.section);
    }
  }

  private pierSegKey(): string {
    const ids = [...this.lastPiers]
      .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
      .map((p) => p.id)
      .join(',');
    return `${this.section}|${ids}`;
  }

  private syncPierSegActiveOnly(): void {
    for (const btn of this.pierSegHost.querySelectorAll<HTMLButtonElement>(
      '.section-profile-panel__pier-btn',
    )) {
      btn.classList.toggle('is-on', btn.dataset.pierId === this.transversePierId);
    }
  }

  private syncPierSeg(): void {
    if (this.lastPiers.length === 0) {
      this.pierSegHost.hidden = true;
      this.pierSegHost.replaceChildren();
      this.pierSegBuiltKey = '';
      return;
    }
    this.pierSegHost.hidden = false;
    const key = this.pierSegKey();
    if (key === this.pierSegBuiltKey && this.pierSegHost.childElementCount > 0) {
      this.syncPierSegActiveOnly();
      return;
    }
    this.pierSegBuiltKey = key;
    this.pierSegHost.replaceChildren();
    const sorted = [...this.lastPiers].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
    for (const pier of sorted) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'section-profile-panel__pier-btn';
      btn.textContent = pier.id;
      btn.dataset.pierId = pier.id;
      btn.classList.toggle('is-on', pier.id === this.transversePierId);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setTransversePierId(pier.id);
      });
      this.pierSegHost.appendChild(btn);
    }
  }

  private setTitle(): void {
    this.titleEl.textContent =
      this.section === 'A'
        ? `단면 A–A′ · 흐름 방향 종단 (${this.transversePierId} 관통)`
        : `단면 B–B′ · 횡단 (${this.transversePierId} 관통 · ${this.lastPiers.length}개 선)`;
  }

  public dispose(): void {
    this.chartHost.removeEventListener('pointermove', this.onChartPointer);
    this.chartHost.removeEventListener('pointerleave', this.onChartLeave);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.element.remove();
  }
}
