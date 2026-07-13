import type { Disposable } from '@/types/disposable';
import type { CsvDashboardLoadResult } from '@/data/loadCsvDashboard';
import {
  FLOW3D_SCRDIF_FIELDS,
  type Flow3dScrdifColumns,
} from '@/utils/parseFlow3dScrdifCsv';
import { computeVirtualWindow } from '@/utils/virtualRows';

const PREVIEW_MAX_COLS = 12;
const PREVIEW_MAX_ROWS = 12;
const STATS_SAMPLE_CAP = 8192;
const ROW_HEIGHT_PX = 28;
const ROW_OVERSCAN = 8;

interface GridStats {
  min: number;
  max: number;
  mean: number;
  sampled: boolean;
}

function computeStats(values: Float32Array): GridStats {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, sampled: false };
  }

  const step =
    values.length <= STATS_SAMPLE_CAP ? 1 : Math.ceil(values.length / STATS_SAMPLE_CAP);
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;

  for (let i = 0; i < values.length; i += step) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    count += 1;
  }

  return {
    min,
    max,
    mean: count > 0 ? sum / count : 0,
    sampled: step > 1,
  };
}

function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 0.001 || abs >= 10000)) return v.toExponential(2);
  return v.toFixed(3);
}

/**
 * 파싱된 ScourSeries 의 요약/통계/미리보기 격자를 화면 중앙 모달로 표시한다.
 * terrain(베이스 표고) 또는 특정 프레임(deltaElevations)을 선택해 볼 수 있다.
 * x·y·z·u·v·w·scrdif 원본 행은 가상 스크롤 표로 전체를 탐색할 수 있다.
 */
export class CsvDataPreviewModal implements Disposable {
  public readonly element: HTMLElement;
  private readonly dialog: HTMLElement;
  private readonly summaryEl: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly tableWrap: HTMLElement;
  private readonly frameSelect: HTMLSelectElement;
  private readonly variablesEl: HTMLElement;
  private readonly rowsSection: HTMLElement;
  private readonly rowsCountEl: HTMLElement;
  private readonly rowsScrollWrap: HTMLElement;
  private readonly rowsSpacer: HTMLElement;
  private readonly rowsBody: HTMLElement;
  private readonly cleanups: Array<() => void> = [];
  private loadResult: CsvDashboardLoadResult | null = null;
  private scrdifColumns: Flow3dScrdifColumns | null = null;
  private scrollFrame: number | null = null;

  public constructor() {
    this.element = document.createElement('div');
    this.element.className = 'csv-preview-modal';
    this.element.hidden = true;

    const backdrop = document.createElement('div');
    backdrop.className = 'csv-preview-modal__backdrop';
    const onBackdrop = (): void => this.close();
    backdrop.addEventListener('click', onBackdrop);
    this.cleanups.push(() => backdrop.removeEventListener('click', onBackdrop));

    this.dialog = document.createElement('div');
    this.dialog.className = 'csv-preview-modal__dialog';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'csv-preview-modal-title');
    const onDialogClick = (ev: MouseEvent): void => {
      ev.stopPropagation();
    };
    this.dialog.addEventListener('click', onDialogClick);
    this.cleanups.push(() => this.dialog.removeEventListener('click', onDialogClick));

    const header = document.createElement('div');
    header.className = 'csv-preview-modal__header';
    const titleEl = document.createElement('h2');
    titleEl.className = 'csv-preview-modal__title';
    titleEl.id = 'csv-preview-modal-title';
    titleEl.textContent = '파싱된 데이터 확인';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'csv-preview-modal__close';
    closeBtn.setAttribute('aria-label', '닫기');
    closeBtn.textContent = '×';
    const onClose = (): void => this.close();
    closeBtn.addEventListener('click', onClose);
    this.cleanups.push(() => closeBtn.removeEventListener('click', onClose));
    header.append(titleEl, closeBtn);

    this.summaryEl = document.createElement('div');
    this.summaryEl.className = 'csv-preview-modal__summary';

    this.rowsSection = document.createElement('section');
    this.rowsSection.className = 'csv-preview-modal__rows-section';
    this.rowsSection.hidden = true;

    const rowsHeading = document.createElement('div');
    rowsHeading.className = 'csv-preview-modal__rows-heading';
    const rowsTitle = document.createElement('h3');
    rowsTitle.className = 'csv-preview-modal__rows-title';
    rowsTitle.textContent = '파싱된 데이터 행 (x·y·z·u·v·w·scrdif)';
    this.rowsCountEl = document.createElement('span');
    this.rowsCountEl.className = 'csv-preview-modal__rows-count';
    rowsHeading.append(rowsTitle, this.rowsCountEl);

