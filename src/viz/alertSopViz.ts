import { GRADES, type GradeKey } from '@/constants/grade';
import type { MockAlertRecord } from '@/data/mockAlertRecords';
import { animateVizBars, bindVizCountUps, settleVizBars, settleVizCountUps } from '@/viz/vizMotion';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export interface AlertKpiStripInput {
  activeCount: number;
  closedCount: number;
  sopDone: number;
  sopTotal: number;
  canClose: boolean;
  focusGradeName: string;
  focusGradeColor: string;
  focusPier: string;
  caseId: string;
  durationSeconds: number;
}

export interface AlertFlowGuideInput {
  pier: string;
  allDone: boolean;
  closed: boolean;
}

/** 화면 읽는 순서 — ① 선택 → ② SOP → ③ 종료 */
export function renderAlertFlowGuide(input: AlertFlowGuideInput): string {
  const step1 = 'is-done';
  const step2 = input.closed || input.allDone ? 'is-done' : 'is-current';
  const step3 = input.closed ? 'is-done' : input.allDone ? 'is-current' : 'is-next';
  const step3Label = input.closed
    ? '경보 종료됨'
    : input.allDone
      ? '종료 버튼을 누르세요'
      : 'SOP 완료 후 가능';
  return `<nav class="alert-sop-flow viz-widget" aria-label="경보 대응 순서">
    <div class="alert-sop-flow__steps">
      <div class="alert-sop-flow__step ${step1}">
        <span class="alert-sop-flow__orb" aria-hidden="true">1</span>
        <div class="alert-sop-flow__copy">
          <strong>경보 선택</strong>
          <span>왼쪽 목록 · 현재 <em>${esc(input.pier)}</em></span>
        </div>
      </div>
      <div class="alert-sop-flow__wire" aria-hidden="true"></div>
      <div class="alert-sop-flow__step ${step2}">
        <span class="alert-sop-flow__orb" aria-hidden="true">2</span>
        <div class="alert-sop-flow__copy">
          <strong>SOP 조치</strong>
          <span>가운데 체크리스트 · 완료 처리</span>
        </div>
      </div>
      <div class="alert-sop-flow__wire" aria-hidden="true"></div>
      <div class="alert-sop-flow__step ${step3}">
        <span class="alert-sop-flow__orb" aria-hidden="true">3</span>
        <div class="alert-sop-flow__copy">
          <strong>경보 종료</strong>
          <span>${step3Label}</span>
        </div>
      </div>
    </div>
  </nav>`;
}

export function renderAlertColHeader(
  step: number,
  title: string,
  desc: string,
  mod?: string,
  options?: { compact?: boolean },
): string {
  const modCls = mod ? ` alert-sop-col-head--${mod}` : '';
  const compactCls = options?.compact ? ' alert-sop-col-head--compact' : '';
  const descHtml =
    desc && !options?.compact ? `<p class="alert-sop-col-head__desc">${desc}</p>` : '';
  return `<div class="alert-sop-col-head${modCls}${compactCls}">
    <span class="alert-sop-col-head__step">STEP ${step}</span>
    <h2 class="alert-sop-page__h2 alert-sop-col-head__title">${title}</h2>
    ${descHtml}
  </div>`;
}

export interface AlertHeroInput {
  pier: string;
  gradeName: string;
  gradeKey: GradeKey;
  gradeColor: string;
  scourM: number;
  foundationM: number;
  remain: number;
  issuedAt: string;
  assignee: string;
  caseId: string;
  closed: boolean;
  ringHtml: string;
  closeLabel: string;
  closeClass: string;
  closeAttrs: string;
  allDone: boolean;
}

