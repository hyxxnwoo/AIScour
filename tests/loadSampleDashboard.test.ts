import { describe, expect, it } from 'vitest';
import { loadCsvDashboard, rebuildCsvDashboard } from '@/data/loadCsvDashboard';
import { MAX_SCOUR_FRAMES } from '@/data/buildSampleProbeDashboard';
import {
  datasetFromTimeBlocks,
  parseSampleProbeCsvText,
  type SampleProbeColumns,
} from '@/utils/parseSampleProbeCsv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SAMPLE_PATH = resolve('public/data/sampledata.csv');

function makeMultiTimeCsv(blockCount: number, rowsPerBlock = 2): string {
  const lines: string[] = [];
  for (let t = 0; t < blockCount; t += 1) {
    lines.push(`a,b, printing scrdif       t=${t * 30}.0  ix=1`);
    lines.push('x y z u v w scrdif');
    for (let r = 0; r < rowsPerBlock; r += 1) {
      lines.push(`${r * 0.01} 0 0 0 0 0 0`);
    }
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
      timeBlockCount: 1,
      skippedLinesAfterHeader: 0,
      parseStepMultiple: 1,
    },
  };
}

describe('loadCsvDashboard (sample probe)', () => {
  it('sampledata.csv 를 로드한다(t 블록 1 → 프레임 1)', async () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const file = new File([text], 'sampledata.csv', { type: 'text/csv' });
    const dataset = parseSampleProbeCsvText(text);

    const progress: string[] = [];
    const result = await loadCsvDashboard([file], {
      onProgress: (p) => progress.push(p.message),
    });

    expect(result.columns.count).toBe(dataset.flatColumns.count);
    expect(result.dataset.blocks.length).toBe(1);
    expect(result.scour.frames.length).toBe(1);
    expect(result.probeSeries.durationSeconds).toBe(0);
    expect(result.autoAdjusted).toBe(false);
    expect(result.requestedStepMultiple).toBe(1);
    expect(result.csvScrdifAllZero).toBe(true);
    expect(progress.some((m) => m.includes('파싱'))).toBe(true);
    expect(progress.some((m) => m.includes('t 블록'))).toBe(true);
  });

  it('rebuildCsvDashboard 는 t 블록 stride 를 반영한다', () => {
    const text = makeMultiTimeCsv(20);
    const dataset = parseSampleProbeCsvText(text);
    const rebuilt = rebuildCsvDashboard(dataset, 10);
    expect(rebuilt.scour.frames.length).toBe(Math.ceil(dataset.blocks.length / 10));
    expect(rebuilt.stepMultiple).toBe(10);
  });

  it('stepMultiple 은 빌드 단계의 t 블록 stride 로 반영된다', async () => {
    const text = makeMultiTimeCsv(20);
    const file = new File([text], 'multi-t.csv', { type: 'text/csv' });
    const full = parseSampleProbeCsvText(text);
    const result = await loadCsvDashboard([file], { stepMultiple: 10 });
    expect(result.dataset.blocks.length).toBe(full.blocks.length);
    expect(result.columns.count).toBe(full.flatColumns.count);
    expect(result.scour.frames.length).toBe(Math.ceil(full.blocks.length / 10));
    expect(result.probeSeries.durationSeconds).toBe((full.blocks.length - 1) * 30);
    expect(result.stepMultiple).toBe(10);
    expect(result.autoAdjusted).toBe(false);
  });

  it('t 블록 수가 프레임 한도를 넘기면 load 시 stride 가 자동 조정된다', async () => {
    const blockCount = MAX_SCOUR_FRAMES + 10;
    const text = makeMultiTimeCsv(blockCount, 1);
    const file = new File([text], 'large-sample.csv', { type: 'text/csv' });
    const result = await loadCsvDashboard([file], { stepMultiple: 1 });

    expect(result.autoAdjusted).toBe(true);
    expect(result.stepMultiple).toBeGreaterThan(1);
    expect(result.scour.frames.length).toBeLessThanOrEqual(MAX_SCOUR_FRAMES);
    expect(result.probeSeries.durationSeconds).toBe((blockCount - 1) * 30);
    // 4000+ t 블록 파싱·프레임 조립은 수 초가 걸린다.
  }, 30_000);

  it('rebuildCsvDashboard 는 한도를 넘는 stride 요청을 자동으로 올린다', () => {
    const blockCount = MAX_SCOUR_FRAMES + 10;
    const dataset = datasetFromTimeBlocks(
      Array.from({ length: blockCount }, () => makeProbeColumns(1)),
    );
    const rebuilt = rebuildCsvDashboard(dataset, 1);
    expect(rebuilt.autoAdjusted).toBe(true);
    expect(rebuilt.scour.frames.length).toBeLessThanOrEqual(MAX_SCOUR_FRAMES);
  });
});
