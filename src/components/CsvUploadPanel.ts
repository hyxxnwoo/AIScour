import type { Disposable } from '@/types/disposable';
import type { CsvDashboardLoadResult, CsvLoadProgress, LoadCsvDashboardOptions } from '@/data/loadCsvDashboard';
import { loadCsvDashboard, rebuildCsvDashboard } from '@/data/loadCsvDashboard';
import { isCsvParseAbortError } from '@/utils/csvParseAbort';
import { computeCsvProgressPct } from '@/utils/csvProgress';
import { createInMemoryUploadFile, snapshotUploadFiles, UPLOAD_SNAPSHOT_MAX_BYTES } from '@/utils/readUploadFile';
import { CsvDataPreviewModal } from '@/components/CsvDataPreviewModal';
import type { SampleProbeColumns } from '@/utils/parseSampleProbeCsv';

/** dev 서버 public/data/sampledata.csv */
const SAMPLE_CSV_URL = '/data/sampledata.csv';

/** 재생 간격 UI 옵션: 라벨 → stride(30초 배수). */
export const SAMPLE_PROBE_INTERVAL_OPTIONS = [
  { label: '30초', stride: 1 },
  { label: '1분', stride: 2 },
  { label: '5분', stride: 10 },
  { label: '10분', stride: 20 },
  { label: '30분', stride: 60 },
] as const;

