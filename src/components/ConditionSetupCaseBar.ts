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
  private activeCaseId = 'A-032';

  public constructor(handlers: ConditionSetupCaseBarHandlers) {
    this.handlers = handlers;
    this.element = document.createElement('div');
    this.element.className = 'condition-setup-case is-hidden';

    const title = document.createElement('div');
    title.className = 'condition-setup-case__title';
    title.textContent = '1 · 케이스';
    this.element.appendChild(title);

    this.select = document.createElement('select');
    this.select.className = 'condition-setup-case__select';
    this.select.addEventListener('change', () => {
      this.activeCaseId = this.select.value;
      this.handlers.onCaseChange(this.activeCaseId);
    });
    this.rebuildOptions();
    this.element.appendChild(this.select);

    const upload = document.createElement('div');
    upload.className = 'condition-setup-case__upload-hint';
    upload.innerHTML =
      '처리 현황은 <button type="button" class="condition-setup-case__link">데이터 연동</button>에서 확인합니다.';
    upload.querySelector('button')?.addEventListener('click', () => this.handlers.onOpenPipeline());
    this.element.appendChild(upload);
  }

  private rebuildOptions(): void {
    this.select.replaceChildren();
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
  }

  public setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
  }

  public dispose(): void {
    this.element.remove();
  }
}
