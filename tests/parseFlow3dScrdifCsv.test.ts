import { describe, expect, it } from 'vitest';
import {
  parseFlow3dScrdifCsvFile,
  parseFlow3dScrdifCsvText,
  toFlow3dScrdifPoints,
} from '@/utils/parseFlow3dScrdifCsv';

const SAMPLE = ` flscon:  version 23.2.0.01  win64 2022 ,,
FLOW-3D   11:16:33  05/26/2026 byum     ,,
   hydr3d   version  23.2.1.1  win64     05/02/2024 HYDRO    ,,
 Simulation Template: Free Surface - TruVOF (Default)                            ,,
,,
Mesh Block   1,,
 printing u, v, w and scrdif       t=0.0  ix=3 to  120   jy=3 to  50  kz=3 to  47 
       1        1      0.000E+00      0.000E+00        3      120        3       50        3       47,,
   x               y               z               u               v               w               scrdif,,
   4.7340277E-03  -2.2313604E-01  -1.2225556E-01   1.0000000E+00   2.0000000E+00   3.0000000E+00   4.0000000E-02,,
   1.4200754E-02  -2.2313604E-01  -1.2225556E-01   5.0000000E-01   6.0000000E-01   7.0000000E-01   8.0000000E-02,,`;

function makeFile(content: string, name = 'sampledata.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('parseFlow3dScrdifCsvText', () => {
  it('flscon 메타 행을 건너뛰고 x·y·z·u·v·w·scrdif 열을 추출한다', () => {
    const columns = parseFlow3dScrdifCsvText(SAMPLE);

    expect(columns.count).toBe(2);
    expect(columns.stats?.fileLineCount).toBe(SAMPLE.split(/\r?\n/).length);
    expect(columns.stats?.dataRowCount).toBe(2);
    expect(columns.stats?.skippedLinesAfterHeader).toBe(0);
    expect(columns.stats?.expectedPrintingCells).toBe(118 * 48 * 45);
    expect(Array.from(columns.u)).toEqual([1, 0.5]);
    expect(columns.v[0]).toBe(2);
    expect(columns.v[1]).toBeCloseTo(0.6);
    expect(columns.w[0]).toBe(3);
    expect(columns.w[1]).toBeCloseTo(0.7);
    expect(columns.scrdif[0]).toBeCloseTo(0.04);
    expect(columns.scrdif[1]).toBeCloseTo(0.08);
    expect(columns.x[0]).toBeCloseTo(4.7340277e-3);
    expect(columns.y[0]).toBeCloseTo(-2.2313604e-1);
    expect(columns.z[0]).toBeCloseTo(-1.2225556e-1);
  });

  it('후행 쉼표(,,) 없이 공백만 있는 형식도 파싱한다', () => {
    const csv = [
      '   x   y   z   u   v   w   scrdif',
      '   0   1   2   3   4   5   6',
    ].join('\n');
    const columns = parseFlow3dScrdifCsvText(csv);
    expect(columns.count).toBe(1);
    expect(columns.scrdif[0]).toBe(6);
  });

  it('쉼표 구분 CSV(1,2,3,...) 형식도 파싱한다', () => {
    const csv = ['x,y,z,u,v,w,scrdif', '0,1,2,3,4,5,6'].join('\n');
    const columns = parseFlow3dScrdifCsvText(csv);
    expect(columns.count).toBe(1);
    expect(columns.x[0]).toBe(0);
    expect(columns.scrdif[0]).toBe(6);
  });

  it('헤더 행이 없으면 오류를 던진다', () => {
    expect(() => parseFlow3dScrdifCsvText('1 2 3 4 5 6 7')).toThrow(/헤더 행/);
  });

  it('데이터 행이 없으면 오류를 던진다', () => {
    expect(() => parseFlow3dScrdifCsvText('x y z u v w scrdif')).toThrow(/데이터 행/);
  });
});

describe('toFlow3dScrdifPoints', () => {
  it('열 배열을 포인트 객체 배열로 변환한다', () => {
    const points = toFlow3dScrdifPoints(parseFlow3dScrdifCsvText(SAMPLE));
    expect(points).toHaveLength(2);
    expect(points[0].u).toBe(1);
    expect(points[1].scrdif).toBeCloseTo(0.08);
  });
});

describe('parseFlow3dScrdifCsvFile', () => {
  it('File 을 읽어 열을 추출한다', async () => {
    const columns = await parseFlow3dScrdifCsvFile(makeFile(SAMPLE));
    expect(columns.count).toBe(2);
    expect(columns.u[0]).toBe(1);
  });

  it('printing line 격자 크기와 무관하게 실제 데이터 행만 파싱한다', () => {
    const columns = parseFlow3dScrdifCsvText(SAMPLE);
    expect(columns.count).toBe(2);
  });

  it('대용량 File 은 스트리밍으로 파싱한다', async () => {
    const header = [
      ' printing u, v, w and scrdif       t=0.0  ix=3 to  5   jy=3 to  4  kz=3 to  4 ',
      '   x               y               z               u               v               w               scrdif',
    ].join('\n');
    const row =
      '   1.0000000E+00   2.0000000E+00   3.0000000E+00   4.0000000E+00   5.0000000E+00   6.0000000E+00   7.0000000E+00';
    const rows = Array.from({ length: 2000 }, () => row).join('\n');
    const payload = `${header}\n${rows}\n`;
    const file = new File([payload], 'large.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'size', { value: 256 * 1024 + 1 });

    const columns = await parseFlow3dScrdifCsvFile(file);
    expect(columns.count).toBe(2000);
    expect(columns.u[0]).toBe(4);
  });

  it('두 번째 printing 블록이 나오면 첫 블록만 파싱한다', async () => {
    const block1 = [
      ' printing u, v, w and scrdif       t=0.0  ix=3 to  120   jy=3 to  50  kz=3 to  47 ',
      '   x               y               z               u               v               w               scrdif',
      '   1.0000000E+00   2.0000000E+00   3.0000000E+00   4.0000000E+00   5.0000000E+00   6.0000000E+00   7.0000000E+00',
    ].join('\n');
    const block2 = [
      ' printing u, v, w and scrdif       t=30.0  ix=3 to  120   jy=3 to  50  kz=3 to  47 ',
      '   x               y               z               u               v               w               scrdif',
      '   9.0000000E+00   8.0000000E+00   7.0000000E+00   6.0000000E+00   5.0000000E+00   4.0000000E+00   3.0000000E+00',
    ].join('\n');
    const payload = `${block1}\n${block2}\n`;
    const file = new File([payload], 'multi-block.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'size', { value: 256 * 1024 + 1 });

    const columns = await parseFlow3dScrdifCsvFile(file);
    expect(columns.count).toBe(1);
    expect(columns.stats?.truncatedAtSecondBlock).toBe(true);
    expect(columns.stats?.dataRowCount).toBe(1);
    expect(columns.u[0]).toBe(4);
  });
});
