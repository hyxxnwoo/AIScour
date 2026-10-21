import { describe, expect, it } from 'vitest';
import { CsvSetupModal, type CsvSetupSelection } from '@/components/CsvSetupModal';

function openModal(initial?: Partial<CsvSetupSelection>): {
  modal: CsvSetupModal;
  confirmed: CsvSetupSelection[];
} {
  const modal = new CsvSetupModal();
  document.body.appendChild(modal.element);
  const confirmed: CsvSetupSelection[] = [];
  modal.open(
    {
      pierCount: 3,
      bridgeEnabled: true,
      bridgeType: 'girder',
      files: [],
      ...initial,
    },
    (selection) => {
      confirmed.push(selection);
    },
  );
  return { modal, confirmed };
}

function clickNamed(root: ParentNode, name: string): void {
  const btn = [...root.querySelectorAll('button')].find((el) => el.textContent?.trim() === name);
  if (!btn) throw new Error(`button not found: ${name}`);
  btn.click();
}

function stepButton(root: ParentNode, step: string): HTMLButtonElement {
  const btn = root.querySelector<HTMLButtonElement>(`[data-step="${step}"]`);
  if (!btn) throw new Error(`step not found: ${step}`);
  return btn;
}

describe('CsvSetupModal', () => {
  it('기둥 개수부터 시작하고 다음 단계는 숨긴다', () => {
    const { modal } = openModal();

    expect(stepButton(modal.element, 'pier').classList.contains('is-current')).toBe(true);
    expect(
      modal.element.querySelector('.csv-setup-modal__panel--pier')?.hasAttribute('hidden'),
    ).toBe(false);
    expect(
      modal.element.querySelector('.csv-setup-modal__panel--files')?.hasAttribute('hidden'),
    ).toBe(true);
    expect(modal.element.textContent).toContain('기둥이 몇 개인지 고릅니다');
    expect(stepButton(modal.element, 'files').disabled).toBe(true);

    modal.dispose();
  });

  it('설치하지 않으면 교량 형식을 건너뛰고 파일 선택으로 간다', () => {
    const { modal } = openModal();

    clickNamed(modal.element, '다음');
    expect(modal.element.textContent).toContain('교량을 둘지 정합니다');

    modal.element.querySelector<HTMLButtonElement>('[data-bridge="off"]')?.click();
    expect(stepButton(modal.element, 'type').classList.contains('is-skipped')).toBe(true);
    expect(stepButton(modal.element, 'type').textContent).toContain('건너뜀');

    clickNamed(modal.element, '다음');
    expect(stepButton(modal.element, 'files').classList.contains('is-current')).toBe(true);
    expect(
      modal.element.querySelector('.csv-setup-modal__panel--type')?.hasAttribute('hidden'),
    ).toBe(true);
    expect(modal.element.textContent).toContain('기둥 3개 · 교량 없음');
    expect(modal.element.querySelectorAll('.csv-setup-modal__file')).toHaveLength(1);

    modal.dispose();
  });

  it('설치하면 교량 형식을 거친 뒤에 파일을 고른다', () => {
    const { modal, confirmed } = openModal({ pierCount: 1, bridgeEnabled: false });

    clickNamed(modal.element, '1개');
    clickNamed(modal.element, '다음');
    modal.element.querySelector<HTMLButtonElement>('[data-bridge="on"]')?.click();
    clickNamed(modal.element, '다음');

    expect(stepButton(modal.element, 'type').classList.contains('is-current')).toBe(true);
    clickNamed(modal.element, '사장교');
    clickNamed(modal.element, '다음');

    expect(modal.element.textContent).toContain('기둥 1개 · 교량 사장교');
    const confirm = [...modal.element.querySelectorAll('button')].find(
      (el) => el.textContent?.trim() === '선택 완료',
    );
    expect(confirm?.hasAttribute('hidden')).toBe(false);
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    confirm?.click();
    expect(confirmed).toHaveLength(0);

    const input = modal.element.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('file input missing');
    const file = new File(['a'], 'P1.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: { 0: file, length: 1, item: () => file },
    });
    input.dispatchEvent(new Event('change'));

    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    confirm?.click();
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]?.pierCount).toBe(1);
    expect(confirmed[0]?.bridgeEnabled).toBe(true);
    expect(confirmed[0]?.bridgeType).toBe('cable-stayed');
    expect(confirmed[0]?.files.map((f) => f.name)).toEqual(['P1.csv']);
    expect(modal.element.hidden).toBe(true);

    modal.dispose();
  });

  it('이전 단계로만 돌아갈 수 있다', () => {
    const { modal } = openModal();

    stepButton(modal.element, 'files').click();
    expect(stepButton(modal.element, 'pier').classList.contains('is-current')).toBe(true);

    clickNamed(modal.element, '다음');
    clickNamed(modal.element, '다음');
    stepButton(modal.element, 'pier').click();
    expect(stepButton(modal.element, 'pier').classList.contains('is-current')).toBe(true);
    expect(modal.element.querySelector('.csv-setup-modal__back')?.hasAttribute('hidden')).toBe(
      true,
    );

    modal.dispose();
  });

  it('여러 CSV 를 고르면 파일명 순으로 모두 확정한다', () => {
    const { modal, confirmed } = openModal({ bridgeEnabled: false });

    clickNamed(modal.element, '다음');
    clickNamed(modal.element, '다음');
    const input = modal.element.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('file input missing');
    expect(input.multiple).toBe(true);

    const files = [
      new File(['b'], 's02_all_timesteps.csv', { type: 'text/csv' }),
      new File(['a'], 's01_all_timesteps.csv', { type: 'text/csv' }),
      new File(['x'], 'memo.txt', { type: 'text/plain' }),
    ];
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new Event('change'));

    clickNamed(modal.element, '선택 완료');
    expect(confirmed[0]?.files.map((f) => f.name)).toEqual([
      's01_all_timesteps.csv',
      's02_all_timesteps.csv',
    ]);

    modal.dispose();
  });

  it('CSV 가 아닌 파일만 고르면 안내하고 확정하지 않는다', () => {
    const { modal, confirmed } = openModal({ bridgeEnabled: false });

    clickNamed(modal.element, '다음');
    clickNamed(modal.element, '다음');
    const input = modal.element.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('file input missing');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['x'], 'memo.txt', { type: 'text/plain' })],
    });
    input.dispatchEvent(new Event('change'));

    expect(modal.element.textContent).toContain('CSV 파일만 선택할 수 있습니다');
    clickNamed(modal.element, '선택 완료');
    expect(confirmed).toHaveLength(0);

    modal.dispose();
  });
});
