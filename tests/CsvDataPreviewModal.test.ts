import { describe, expect, it } from 'vitest';
import { CsvDataPreviewModal } from '@/components/CsvDataPreviewModal';
import { buildSampleProbeDashboard } from '@/data/buildSampleProbeDashboard';
import type { CsvDashboardLoadResult } from '@/data/loadCsvDashboard';
import { datasetFromColumns, type SampleProbeColumns } from '@/utils/parseSampleProbeCsv';

function makeProbeColumns(count: number): SampleProbeColumns {
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

function makeLoadResult(columns: SampleProbeColumns): CsvDashboardLoadResult {
  const dataset = datasetFromColumns(columns);
  const built = buildSampleProbeDashboard(dataset);
  return {
    scour: built.scour,
    probeSeries: built.probeSeries,
    fluid: built.fluid,
    columns: dataset.flatColumns,
    dataset,
    stepMultiple: 1,
    requestedStepMultiple: 1,
    autoAdjusted: false,
    csvScrdifAllZero: false,
  };
}

describe('CsvDataPreviewModal', () => {
  it('open() 호출 시 모달을 즉시 표시한다', () => {
    const modal = new CsvDataPreviewModal();
    document.body.appendChild(modal.element);
    const columns = makeProbeColumns(4);

    modal.open(makeLoadResult(columns));

    expect(modal.element.hidden).toBe(false);
    expect(modal.element.textContent).toContain('세굴 프레임');
    expect(modal.element.textContent).toMatch(/1개/);

    modal.dispose();
  });

  it('columns 가 있으면 원본 행 섹션과 초기 가상 행을 렌더한다', () => {
    const modal = new CsvDataPreviewModal();
    document.body.appendChild(modal.element);
    const columns = makeProbeColumns(120);

    modal.open(makeLoadResult(columns), columns);

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
});
