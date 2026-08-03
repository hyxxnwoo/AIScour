import { describe, expect, it } from 'vitest';
import {
  countSampleProbeDataRowsText,
  countSampleProbeTimeBlocksText,
  detectSampleProbeCsv,
  extractTimeMarkerFromLine,
  parseSampleProbeCsvText,
} from '@/utils/parseSampleProbeCsv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SAMPLE_PATH = resolve('public/data/sampledata.csv');

function makeMultiTimeCsv(): string {
  return [
    'a,b, printing scrdif       t=0.0  ix=1',
    'x y z u v w scrdif',
    '0 0 0 0.1 0 0 -0.01',
    '0.01 0 0 0.1 0 0 -0.02',
    'a,b, printing scrdif       t=30.0  ix=1',
    'x y z u v w scrdif',
    '0 0 0 0.2 0 0 -0.03',
    'a,b, printing scrdif       t=60.0  ix=1',
    'x y z u v w scrdif',
    '0 0 0 0.3 0 0 -0.04',
  ].join('\n');
}

describe('extractTimeMarkerFromLine', () => {
  it('C열의 t= 값을 읽는다', () => {
    const line =
      ' printing u, v, w and scrdif       t=0.0  ix=3 to  120   jy=3 to  50  kz=3 to  47 ';
    expect(extractTimeMarkerFromLine(line)).toBe(0);
  });

  it('데이터 행에서는 null', () => {
    expect(
      extractTimeMarkerFromLine(
        '   4.7340277E-03  -2.2313604E-01  -1.2225556E-01   0.0000000E+00   0.0000000E+00   0.0000000E+00   0.0000000E+00,,',
      ),
    ).toBeNull();
  });
});

describe('detectSampleProbeCsv', () => {
  it('sampledata.csv 헤더를 감지한다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    expect(detectSampleProbeCsv(text)).toBe(true);
  });
});

describe('parseSampleProbeCsvText', () => {
  it('sampledata.csv 는 t=0 한 블록에 공간 행을 담는다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const dataset = parseSampleProbeCsvText(text);
    expect(dataset.blocks.length).toBe(1);
    expect(dataset.blocks[0]!.timestampSeconds).toBe(0);
    expect(dataset.blocks[0]!.rawT).toBe(0);
    expect(dataset.flatColumns.count).toBe(91);
    expect(dataset.stats.dataRowCount).toBe(91);
    expect(dataset.stats.timeBlockCount).toBe(1);
    expect(dataset.stats.fileLineCount).toBe(text.split(/\r?\n/).length);
  });

  it('t 마커 등장 순서대로 0·30·60초 블록을 만든다', () => {
    const dataset = parseSampleProbeCsvText(makeMultiTimeCsv());
    expect(dataset.blocks.length).toBe(3);
    expect(dataset.blocks.map((b) => b.timestampSeconds)).toEqual([0, 30, 60]);
    expect(dataset.blocks.map((b) => b.rawT)).toEqual([0, 30, 60]);
    expect(dataset.blocks[0]!.columns.count).toBe(2);
    expect(dataset.blocks[1]!.columns.count).toBe(1);
    expect(dataset.blocks[2]!.columns.count).toBe(1);
    expect(dataset.flatColumns.count).toBe(4);
  });

  it('헤더 없으면 오류를 던진다', () => {
    expect(() => parseSampleProbeCsvText('a,b,c\n1,2,3')).toThrow(/헤더/);
  });

  it('공간 stepMultiple=2 이면 블록 내 절반만 저장하고 dataRowCount 는 전체 행 수를 유지한다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const full = parseSampleProbeCsvText(text);
    const strided = parseSampleProbeCsvText(text, { stepMultiple: 2 });
    expect(strided.flatColumns.count).toBe(Math.ceil(full.stats.dataRowCount / 2));
    expect(strided.stats.dataRowCount).toBe(full.stats.dataRowCount);
    expect(strided.stats.parseStepMultiple).toBe(2);
    expect(strided.blocks.length).toBe(1);
  });
});

describe('countSampleProbeDataRowsText / countSampleProbeTimeBlocksText', () => {
  it('sampledata.csv 의 유효 데이터 행·t 블록 수를 센다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const dataset = parseSampleProbeCsvText(text);
    expect(countSampleProbeDataRowsText(text)).toBe(dataset.stats.dataRowCount);
    expect(countSampleProbeTimeBlocksText(text)).toBe(1);
  });

  it('다중 t CSV 의 블록 수를 센다', () => {
    const text = makeMultiTimeCsv();
    expect(countSampleProbeTimeBlocksText(text)).toBe(3);
    expect(countSampleProbeDataRowsText(text)).toBe(4);
  });
});
