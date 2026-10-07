import type { Disposable } from '@/types/disposable';
import type {
  CsvDashboardLoadResult,
  CsvLoadProgress,
  LoadCsvDashboardOptions,
} from '@/data/loadCsvDashboard';
import { loadCsvDashboard } from '@/data/loadCsvDashboard';
import { isCsvParseAbortError } from '@/utils/csvParseAbort';
import { computeCsvProgressPct } from '@/utils/csvProgress';
import { snapshotUploadFiles, UPLOAD_SNAPSHOT_MAX_BYTES } from '@/utils/readUploadFile';
import { CsvDataPreviewModal } from '@/components/CsvDataPreviewModal';
import { bridgeTypeLabel, CsvSetupModal, type CsvSetupSelection } from '@/components/CsvSetupModal';
import type { BridgeType } from '@/types/simParams';
export interface CsvUploadPanelHandlers {
  onLoaded: (result: CsvDashboardLoadResult) => void | Promise<void>;
  /** 「적용하고 결과 보기」 — 3D 장면 생성·뷰어 이동 */
  onApplyScene?: () => void | Promise<void>;
  onError?: (message: string) => void;
  /** 파싱 결과가 파일·기둥 수 변경으로 무효가 되었을 때 */
  onInvalidated?: () => void;
  /** 팝업에서 기둥·교량·파일을 확정했을 때 */
  onSetupApplied?: (selection: CsvSetupSelection) => void;
  /** 외부에서 넘긴 파일 수에 맞춰 실행 조건의 기둥 수를 맞출 때 */
  onAnalysisPierCountChange?: (count: number) => void;
  getLoadOptions?: () => Partial<LoadCsvDashboardOptions>;
  getStructure?: () => {
    pierCount: 1 | 2 | 3;
    bridgeEnabled: boolean;
    bridgeType: BridgeType;
  };
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

export class CsvUploadPanel implements Disposable {
  public readonly element: HTMLElement;
  private readonly handlers: CsvUploadPanelHandlers;
  private readonly cleanups: Array<() => void> = [];
  private statusEl!: HTMLElement;
  private summaryEl!: HTMLElement;
  private openBtn!: HTMLButtonElement;
  private analysisPierCount = 3;
  private bridgeEnabled = true;
  private bridgeType: BridgeType = 'girder';
  private readonly pierSlotFiles: Array<File | null> = [null, null, null];
  private readonly setupModal: CsvSetupModal;
  private progressBar!: HTMLElement;
  private loadBtn!: HTMLButtonElement;
  private cancelBtn!: HTMLButtonElement;
  private previewBtn!: HTMLButtonElement;
  private applySceneBtn!: HTMLButtonElement;
  private isLoading = false;
  private applySceneLoading = false;
  private parseReadyFiles: File[] = [];
  private abortController: AbortController | null = null;
  private lastLoadResult: CsvDashboardLoadResult | null = null;
  private readonly previewModal = new CsvDataPreviewModal();
  private pendingProgress: CsvLoadProgress | null = null;
  private progressFrame: number | null = null;
  private readonly blockerEl: HTMLElement;
  private readonly blockerStatusEl: HTMLElement;
  private readonly blockerProgressBar: HTMLElement;
  private readonly blockerDock: HTMLElement;
  private readonly actionRow: HTMLElement;