export function renderAlertHero(input: AlertHeroInput): string {
  const statusChip = input.closed
    ? '<span class="alert-sop-hero__chip is-closed">종료</span>'
    : input.allDone
      ? '<span class="alert-sop-hero__chip is-ready">종료 가능</span>'
      : '<span class="alert-sop-hero__chip is-active">조치 중</span>';
  return `<div class="alert-sop-page__focus alert-sop-page__focus--hero alert-sop-hero" style="--focus-accent:${input.gradeColor}">
    <div class="alert-sop-hero__top">
      <div class="alert-sop-hero__identity">
        <span class="alert-sop-hero__eyebrow">선택 경보</span>
        <div class="alert-sop-hero__title-row">
          <span class="grade-pill grade-pill--${input.gradeKey}">${esc(input.gradeName)}</span>
          ${statusChip}
        </div>
        <h3 class="alert-sop-hero__pier">${esc(input.pier)} <span class="alert-sop-hero__case">${esc(input.caseId)}</span></h3>
        <p class="alert-sop-hero__meta">발령 ${esc(input.issuedAt)} · 담당 ${esc(input.assignee)}</p>
      </div>
      <div class="alert-sop-hero__gauge">${input.ringHtml}<span class="alert-sop-hero__gauge-cap">잔여 여유율</span></div>
    </div>
    <div class="alert-sop-hero__stats">
      <div class="alert-sop-hero__stat">
        <span class="alert-sop-hero__stat-label">세굴 깊이</span>
        <span class="alert-sop-hero__stat-val">${input.scourM.toFixed(2)}<small>m</small></span>
      </div>
      <div class="alert-sop-hero__stat">
        <span class="alert-sop-hero__stat-label">기초 근입</span>
        <span class="alert-sop-hero__stat-val">${input.foundationM.toFixed(1)}<small>m</small></span>
      </div>
      <div class="alert-sop-hero__stat alert-sop-hero__stat--accent" style="--stat-accent:${input.gradeColor}">
        <span class="alert-sop-hero__stat-label">판정</span>
        <span class="alert-sop-hero__stat-val">${esc(input.gradeName)}</span>
      </div>
    </div>
    <div class="alert-sop-hero__foot">
      <p class="alert-sop-hero__foot-hint">${input.closed ? '종료된 경보입니다. 목록에서 다른 경보를 선택하세요.' : input.allDone ? 'SOP 완료 — 종료 버튼으로 경보를 닫습니다.' : 'SOP 항목을 <b>완료 처리</b>하세요.'}</p>
      <div class="${input.closeClass} alert-sop-hero__close" style="${input.allDone && !input.closed ? `background:${input.gradeColor}` : ''}" ${input.closeAttrs}>${esc(input.closeLabel)}</div>
    </div>
  </div>`;
}

export function renderAlertNextTask(
  sopIdx: number,
  title: string,
  gradeName: string,
  gradeColor: string,
): string {
  return `<div class="alert-sop-next-task" data-sop-idx="${sopIdx}" style="--task-accent:${gradeColor}">
    <span class="alert-sop-next-task__pulse" aria-hidden="true"></span>
    <div class="alert-sop-next-task__body">
      <span class="alert-sop-next-task__label">지금 할 일</span>
      <strong class="alert-sop-next-task__title">${esc(title)}</strong>
      <span class="alert-sop-next-task__grade">${esc(gradeName)} 등급 조치</span>
    </div>
    <span class="alert-sop-next-task__arrow" aria-hidden="true">↓</span>
  </div>`;
}

/** 상단 KPI + 상태 칩 */
export function renderAlertKpiStrip(input: AlertKpiStripInput): string {
  const pct = input.sopTotal > 0 ? Math.round((input.sopDone / input.sopTotal) * 100) : 0;
  const statusLabel = input.canClose
    ? '종료 가능'
    : input.sopDone >= input.sopTotal
      ? '종료 대기'
      : '조치 진행';
  const statusColor = input.canClose ? '#00ffcc' : '#e8b21a';
  return `<header class="alert-sop-kpi-strip viz-widget" data-widget-id="alert-kpi">
    <div class="alert-sop-kpi-strip__head">
      <div>
        <h1 class="alert-sop-kpi-strip__title">경보 · SOP 대응 센터</h1>
        <p class="alert-sop-kpi-strip__hint">교각 <b>${esc(input.focusPier)}</b> · <b>${esc(input.caseId)}</b> · t=${Math.round(input.durationSeconds)}s · 진행 ${input.activeCount} · 종료 ${input.closedCount}</p>
      </div>
      <span class="alert-sop-kpi-strip__live" aria-hidden="true"><i></i>실시간 연동</span>
    </div>
    <div class="alert-sop-kpi-strip__cards">
      <div class="alert-sop-kpi-card" data-alert-kpi="active" data-tip="진행 중 경보">
        <span class="alert-sop-kpi-card__label">진행</span>
        <span class="alert-sop-kpi-card__val"><b data-bi-count="${input.activeCount}" data-bi-decimals="0">0</b></span>
        <span class="alert-sop-kpi-card__bar" aria-hidden="true"><i data-bar-pct="${Math.min(100, input.activeCount * 8)}" style="width:0;background:#E8791A"></i></span>
      </div>
      <div class="alert-sop-kpi-card" data-alert-kpi="closed" data-tip="종료된 경보">
        <span class="alert-sop-kpi-card__label">종료</span>
        <span class="alert-sop-kpi-card__val"><b data-bi-count="${input.closedCount}" data-bi-decimals="0">0</b></span>
        <span class="alert-sop-kpi-card__bar" aria-hidden="true"><i data-bar-pct="${Math.min(100, input.closedCount * 8)}" style="width:0;background:#2EA36B"></i></span>
      </div>
      <div class="alert-sop-kpi-card alert-sop-kpi-card--accent" data-alert-kpi="sop" style="--kpi-accent:${input.focusGradeColor}">
        <span class="alert-sop-kpi-card__label">SOP 완료</span>
        <span class="alert-sop-kpi-card__val"><b data-bi-count="${pct}" data-bi-suffix="%" data-bi-decimals="0">0</b></span>
        <span class="alert-sop-kpi-card__sub">${input.sopDone}/${input.sopTotal} 단계</span>
        <span class="alert-sop-kpi-card__bar" aria-hidden="true"><i data-bar-pct="${pct}" style="width:0;background:${input.focusGradeColor}"></i></span>
      </div>
      <div class="alert-sop-kpi-card alert-sop-kpi-card--status ${input.canClose ? 'is-ready' : ''}" data-alert-kpi="status">
        <span class="alert-sop-kpi-card__label">상태</span>
        <span class="alert-sop-kpi-card__status" style="color:${statusColor}">${statusLabel}</span>
        <span class="alert-sop-kpi-card__grade" style="color:${input.focusGradeColor}">${esc(input.focusGradeName)}</span>
      </div>
    </div>
  </header>`;
}

