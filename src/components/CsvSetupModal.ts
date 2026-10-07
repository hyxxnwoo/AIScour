import type { Disposable } from '@/types/disposable';
import type { BridgeType } from '@/types/simParams';

export interface CsvSetupSelection {
  pierCount: 1 | 2 | 3;
  bridgeEnabled: boolean;
  bridgeType: BridgeType;
  files: Array<File | null>;
}

const BRIDGE_OPTIONS: Array<{ value: BridgeType; label: string }> = [
  { value: 'suspension', label: '현수교' },
  { value: 'cable-stayed', label: '사장교' },
  { value: 'arch', label: '아치교' },
  { value: 'girder', label: '거더교' },
];

export function bridgeTypeLabel(type: BridgeType): string {
  return BRIDGE_OPTIONS.find((opt) => opt.value === type)?.label ?? type;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** CSV 선택 팝업 — 기둥 수, 교량, 교각별 파일을 한 번에 정한다. */
export class CsvSetupModal implements Disposable {
  public readonly element: HTMLElement;
  private readonly dialog: HTMLElement;
  private readonly fileRows: HTMLElement;
  private bridgeTypeRow!: HTMLElement;
  private readonly confirmBtn: HTMLButtonElement;
  private readonly noteEl: HTMLElement;
  private readonly cleanups: Array<() => void> = [];
  private pierCount: 1 | 2 | 3 = 3;
  private bridgeEnabled = true;
  private bridgeType: BridgeType = 'girder';
  private readonly files: Array<File | null> = [null, null, null];
  private pierButtons: HTMLButtonElement[] = [];
  private bridgeButtons: HTMLButtonElement[] = [];
  private bridgeCheck!: HTMLInputElement;
  private onConfirm: ((selection: CsvSetupSelection) => void) | null = null;

  public constructor() {
    this.element = document.createElement('div');
    this.element.className = 'csv-setup-modal';
    this.element.hidden = true;

    const backdrop = document.createElement('div');
    backdrop.className = 'csv-setup-modal__backdrop';
    const onBackdrop = (): void => this.close();
    backdrop.addEventListener('click', onBackdrop);
    this.cleanups.push(() => backdrop.removeEventListener('click', onBackdrop));

    this.dialog = document.createElement('div');
    this.dialog.className = 'csv-setup-modal__dialog';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'csv-setup-modal-title');

    const title = document.createElement('h2');
    title.className = 'csv-setup-modal__title';
    title.id = 'csv-setup-modal-title';
    title.textContent = 'CSV 선택';

    const hint = document.createElement('p');
    hint.className = 'csv-setup-modal__hint';
    hint.textContent = '기둥 수와 교량을 정한 뒤, 교각마다 CSV를 올립니다.';

    this.dialog.append(
      title,
      hint,
      this.buildPierCountRow(),
      this.buildBridgeToggle(),
      this.buildBridgeTypeRow(),
    );

    this.fileRows = document.createElement('div');
    this.fileRows.className = 'csv-setup-modal__files';
    this.dialog.appendChild(this.fileRows);

    this.noteEl = document.createElement('p');
    this.noteEl.className = 'csv-setup-modal__note';
    this.dialog.appendChild(this.noteEl);

    const actions = document.createElement('div');
    actions.className = 'csv-setup-modal__actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'csv-setup-modal__cancel';
    cancelBtn.textContent = '취소';
    const onCancel = (): void => this.close();
    cancelBtn.addEventListener('click', onCancel);
    this.cleanups.push(() => cancelBtn.removeEventListener('click', onCancel));

    this.confirmBtn = document.createElement('button');
    this.confirmBtn.type = 'button';
    this.confirmBtn.className = 'csv-setup-modal__confirm';
    this.confirmBtn.textContent = '선택 완료';
    const onOk = (): void => this.confirm();
    this.confirmBtn.addEventListener('click', onOk);
    this.cleanups.push(() => this.confirmBtn.removeEventListener('click', onOk));

    actions.append(cancelBtn, this.confirmBtn);
    this.dialog.appendChild(actions);

    this.element.append(backdrop, this.dialog);

    const onKey = (event: KeyboardEvent): void => {
      if (this.element.hidden) return;
      if (event.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', onKey);
    this.cleanups.push(() => document.removeEventListener('keydown', onKey));
  }

  public open(initial: CsvSetupSelection, onConfirm: (selection: CsvSetupSelection) => void): void {
    this.onConfirm = onConfirm;
    this.pierCount = initial.pierCount;
    this.bridgeEnabled = initial.bridgeEnabled;
    this.bridgeType = initial.bridgeType;
    this.files[0] = initial.files[0] ?? null;
    this.files[1] = initial.files[1] ?? null;
    this.files[2] = initial.files[2] ?? null;
    this.noteEl.textContent = '';
    this.syncPierButtons();
    this.syncBridgeButtons();
    this.syncBridgeTypeVisibility();
    this.renderFileRows();
    this.element.hidden = false;
  }

  public close(): void {
    this.element.hidden = true;
    this.onConfirm = null;
  }

  public dispose(): void {
    for (const fn of this.cleanups) fn();
    this.element.remove();
  }

  private confirm(): void {
    if (!this.filesReady()) return;
    const selection: CsvSetupSelection = {
      pierCount: this.pierCount,
      bridgeEnabled: this.bridgeEnabled,
      bridgeType: this.bridgeType,
      files: [this.files[0], this.files[1], this.files[2]],
    };
    const notify = this.onConfirm;
    this.close();
    notify?.(selection);
  }

  private filesReady(): boolean {
    for (let i = 0; i < this.pierCount; i += 1) {
      if (!this.files[i]) return false;
    }
    return true;
  }

  private syncConfirm(): void {
    const ready = this.filesReady();
    this.confirmBtn.disabled = !ready;
    this.noteEl.textContent = ready ? '' : `교각 ${this.pierCount}개의 CSV를 모두 선택해 주세요.`;
  }

  private buildPierCountRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'csv-setup-modal__row';
    const label = document.createElement('span');
    label.className = 'csv-setup-modal__label';
    label.textContent = '기둥 개수';
    const segments = document.createElement('div');
    segments.className = 'csv-setup-modal__segments';
    segments.setAttribute('role', 'group');
    segments.setAttribute('aria-label', '기둥 개수');
    this.pierButtons = [];
    for (const count of [1, 2, 3] as const) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'csv-setup-modal__segment';
      btn.textContent = String(count);
      const onClick = (): void => {
        this.pierCount = count;
        this.syncPierButtons();
        this.renderFileRows();
      };
      btn.addEventListener('click', onClick);
      this.cleanups.push(() => btn.removeEventListener('click', onClick));
      this.pierButtons.push(btn);
      segments.appendChild(btn);
    }
    row.append(label, segments);
    return row;
  }

  private buildBridgeToggle(): HTMLElement {
    const row = document.createElement('label');
    row.className = 'csv-setup-modal__row csv-setup-modal__row--toggle';
    const label = document.createElement('span');
    label.className = 'csv-setup-modal__label';
    label.textContent = '교량 설치';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'csv-setup-modal__check';
    input.checked = this.bridgeEnabled;
    const text = document.createElement('span');
    text.textContent = '설치';
    const onChange = (): void => {
      this.bridgeEnabled = input.checked;
      this.syncBridgeTypeVisibility();
    };
    input.addEventListener('change', onChange);
    this.cleanups.push(() => input.removeEventListener('change', onChange));
    this.bridgeCheck = input;
    row.append(label, input, text);
    return row;
  }

  private buildBridgeTypeRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'csv-setup-modal__row';
    this.bridgeTypeRow = row;
    const label = document.createElement('span');
    label.className = 'csv-setup-modal__label';
    label.textContent = '교량 형식';
    const segments = document.createElement('div');
    segments.className = 'csv-setup-modal__segments csv-setup-modal__segments--wrap';
    segments.setAttribute('role', 'group');
    segments.setAttribute('aria-label', '교량 형식');
    this.bridgeButtons = [];
    for (const opt of BRIDGE_OPTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'csv-setup-modal__segment';
      btn.textContent = opt.label;
      btn.dataset.value = opt.value;
      const onClick = (): void => {
        this.bridgeType = opt.value;
        this.bridgeEnabled = true;
        this.bridgeCheck.checked = true;
        this.syncBridgeButtons();
        this.syncBridgeTypeVisibility();
      };
      btn.addEventListener('click', onClick);
      this.cleanups.push(() => btn.removeEventListener('click', onClick));
      this.bridgeButtons.push(btn);
      segments.appendChild(btn);
    }
    row.append(label, segments);
    return row;
  }

  private syncPierButtons(): void {
    for (const btn of this.pierButtons) {
      const active = Number(btn.textContent) === this.pierCount;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  private syncBridgeButtons(): void {
    for (const btn of this.bridgeButtons) {
      const active = btn.dataset.value === this.bridgeType;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  private syncBridgeTypeVisibility(): void {
    this.bridgeTypeRow.hidden = !this.bridgeEnabled;
  }

  private renderFileRows(): void {
    this.fileRows.replaceChildren();
    for (let i = 0; i < this.pierCount; i += 1) {
      this.fileRows.appendChild(this.buildFileRow(i));
    }
    this.syncConfirm();
  }

  private buildFileRow(index: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'csv-setup-modal__file';

    const title = document.createElement('div');
    title.className = 'csv-setup-modal__file-title';
    title.textContent = `교각 P${index + 1}`;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.hidden = true;

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'csv-setup-modal__pick';
    pick.textContent = '파일 선택';
    const onPick = (): void => {
      input.value = '';
      input.click();
    };
    pick.addEventListener('click', onPick);

    const status = document.createElement('div');
    status.className = 'csv-setup-modal__file-status';
    const file = this.files[index];
    status.textContent = file ? `${file.name} · ${formatBytes(file.size)}` : '선택된 파일 없음';

    const onChange = (): void => {
      const next = input.files?.[0] ?? null;
      if (!next) return;
      if (!next.name.toLowerCase().endsWith('.csv') && !next.type.includes('csv')) {
        this.noteEl.textContent = 'CSV 파일만 선택할 수 있습니다.';
        return;
      }
      this.files[index] = next;
      status.textContent = `${next.name} · ${formatBytes(next.size)}`;
      this.noteEl.textContent = '';
      this.syncConfirm();
    };
    input.addEventListener('change', onChange);

    row.append(title, pick, status, input);
    return row;
  }
}
