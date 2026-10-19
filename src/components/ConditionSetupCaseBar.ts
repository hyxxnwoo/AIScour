import { MOCK_CASE_STATUS, MOCK_CASES } from '@/data/mockCases';
import type { Disposable } from '@/types/disposable';

export interface ConditionSetupCaseBarHandlers {
  onOpenPipeline: () => void;
  onCaseChange: (caseId: string) => void;
}

/** 4번 좌측 — 케이스 선택·업로드 처리 상태 (목업) */
export class ConditionSetupCaseBar implements Disposable {
  public readonly element: HTMLElement;
  private readonly handlers: ConditionSetupCaseBarHandlers;
  private select!: HTMLSelectElement;
  private activeCaseId = '';
  private pinned: { id: string; label: string } | null = null;
  private statusEl!: HTMLElement;

  public constructor(handlers: ConditionSetupCaseBarHandlers) {
    this.handlers = handlers;
    this.element = document.createElement('div');
    this.element.className = 'condition-setup-case condition-setup-case--viz is-hidden';

    const head = document.createElement('header');
    head.className = 'condition-setup-case__head';
    head.innerHTML = `<span class="condition-setup-case__step">1</span>
      <h3 class="condition-setup-case__title">케이스</h3>`;
    this.element.appendChild(head);

    const body = document.createElement('div');
    body.className = 'condition-setup-case__body';

    this.statusEl = document.createElement('p');
    this.statusEl.className = 'condition-setup-case__status';
    body.appendChild(this.statusEl);

    this.select = document.createElement('select');
    this.select.className = 'condition-setup-case__select';
    this.select.addEventListener('change', () => {
      this.activeCaseId = this.select.value;
      this.updateStatus();
      this.handlers.onCaseChange(this.activeCaseId);
    });
    this.rebuildOptions();
    body.appendChild(this.select);

    const upload = document.createElement('p');
    upload.className = 'condition-setup-case__upload-hint';
    upload.innerHTML =
      '처리 현황은 <button type="button" class="condition-setup-case__link">데이터 연동</button>에서 확인합니다.';
    upload.querySelector('button')?.addEventListener('click', () => this.handlers.onOpenPipeline());
    body.appendChild(upload);

    this.element.appendChild(body);
    this.updateStatus();
  }

  /** CSV 적용으로 방금 생긴 케이스. 목록 필터(검증완료·오류)와 별도로 고른 값으로 둔다. */
  public pinIssuedCase(id: string, label: string): void {
    this.pinned = { id, label };
    this.activeCaseId = id;
    this.rebuildOptions();
    this.updateStatus();
  }

  private updateStatus(): void {
    if (!this.activeCaseId) {
      this.statusEl.textContent =
        '시뮬레이션 적용 전 — 기존 케이스를 고르거나 CSV 적용 후 ID가 발급됩니다.';
      this.element.classList.remove('condition-setup-case--ready');
      return;
    }
    const row = MOCK_CASES.find((c) => c.id === this.activeCaseId);
    const st = row ? MOCK_CASE_STATUS[row.status].label : '신규';
    this.statusEl.textContent = `${this.activeCaseId} · ${st}`;
    this.element.classList.add('condition-setup-case--ready');
  }

  private rebuildOptions(): void {
    this.select.replaceChildren();
    const pending = document.createElement('option');
    pending.value = '';
    pending.textContent = '시뮬레이션 적용 전';
    this.select.appendChild(pending);
    if (this.pinned) {
      const issued = document.createElement('option');
      issued.value = this.pinned.id;
      issued.textContent = this.pinned.label;
      this.select.appendChild(issued);
    }
    for (const c of MOCK_CASES) {
      if (c.status !== 'done' && c.status !== 'err') continue;
      const st = MOCK_CASE_STATUS[c.status].label;
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.id} · ${st} · ${c.shape}`;
      this.select.appendChild(opt);
    }
    this.select.value = this.activeCaseId;
  }

  public setCaseId(caseId: string): void {
    this.activeCaseId = caseId;
    if (this.select.querySelector(`option[value="${caseId}"]`)) {
      this.select.value = caseId;
    }
    this.updateStatus();
  }

  public getCaseLabel(): string {
    if (!this.activeCaseId) return '미선택';
    const opt = this.select.querySelector<HTMLOptionElement>(
      `option[value="${this.activeCaseId}"]`,
    );
    return opt?.textContent ?? this.activeCaseId;
  }

  public isCaseReady(): boolean {
    return this.activeCaseId.length > 0;
  }

  public setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
  }

  public dispose(): void {
    this.element.remove();
  }
}
