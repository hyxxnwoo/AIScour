import type { Disposable } from '@/types/disposable';
import type { CsvDashboardLoadResult, CsvLoadProgress } from '@/data/loadCsvDashboard';
import { loadCsvDashboards } from '@/data/loadCsvDashboard';
import { isCsvParseAbortError } from '@/utils/csvParseAbort';
import { computeCsvProgressPct } from '@/utils/csvProgress';
import { snapshotUploadFiles, UPLOAD_SNAPSHOT_MAX_BYTES } from '@/utils/readUploadFile';
import { CsvDataPreviewModal } from '@/components/CsvDataPreviewModal';
import { bridgeTypeLabel, CsvSetupModal, type CsvSetupSelection } from '@/components/CsvSetupModal';
import type { BridgeType } from '@/types/simParams';
import { buildCsvSetupPrefill, filterCsvUploadFiles } from '@/utils/csvSetupPrefill';

export interface CsvUploadPanelHandlers {
  /** 파싱된 케이스 목록(파일 1개 = 케이스 1개). 항상 1개 이상. */
  onLoaded: (results: CsvDashboardLoadResult[]) => void | Promise<void>;
  /** 「적용하고 결과 보기」 — 3D 장면 생성·뷰어 이동 */
  onApplyScene?: () => void | Promise<void>;
  onError?: (message: string) => void;
  /** 파싱 결과가 파일·기둥 수 변경으로 무효가 되었을 때 */
  onInvalidated?: () => void;
  /** 팝업에서 기둥·교량·파일을 확정했을 때 */
  onSetupApplied?: (selection: CsvSetupSelection) => void;
  /** 외부에서 넘긴 파일 수에 맞춰 실행 조건의 기둥 수를 맞출 때 */
  onAnalysisPierCountChange?: (count: number) => void;
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

type CsvSetupFlowStep = 'select' | 'parse' | 'apply';

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
  private selectedFiles: File[] = [];
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
  /** 파싱된 첫 케이스(미리보기·적용 버튼 활성 판단용). */
  private lastLoadResult: CsvDashboardLoadResult | null = null;
  private readonly previewModal = new CsvDataPreviewModal();
  private pendingProgress: CsvLoadProgress | null = null;
  private progressFrame: number | null = null;
  private readonly blockerEl: HTMLElement;
  private readonly blockerStatusEl: HTMLElement;
  private readonly blockerProgressBar: HTMLElement;
  private readonly blockerDock: HTMLElement;
  private readonly actionRow: HTMLElement;
  private readonly flowStrip: HTMLElement;
  private readonly flowStepBtns: Record<CsvSetupFlowStep, HTMLButtonElement>;
  private lastFlowStep: CsvSetupFlowStep | null = null;

  public constructor(handlers: CsvUploadPanelHandlers) {
    this.handlers = handlers;
    this.element = document.createElement('div');
    this.element.className = 'csv-upload-panel csv-upload-panel--viz';

    const flow = this.buildFlowStrip();
    this.flowStrip = flow.strip;
    this.flowStepBtns = flow.buttons;
    this.element.appendChild(this.flowStrip);

    const hint = document.createElement('p');
    hint.className = 'csv-upload-panel__hint';
    hint.dataset.flowHint = '1';
    hint.textContent =
      '① CSV 선택 — 기둥·교량·파일을 정한 뒤, 단계 표시에 따라 파싱 → 적용 순으로 진행합니다.';
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
    this.syncSetupFlowStep();
  }

  /** 4번 조건 설정 진입 시 단계 하이라이트 갱신 */
  public refreshSetupFlow(): void {
    this.syncSetupFlowStep(true);
  }

