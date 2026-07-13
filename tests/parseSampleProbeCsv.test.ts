import { describe, expect, it } from 'vitest';
import {
  countSampleProbeDataRowsText,
  detectSampleProbeCsv,
  parseSampleProbeCsvText,
} from '@/utils/parseSampleProbeCsv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SAMPLE_PATH = resolve('public/data/sampledata.csv');

describe('detectSampleProbeCsv', () => {
  it('sampledata.csv 헤더를 감지한다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    expect(detectSampleProbeCsv(text)).toBe(true);
  });
});

describe('parseSampleProbeCsvText', () => {
  it('sampledata.csv 를 파싱한다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const columns = parseSampleProbeCsvText(text);
    expect(columns.count).toBe(91);
    expect(columns.stats?.dataRowCount).toBe(91);
    expect(columns.stats?.fileLineCount).toBe(text.split(/\r?\n/).length);
  });

  it('헤더 없으면 오류를 던진다', () => {
    expect(() => parseSampleProbeCsvText('a,b,c\n1,2,3')).toThrow(/헤더/);
  });

  it('stepMultiple=2 이면 절반만 저장하고 dataRowCount 는 전체 행 수를 유지한다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const full = parseSampleProbeCsvText(text);
    const strided = parseSampleProbeCsvText(text, { stepMultiple: 2 });
    expect(strided.count).toBe(Math.ceil(full.stats!.dataRowCount / 2));
    expect(strided.stats?.dataRowCount).toBe(full.stats!.dataRowCount);
    expect(strided.stats?.parseStepMultiple).toBe(2);
  });
});

describe('countSampleProbeDataRowsText', () => {
  it('sampledata.csv 의 유효 데이터 행 수를 센다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const columns = parseSampleProbeCsvText(text);
    expect(countSampleProbeDataRowsText(text)).toBe(columns.stats!.dataRowCount);
  });
});
