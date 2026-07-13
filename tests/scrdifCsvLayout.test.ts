import { describe, expect, it } from 'vitest';
import {
  classifyScrdifCsvLayout,
  isScrdifSpatialSlice,
  scrdifValueRange,
} from '@/utils/scrdifCsvLayout';
import { parseFlow3dScrdifCsvText } from '@/utils/parseFlow3dScrdifCsv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SAMPLE_PATH = resolve('public/data/sampledata.csv');

describe('classifyScrdifCsvLayout', () => {
  it('sampledata.csv 는 행=시각 프로브로 분류한다', () => {
    const columns = parseFlow3dScrdifCsvText(readFileSync(SAMPLE_PATH, 'utf8'));
    expect(classifyScrdifCsvLayout(columns)).toBe('temporal-probe');
    expect(isScrdifSpatialSlice(columns)).toBe(false);
  });

  it('3D 격자(x·y·z 모두 변화)는 공간 슬라이스로 분류한다', () => {
    const nx = 20;
    const ny = 15;
    const nz = 10;
    const count = nx * ny * nz;
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    const z = new Float32Array(count);
    const u = new Float32Array(count);
    const v = new Float32Array(count);
    const w = new Float32Array(count);
    const scrdif = new Float32Array(count);
    let idx = 0;
    for (let iz = 0; iz < nz; iz += 1) {
      for (let iy = 0; iy < ny; iy += 1) {
        for (let ix = 0; ix < nx; ix += 1) {
          x[idx] = ix * 0.01;
          y[idx] = iy * 0.01;
          z[idx] = iz * 0.01;
          scrdif[idx] = -0.001 * idx;
          idx += 1;
        }
      }
    }
    expect(classifyScrdifCsvLayout({ x, y, z, u, v, w, scrdif, count })).toBe('spatial-slice');
  });

  it('x·y·z 좌표가 모두 고정된 단일 지점 시계열도 temporal-probe 로 분류한다', () => {
    const count = 10;
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    const z = new Float32Array(count);
    const u = new Float32Array(count);
    const v = new Float32Array(count);
    const w = new Float32Array(count);
    const scrdif = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      x[i] = 0.5;
      y[i] = 0.2;
      z[i] = -0.1;
      u[i] = 0.01 * i;
      scrdif[i] = -0.001 * i;
    }
    expect(classifyScrdifCsvLayout({ x, y, z, u, v, w, scrdif, count })).toBe('temporal-probe');
  });

  it('z 가 행마다 변하면 시간 프로브로 분류한다', () => {
    const count = 5;
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    const z = new Float32Array(count);
    const u = new Float32Array(count);
    const v = new Float32Array(count);
    const w = new Float32Array(count);
    const scrdif = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      x[i] = i * 0.01;
      y[i] = 0.2;
      z[i] = -0.1 + i * 0.01;
      scrdif[i] = -0.01 * i;
    }
    expect(classifyScrdifCsvLayout({ x, y, z, u, v, w, scrdif, count })).toBe('temporal-probe');
  });

  it('scrdifValueRange 가 min·max 를 반환한다', () => {
    const columns = parseFlow3dScrdifCsvText(readFileSync(SAMPLE_PATH, 'utf8'));
    columns.scrdif[0] = -0.05;
    columns.scrdif[1] = 0.02;
    const range = scrdifValueRange(columns);
    expect(range.min).toBeLessThanOrEqual(-0.05);
    expect(range.max).toBeCloseTo(0.02, 5);
  });
});