    const rowsHeader = document.createElement('div');
    rowsHeader.className = 'csv-preview-modal__rows-header';
    rowsHeader.setAttribute('role', 'row');
    for (const label of ['#', ...FLOW3D_SCRDIF_FIELDS]) {
      const cell = document.createElement('span');
      cell.className = 'csv-preview-modal__rows-cell csv-preview-modal__rows-cell--head';
      cell.textContent = label;
      rowsHeader.appendChild(cell);
    }

    this.rowsScrollWrap = document.createElement('div');
    this.rowsScrollWrap.className = 'csv-preview-modal__rows-wrap';
    this.rowsSpacer = document.createElement('div');
    this.rowsSpacer.className = 'csv-preview-modal__rows-spacer';
    this.rowsBody = document.createElement('div');
    this.rowsBody.className = 'csv-preview-modal__rows-body';

    this.rowsSpacer.appendChild(this.rowsBody);
    this.rowsScrollWrap.append(this.rowsSpacer);

    const onRowsScroll = (): void => {
      if (this.scrollFrame !== null) return;
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = null;
        this.renderVisibleRows();
      });
    };
    this.rowsScrollWrap.addEventListener('scroll', onRowsScroll, { passive: true });
    this.cleanups.push(() =>
      this.rowsScrollWrap.removeEventListener('scroll', onRowsScroll),
    );

    this.rowsSection.append(rowsHeading, rowsHeader, this.rowsScrollWrap);

    const controls = document.createElement('div');
    controls.className = 'csv-preview-modal__controls';
    const selectLabel = document.createElement('label');
    selectLabel.className = 'csv-preview-modal__select-label';
    selectLabel.textContent = '미리보기 대상';
    this.frameSelect = document.createElement('select');
    this.frameSelect.className = 'csv-preview-modal__select';
    const onSelect = (): void => this.renderGrid();
    this.frameSelect.addEventListener('change', onSelect);
    this.cleanups.push(() => this.frameSelect.removeEventListener('change', onSelect));
    selectLabel.appendChild(this.frameSelect);
    controls.appendChild(selectLabel);

    this.statsEl = document.createElement('div');
    this.statsEl.className = 'csv-preview-modal__stats';

    this.variablesEl = document.createElement('div');
    this.variablesEl.className = 'csv-preview-modal__variables';

    this.tableWrap = document.createElement('div');
    this.tableWrap.className = 'csv-preview-modal__table-wrap';

    const note = document.createElement('p');
    note.className = 'csv-preview-modal__note';
    note.textContent = `좌상단 최대 ${PREVIEW_MAX_ROWS}×${PREVIEW_MAX_COLS} 셀만 미리 표시합니다.`;

    this.dialog.append(
      header,
      this.summaryEl,
      this.rowsSection,
      this.variablesEl,
      controls,
      this.statsEl,
      this.tableWrap,
      note,
    );
    this.element.append(backdrop, this.dialog);

    const onKeydown = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape' && !this.element.hidden) this.close();
    };
    document.addEventListener('keydown', onKeydown);
    this.cleanups.push(() => document.removeEventListener('keydown', onKeydown));
  }

  public open(
    result: CsvDashboardLoadResult,
    scrdifColumns: Flow3dScrdifColumns | null = null,
  ): void {
    this.loadResult = result;
    this.scrdifColumns = scrdifColumns;
    this.element.hidden = false;
    this.renderSummary();
    this.renderVariables();
    this.populateFrameOptions();
    this.tableWrap.replaceChildren();
    this.statsEl.textContent = '미리보기 준비 중…';
    this.setupRowsSection();
    this.renderVisibleRows();
    requestAnimationFrame(() => {
      if (this.loadResult !== result) return;
      this.renderGrid();
      this.renderVisibleRows();
    });
  }

  public close(): void {
    this.element.hidden = true;
  }

  private setupRowsSection(): void {
    if (!this.scrdifColumns || this.scrdifColumns.count === 0) {
      this.rowsSection.hidden = true;
      this.rowsBody.replaceChildren();
      this.rowsSpacer.style.height = '0px';
      return;
    }

    this.rowsSection.hidden = false;
    const stats = this.scrdifColumns.stats;
    if (stats) {
      const parts = [
        `데이터 ${this.scrdifColumns.count.toLocaleString()}행`,
        `파일 ${stats.fileLineCount.toLocaleString()}줄`,
      ];
      if (stats.skippedLinesAfterHeader > 0) {
        parts.push(`건너뜀 ${stats.skippedLinesAfterHeader.toLocaleString()}줄`);
      }
      if (stats.truncatedAtSecondBlock) {
        parts.push('첫 printing 블록만');
      }
      this.rowsCountEl.textContent = `${parts.join(' · ')} · 가상 스크롤`;
    } else {
      this.rowsCountEl.textContent = `데이터 ${this.scrdifColumns.count.toLocaleString()}행 · 가상 스크롤`;
    }
    this.rowsScrollWrap.scrollTop = 0;
    this.rowsSpacer.style.height = `${this.scrdifColumns.count * ROW_HEIGHT_PX}px`;
  }

  private renderVisibleRows(): void {
    const columns = this.scrdifColumns;
    if (!columns || columns.count === 0) {
      this.rowsBody.replaceChildren();
      return;
    }

    const viewportHeight = this.rowsScrollWrap.clientHeight || ROW_HEIGHT_PX * (ROW_OVERSCAN + 1);
    const window = computeVirtualWindow({
      scrollTop: this.rowsScrollWrap.scrollTop,
      viewportHeight,
      rowHeight: ROW_HEIGHT_PX,
      totalRows: columns.count,
      overscan: ROW_OVERSCAN,
    });

    this.rowsBody.style.transform = `translateY(${window.offsetY}px)`;
    this.rowsBody.replaceChildren();

    const fragment = document.createDocumentFragment();
    for (let rowIndex = window.startIndex; rowIndex < window.endIndex; rowIndex += 1) {
      const row = document.createElement('div');
      row.className = 'csv-preview-modal__rows-row';
      row.setAttribute('role', 'row');

      const indexCell = document.createElement('span');
      indexCell.className =
        'csv-preview-modal__rows-cell csv-preview-modal__rows-cell--index';
      indexCell.textContent = String(rowIndex + 1);
      row.appendChild(indexCell);

      for (const field of FLOW3D_SCRDIF_FIELDS) {
        const cell = document.createElement('span');
        cell.className = 'csv-preview-modal__rows-cell';
        cell.textContent = formatNumber(columns[field][rowIndex]!);
        row.appendChild(cell);
      }

      fragment.appendChild(row);
    }

    this.rowsBody.appendChild(fragment);
  }

  private renderSummary(): void {
    if (!this.loadResult) return;
    const { scour, fluid, variables } = this.loadResult;
    const items: Array<[string, string]> = [];

    if (this.scrdifColumns && this.scrdifColumns.count > 0) {
      const stats = this.scrdifColumns.stats;
      if (stats) {
        items.push([
          stats.truncatedAtSecondBlock ? '읽은 줄 수 (첫 블록)' : '파일 줄 수',
          `${stats.fileLineCount.toLocaleString()}줄`,
        ]);
        items.push(['파싱된 데이터 행', `${stats.dataRowCount.toLocaleString()}행`]);
        const metaLines =
          stats.fileLineCount - stats.dataRowCount - stats.skippedLinesAfterHeader - 1;
        if (metaLines > 0) {
          items.push(['메타·헤더 줄', `${metaLines.toLocaleString()}줄`]);
        }
        if (stats.skippedLinesAfterHeader > 0) {
          items.push([
            '건너뛴 데이터 줄',
            `${stats.skippedLinesAfterHeader.toLocaleString()}줄`,
          ]);
        }
        if (stats.expectedPrintingCells !== null && stats.expectedPrintingCells !== stats.dataRowCount) {
          items.push([
            'printing 격자(참고)',
            `${stats.expectedPrintingCells.toLocaleString()}셀`,
          ]);
        }
        if (stats.truncatedAtSecondBlock) {
          items.push(['파싱 범위', '첫 printing 블록만 (대용량)']);
        }
      } else {
        items.push(['파싱된 데이터 행', `${this.scrdifColumns.count.toLocaleString()}행`]);
      }
    }
    if (variables.length > 0) {
      items.push(['파싱 변수 수', `${variables.length}개`]);
    }
    if (scour) {
      items.push(['세굴 격자', `${scour.baseTerrain.width} × ${scour.baseTerrain.height}`]);
      items.push(['세굴 프레임', `${scour.frames.length}개`]);
    }
    if (fluid) {
      items.push([
        '유체 격자',
        `${fluid.grid.width} × ${fluid.grid.height} × ${fluid.grid.depth}`,
      ]);
      if (fluid.metadata?.simulationId) {
        items.push(['데이터 출처', fluid.metadata.simulationId]);
      }
    }

    if (items.length === 0) {
      items.push(['데이터', '없음']);
    }

    this.summaryEl.replaceChildren(
      ...items.map(([label, value]) => {
        const cell = document.createElement('div');
        cell.className = 'csv-preview-modal__summary-item';
        const k = document.createElement('span');
        k.className = 'csv-preview-modal__summary-key';
        k.textContent = label;
        const v = document.createElement('span');
        v.className = 'csv-preview-modal__summary-value';
        v.textContent = value;
        cell.append(k, v);
        return cell;
      }),
    );
  }

  private renderVariables(): void {
    if (!this.loadResult || this.loadResult.variables.length === 0) {
      this.variablesEl.replaceChildren();
      return;
    }

    const table = document.createElement('table');
    table.className = 'csv-preview-modal__var-table';
    const head = document.createElement('thead');
    head.innerHTML = '<tr><th>ID</th><th>물리량</th><th>단위</th><th>값 개수</th></tr>';
    table.appendChild(head);

    const body = document.createElement('tbody');
    for (const v of this.loadResult.variables) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${v.id}</td><td>${v.label}</td><td>${v.unit || '—'}</td><td>${v.values.length}</td>`;
      body.appendChild(tr);
    }
    table.appendChild(body);
    this.variablesEl.replaceChildren(table);
  }

  private populateFrameOptions(): void {
    if (!this.loadResult) return;
    const options: HTMLOptionElement[] = [];

    for (const variable of this.loadResult.variables) {
      const opt = document.createElement('option');
      opt.value = `var:${variable.id}`;
      opt.textContent = `${variable.id} — ${variable.label}`;
      options.push(opt);
    }

    const scour = this.loadResult.scour;
    if (scour) {
      const terrainOpt = document.createElement('option');
      terrainOpt.value = 'terrain';
      terrainOpt.textContent = '베이스 지형 (표고)';
      options.push(terrainOpt);

      scour.frames.forEach((frame, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `프레임 ${i} (t=${frame.timestampSeconds.toFixed(1)}s, Δ표고)`;
        options.push(opt);
      });
    }

    this.frameSelect.replaceChildren(...options);
    if (options[0]) {
      this.frameSelect.value = options[0].value;
    }
  }

  private currentValues(): { values: Float32Array; width: number; height: number } | null {
    if (!this.loadResult) return null;
    const sel = this.frameSelect.value;

    if (sel.startsWith('var:')) {
      const id = sel.slice(4);
      const variable = this.loadResult.variables.find((v) => v.id === id);
      if (!variable) return null;

      const gridW =
        this.loadResult.fluid?.grid.width ??
        this.loadResult.scour?.baseTerrain.width ??
        Math.max(1, Math.round(Math.sqrt(variable.values.length)));
      const gridH = Math.max(1, Math.ceil(variable.values.length / gridW));
      return { values: variable.values, width: gridW, height: gridH };
    }

    const scour = this.loadResult.scour;
    if (!scour) return null;
    const { baseTerrain, frames } = scour;
    if (sel === 'terrain') {
      return {
        values: baseTerrain.elevations,
        width: baseTerrain.width,
        height: baseTerrain.height,
      };
    }
    const frame = frames[Number(sel)];
    if (!frame) return null;
    return {
      values: frame.deltaElevations,
      width: baseTerrain.width,
      height: baseTerrain.height,
    };
  }

  private renderGrid(): void {
    const current = this.currentValues();
    if (!current) {
      this.tableWrap.replaceChildren();
      this.statsEl.replaceChildren();
      return;
    }

    const { values, width, height } = current;
    const stats = computeStats(values);
    const statItems: Array<[string, string]> = [
      ['최소', formatNumber(stats.min)],
      ['최대', formatNumber(stats.max)],
      ['평균', formatNumber(stats.mean)],
      ['값 개수', `${values.length}`],
    ];
    if (stats.sampled) {
      statItems.push(['통계', `표본 ${STATS_SAMPLE_CAP}개 기준`]);
    }
    this.statsEl.replaceChildren(
      ...statItems.map(([label, value]) => {
        const chip = document.createElement('span');
        chip.className = 'csv-preview-modal__stat';
        chip.textContent = `${label} ${value}`;
        return chip;
      }),
    );

    const cols = Math.min(PREVIEW_MAX_COLS, width);
    const rows = Math.min(PREVIEW_MAX_ROWS, height);

    const table = document.createElement('table');
    table.className = 'csv-preview-modal__table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.textContent = 'y\\x';
    headRow.appendChild(corner);
    for (let x = 0; x < cols; x += 1) {
      const th = document.createElement('th');
      th.textContent = String(x);
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let y = 0; y < rows; y += 1) {
      const tr = document.createElement('tr');
      const rowHead = document.createElement('th');
      rowHead.textContent = String(y);
      tr.appendChild(rowHead);
      for (let x = 0; x < cols; x += 1) {
        const td = document.createElement('td');
        td.textContent = formatNumber(values[y * width + x]);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    this.tableWrap.replaceChildren(table);
  }

  public dispose(): void {
    if (this.scrollFrame !== null) {
      cancelAnimationFrame(this.scrollFrame);
      this.scrollFrame = null;
    }
    for (const fn of this.cleanups) fn();
    this.element.remove();
  }
}