  private buildFlowStrip(): {
    strip: HTMLElement;
    buttons: Record<CsvSetupFlowStep, HTMLButtonElement>;
  } {
    const strip = document.createElement('div');
    strip.className = 'csv-setup-flow csv-setup-flow--enter';
    strip.setAttribute('role', 'list');
    strip.setAttribute('aria-label', 'CSV 업로드 단계');

    const defs: Array<{ id: CsvSetupFlowStep; n: number; label: string }> = [
      { id: 'select', n: 1, label: 'CSV 선택' },
      { id: 'parse', n: 2, label: 'CSV 파싱' },
      { id: 'apply', n: 3, label: '결과 보기' },
    ];

    const buttons = {} as Record<CsvSetupFlowStep, HTMLButtonElement>;
    defs.forEach((d, i) => {
      if (i > 0) {
        const conn = document.createElement('span');
        conn.className = 'csv-setup-flow__conn';
        conn.setAttribute('aria-hidden', 'true');
        strip.appendChild(conn);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'csv-setup-flow__step';
      btn.dataset.flowStep = d.id;
      btn.dataset.stepN = String(d.n);
      btn.setAttribute('role', 'listitem');
      btn.innerHTML = `<span class="csv-setup-flow__idx">${d.n}</span>
        <span class="csv-setup-flow__text"><b>${d.label}</b></span>`;
      btn.addEventListener('click', () => this.onFlowStepClick(d.id));
      strip.appendChild(btn);
      buttons[d.id] = btn;
    });

    return { strip, buttons };
  }

  private onFlowStepClick(step: CsvSetupFlowStep): void {
    const current = this.computeFlowStep();
    if (step === 'select') {
      this.openSetup();
      return;
    }
    if (step === 'parse') {
      if (current === 'parse' && !this.isLoading && this.loadBtn.disabled === false) {
        void this.startLoad();
      } else if (current === 'select') {
        this.openSetup();
      }
      return;
    }
    if (step === 'apply' && this.lastLoadResult && !this.applySceneLoading && !this.isLoading) {
      void Promise.resolve(this.handlers.onApplyScene?.());
    }
  }

  private computeFlowStep(): CsvSetupFlowStep {
    if (this.lastLoadResult && !this.isLoading) return 'apply';
    const filesReady = this.parseReadyFiles.length > 0;
    if (filesReady || this.isLoading) return 'parse';
    return 'select';
  }

  private syncSetupFlowStep(pulseOnStepChange = false): void {
    const step = this.computeFlowStep();
    const filesReady = this.parseReadyFiles.length > 0;
    const parsed = this.lastLoadResult !== null;

    this.element.dataset.flowStep = step;
    this.flowStrip.dataset.flowStep = step;

    const hintEl = this.element.querySelector('.csv-upload-panel__hint');
    if (hintEl) {
      const hints: Record<CsvSetupFlowStep, string> = {
        select: '',
        parse: '② CSV 파싱 — 파일이 모두 선택되었습니다. 파싱을 실행하세요.',
        apply: '③ 적용하고 결과 보기 — 파싱이 끝났습니다. 3D 장면을 만든 뒤 세굴 뷰로 이동합니다.',
      };
      hintEl.textContent = hints[step];
    }

    for (const id of ['select', 'parse', 'apply'] as const) {
      const btn = this.flowStepBtns[id];
      const isActive = step === id;
      const isDone = (id === 'select' && filesReady) || (id === 'parse' && parsed) || false;
      btn.classList.toggle('is-active', isActive);
      btn.classList.toggle('is-done', isDone && !isActive);
      btn.classList.toggle(
        'is-loading',
        (isActive && id === 'parse' && this.isLoading) ||
          (isActive && id === 'apply' && this.applySceneLoading),
      );
      btn.disabled =
        (id === 'parse' && !filesReady && !parsed) ||
        (id === 'apply' && !parsed) ||
        (id === 'select' && this.isLoading);
      btn.setAttribute('aria-current', isActive ? 'step' : 'false');
      const idxEl = btn.querySelector('.csv-setup-flow__idx');
      if (idxEl) {
        idxEl.textContent = isDone && !isActive ? '✓' : (btn.dataset.stepN ?? '');
      }
    }

    this.openBtn.classList.toggle('is-flow-focus', step === 'select' && !this.isLoading);
    this.loadBtn.classList.toggle('is-flow-focus', step === 'parse' && !parsed && !this.isLoading);
    this.applySceneBtn.classList.toggle(
      'is-flow-focus',
      step === 'apply' && !this.applySceneLoading,
    );

    if (pulseOnStepChange && this.lastFlowStep !== step) {
      const target =
        step === 'select' ? this.openBtn : step === 'parse' ? this.loadBtn : this.applySceneBtn;
      target.classList.add('is-flow-pulse');
      window.setTimeout(() => target.classList.remove('is-flow-pulse'), 1200);
    }
    this.lastFlowStep = step;
  }

  /** CSV 파싱 성공 후에만 「적용하고 결과 보기」 허용 */
  private syncApplySceneEnabled(): void {
    const ready = this.lastLoadResult !== null;
    this.applySceneBtn.disabled = !ready || this.isLoading || this.applySceneLoading;
    this.applySceneBtn.title = ready ? '' : 'CSV 파싱을 먼저 완료해 주세요.';
    this.syncSetupFlowStep();
  }

  private structureDefaults(): CsvSetupSelection {
    const structure = this.handlers.getStructure?.();
    return {
      pierCount: (structure?.pierCount ?? this.analysisPierCount) as 1 | 2 | 3,
      bridgeEnabled: structure?.bridgeEnabled ?? this.bridgeEnabled,
      bridgeType: structure?.bridgeType ?? this.bridgeType,
      files: [...this.selectedFiles],
    };
  }

  private openSetup(): void {
    if (this.isLoading) return;
    const initial = this.structureDefaults();
    this.setupModal.open(initial, (selection) => {
      void this.commitSetup(selection);
    });
  }

  /**
   * 2번 케이스 허브 등 — 4번과 동일하게 「CSV 선택」 모달부터 시작 (자동 파싱 없음).
   */
  public openSetupWithPrefilledFiles(rawFiles: File[]): void {
    if (this.isLoading) return;
    const csv = filterCsvUploadFiles(rawFiles);
    const base = this.structureDefaults();
    const initial =
      csv.length > 0
        ? buildCsvSetupPrefill(csv, {
            pierCount: base.pierCount,
            bridgeEnabled: base.bridgeEnabled,
            bridgeType: base.bridgeType,
          })
        : base;
    this.setupModal.open(initial, (selection) => {
      void this.commitSetup(selection);
    });
  }

  private async commitSetup(selection: CsvSetupSelection): Promise<void> {
    if (this.isLoading) return;
    const hadResult = this.lastLoadResult !== null;
    this.analysisPierCount = selection.pierCount;
    this.bridgeEnabled = selection.bridgeEnabled;
    this.bridgeType = selection.bridgeType;
    this.selectedFiles = [...selection.files];
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
    this.syncSetupFlowStep(true);
  }

  private refreshSummary(): void {
    const bridge = this.bridgeEnabled ? `교량 ${bridgeTypeLabel(this.bridgeType)}` : '교량 없음';
    const lines = [`기둥 ${this.analysisPierCount}개 · ${bridge}`];
    if (this.selectedFiles.length === 0) {
      lines.push('CSV 파일 없음');
    } else {
      lines.push(
        `CSV ${this.selectedFiles.length}개: ${this.selectedFiles.map((f) => f.name).join(', ')}`,
      );
    }
    this.summaryEl.textContent = lines.join('\n');
  }

  private async snapshotSlotFilesIfNeeded(): Promise<void> {
    const active = this.selectedFiles;
    if (active.length === 0) return;

    const hasLarge = active.some((f) => f.size > UPLOAD_SNAPSHOT_MAX_BYTES);
    if (hasLarge) return;

    try {
      this.selectedFiles = await snapshotUploadFiles(active);
      this.refreshSummary();
    } catch {
      /* 스냅샷 실패 시 원본 File 로 스트리밍 파싱 */
    }
  }

  private syncParseReadyFromSlots(): void {
    const files = [...this.selectedFiles];

    this.parseReadyFiles = files;
    if (files.length === 0) {
      this.statusEl.textContent = 'CSV 파일을 선택해 주세요.';
      this.statusEl.classList.remove('is-ready');
      this.loadBtn.disabled = true;
      return;
    }

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    const label = files.length === 1 ? files[0].name : `케이스 ${files.length}개`;
    this.statusEl.textContent = `${label} · ${formatBytes(totalBytes)} · 파싱할 수 있습니다`;
    this.statusEl.classList.remove('is-ready');
    this.loadBtn.disabled = this.isLoading;
    this.syncSetupFlowStep(true);
  }

  public pulseAttention(): void {
    this.element.classList.add('csv-upload-panel--attention');
    this.syncSetupFlowStep(true);
    window.setTimeout(() => this.element.classList.remove('csv-upload-panel--attention'), 2800);
  }

  private setSlotInputsDisabled(disabled: boolean): void {
    this.openBtn.disabled = disabled;
  }

  /** CSV 0 셀에서 검출한 교각 수를 기둥 개수(1~3)에 반영한다. */
  private syncPierCountFromResult(result: CsvDashboardLoadResult): void {
    const detected = Math.min(3, result.piers.length);
    if (detected < 1 || detected === this.analysisPierCount) return;
    this.analysisPierCount = detected;
    this.refreshSummary();
    this.handlers.onAnalysisPierCountChange?.(detected);
  }

  private formatLoadCompleteStatus(results: CsvDashboardLoadResult[]): string {
    const result = results[0];
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
    const warnings = results.flatMap((r) => r.warnings);
    if (warnings.length > 0) {
      parts.push(`⚠ ${warnings.join(' / ')}`);
    }
    if (results.length > 1) {
      parts.unshift(`케이스 ${results.length}개(${results.map((r) => r.caseName).join(', ')})`);
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
    this.loadBtn.disabled = loading || this.parseReadyFiles.length === 0;
    this.syncApplySceneEnabled();
    this.setSlotInputsDisabled(loading);
    this.setParseBlocker(loading);
    this.syncSetupFlowStep();
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
      const results = await loadCsvDashboards(this.parseReadyFiles, {
        stepMultiple: 1,
        signal,
        onProgress: (p) => this.setProgress(p, p.phase === 'classify'),
      });

      this.flushProgressFrame();

      this.progressBar.style.width = '100%';
      this.blockerProgressBar.style.width = '100%';
      this.lastLoadResult = results[0] ?? null;
      this.element.classList.add('csv-upload-panel--parsed');
      this.previewBtn.hidden = false;
      this.setParseBlocker(false);
      this.syncPierCountFromResult(results[0]);
      await Promise.resolve(this.handlers.onLoaded(results));
      this.statusEl.textContent = this.formatLoadCompleteStatus(results);
      this.statusEl.classList.add('is-ready');
      this.syncApplySceneEnabled();
      this.syncSetupFlowStep(true);
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
      this.syncSetupFlowStep();
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