export interface AlertListCardInput {
  rec: MockAlertRecord;
  gradeKey: GradeKey;
  gradeName: string;
  gradeColor: string;
  remainPct: number;
  statusText: string;
  assignee: string;
  isFocus: boolean;
}

export function renderAlertListCard(input: AlertListCardInput): string {
  const { rec, gradeColor, gradeName, gradeKey, remainPct, statusText, assignee, isFocus } = input;
  const barW = Math.max(4, Math.min(100, remainPct));
  const pickHint = isFocus ? '<span class="alert-sop-page__alert-pick">선택됨</span>' : '';
  return `<button type="button" class="alert-sop-page__alert-item ${isFocus ? 'is-focus' : ''}" data-act="alert-pick" data-alert-id="${esc(rec.id)}" data-grade-key="${gradeKey}" data-status="${rec.status}" style="--alert-accent:${gradeColor}">
    <span class="alert-sop-page__alert-accent" aria-hidden="true"></span>
    ${pickHint}
    <div class="alert-sop-page__alert-head">
      <span class="grade-pill grade-pill--${gradeKey}">${gradeName}</span>
      <span class="alert-sop-page__alert-pier">${esc(rec.pier)}</span>
      <span class="alert-sop-page__alert-time">${esc(rec.issuedAt)}</span>
    </div>
    <div class="alert-sop-page__alert-sub alert-sop-page__alert-sub--viz">
      <span class="alert-sop-page__remain-ring" aria-hidden="true" data-tip="잔여 여유율(%)">
        <svg viewBox="0 0 36 36" width="44" height="44"><circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3"/>
        <circle cx="18" cy="18" r="15" fill="none" stroke="${gradeColor}" stroke-width="3" stroke-dasharray="${(barW / 100) * 94} 94" stroke-linecap="round" transform="rotate(-90 18 18)"/>
        <text x="18" y="19" text-anchor="middle" fill="#e8f0fa" font-size="8" font-weight="600">여유</text>
        <text x="18" y="27" text-anchor="middle" fill="#fff" font-size="10" font-weight="800">${Math.round(remainPct)}</text></svg>
      </span>
      <div class="alert-sop-page__alert-status-wrap">
        <span class="alert-sop-page__alert-status" data-tip="담당 ${esc(assignee)}"><b>${esc(statusText)}</b></span>
        <span class="alert-sop-page__alert-case">${esc(rec.caseId)}</span>
      </div>
    </div>
  </button>`;
}

export function renderAlertGradeCards(focusKey: GradeKey): string {
  return GRADES.map(
    (
      g,
    ) => `<button type="button" class="alert-sop-page__grade-card ${g.key === focusKey ? 'is-on' : ''}" data-act="grade-card" data-grade-key="${g.key}" style="--g:${g.color}">
      <span class="alert-sop-page__grade-card-swatch"></span>
      <span class="alert-sop-page__grade-card-name">${g.name}</span>
      <span class="alert-sop-page__grade-card-en">${g.en}</span>
      <p class="alert-sop-page__grade-card-act">${esc(g.action)}</p>
    </button>`,
  ).join('');
}

