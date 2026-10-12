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

type SetupStep = 'pier' | 'bridge' | 'type' | 'files';

const STEP_ORDER: SetupStep[] = ['pier', 'bridge', 'type', 'files'];

const STEP_META: Record<SetupStep, { label: string; prompt: string }> = {
  pier: {
    label: '기둥 개수',
    prompt: '교각이 몇 개인지 고릅니다. 고른 개수만큼 CSV가 필요합니다.',
  },
  bridge: {
    label: '교량 설치',
    prompt: '교량을 둘지 정합니다. 설치하지 않으면 형식은 묻지 않고 파일 선택으로 갑니다.',
  },
  type: {
    label: '교량 형식',
    prompt: '설치할 교량의 형식을 고릅니다.',
  },
  files: {
    label: '파일 선택',
    prompt: '교각마다 CSV 파일을 하나씩 올립니다.',
  },
};

export function bridgeTypeLabel(type: BridgeType): string {
  return BRIDGE_OPTIONS.find((opt) => opt.value === type)?.label ?? type;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** CSV 선택 팝업 — 기둥 개수, 교량 설치, 교량 형식, 파일 선택을 한 단계씩 진행한다. */
export class CsvSetupModal implements Disposable {
  public readonly element: HTMLElement;
  private readonly dialog: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly recapEl: HTMLElement;
  private readonly fileRows: HTMLElement;
  private readonly pierPanel: HTMLElement;
  private readonly bridgePanel: HTMLElement;
  private readonly typePanel: HTMLElement;
  private readonly filesPanel: HTMLElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly confirmBtn: HTMLButtonElement;
  private readonly noteEl: HTMLElement;
  private readonly stepButtons: HTMLButtonElement[] = [];
  private readonly cleanups: Array<() => void> = [];
  private step: SetupStep = 'pier';
  private pierCount: 1 | 2 | 3 = 3;
  private bridgeEnabled = true;
  private bridgeType: BridgeType = 'girder';
  private readonly files: Array<File | null> = [null, null, null];
  private pierButtons: HTMLButtonElement[] = [];
  private bridgeButtons: HTMLButtonElement[] = [];
  private bridgeChoiceButtons: HTMLButtonElement[] = [];
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

    this.promptEl = document.createElement('p');
    this.promptEl.className = 'csv-setup-modal__prompt';
    this.promptEl.setAttribute('aria-live', 'polite');

    this.pierPanel = this.buildPierCountPanel();
    this.bridgePanel = this.buildBridgePanel();
    this.typePanel = this.buildBridgeTypePanel();

    this.filesPanel = document.createElement('div');
    this.filesPanel.className = 'csv-setup-modal__panel csv-setup-modal__panel--files';
    this.recapEl = document.createElement('p');
    this.recapEl.className = 'csv-setup-modal__recap';
    this.fileRows = document.createElement('div');
    this.fileRows.className = 'csv-setup-modal__files';
    this.filesPanel.append(this.recapEl, this.fileRows);

    this.noteEl = document.createElement('p');
    this.noteEl.className = 'csv-setup-modal__note';

    const actions = document.createElement('div');
    actions.className = 'csv-setup-modal__actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'csv-setup-modal__cancel';
    cancelBtn.textContent = '취소';
    const onCancel = (): void => this.close();
    cancelBtn.addEventListener('click', onCancel);
    this.cleanups.push(() => cancelBtn.removeEventListener('click', onCancel));

    this.backBtn = document.createElement('button');
    this.backBtn.type = 'button';
    this.backBtn.className = 'csv-setup-modal__back';
    this.backBtn.textContent = '이전';
    const onBack = (): void => this.go(-1);
    this.backBtn.addEventListener('click', onBack);
    this.cleanups.push(() => this.backBtn.removeEventListener('click', onBack));

    this.nextBtn = document.createElement('button');
    this.nextBtn.type = 'button';
    this.nextBtn.className = 'csv-setup-modal__next';
    this.nextBtn.textContent = '다음';
    const onNext = (): void => this.go(1);
    this.nextBtn.addEventListener('click', onNext);
    this.cleanups.push(() => this.nextBtn.removeEventListener('click', onNext));

    this.confirmBtn = document.createElement('button');
    this.confirmBtn.type = 'button';
    this.confirmBtn.className = 'csv-setup-modal__confirm';
    this.confirmBtn.textContent = '선택 완료';
    const onOk = (): void => this.confirm();
    this.confirmBtn.addEventListener('click', onOk);
    this.cleanups.push(() => this.confirmBtn.removeEventListener('click', onOk));

    actions.append(cancelBtn, this.backBtn, this.nextBtn, this.confirmBtn);

    this.dialog.append(
      title,
      this.buildStepper(),
      this.promptEl,
      this.pierPanel,
      this.bridgePanel,
      this.typePanel,
      this.filesPanel,
      this.noteEl,
      actions,
    );

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
    this.step = 'pier';
    this.pierCount = initial.pierCount;
    this.bridgeEnabled = initial.bridgeEnabled;
    this.bridgeType = initial.bridgeType;
    this.files[0] = initial.files[0] ?? null;
    this.files[1] = initial.files[1] ?? null;
    this.files[2] = initial.files[2] ?? null;
    this.noteEl.textContent = '';
    this.syncPierButtons();
    this.syncBridgeChoices();
    this.syncBridgeButtons();
    this.renderFileRows();
    this.element.hidden = false;
    this.renderStep(true);
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
    if (this.step !== 'files' || !this.filesReady()) return;
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

  private orderedSteps(): SetupStep[] {
    return this.bridgeEnabled ? ['pier', 'bridge', 'type', 'files'] : ['pier', 'bridge', 'files'];
  }

  private go(delta: 1 | -1): void {
    const steps = this.orderedSteps();
    const index = steps.indexOf(this.step);
    const next = steps[index + delta];
    if (!next) return;
    this.step = next;
    this.renderStep(true);
  }

  private canJumpTo(id: SetupStep): boolean {
    const steps = this.orderedSteps();
    const target = steps.indexOf(id);
    const current = steps.indexOf(this.step);
    return target >= 0 && current >= 0 && target < current;
  }

  private renderStep(focus = false): void {
    if (!this.orderedSteps().includes(this.step)) this.step = 'bridge';
    const steps = this.orderedSteps();
    const index = steps.indexOf(this.step);

    for (const btn of this.stepButtons) {
      const id = btn.dataset.step as SetupStep;
      const current = id === this.step;
      const skipped = id === 'type' && !this.bridgeEnabled;
      const done = this.canJumpTo(id);
      btn.classList.toggle('is-current', current);
      btn.classList.toggle('is-done', done);
      btn.classList.toggle('is-skipped', skipped);
      btn.disabled = !done && !current;
      if (current) btn.setAttribute('aria-current', 'step');
      else btn.removeAttribute('aria-current');
      const state = btn.querySelector('.csv-setup-modal__step-state');
      if (state) state.textContent = skipped ? '건너뜀' : '';
    }

    this.promptEl.textContent = STEP_META[this.step].prompt;
    this.pierPanel.hidden = this.step !== 'pier';
    this.bridgePanel.hidden = this.step !== 'bridge';
    this.typePanel.hidden = this.step !== 'type';
    this.filesPanel.hidden = this.step !== 'files';
    this.recapEl.textContent = this.bridgeEnabled
      ? `기둥 ${this.pierCount}개 · 교량 ${bridgeTypeLabel(this.bridgeType)}`
      : `기둥 ${this.pierCount}개 · 교량 없음`;

    this.backBtn.hidden = index <= 0;
    const last = this.step === 'files';
    this.nextBtn.hidden = last;
    this.confirmBtn.hidden = !last;
    if (last) this.syncConfirm();
    else this.noteEl.textContent = '';

    if (focus) this.focusStep();
  }

  private focusStep(): void {
    const panel =
      this.step === 'pier'
        ? this.pierPanel
        : this.step === 'bridge'
          ? this.bridgePanel
          : this.step === 'type'
            ? this.typePanel
            : this.filesPanel;
    const active = panel.querySelector<HTMLButtonElement>('.is-active');
    const fallback = panel.querySelector<HTMLButtonElement>('button');
    (active ?? fallback)?.focus();
  }

  private buildStepper(): HTMLElement {
    const list = document.createElement('ol');
    list.className = 'csv-setup-modal__steps';
    STEP_ORDER.forEach((id, index) => {
      const item = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'csv-setup-modal__step';
      btn.dataset.step = id;
      const n = document.createElement('span');
      n.className = 'csv-setup-modal__step-n';
      n.textContent = String(index + 1);
      const label = document.createElement('span');
      label.className = 'csv-setup-modal__step-label';
      label.textContent = STEP_META[id].label;
      const state = document.createElement('span');
      state.className = 'csv-setup-modal__step-state';
      btn.append(n, label, state);
      const onClick = (): void => {
        if (!this.canJumpTo(id)) return;
        this.step = id;
        this.renderStep(true);
      };
      btn.addEventListener('click', onClick);
      this.cleanups.push(() => btn.removeEventListener('click', onClick));
      this.stepButtons.push(btn);
      item.appendChild(btn);
      list.appendChild(item);
    });
    return list;
  }

  private buildPierCountPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'csv-setup-modal__panel csv-setup-modal__panel--pier';
    const segments = document.createElement('div');
    segments.className = 'csv-setup-modal__segments';
    segments.setAttribute('role', 'group');
    segments.setAttribute('aria-label', '기둥 개수');
    this.pierButtons = [];
    for (const count of [1, 2, 3] as const) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'csv-setup-modal__segment';
      btn.dataset.count = String(count);
      btn.textContent = `${count}개`;
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
    panel.appendChild(segments);
    return panel;
  }

  private buildBridgePanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'csv-setup-modal__panel csv-setup-modal__panel--bridge';
    const choices = document.createElement('div');
    choices.className = 'csv-setup-modal__choices';
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', '교량 설치');

    const options: Array<{ enabled: boolean; title: string; desc: string }> = [
      { enabled: true, title: '설치', desc: '형식을 이어서 고릅니다' },
      { enabled: false, title: '설치 안 함', desc: '형식 단계는 건너뜁니다' },
    ];
    this.bridgeChoiceButtons = [];
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'csv-setup-modal__choice';
      btn.dataset.bridge = opt.enabled ? 'on' : 'off';
      const title = document.createElement('span');
      title.className = 'csv-setup-modal__choice-title';
      title.textContent = opt.title;
      const desc = document.createElement('span');
      desc.className = 'csv-setup-modal__choice-desc';
      desc.textContent = opt.desc;
      btn.append(title, desc);
      const onClick = (): void => {
        this.bridgeEnabled = opt.enabled;
        this.syncBridgeChoices();
        this.renderStep();
      };
      btn.addEventListener('click', onClick);
      this.cleanups.push(() => btn.removeEventListener('click', onClick));
      this.bridgeChoiceButtons.push(btn);
      choices.appendChild(btn);
    }
    panel.appendChild(choices);
    return panel;
  }

  private buildBridgeTypePanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'csv-setup-modal__panel csv-setup-modal__panel--type';
    const segments = document.createElement('div');
    segments.className = 'csv-setup-modal__segments csv-setup-modal__segments--types';
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
        this.syncBridgeButtons();
      };
      btn.addEventListener('click', onClick);
      this.cleanups.push(() => btn.removeEventListener('click', onClick));
      this.bridgeButtons.push(btn);
      segments.appendChild(btn);
    }
    panel.appendChild(segments);
    return panel;
  }

  private syncPierButtons(): void {
    for (const btn of this.pierButtons) {
      const active = Number(btn.dataset.count) === this.pierCount;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  private syncBridgeChoices(): void {
    for (const btn of this.bridgeChoiceButtons) {
      const active = (btn.dataset.bridge === 'on') === this.bridgeEnabled;
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

  private renderFileRows(): void {
    this.fileRows.replaceChildren();
    for (let i = 0; i < this.pierCount; i += 1) {
      this.fileRows.appendChild(this.buildFileRow(i));
    }
    if (this.step === 'files') this.syncConfirm();
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
      this.syncConfirm();
    };
    input.addEventListener('change', onChange);

    row.append(title, pick, status, input);
    return row;
  }
}
