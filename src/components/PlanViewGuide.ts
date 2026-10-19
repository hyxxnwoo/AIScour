import type { Disposable } from '@/types/disposable';
import type { SectionId } from '@/utils/sectionProfile';

export interface PlanViewGuideHandlers {
  onSectionChange: (section: SectionId) => void;
}

/** 6번 평면뷰 — 단면 전환·조작 안내 (캔버스 위) */
export class PlanViewGuide implements Disposable {
  public readonly element: HTMLElement;
  private section: SectionId = 'A';
  private readonly handlers: PlanViewGuideHandlers;

  public constructor(handlers: PlanViewGuideHandlers) {
    this.handlers = handlers;
    this.element = document.createElement('div');
    this.element.className = 'plan-view-guide';
    this.element.dataset.widgetId = 'plan-view-guide';
    this.paint();
  }

  public setSection(section: SectionId): void {
    if (this.section === section) return;
    this.section = section;
    this.syncSeg();
  }

  private paint(): void {
    this.element.innerHTML = `
      <div class="plan-view-guide__glass">
        <span class="plan-view-guide__badge">TOP</span>
        <p class="plan-view-guide__lead">평면 · 단면</p>
        <div class="plan-view-guide__seg" role="tablist" aria-label="단면 선택">
          <button type="button" class="plan-view-guide__seg-btn" data-section="A" role="tab">A–A′ 종단</button>
          <button type="button" class="plan-view-guide__seg-btn" data-section="B" role="tab">B–B′ 횡단</button>
        </div>
        <p class="plan-view-guide__hint">그래프에 마우스 → 단면선 · B′ 모드에서 교각 클릭</p>
      </div>`;
    for (const btn of this.element.querySelectorAll<HTMLButtonElement>('[data-section]')) {
      btn.addEventListener('click', () => {
        const sec = btn.dataset.section as SectionId;
        this.section = sec;
        this.syncSeg();
        this.handlers.onSectionChange(sec);
      });
    }
    this.syncSeg();
  }

  private syncSeg(): void {
    for (const btn of this.element.querySelectorAll<HTMLButtonElement>('[data-section]')) {
      const on = btn.dataset.section === this.section;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  public dispose(): void {
    this.element.remove();
  }
}
