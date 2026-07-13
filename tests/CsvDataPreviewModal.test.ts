import { describe, expect, it } from 'vitest';
import { CsvDataPreviewModal } from '@/components/CsvDataPreviewModal';

function makeScrdifColumns(count: number) {
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const u = new Float32Array(count);
  const v = new Float32Array(count);
  const w = new Float32Array(count);
  const scrdif = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    x[i] = i;
    y[i] = i * 0.1;
    z[i] = -i * 0.01;
    u[i] = 1;
    v[i] = 2;
    w[i] = 3;
    scrdif[i] = 0.04;
  }

  return { x, y, z, u, v, w, scrdif, count };
}

describe('CsvDataPreviewModal', () => {
  it('open() 호출 시 모달을 즉시 표시한다', () => {
    const modal = new CsvDataPreviewModal();
    document.body.appendChild(modal.element);

    modal.open({
      scour: null,
      fluid: null,
      variables: [
        {
          id: 'ux',
          label: 'X 속도',
          unit: 'm/s',
          values: Float32Array.from([0, 1, 2, 3]),
        },
      ],
    });

    expect(modal.element.hidden).toBe(false);
    expect(modal.element.querySelector('.csv-preview-modal__summary-value')?.textContent).toBe(
      '1개',
    );

    modal.dispose();
  });

  it('scrdifColumns 가 있으면 원본 행 섹션과 초기 가상 행을 렌더한다', () => {
    const modal = new CsvDataPreviewModal();
    document.body.appendChild(modal.element);

    modal.open(
      {
        scour: null,
        fluid: null,
        variables: [],
      },
      makeScrdifColumns(120),
    );

    const section = modal.element.querySelector('.csv-preview-modal__rows-section');
    expect(section?.hasAttribute('hidden')).toBe(false);
    expect(modal.element.querySelector('.csv-preview-modal__rows-count')?.textContent).toContain(
      '120',
    );

    const headerCells = modal.element.querySelectorAll(
      '.csv-preview-modal__rows-header .csv-preview-modal__rows-cell--head',
    );
    expect(headerCells.length).toBe(8);
    expect(headerCells[1]?.textContent).toBe('x');
    expect(headerCells[7]?.textContent).toBe('scrdif');

    const renderedRows = modal.element.querySelectorAll('.csv-preview-modal__rows-row');
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(120);

    modal.dispose();
  });

  it('scrdifColumns 가 없으면 원본 행 섹션을 숨긴다', () => {
    const modal = new CsvDataPreviewModal();
    document.body.appendChild(modal.element);

    modal.open({
      scour: null,
      fluid: null,
      variables: [],
    });

    const section = modal.element.querySelector('.csv-preview-modal__rows-section');
    expect(section?.hasAttribute('hidden')).toBe(true);

    modal.dispose();
  });
});