export interface CsvUploadPanelHandlers {
  onLoaded: (result: CsvDashboardLoadResult) => void | Promise<void>;
  onError?: (message: string) => void;
  getLoadOptions?: () => Partial<LoadCsvDashboardOptions>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatProgress(progress: CsvLoadProgress): string {
  const pct = computeCsvProgressPct(progress);
  const rows =
    progress.rowsParsed !== undefined && progress.totalRows !== undefined
      ? ` · ${progress.rowsParsed}/${progress.totalRows}행`
      : '';
  const fileLabel = progress.fileName ? basename(progress.fileName) : '';
  return `${progress.message}${fileLabel ? ` ${fileLabel}` : ''} · ${pct.toFixed(0)}%${rows}`;
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function isFullSampleProbeColumns(columns: SampleProbeColumns): boolean {
  const total = columns.stats?.dataRowCount ?? columns.count;
  const parseStride = columns.stats?.parseStepMultiple ?? 1;
  return parseStride === 1 && columns.count === total;
}

function formatIntervalLabel(stepMultiple: number, baseIntervalSeconds = 30): string {
  const seconds = stepMultiple * baseIntervalSeconds;
  if (seconds < 60) return `${seconds}초`;
  if (seconds % 60 === 0) return `${seconds / 60}분`;
  return `${seconds}초`;
}

function formatAutoAdjustedMessage(
  result: CsvDashboardLoadResult,
  baseIntervalSeconds = 30,
): string {
  const intervalLabel = formatIntervalLabel(result.stepMultiple, baseIntervalSeconds);
  return `행이 많아 재생 간격을 ${intervalLabel}로 자동 조정했습니다 · 프레임 ${result.scour.frames.length}개`;
}

export class CsvUploadPanel implements Disposable {
  public readonly element: HTMLElement;
  private readonly handlers: CsvUploadPanelHandlers;
  private readonly cleanups: Array<() => void> = [];
  private fileInput!: HTMLInputElement;
  private statusEl!: HTMLElement;
  private progressBar!: HTMLElement;
  private loadBtn!: HTMLButtonElement;
  private cancelBtn!: HTMLButtonElement;
  private previewBtn!: HTMLButtonElement;
  private isLoading = false;
  private parseReadyFiles: File[] = [];
  private abortController: AbortController | null = null;
  private lastLoadResult: CsvDashboardLoadResult | null = null;
  private lastColumns: SampleProbeColumns | null = null;
  private readonly previewModal = new CsvDataPreviewModal();
  private pendingProgress: CsvLoadProgress | null = null;
  private progressFrame: number | null = null;
  private readonly blockerEl: HTMLElement;
  private readonly blockerStatusEl: HTMLElement;
  private readonly blockerProgressBar: HTMLElement;
  private readonly blockerDock: HTMLElement;
  private readonly actionRow: HTMLElement;
  private readonly intervalRow: HTMLElement;
  private autoIntervalOption: HTMLOptionElement | null = null;
  private readonly intervalSelect: HTMLSelectElement;

  public constructor(handlers: CsvUploadPanelHandlers) {
    this.handlers = handlers;
    this.element = document.createElement('div');
    this.element.className = 'csv-upload-panel';

    const title = document.createElement('div');
    title.className = 'csv-upload-panel__title';
    title.textContent = 'CSV 데이터 업로드';
    this.element.appendChild(title);

    const hint = document.createElement('p');
    hint.className = 'csv-upload-panel__hint';
    hint.textContent =
      'sampledata.csv 양식(x y z u v w scrdif)만 업로드합니다. 디스크 읽기 오류 시 「샘플 CSV」를 사용해 보세요.';
    this.element.appendChild(hint);

    const fileRow = document.createElement('div');
    fileRow.className = 'csv-upload-panel__file-row';

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = false;
    this.fileInput.accept = '.csv,text/csv';
    this.fileInput.className = 'csv-upload-panel__file-input';

    const fileBtn = document.createElement('button');
    fileBtn.type = 'button';
    fileBtn.className = 'csv-upload-panel__pick';
    fileBtn.textContent = '파일 선택';
    const onFileBtn = (): void => {
      this.fileInput.value = '';
      this.fileInput.click();
    };
    fileBtn.addEventListener('click', onFileBtn);
    this.cleanups.push(() => fileBtn.removeEventListener('click', onFileBtn));

    const sampleBtn = document.createElement('button');
    sampleBtn.type = 'button';
    sampleBtn.className = 'csv-upload-panel__pick csv-upload-panel__pick--secondary';
    sampleBtn.textContent = '샘플 CSV';
    const onSampleBtn = (): void => {
      void this.loadSampleData();
    };
    sampleBtn.addEventListener('click', onSampleBtn);
    this.cleanups.push(() => sampleBtn.removeEventListener('click', onSampleBtn));

    fileRow.append(fileBtn, sampleBtn);
    this.element.appendChild(fileRow);
    this.element.append(this.fileInput);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'csv-upload-panel__status';
    this.statusEl.textContent = '선택된 파일 없음';
    this.element.appendChild(this.statusEl);

    const progressTrack = document.createElement('div');
    progressTrack.className = 'csv-upload-panel__progress-track';
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'csv-upload-panel__progress-bar';
    progressTrack.appendChild(this.progressBar);
    this.element.appendChild(progressTrack);

    this.intervalRow = document.createElement('div');
    this.intervalRow.className = 'csv-upload-panel__interval-row';
    this.intervalRow.hidden = true;

    const intervalLabel = document.createElement('label');
    intervalLabel.className = 'csv-upload-panel__interval-label';
    intervalLabel.textContent = '재생 간격';

    this.intervalSelect = document.createElement('select');
    this.intervalSelect.className = 'csv-upload-panel__interval-select';
    for (const opt of SAMPLE_PROBE_INTERVAL_OPTIONS) {
      const el = document.createElement('option');
      el.value = String(opt.stride);
      el.textContent = opt.label;
      this.intervalSelect.appendChild(el);
    }
    const onIntervalChange = (): void => {
      void this.rebuildWithCurrentInterval();
    };
    this.intervalSelect.addEventListener('change', onIntervalChange);
    this.cleanups.push(() => this.intervalSelect.removeEventListener('change', onIntervalChange));

    intervalLabel.appendChild(this.intervalSelect);
    this.intervalRow.appendChild(intervalLabel);
    this.element.appendChild(this.intervalRow);

    this.loadBtn = document.createElement('button');
    this.loadBtn.type = 'button';
    this.loadBtn.className = 'csv-upload-panel__load';
    this.loadBtn.textContent = 'CSV 파싱 및 적용';
    this.loadBtn.disabled = true;
    const onLoad = (): void => {
      void this.startLoad();
    };
    this.loadBtn.addEventListener('click', onLoad);
    this.cleanups.push(() => this.loadBtn.removeEventListener('click', onLoad));

    this.cancelBtn = document.createElement('button');
    this.cancelBtn.type = 'button';
    this.cancelBtn.className = 'csv-upload-panel__cancel';
    this.cancelBtn.textContent = '파싱 중지';
    this.cancelBtn.hidden = true;
    const onCancel = (): void => {
      this.cancelLoad();
    };
    this.cancelBtn.addEventListener('click', onCancel);
    this.cleanups.push(() => this.cancelBtn.removeEventListener('click', onCancel));

    this.previewBtn = document.createElement('button');
    this.previewBtn.type = 'button';
    this.previewBtn.className = 'csv-upload-panel__preview';
    this.previewBtn.textContent = '데이터 확인';
    this.previewBtn.hidden = true;
    const onPreview = (): void => {
      if (this.lastLoadResult) {
        this.previewModal.open(this.lastLoadResult, this.lastColumns);
      }
    };
    this.previewBtn.addEventListener('click', onPreview);
    this.cleanups.push(() => this.previewBtn.removeEventListener('click', onPreview));

    const actionRow = document.createElement('div');
    actionRow.className = 'csv-upload-panel__actions';
    actionRow.append(this.loadBtn, this.cancelBtn, this.previewBtn);
    this.element.appendChild(actionRow);
    this.actionRow = actionRow;

    this.blockerEl = document.createElement('div');
    this.blockerEl.className = 'csv-parse-blocker';
    this.blockerEl.hidden = true;

    const blockerPanel = document.createElement('div');
    blockerPanel.className = 'csv-parse-blocker__panel';

    this.blockerStatusEl = document.createElement('p');
    this.blockerStatusEl.className = 'csv-parse-blocker__status';
    this.blockerStatusEl.textContent = 'CSV 파싱 중…';

    const blockerProgressTrack = document.createElement('div');
    blockerProgressTrack.className = 'csv-parse-blocker__progress-track';
    this.blockerProgressBar = document.createElement('div');
    this.blockerProgressBar.className = 'csv-parse-blocker__progress-bar';
    blockerProgressTrack.appendChild(this.blockerProgressBar);

    this.blockerDock = document.createElement('div');
    this.blockerDock.className = 'csv-parse-blocker__dock';

    blockerPanel.append(this.blockerStatusEl, blockerProgressTrack, this.blockerDock);
    this.blockerEl.appendChild(blockerPanel);
    document.body.appendChild(this.blockerEl);

    document.body.appendChild(this.previewModal.element);

    const onFiles = (ev: Event): void => {
      void this.handleFilesSelected(ev.target as HTMLInputElement);
    };
    this.fileInput.addEventListener('change', onFiles);
    this.cleanups.push(() => this.fileInput.removeEventListener('change', onFiles));
  }

  private async handleFilesSelected(input: HTMLInputElement): Promise<void> {
    const raw = Array.from(input.files ?? []);
    if (raw.length === 0) {
      this.parseReadyFiles = [];
      this.setSelectedFiles([]);
      return;
    }

    this.parseReadyFiles = [];
    this.statusEl.textContent = '파일 읽는 중…';
    this.loadBtn.disabled = true;
    this.fileInput.disabled = true;

    try {
      const hasLargeFile = raw.some((f) => f.size > UPLOAD_SNAPSHOT_MAX_BYTES);
      if (hasLargeFile) {
        this.parseReadyFiles = raw;
        input.value = '';
        this.setSelectedFiles(raw);
        return;
      }

      const snapshotted = await snapshotUploadFiles(raw);
      this.parseReadyFiles = snapshotted;
      input.value = '';
      this.setSelectedFiles(snapshotted);
    } catch (err: unknown) {
      this.parseReadyFiles = raw;
      this.previewBtn.hidden = true;
      this.intervalRow.hidden = true;
      this.lastLoadResult = null;
      this.lastColumns = null;

      const totalBytes = raw.reduce((sum, f) => sum + f.size, 0);
      const hint = totalBytes > 2 * 1024 * 1024 ? ' · 대용량(스트리밍 파싱)' : ' · 스트리밍 파싱';
      this.statusEl.textContent = `${raw.length}개 파일 · ${formatBytes(totalBytes)}${hint}`;
      this.loadBtn.disabled = false;

      if (err instanceof Error) {
        console.warn('CSV 메모리 복사 건너뜀 — 스트리밍으로 파싱합니다:', err.message);
      }
    } finally {
      if (!this.isLoading) {
        this.fileInput.disabled = false;
      }
    }
  }

  private async loadSampleData(): Promise<void> {
    if (this.isLoading) return;
    this.fileInput.disabled = true;
    this.statusEl.textContent = '샘플 CSV 불러오는 중…';
    this.loadBtn.disabled = true;

    try {
      const res = await fetch(SAMPLE_CSV_URL);
      if (!res.ok) {
        throw new Error(`샘플 CSV를 불러올 수 없습니다 (HTTP ${res.status}).`);
      }
      const text = await res.text();
      const file = createInMemoryUploadFile(text, 'sampledata.csv');
      this.parseReadyFiles = [file];
      this.fileInput.value = '';
      this.setSelectedFiles([file]);
    } catch (err: unknown) {
      this.parseReadyFiles = [];
      this.lastLoadResult = null;
      this.lastColumns = null;
      const message =
        err instanceof Error ? err.message : '샘플 CSV를 불러올 수 없습니다.';
      this.statusEl.textContent = message;
      this.loadBtn.disabled = true;
      this.previewBtn.hidden = true;
      this.intervalRow.hidden = true;
      this.handlers.onError?.(message);
      console.error('샘플 CSV 불러오기 실패:', err);
    } finally {
      if (!this.isLoading) {
        this.fileInput.disabled = false;
      }
    }
  }

  private setSelectedFiles(files: File[]): void {
    this.previewBtn.hidden = true;
    this.intervalRow.hidden = true;
    this.lastLoadResult = null;
    this.lastColumns = null;
    if (files.length === 0) {
      this.statusEl.textContent = '선택된 파일 없음';
      this.loadBtn.disabled = true;
      return;
    }

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    this.statusEl.textContent = `${files[0]?.name ?? 'CSV'} · ${formatBytes(totalBytes)}`;
    this.loadBtn.disabled = false;
  }

  private syncIntervalSelect(stepMultiple: number, baseIntervalSeconds = 30): void {
    const stride = String(stepMultiple);
    const existing = Array.from(this.intervalSelect.options).find((opt) => opt.value === stride);
    if (existing) {
      if (this.autoIntervalOption) {
        this.autoIntervalOption.remove();
        this.autoIntervalOption = null;
      }
      this.intervalSelect.value = stride;
      return;
    }

    if (!this.autoIntervalOption) {
      this.autoIntervalOption = document.createElement('option');
      this.intervalSelect.appendChild(this.autoIntervalOption);
    }
    this.autoIntervalOption.value = stride;
    this.autoIntervalOption.textContent = `자동 (${formatIntervalLabel(stepMultiple, baseIntervalSeconds)})`;
    this.intervalSelect.value = stride;
  }

  private formatLoadCompleteStatus(result: CsvDashboardLoadResult): string {
    const base = `완료 · ${result.scour.baseTerrain.width}×${result.scour.baseTerrain.height} · 프레임 ${result.scour.frames.length}개`;
    if (!result.autoAdjusted) return base;
    const intervalLabel = formatIntervalLabel(
      result.stepMultiple,
      result.probeSeries.baseIntervalSeconds,
    );
    return `${base} · 간격 ${intervalLabel} 자동 조정`;
  }

  private async rebuildWithCurrentInterval(): Promise<void> {
    if (!this.lastColumns && !this.lastLoadResult) return;
    const stepMultiple = this.getStepMultiple();
    const lastStep = this.lastLoadResult?.stepMultiple ?? 1;
    if (stepMultiple === lastStep) return;

    if (this.lastColumns && isFullSampleProbeColumns(this.lastColumns)) {
      const result = rebuildCsvDashboard(this.lastColumns, stepMultiple);
      this.lastLoadResult = result;
      this.syncIntervalSelect(result.stepMultiple, result.probeSeries.baseIntervalSeconds);
      const applyMessage = result.autoAdjusted
        ? `${formatAutoAdjustedMessage(result, result.probeSeries.baseIntervalSeconds)} · 3D 적용 중…`
        : `재생 간격 변경 · 프레임 ${result.scour.frames.length}개 · 3D 적용 중…`;
      this.statusEl.textContent = applyMessage;
      try {
        await Promise.resolve(this.handlers.onLoaded(result));
        this.statusEl.textContent = this.formatLoadCompleteStatus(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '간격 변경 적용에 실패했습니다.';
        this.statusEl.textContent = message;
        this.handlers.onError?.(message);
      }
      return;
    }

    await this.reparseWithStepMultiple(stepMultiple);
  }

  private async reparseWithStepMultiple(stepMultiple: number): Promise<void> {
    if (this.isLoading || this.parseReadyFiles.length === 0) return;
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    this.setLoading(true);
    this.progressBar.style.width = '0%';
    this.blockerProgressBar.style.width = '0%';
    this.applyProgress({
      phase: 'parse',
      message: '재생 간격 변경 · CSV 재파싱 중…',
      fileName: this.parseReadyFiles[0]?.name ?? '',
      fileIndex: 0,
      fileCount: this.parseReadyFiles.length,
      bytesRead: 0,
      fileSize: this.parseReadyFiles.reduce((s, f) => s + f.size, 0),
    });

    try {
      const result = await loadCsvDashboard(this.parseReadyFiles, {
        ...this.handlers.getLoadOptions?.(),
        stepMultiple,
        signal,
        onProgress: (p) => this.setProgress(p, p.phase === 'classify'),
      });

      this.flushProgressFrame();
      this.lastColumns = result.columns;
      this.lastLoadResult = result;
      this.syncIntervalSelect(result.stepMultiple, result.probeSeries.baseIntervalSeconds);
      this.progressBar.style.width = '100%';
      this.blockerProgressBar.style.width = '100%';
      const applyMessage = result.autoAdjusted
        ? `${formatAutoAdjustedMessage(result, result.probeSeries.baseIntervalSeconds)} · 3D 적용 중…`
        : `재생 간격 변경 · 프레임 ${result.scour.frames.length}개 · 3D 적용 중…`;
      this.statusEl.textContent = applyMessage;
      await Promise.resolve(this.handlers.onLoaded(result));
      this.statusEl.textContent = this.formatLoadCompleteStatus(result);
    } catch (err: unknown) {
      if (isCsvParseAbortError(err)) {
        this.statusEl.textContent = err.message;
        this.progressBar.style.width = '0%';
        return;
      }
      const message = err instanceof Error ? err.message : '간격 변경 재파싱에 실패했습니다.';
      this.statusEl.textContent = message;
      this.progressBar.style.width = '0%';
      this.handlers.onError?.(message);
    } finally {
      this.flushProgressFrame();
      this.abortController = null;
      this.setLoading(false);
    }
  }

  private setParseBlocker(visible: boolean): void {
    this.blockerEl.hidden = !visible;
    if (visible) {
      this.blockerDock.appendChild(this.cancelBtn);
      this.cancelBtn.hidden = false;
      return;
    }

    this.actionRow.appendChild(this.cancelBtn);
    this.cancelBtn.hidden = true;
    this.blockerProgressBar.style.width = '0%';
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.loadBtn.hidden = loading;
    this.loadBtn.disabled = loading || this.parseReadyFiles.length === 0;
    this.fileInput.disabled = loading;
    this.setParseBlocker(loading);
  }

  private cancelLoad(): void {
    this.abortController?.abort();
    this.statusEl.textContent = '파싱 중지 요청됨…';
    this.blockerStatusEl.textContent = '파싱 중지 요청됨…';
  }

  private applyProgress(progress: CsvLoadProgress): void {
    const pct = computeCsvProgressPct(progress);
    const width = `${pct}%`;
    const message = formatProgress(progress);
    this.progressBar.style.width = width;
    this.blockerProgressBar.style.width = width;
    this.statusEl.textContent = message;
    this.blockerStatusEl.textContent = message;
  }

  private setProgress(progress: CsvLoadProgress, immediate = false): void {
    this.pendingProgress = progress;
    if (immediate) {
      if (this.progressFrame !== null) {
        cancelAnimationFrame(this.progressFrame);
        this.progressFrame = null;
      }
      this.applyProgress(progress);
      return;
    }
    if (this.progressFrame !== null) return;
    this.progressFrame = requestAnimationFrame(() => {
      this.progressFrame = null;
      const pending = this.pendingProgress;
      if (!pending || !this.isLoading) return;
      this.applyProgress(pending);
    });
  }

  private flushProgressFrame(): void {
    if (this.progressFrame !== null) {
      cancelAnimationFrame(this.progressFrame);
      this.progressFrame = null;
    }
    this.pendingProgress = null;
  }

  private async startLoad(): Promise<void> {
    if (this.isLoading || this.parseReadyFiles.length === 0) return;
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    this.previewBtn.hidden = true;
    this.intervalRow.hidden = true;
    this.lastLoadResult = null;
    this.lastColumns = null;
    this.setLoading(true);
    this.progressBar.style.width = '0%';
    this.blockerProgressBar.style.width = '0%';
    this.applyProgress({
      phase: 'classify',
      message: '파싱 준비 중…',
      fileName: this.parseReadyFiles[0]?.name ?? '',
      fileIndex: 0,
      fileCount: this.parseReadyFiles.length,
      bytesRead: 0,
      fileSize: this.parseReadyFiles.reduce((s, f) => s + f.size, 0),
    });

    try {
      const result = await loadCsvDashboard(this.parseReadyFiles, {
        ...this.handlers.getLoadOptions?.(),
        stepMultiple: this.getStepMultiple(),
        signal,
        onProgress: (p) => this.setProgress(p, p.phase === 'classify'),
      });

      this.flushProgressFrame();

      this.lastColumns = result.columns;
      this.intervalRow.hidden = false;
      this.syncIntervalSelect(result.stepMultiple, result.probeSeries.baseIntervalSeconds);

      this.progressBar.style.width = '100%';
      this.blockerProgressBar.style.width = '100%';
      this.lastLoadResult = result;
      this.previewBtn.hidden = false;
      this.setParseBlocker(false);
      if (result.autoAdjusted) {
        this.statusEl.textContent = `${formatAutoAdjustedMessage(result, result.probeSeries.baseIntervalSeconds)} · 3D 적용 중…`;
      } else {
        this.statusEl.textContent = '파싱 완료 · 3D 장면 적용 중…';
      }
      await Promise.resolve(this.handlers.onLoaded(result));
      this.statusEl.textContent = this.formatLoadCompleteStatus(result);
      this.fileInput.value = '';
    } catch (err: unknown) {
      if (isCsvParseAbortError(err)) {
        this.statusEl.textContent = err.message;
        this.progressBar.style.width = '0%';
        return;
      }
      const message = err instanceof Error ? err.message : 'CSV 파싱에 실패했습니다.';
      this.statusEl.textContent = message;
      this.progressBar.style.width = '0%';
      this.handlers.onError?.(message);
      console.error('CSV 업로드 실패:', err);
    } finally {
      this.flushProgressFrame();
      this.abortController = null;
      this.setLoading(false);
    }
  }

  public getStepMultiple(): number {
    return Math.max(1, Number(this.intervalSelect.value) || 1);
  }

  public dispose(): void {
    this.abortController?.abort();
    if (this.progressFrame !== null) {
      cancelAnimationFrame(this.progressFrame);
      this.progressFrame = null;
    }
    this.previewModal.dispose();
    this.blockerEl.remove();
    for (const fn of this.cleanups) fn();
    this.element.remove();
  }
}