function clearSpotlights(root: Element): void {
  root.querySelectorAll('.is-spotlight').forEach((el) => el.classList.remove('is-spotlight'));
}

function setSpotlight(root: Element, attr: string, id: string | null, selector: string): void {
  root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    el.classList.toggle('is-spotlight', !!id && el.getAttribute(attr) === id);
  });
}

export interface AlertSopVizBindOptions {
  /** 최초 화면 진입 시에만 true */
  enter?: boolean;
  animateBars?: boolean;
  animateCount?: boolean;
}

function handleAlertSopSpotlightOver(root: HTMLElement, t: HTMLElement): void {
  const kpi = t.closest('[data-alert-kpi]');
  if (kpi instanceof HTMLElement) {
    clearSpotlights(root);
    kpi.classList.add('is-spotlight');
    return;
  }

  const donut = t.closest('[data-donut-id]');
  if (donut instanceof HTMLElement) {
    clearSpotlights(root);
    donut.classList.add('is-spotlight');
    const id = donut.getAttribute('data-donut-id');
    setSpotlight(
      root,
      'data-status',
      id === 'active' ? 'active' : id === 'closed' ? 'closed' : null,
      '.alert-sop-page__alert-item',
    );
    return;
  }

  const heat = t.closest('.viz-heat-strip__cell');
  if (heat instanceof HTMLElement) {
    clearSpotlights(root);
    heat.classList.add('is-spotlight');
    return;
  }

  const alert = t.closest('[data-act="alert-pick"]');
  if (alert instanceof HTMLElement) {
    clearSpotlights(root);
    alert.classList.add('is-spotlight');
    return;
  }

  const sop = t.closest('.alert-sop-page__sop-row');
  if (sop instanceof HTMLElement) {
    clearSpotlights(root);
    sop.classList.add('is-spotlight');
    return;
  }

  const hist = t.closest('.viz-event-timeline__item');
  if (hist instanceof HTMLElement) {
    root.querySelectorAll('.viz-event-timeline__item').forEach((el) => {
      el.classList.toggle('is-spotlight', el === hist);
    });
    return;
  }

  const grade = t.closest('[data-act="grade-card"]');
  if (grade instanceof HTMLElement) {
    clearSpotlights(root);
    grade.classList.add('is-spotlight');
    const key = grade.getAttribute('data-grade-key');
    setSpotlight(root, 'data-grade-key', key, '.alert-sop-page__alert-item');
  }
}

/** innerHTML 교체 후에도 유지 — 페이지 루트에 한 번만 연결 */
export function attachAlertSopSpotlight(root: HTMLElement): () => void {
  const onOver = (e: Event): void => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    handleAlertSopSpotlightOver(root, t);
  };

  const onOut = (e: Event): void => {
    const rel = (e as MouseEvent).relatedTarget;
    if (rel instanceof Node && root.contains(rel)) return;
    clearSpotlights(root);
  };

  root.addEventListener('mouseover', onOver);
  root.addEventListener('mouseout', onOut);

  return () => {
    root.removeEventListener('mouseover', onOver);
    root.removeEventListener('mouseout', onOut);
    clearSpotlights(root);
  };
}

/** KPI 진입·갱신 모션 (호버는 attachAlertSopSpotlight) */
export function bindAlertSopViz(root: HTMLElement, opts: AlertSopVizBindOptions = {}): () => void {
  const { enter = true, animateBars = true, animateCount = true } = opts;
  root.classList.add('alert-sop-page--viz');
  if (enter) {
    root.classList.add('alert-sop-page--enter');
    window.setTimeout(() => root.classList.remove('alert-sop-page--enter'), 900);
  } else {
    root.classList.add('alert-sop-page--soft-update');
    requestAnimationFrame(() => root.classList.remove('alert-sop-page--soft-update'));
  }

  if (animateBars) animateVizBars(root);
  else settleVizBars(root);

  const countStops = animateCount ? bindVizCountUps(root, 'alert-sop') : [];
  if (!animateCount) settleVizCountUps(root);

  return () => {
    countStops.forEach((s) => s());
    root.classList.remove('alert-sop-page--enter', 'alert-sop-page--soft-update');
  };
}

/** 클릭·토글 직후 짧은 피드백 (전체 재진입 없음) */
export function flashAlertSopTarget(root: HTMLElement, selector: string): void {
  const el = root.querySelector(selector);
  if (!(el instanceof HTMLElement)) return;
  el.classList.remove('is-action-flash');
  void el.offsetWidth;
  el.classList.add('is-action-flash');
  window.setTimeout(() => el.classList.remove('is-action-flash'), 480);
}
