import type { MockCaseStatusKey } from '@/data/mockCases';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function shapeKind(shape: string): string {
  if (shape.includes('사각')) return 'rect';
  if (shape.includes('식생')) return 'veg';
  if (shape.includes('배치')) return 'multi';
  if (shape.includes('대책')) return 'mit';
  return 'round';
}

export function renderCaseIdCell(caseId: string): string {
  const id = esc(caseId);
  if (!caseId.includes('-')) {
    return `<span class="mgmt-case-id" title="케이스 ${id}"><span class="mgmt-case-id__num">${id}</span></span>`;
  }
  const [series, num] = caseId.split('-', 2);
  return `<span class="mgmt-case-id" title="케이스 ${id}">
    <span class="mgmt-case-id__series">${esc(series)}</span><span class="mgmt-case-id__sep">-</span><span class="mgmt-case-id__num">${esc(num)}</span>
  </span>`;
}

export function renderShapeCell(shape: string): string {
  const k = shapeKind(shape);
  return `<span class="mgmt-shape-tag mgmt-shape-tag--${k}">${esc(shape)}</span>`;
}

/** "MM-DD HH:mm" 목업 형식 */
export function renderUpdatedAtCell(updatedAt: string): string {
  const raw = esc(updatedAt);
  const m = updatedAt.match(/^(\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
  if (!m) {
    return `<span class="mgmt-date-cell"><span class="mgmt-date-cell__main">${raw}</span></span>`;
  }
  return `<span class="mgmt-date-cell" title="${raw}">
    <span class="mgmt-date-cell__day">${esc(m[1])}</span>
    <span class="mgmt-date-cell__time">${esc(m[2])}</span>
  </span>`;
}

export function renderCaseStatusBadge(
  label: string,
  color: string,
  bg: string,
  status: MockCaseStatusKey,
): string {
  return `<span class="mgmt-sbadge mgmt-sbadge--table mgmt-sbadge--${status}" style="--sb-fg:${color};--sb-bg:${bg}">
    <span class="mgmt-sbadge__dot" aria-hidden="true"></span>${esc(label)}
  </span>`;
}

export function renderCaseRowAction(status: MockCaseStatusKey, caseId: string): string {
  const id = esc(caseId);
  if (status === 'done') {
    return `<button type="button" class="mgmt-row-act mgmt-row-act--viewer" data-act="viewer" data-case-id="${id}">
      <span class="mgmt-row-act__icon" aria-hidden="true">▶</span><span class="mgmt-row-act__label">뷰어</span>
    </button>`;
  }
  if (status === 'err') {
    return `<button type="button" class="mgmt-row-act mgmt-row-act--err" data-act="error-check" data-case-id="${id}">
      <span class="mgmt-row-act__icon" aria-hidden="true">!</span><span class="mgmt-row-act__label">오류</span>
    </button>`;
  }
  if (status === 'run') {
    return `<span class="mgmt-row-act mgmt-row-act--run" title="해석 진행 중">
      <span class="mgmt-row-act__run-label">해석</span>
      <span class="mgmt-row-act__run-bar" aria-hidden="true"><i style="width:62%"></i></span>
      <span class="mgmt-row-act__run-pct">62%</span>
    </span>`;
  }
  return `<span class="mgmt-row-act mgmt-row-act--idle mgmt-muted">—</span>`;
}

export function renderRowSelectButton(caseId: string, selected: boolean): string {
  return `<span class="mgmt-row-select ${selected ? 'is-on' : ''}" aria-hidden="true" title="${esc(caseId)}">
    <span class="mgmt-row-select__ring"></span>
  </span>`;
}
