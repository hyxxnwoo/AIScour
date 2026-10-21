import { describe, expect, it } from 'vitest';
import {
  detectScrdifTimeCsv,
  parseScrdifTimeCsvFile,
  parseScrdifTimeCsvText,
} from '@/utils/parseScrdifTimeCsv';
import { makeScrdifCsv } from './helpers/scrdifCsv';

describe('parseScrdifTimeCsv', () => {
  it('헤더의 시간 열을 초 단위로 읽고 행×시간 배열로 변환한다', () => {
    const ds = parseScrdifTimeCsvText(makeScrdifCsv({ nx: 4, ny: 3, times: [0, 30, 60, 90] }));
    expect(ds.count).toBe(12);
    expect(ds.times).toEqual([0, 30, 60, 90]);
    expect(ds.frames.length).toBe(4);
    expect(ds.frames[0].length).toBe(12);
    expect(ds.frames[0].every((v) => v === 0)).toBe(true);
    expect(Math.min(...ds.frames[2])).toBeLessThan(0);
    expect(ds.x[1]).toBeCloseTo(0.01, 6);
  });

  it('BOM·CRLF·빈 줄을 허용한다', () => {
    const text = `﻿${makeScrdifCsv({ nx: 2, ny: 2 }).replace(/\n/g, '\r\n')}\r\n\r\n`;
    const ds = parseScrdifTimeCsvText(text);
    expect(ds.count).toBe(4);
    expect(ds.times.length).toBe(3);
  });

  it('x_m/y_m/시간 열이 없으면 거부한다', () => {
    expect(detectScrdifTimeCsv('x,y,z,u,v,w,scrdif\n1,2,3,4,5,6,7')).toBe(false);
    expect(detectScrdifTimeCsv(makeScrdifCsv({ nx: 2, ny: 2 }))).toBe(true);
    expect(() => parseScrdifTimeCsvText('x,y,z\n1,2,3')).toThrow(/지원하지 않는 CSV/);
  });

  it('File 스트림 파싱 결과가 텍스트 파싱과 같고 진행률을 보고한다', async () => {
    const text = makeScrdifCsv();
    const file = new File([text], 's.csv', { type: 'text/csv' });
    const rows: number[] = [];
    const ds = await parseScrdifTimeCsvFile(file, { onProgress: (p) => rows.push(p.rowsParsed) });
    const expected = parseScrdifTimeCsvText(text);
    expect(ds.count).toBe(expected.count);
    expect(Array.from(ds.frames[2])).toEqual(Array.from(expected.frames[2]));
    expect(rows.at(-1)).toBe(expected.count);
  });

  it('중지 신호가 있으면 파싱을 중단한다', async () => {
    const controller = new AbortController();
    controller.abort();
    const file = new File([makeScrdifCsv()], 's.csv', { type: 'text/csv' });
    await expect(parseScrdifTimeCsvFile(file, { signal: controller.signal })).rejects.toThrow();
  });
});