  public constructor(handlers: CsvUploadPanelHandlers) {
    this.handlers = handlers;
    this.element = document.createElement('div');
    this.element.className = 'csv-upload-panel';

    const title = document.createElement('div');
    title.className = 'csv-upload-panel__title';
    title.textContent = '2 · CSV 파싱';
    this.element.appendChild(title);

    const hint = document.createElement('p');
    hint.className = 'csv-upload-panel__hint';
    hint.textContent =
      'CSV 선택에서 기둥·교량과 파일을 정합니다. 아래 「적용하고 결과 보기」로 3D 장면을 만듭니다.';
    this.element.appendChild(hint);

    this.openBtn = document.createElement('button');
    this.openBtn.type = 'button';
    this.openBtn.className = 'csv-upload-panel__pick';
    this.openBtn.textContent = 'CSV 선택';
    const onOpen = (): void => this.openSetup();
    this.openBtn.addEventListener('click', onOpen);
    this.cleanups.push(() => this.openBtn.removeEventListener('click', onOpen));
    this.element.appendChild(this.openBtn);

    this.summaryEl = document.createElement('div');
    this.summaryEl.className = 'csv-upload-panel__summary';
    this.element.appendChild(this.summaryEl);
    this.refreshSummary();

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

    this.loadBtn = document.createElement('button');
    this.loadBtn.type = 'button';
    this.loadBtn.className = 'csv-upload-panel__load';
    this.loadBtn.textContent = 'CSV 파싱';
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
        this.previewModal.open(this.lastLoadResult, this.lastLoadResult.columns);
      }
    };
    this.previewBtn.addEventListener('click', onPreview);
    this.cleanups.push(() => this.previewBtn.removeEventListener('click', onPreview));

    const actionRow = document.createElement('div');
    actionRow.className = 'csv-upload-panel__actions';
    actionRow.append(this.loadBtn, this.cancelBtn, this.previewBtn);
    this.element.appendChild(actionRow);
    this.actionRow = actionRow;

    this.applySceneBtn = document.createElement('button');
    this.applySceneBtn.type = 'button';
    this.applySceneBtn.className = 'csv-upload-panel__apply-scene';
    this.applySceneBtn.textContent = '적용하고 결과 보기';
    const onApplyScene = (): void => {
      if (this.applySceneLoading || !this.lastLoadResult) return;
      void Promise.resolve(this.handlers.onApplyScene?.());
    };
    this.applySceneBtn.addEventListener('click', onApplyScene);
    this.cleanups.push(() => this.applySceneBtn.removeEventListener('click', onApplyScene));
    this.element.appendChild(this.applySceneBtn);

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
    this.setupModal = new CsvSetupModal();
    document.body.appendChild(this.setupModal.element);

