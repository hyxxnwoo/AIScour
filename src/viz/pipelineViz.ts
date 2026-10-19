import type { MockPipelineFile, PipelineResultKey } from '@/data/mockPipelineFiles';
import {
  PIPELINE_KPI_SECTION_TITLE,
  PIPELINE_QA_QC_EXPLAIN,
  PIPELINE_QA_QC_STAGE_LABEL,
  QA_AUTOMATION_LABEL,
  QA_NRMSE_LABEL,
  QA_PHYSICS_PASS_LABEL,
  QA_TENSOR_QUALITY_LABEL,
} from '@/constants/fieldLabels';
import { renderCaseIdCell, renderUpdatedAtCell } from '@/viz/tableCaseCells';
import { countUpText } from '@/viz/tween';

export type PipelineListSeg = 'all' | PipelineResultKey;

const STAGES = [
  '업로드',
  '파싱',
  '경량화 · 변환',
  PIPELINE_QA_QC_STAGE_LABEL,
  '서비스 반영',
] as const;

export const PIPELINE_RESULT_META: Record<
  PipelineResultKey,
  { label: string; color: string; bg: string }
> = {
  ok: { label: '완료', color: '#5BD6A0', bg: '#10402F' },
  warn: { label: '경고', color: '#E8B21A', bg: '#3D2A0C' },
  err: { label: '오류', color: '#E8796B', bg: '#3B1512' },
  run: { label: '처리중', color: '#6FB6DE', bg: '#102C45' },
  wait: { label: '대기', color: '#9FB6C8', bg: '#1B3350' },
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function parseSizeMb(label: string): number {
  const m = label.match(/([\d.]+)\s*MB/i);
  return m ? Number.parseFloat(m[1]) : 0;
}

export function countFilesAtStage(files: MockPipelineFile[], minProgress: number): number {
  return files.filter((f) => f.stageProgress >= minProgress).length;
}

/** 상단 5단계 + 결과 요약 */
export function renderPipelineStageStrip(
  files: MockPipelineFile[],
  listSeg: PipelineListSeg,
  stageMin: number | 'all',
): string {
  const total = files.length || 1;
  const segCounts = (['ok', 'run', 'warn', 'err', 'wait'] as const).map((k) => ({
    key: k,
    ...PIPELINE_RESULT_META[k],
    count: files.filter((f) => f.result === k).length,
  }));

  const stageCards = STAGES.map((label, i) => {
    const min = i + 1;
    const done = countFilesAtStage(files, min);
    const pct = (done / total) * 100;
    const active = stageMin === min ? ' is-active' : '';
    const tip = esc(`${label} — ${done}/${files.length}건 통과 · 클릭해 해당 단계까지 필터`);
    return `<button type="button" class="pipeline-stage__card${active}" data-act="pipeline-stage" data-stage-min="${min}" data-tip="${tip}">
      <span class="pipeline-stage__idx">${i + 1}</span>
      <span class="pipeline-stage__label">${label}</span>
      <span class="pipeline-stage__count" data-bi-count="${done}">0</span>
      <span class="pipeline-stage__bar" aria-hidden="true"><i data-bar-pct="${pct.toFixed(1)}" style="width:0"></i></span>
    </button>`;
  }).join('<span class="pipeline-stage__conn" aria-hidden="true"></span>');

  const segBtns = segCounts
    .map((s) => {
      const on = listSeg === s.key ? ' is-on' : '';
      return `<button type="button" class="pipeline-seg__chip${on}" data-act="seg" data-seg="${s.key}" data-tip="${esc(`${s.label} ${s.count}건`)}">
        <span class="pipeline-seg__dot" style="--c:${s.color}"></span>${s.label}<b>${s.count}</b>
      </button>`;
    })
    .join('');

  const allOn = listSeg === 'all' && stageMin === 'all' ? ' is-on' : '';
  return `<div class="pipeline-stage-strip pipeline-stage-strip--enter viz-widget-grid" data-widget-id="pipeline-stages">
    <header class="pipeline-stage-strip__head">
      <div>
        <h3 class="pipeline-stage-strip__title">처리 파이프라인</h3>
        <p class="pipeline-stage-strip__hint">단계·결과 칩을 눌러 목록 필터 · 재클릭으로 해제</p>
      </div>
      <button type="button" class="pipeline-seg__chip pipeline-seg__chip--all${allOn}" data-act="pipeline-reset" data-tip="전체 보기">전체 ${files.length}</button>
    </header>
    <div class="pipeline-stage__row">${stageCards}</div>
    <div class="pipeline-seg__row">${segBtns}</div>
  </div>`;
}

export function renderPipelineFileRow(
  f: MockPipelineFile,
  selected: boolean,
  sizePct: number,
): string {
  const tip = esc(`${f.fileName} · ${f.summary}`);
  const steps = renderPipelineStepTrack(f.stageProgress, f.result);
  return `<tr class="pipeline-file-row ${selected ? 'is-selected' : ''}" data-act="pick-file" data-file-id="${esc(f.id)}" data-result="${f.result}" data-stage-progress="${f.stageProgress}" data-tip="${tip}" aria-selected="${selected ? 'true' : 'false'}">
    <td class="mgmt-table__cell pipeline-file-row__name"><span class="pipeline-file-chip"><span class="pipeline-file-chip__ext">CSV</span><span class="pipeline-file-chip__name">${esc(f.fileName)}</span></span></td>
    <td class="mgmt-table__cell">${renderCaseIdCell(f.caseId)}</td>
    <td class="mgmt-table__cell mgmt-table__cell--date">${renderUpdatedAtCell(f.uploadedAt)}</td>
    <td class="mgmt-table__cell mgmt-table__cell--metric">${renderPipelineSizeCell(f.sizeLabel, sizePct)}</td>
    <td class="mgmt-table__cell pipeline-file-row__steps">${steps}</td>
    <td class="mgmt-table__cell">${renderPipelineResultBadge(f.result)}</td>
    <td class="mgmt-table__cell pipeline-file-row__summary viz-tier viz-tier--detail">${esc(f.summary)}</td>
  </tr>`;
}

function renderPipelineSizeCell(sizeLabel: string, pct: number): string {
  const w = Math.max(4, Math.min(100, pct));
  return `<span class="pipeline-size-cell" data-tip="${esc(sizeLabel)}">
    <span class="pipeline-size-cell__val">${esc(sizeLabel)}</span>
    <span class="pipeline-size-cell__bar" aria-hidden="true"><i data-bar-pct="${w.toFixed(0)}" style="width:0"></i></span>
  </span>`;
}

export function renderPipelineStepTrack(progress: number, result: PipelineResultKey): string {
  const nodes = STAGES.map((label, i) => {
    const idx = i + 1;
    let state = 'wait';
    if (idx < progress) state = 'ok';
    else if (idx === progress) {
      if (result === 'err') state = 'err';
      else if (result === 'run') state = 'run';
      else if (result === 'warn') state = 'warn';
      else if (progress >= 5) state = 'ok';
      else state = 'run';
    }
    return `<span class="pipeline-step-dot pipeline-step-dot--${state}" title="${esc(label)}"></span>`;
  }).join('');
  return `<span class="pipeline-step-track" aria-label="처리 ${progress}/5">${nodes}</span>`;
}

export function renderPipelineResultBadge(result: PipelineResultKey): string {
  const m = PIPELINE_RESULT_META[result];
  return `<span class="mgmt-sbadge mgmt-sbadge--table mgmt-sbadge--${result}" style="--sb-fg:${m.color};--sb-bg:${m.bg}">
    <span class="mgmt-sbadge__dot" aria-hidden="true"></span>${m.label}
  </span>`;
}

export function renderPipelineDetailPanel(
  file: MockPipelineFile,
  focusedLogIdx: number | null,
): string {
  const progPct = (file.stageProgress / 5) * 100;
  const steps = file.logs
    .map((log, i) => {
      const active = i + 1 === file.stageProgress ? ' is-current' : '';
      const done = i + 1 < file.stageProgress ? ' is-done' : '';
      const focus = focusedLogIdx === i ? ' is-focus' : '';
      return `<button type="button" class="pipeline-log-step${active}${done}${focus}" data-act="log-step" data-log-idx="${i}" data-tip="${esc(log.detail)}">
        <span class="pipeline-log-step__rail"><i class="pipeline-log-step__dot pipeline-log-step__dot--${log.state}"></i></span>
        <span class="pipeline-log-step__body">
          <span class="pipeline-log-step__title">${esc(log.stage)}</span>
          <span class="pipeline-log-step__meta"><time>${esc(log.time)}</time> · ${esc(log.detail)}</span>
        </span>
      </button>`;
    })
    .join('');

  const focusDetail =
    focusedLogIdx != null && file.logs[focusedLogIdx]
      ? file.logs[focusedLogIdx].detail
      : file.summary;

  return `<div class="pipeline-detail">
    <div class="pipeline-detail__head">
      <span class="pipeline-file-chip pipeline-file-chip--lg"><span class="pipeline-file-chip__ext">CSV</span><span class="pipeline-file-chip__name">${esc(file.fileName)}</span></span>
      ${renderPipelineResultBadge(file.result)}
    </div>
    <div class="pipeline-detail__progress" aria-label="처리 진행 ${file.stageProgress}/5">
      <div class="pipeline-detail__progress-track"><i style="width:${progPct.toFixed(0)}%" data-bar-pct="${progPct.toFixed(0)}"></i></div>
      <span class="pipeline-detail__progress-label"><b data-bi-count="${file.stageProgress}">0</b><span>/5 단계</span></span>
    </div>
    <p class="pipeline-detail__summary">${esc(focusDetail)}</p>
    <div class="pipeline-detail__timeline">${steps}</div>
  </div>`;
}

export function renderPipelineKpiPanel(): string {
  const kpi: Array<{
    label: string;
    display: string;
    pct: number;
    color: string;
    hint: string;
  }> = [
    { label: QA_AUTOMATION_LABEL, display: '94%', pct: 94, color: '#5BD6A0', hint: '목표 > 90%' },
    {
      label: QA_NRMSE_LABEL,
      display: '0.72%',
      pct: 28,
      color: '#6FB6DE',
      hint: '목표 < 1% (낮을수록 좋음)',
    },
    {
      label: QA_PHYSICS_PASS_LABEL,
      display: '97.5%',
      pct: 97.5,
      color: '#00D4B0',
      hint: '물리 제약 통과율',
    },
    {
      label: QA_TENSOR_QUALITY_LABEL,
      display: '0.88',
      pct: 88,
      color: '#E8B21A',
      hint: '목표 ≥ 0.85',
    },
  ];

  const cards = kpi
    .map((k) => {
      const valInner = renderKpiCountHtml(k.display);
      return `<div class="pipeline-kpi-card" data-tip="${esc(k.label + ' · ' + k.hint)}" tabindex="0">
        <span class="pipeline-kpi-card__label">${esc(k.label)}</span>
        <span class="pipeline-kpi-card__val">${valInner}</span>
        <span class="pipeline-kpi-card__bar" aria-hidden="true"><i data-bar-pct="${k.pct}" style="width:0;background:${k.color}"></i></span>
        <span class="pipeline-kpi-card__hint">${esc(k.hint)}</span>
      </div>`;
    })
    .join('');

  return `<section class="pipeline-kpi" aria-label="${PIPELINE_KPI_SECTION_TITLE}">
    <h2 class="mgmt-h2">${PIPELINE_KPI_SECTION_TITLE}</h2>
    <p class="pipeline-kpi__lead">${PIPELINE_QA_QC_EXPLAIN}</p>
    <div class="pipeline-kpi__grid">${cards}</div>
  </section>`;
}

export function maxSizePctOnPage(rows: MockPipelineFile[]): (label: string) => number {
  const max = Math.max(...rows.map((f) => parseSizeMb(f.sizeLabel)), 1);
  return (label) => (parseSizeMb(label) / max) * 100;
}

function renderKpiCountHtml(display: string): string {
  const m = display.match(/^([\d.]+)(%?)$/);
  if (!m) return esc(display);
  const num = m[1];
  const suffix = m[2] ?? '';
  const n = Number.parseFloat(num);
  const decimals = suffix === '%' ? (n < 10 && num.includes('.') ? 2 : n % 1 !== 0 ? 1 : 0) : 2;
  return `<b data-bi-count="${num}" data-bi-suffix="${suffix}" data-bi-decimals="${decimals}">0</b>`;
}

function animateWidthBars(root: Element): void {
  root.querySelectorAll<HTMLElement>('[data-bar-pct]').forEach((el) => {
    const pct = el.getAttribute('data-bar-pct') ?? '0';
    el.style.width = '0%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.width = `${pct}%`;
        el.classList.add('is-drawn');
      });
    });
  });
}

