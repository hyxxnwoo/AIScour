import { describe, expect, it } from 'vitest';
import { loadCsvDashboard, rebuildCsvDashboard } from '@/data/loadCsvDashboard';
import { MAX_SCOUR_FRAMES } from '@/data/buildSampleProbeDashboard';
import { parseSampleProbeCsvText } from '@/utils/parseSampleProbeCsv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SAMPLE_PATH = resolve('public/data/sampledata.csv');

function makeSampleProbeCsv(rowCount: number): string {
  const lines = ['x y z u v w scrdif'];
  for (let i = 0; i < rowCount; i += 1) {
    lines.push('0 0 0 0 0 0 0');
  }
  return lines.join('\n');
}

function makeProbeColumns(rowCount: number): SampleProbeColumns {
  const x = new Float32Array(rowCount);
  const y = new Float32Array(rowCount);
  const z = new Float32Array(rowCount);
  const u = new Float32Array(rowCount);
  const v = new Float32Array(rowCount);
  const w = new Float32Array(rowCount);
  const scrdif = new Float32Array(rowCount);
  return {
    x,
    y,
    z,
    u,
    v,
    w,
    scrdif,
    count: rowCount,
    stats: {
      fileLineCount: rowCount + 1,
      dataRowCount: rowCount,
      skippedLinesAfterHeader: 0,
      parseStepMultiple: 1,
    },
  };
}

describe('loadCsvDashboard (sample probe)', () => {
  it('sampledata.csv 를 로드한다', async () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const file = new File([text], 'sampledata.csv', { type: 'text/csv' });
    const columns = parseSampleProbeCsvText(text);

    const progress: string[] = [];
    const result = await loadCsvDashboard([file], {
      onProgress: (p) => progress.push(p.message),
    });

    expect(result.columns.count).toBe(columns.count);
    expect(result.scour.frames.length).toBe(columns.count);
    expect(result.probeSeries.durationSeconds).toBe(columns.count * 30);
    expect(result.autoAdjusted).toBe(false);
    expect(result.requestedStepMultiple).toBe(1);
    expect(progress.some((m) => m.includes('파싱'))).toBe(true);
    expect(progress.some((m) => m.includes('행 수 확인'))).toBe(true);
  });

  it('rebuildCsvDashboard 는 stride 를 반영한다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const columns = parseSampleProbeCsvText(text);
    const rebuilt = rebuildCsvDashboard(columns, 10);
    expect(rebuilt.scour.frames.length).toBe(Math.ceil(columns.count / 10));
    expect(rebuilt.stepMultiple).toBe(10);
  });

  it('stepMultiple 을 파싱 단계에 반영한다', async () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const file = new File([text], 'sampledata.csv', { type: 'text/csv' });
    const full = parseSampleProbeCsvText(text);
    const result = await loadCsvDashboard([file], { stepMultiple: 10 });
    expect(result.columns.count).toBe(Math.ceil(full.stats!.dataRowCount / 10));
    expect(result.columns.stats?.dataRowCount).toBe(full.stats!.dataRowCount);
    expect(result.probeSeries.durationSeconds).toBe(full.stats!.dataRowCount * 30);
    expect(result.stepMultiple).toBe(10);
    expect(result.autoAdjusted).toBe(false);
  });

  it('행 수가 많으면 stride 를 자동으로 올려 프레임 한도를 넘지 않는다', async () => {
    const rowCount = 10_000;
    const text = makeSampleProbeCsv(rowCount);
    const file = new File([text], 'large-sample.csv', { type: 'text/csv' });
    const result = await loadCsvDashboard([file], { stepMultiple: 1 });

    expect(result.autoAdjusted).toBe(true);
    expect(result.stepMultiple).toBe(Math.ceil(rowCount / MAX_SCOUR_FRAMES));
    expect(result.scour.frames.length).toBeLessThanOrEqual(MAX_SCOUR_FRAMES);
    expect(result.probeSeries.durationSeconds).toBe(rowCount * 30);
  });

  it('rebuildCsvDashboard 는 한도를 넘는 stride 요청을 자동으로 올린다', () => {
    const rowCount = 10_000;
    const columns = makeProbeColumns(rowCount);
    const rebuilt = rebuildCsvDashboard(columns, 1);
    expect(rebuilt.autoAdjusted).toBe(true);
    expect(rebuilt.scour.frames.length).toBeLessThanOrEqual(MAX_SCOUR_FRAMES);
  });
});