    this.syncParseReadyFromSlots();
    this.syncApplySceneEnabled();
  }

  /** CSV 파싱 성공 후에만 「적용하고 결과 보기」 허용 */
  private syncApplySceneEnabled(): void {
    const ready = this.lastLoadResult !== null;
    this.applySceneBtn.disabled = !ready || this.isLoading || this.applySceneLoading;
    this.applySceneBtn.title = ready ? '' : 'CSV 파싱을 먼저 완료해 주세요.';
  }

  private openSetup(): void {
    if (this.isLoading) return;
    const structure = this.handlers.getStructure?.();
    const pierCount = (structure?.pierCount ?? this.analysisPierCount) as 1 | 2 | 3;
    this.setupModal.open(
      {
        pierCount,
        bridgeEnabled: structure?.bridgeEnabled ?? this.bridgeEnabled,
        bridgeType: structure?.bridgeType ?? this.bridgeType,
        files: [...this.pierSlotFiles],
      },
      (selection) => {
        void this.commitSetup(selection);
      },
    );
  }

  private async commitSetup(selection: CsvSetupSelection): Promise<void> {
    if (this.isLoading) return;
    const hadResult = this.lastLoadResult !== null;
    this.analysisPierCount = selection.pierCount;
    this.bridgeEnabled = selection.bridgeEnabled;
    this.bridgeType = selection.bridgeType;
    for (let i = 0; i < 3; i += 1) {
      this.pierSlotFiles[i] = i < selection.pierCount ? (selection.files[i] ?? null) : null;
    }
    if (hadResult) {
      this.lastLoadResult = null;
      this.previewBtn.hidden = true;
      this.statusEl.classList.remove('is-ready');
      this.handlers.onInvalidated?.();
      this.syncApplySceneEnabled();
    }
    this.refreshSummary();
    await this.snapshotSlotFilesIfNeeded();
    this.syncParseReadyFromSlots();
    this.handlers.onSetupApplied?.(selection);
  }

  private refreshSummary(): void {
    const bridge = this.bridgeEnabled ? `교량 ${bridgeTypeLabel(this.bridgeType)}` : '교량 없음';
    const lines = [`기둥 ${this.analysisPierCount}개 · ${bridge}`];
    for (let i = 0; i < this.analysisPierCount; i += 1) {
      const file = this.pierSlotFiles[i];
      lines.push(file ? `P${i + 1} ${file.name}` : `P${i + 1} 파일 없음`);
    }
    this.summaryEl.textContent = lines.join('\n');
  }

  public getAnalysisPierCount(): number {
    return this.analysisPierCount;
  }

  /** 오른쪽 기둥 개수에 맞춰 파일 칸 수를 바꾼다. 파싱 결과는 무효가 된다. */
  public setSlotCount(count: 1 | 2 | 3): void {
    if (this.isLoading || count === this.analysisPierCount) return;
    const hadResult = this.lastLoadResult !== null;
    this.analysisPierCount = count;
    for (let i = count; i < 3; i += 1) {
      this.pierSlotFiles[i] = null;
    }
    this.refreshSummary();
    if (hadResult) {
      this.lastLoadResult = null;
      this.previewBtn.hidden = true;
      this.handlers.onInvalidated?.();
    }
    this.syncParseReadyFromSlots();
    if (hadResult && this.parseReadyFiles.length === this.analysisPierCount) {
      this.statusEl.textContent = '기둥 수가 바뀌었습니다. 다시 파싱하세요.';
      this.statusEl.classList.remove('is-ready');
      this.loadBtn.disabled = false;
    }
  }

  private async snapshotSlotFilesIfNeeded(): Promise<void> {
    const active = this.pierSlotFiles.slice(0, this.analysisPierCount).filter(Boolean) as File[];
    if (active.length === 0) return;

    const hasLarge = active.some((f) => f.size > UPLOAD_SNAPSHOT_MAX_BYTES);
    if (hasLarge) return;

    try {
      const snapshotted = await snapshotUploadFiles(active);
      for (let i = 0, si = 0; i < this.analysisPierCount; i += 1) {
        if (this.pierSlotFiles[i]) {
          this.pierSlotFiles[i] = snapshotted[si] ?? this.pierSlotFiles[i];
          si += 1;
        }
      }
      this.refreshSummary();
    } catch {
      /* 스냅샷 실패 시 원본 File 로 스트리밍 파싱 */
    }
  }

  private syncParseReadyFromSlots(): void {
    const missing: number[] = [];
    const files: File[] = [];
    for (let i = 0; i < this.analysisPierCount; i += 1) {
      const f = this.pierSlotFiles[i];
      if (!f) missing.push(i + 1);
      else files.push(f);
    }

    this.parseReadyFiles = files;
    if (missing.length > 0) {
      this.statusEl.textContent = `교각 P${missing.join(', P')} CSV를 선택해 주세요. (${files.length}/${this.analysisPierCount})`;
      this.statusEl.classList.remove('is-ready');
      this.loadBtn.disabled = true;
      return;
    }

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (this.analysisPierCount === 1) {
      this.statusEl.textContent = `${files[0]?.name ?? 'CSV'} · ${formatBytes(totalBytes)} · 파싱할 수 있습니다`;
    } else {
      this.statusEl.textContent = `교각 ${this.analysisPierCount}개 CSV · ${formatBytes(totalBytes)} · 파싱할 수 있습니다`;
    }
    this.statusEl.classList.remove('is-ready');
    this.loadBtn.disabled = this.isLoading;
  }

  /**
   * 2번 케이스 허브 등 외부에서 파일을 넘길 때 사용.
   * autoLoad true면 스테이징 직후 파싱(startLoad)까지 실행한다. 장면은 만들지 않는다.
   */
  public async ingestExternalFiles(files: File[], autoLoad = false): Promise<void> {
    const raw = files.filter(
      (f) => f.name.toLowerCase().endsWith('.csv') || f.type.includes('csv'),
    );
    if (raw.length === 0) {
      this.parseReadyFiles = [];
      this.syncParseReadyFromSlots();
      return;
    }

    const count = Math.min(3, Math.max(1, raw.length)) as 1 | 2 | 3;
    this.setSlotCount(count);
    this.handlers.onAnalysisPierCountChange?.(count);
    for (let i = 0; i < 3; i += 1) {
      this.pierSlotFiles[i] = null;
    }
    for (let i = 0; i < count; i += 1) {
      this.pierSlotFiles[i] = raw[i] ?? null;
    }
    this.refreshSummary();

    this.statusEl.textContent = '파일 읽는 중…';
    this.loadBtn.disabled = true;
    this.setSlotInputsDisabled(true);

    try {
      await this.snapshotSlotFilesIfNeeded();
      this.syncParseReadyFromSlots();
      if (autoLoad && this.parseReadyFiles.length === this.analysisPierCount) {
        await this.startLoad();
      }
    } finally {
      if (!this.isLoading) {
        this.setSlotInputsDisabled(false);
      }
    }
  }

  public pulseAttention(): void {
    this.element.classList.add('csv-upload-panel--attention');
    window.setTimeout(() => this.element.classList.remove('csv-upload-panel--attention'), 2800);
  }

  private setSlotInputsDisabled(disabled: boolean): void {
    this.openBtn.disabled = disabled;
  }

  private formatLoadCompleteStatus(result: CsvDashboardLoadResult): string {
    const base = `파싱 완료 · ${result.scour.baseTerrain.width}×${result.scour.baseTerrain.height} · 프레임 ${result.scour.frames.length}개`;
    const parts = [base];
    if (result.fluid) {
      const g = result.fluid.grid;
      parts.push(`유체장 ${g.width}×${g.height}×${g.depth}`);
    }
    if (result.csvScrdifAllZero) {
      parts.push('CSV scrdif=0 · 세굴 없음(실측 없음)');
    } else if (result.piers.length > 0) {
      parts.push(`교각 ${result.piers.length}개(P1…P${result.piers.length})`);
    }
    if (result.autoAdjusted) {
      parts.push('프레임 자동 축소');
    }
    return parts.join(' · ');
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

  public setApplyLoading(loading: boolean): void {
    this.applySceneLoading = loading;
    this.applySceneBtn.textContent = loading ? '장면 만드는 중…' : '적용하고 결과 보기';
    this.syncApplySceneEnabled();
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.loadBtn.hidden = loading;
    this.loadBtn.disabled = loading || this.parseReadyFiles.length !== this.analysisPierCount;
    this.syncApplySceneEnabled();
    this.setSlotInputsDisabled(loading);
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
    if (this.isLoading || this.parseReadyFiles.length !== this.analysisPierCount) return;
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    this.previewBtn.hidden = true;
    this.lastLoadResult = null;
    this.statusEl.classList.remove('is-ready');
    this.handlers.onInvalidated?.();
    this.syncApplySceneEnabled();
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
        stepMultiple: 1,
        signal,
        onProgress: (p) => this.setProgress(p, p.phase === 'classify'),
      });

      this.flushProgressFrame();

      this.progressBar.style.width = '100%';
      this.blockerProgressBar.style.width = '100%';
      this.lastLoadResult = result;
      this.previewBtn.hidden = false;
      this.setParseBlocker(false);
      await Promise.resolve(this.handlers.onLoaded(result));
      this.statusEl.textContent = this.formatLoadCompleteStatus(result);
      this.statusEl.classList.add('is-ready');
      this.syncApplySceneEnabled();
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
    } finally {
      this.flushProgressFrame();
      this.abortController = null;
      this.setLoading(false);
    }
  }

  public dispose(): void {
    this.abortController?.abort();
    if (this.progressFrame !== null) {
      cancelAnimationFrame(this.progressFrame);
      this.progressFrame = null;
    }
    this.previewModal.dispose();
    this.setupModal.dispose();
    this.blockerEl.remove();
    for (const fn of this.cleanups) fn();
    this.element.remove();
  }
}