/** 강조만 — 목록 등은 흐리게(dim)하지 않음 */
function setSpotlight(root: Element, attr: string, id: string | null, selector: string): void {
  root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    el.classList.remove('is-dimmed');
    el.classList.toggle('is-spotlight', !!id && el.getAttribute(attr) === id);
  });
}

function clearSpotlights(root: Element): void {
  root.querySelectorAll('.is-spotlight').forEach((el) => {
    el.classList.remove('is-spotlight');
  });
}

function bindCountUps(root: Element): (() => void)[] {
  const stops: (() => void)[] = [];
  root.querySelectorAll<HTMLElement>('[data-bi-count]').forEach((el) => {
    const to = Number.parseFloat(el.getAttribute('data-bi-count') ?? '0');
    const suffix = el.getAttribute('data-bi-suffix') ?? '';
    const dec = Number.parseInt(el.getAttribute('data-bi-decimals') ?? '-1', 10);
    stops.push(
      countUpText(
        el,
        to,
        (v) => {
          if (dec >= 0) return `${v.toFixed(dec)}${suffix}`;
          return `${Math.round(v)}${suffix}`;
        },
        { durationMs: 680, key: `pipe-${el.className}-${to}` },
      ),
    );
  });
  return stops;
}

export function bindPipelineViz(container: HTMLElement): () => void {
  const strip = container.querySelector('.pipeline-stage-strip');
  if (strip) strip.classList.add('is-visible');

  animateWidthBars(container);
  const countStops = bindCountUps(container);

  const onOver = (e: Event): void => {
    const t = e.target as HTMLElement;

    const seg = t.closest('.pipeline-seg__chip[data-seg]');
    if (seg instanceof HTMLElement) {
      clearSpotlights(container);
      if (strip) clearSpotlights(strip);
      const key = seg.getAttribute('data-seg');
      setSpotlight(container, 'data-result', key, '.pipeline-file-row');
      setSpotlight(strip ?? container, 'data-seg', key, '.pipeline-seg__chip[data-seg]');
      return;
    }

    const stage = t.closest('.pipeline-stage__card[data-stage-min]');
    if (stage instanceof HTMLElement) {
      clearSpotlights(container);
      if (strip) clearSpotlights(strip);
      const min = stage.getAttribute('data-stage-min');
      const minN = min != null ? Number.parseInt(min, 10) : 0;
      container.querySelectorAll<HTMLElement>('.pipeline-file-row').forEach((row) => {
        row.classList.remove('is-dimmed');
        const prog = Number.parseInt(row.getAttribute('data-stage-progress') ?? '0', 10);
        row.classList.toggle('is-spotlight', prog >= minN);
      });
      setSpotlight(strip ?? container, 'data-stage-min', min, '.pipeline-stage__card');
      return;
    }

    const fileRow = t.closest('.pipeline-file-row');
    if (fileRow instanceof HTMLElement) {
      clearSpotlights(container);
      if (strip) clearSpotlights(strip);
      const id = fileRow.getAttribute('data-file-id');
      setSpotlight(container, 'data-file-id', id, '.pipeline-file-row');
      return;
    }

    const logStep = t.closest('.pipeline-log-step');
    if (logStep instanceof HTMLElement) {
      container.querySelectorAll('.pipeline-log-step').forEach((el) => {
        el.classList.toggle('is-spotlight', el === logStep);
      });
      return;
    }

    const kpi = t.closest('.pipeline-kpi-card');
    if (kpi instanceof HTMLElement) {
      container.querySelectorAll('.pipeline-kpi-card').forEach((el) => {
        el.classList.toggle('is-spotlight', el === kpi);
      });
    }
  };

  const onOut = (e: Event): void => {
    const rel = (e as MouseEvent).relatedTarget;
    if (rel instanceof Node && container.contains(rel)) return;
    clearSpotlights(container);
    if (strip) clearSpotlights(strip);
    container.querySelectorAll('.pipeline-log-step.is-spotlight').forEach((el) => {
      el.classList.remove('is-spotlight');
    });
    container.querySelectorAll('.pipeline-kpi-card.is-spotlight').forEach((el) => {
      el.classList.remove('is-spotlight');
    });
  };

  container.addEventListener('mouseover', onOver);
  container.addEventListener('mouseout', onOut);
  container.addEventListener('focusin', onOver);
  container.addEventListener('focusout', onOut);

  return () => {
    container.removeEventListener('mouseover', onOver);
    container.removeEventListener('mouseout', onOut);
    container.removeEventListener('focusin', onOver);
    container.removeEventListener('focusout', onOut);
    countStops.forEach((stop) => stop());
  };
}
