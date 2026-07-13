import { describe, expect, it } from 'vitest';
import {
  buildScourSeriesFromScrdifColumns,
  buildSeriesFromScrdifColumns,
} from '@/data/buildSeriesFromScrdifCsv';
import { loadCsvDashboard } from '@/data/loadCsvDashboard';
import { computeBounds, dataToWorld } from '@/data/buildTimeProbeSeries';
import {
  detectFlow3dScrdifCsv,
  parseFlow3dScrdifCsvText,
  scrdifColumnsHaveFlow,
  type Flow3dScrdifColumns,
} from '@/utils/parseFlow3dScrdifCsv';
import { worldXZToTerrainGrid } from '@/utils/fluidWorld';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SAMPLE_PATH = resolve('public/data/sampledata.csv');

describe('detectFlow3dScrdifCsv', () => {
  it('sampledata.csv 헤더를 감지한다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    expect(detectFlow3dScrdifCsv(text)).toBe(true);
  });
});

describe('loadCsvDashboard (scrdif)', () => {
  it('sampledata.csv 를 scrdif 형식으로 파싱한다', async () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const file = new File([text], 'sampledata.csv', { type: 'text/csv' });
    const expectedCount = parseFlow3dScrdifCsvText(text).count;

    const progress: string[] = [];
    const result = await loadCsvDashboard([file], {
      onProgress: (p) => progress.push(p.message),
    });

    expect(result.scrdifColumns?.count).toBe(expectedCount);
    expect(result.scrdifColumns?.stats?.fileLineCount).toBe(text.split(/\r?\n/).length);
    expect(result.scrdifColumns?.stats?.dataRowCount).toBe(expectedCount);
    expect(result.variables.map((v) => v.id).sort()).toEqual(['scrdif', 'ux', 'vy', 'vz']);
    expect(result.fluid?.grid.width).toBeGreaterThan(0);
    expect(result.scour).not.toBeNull();
    expect(result.scour!.frames.length).toBeGreaterThan(0);
    expect(progress.some((m) => m.includes('scrdif'))).toBe(true);
  });
});

describe('scrdifColumnsHaveFlow', () => {
  it('sampledata.csv 는 u·v·w=0 이므로 유속이 없다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const columns = parseFlow3dScrdifCsvText(text);
    expect(scrdifColumnsHaveFlow(columns)).toBe(false);
  });

  it('u>0 인 행이 있으면 true', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const columns = parseFlow3dScrdifCsvText(text);
    columns.u[0] = 0.2;
    expect(scrdifColumnsHaveFlow(columns)).toBe(true);
  });

  it('u=0 이고 v·w만 있어도 true', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const columns = parseFlow3dScrdifCsvText(text);
    columns.u[0] = 0;
    columns.v[0] = 0.3;
    columns.w[0] = 0.2;
    expect(scrdifColumnsHaveFlow(columns)).toBe(true);
  });
});

describe('buildScourSeriesFromScrdifColumns', () => {
  function makeVolumeColumns(nx: number, ny: number, nz: number): Flow3dScrdifColumns {
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
    return { x, y, z, u, v, w, scrdif, count };
  }

  it('3D 격자는 단일 프레임으로 래스터화한다', () => {
    const columns = makeVolumeColumns(20, 15, 10);
    const scour = buildScourSeriesFromScrdifColumns(columns, { waterDepth: 0.15 });
    expect(scour).not.toBeNull();
    expect(scour!.frames).toHaveLength(1);
    expect(scour!.frames[0]!.timestampSeconds).toBe(0);
    expect(scour!.frames[0]!.deltaElevations.some((v) => v !== 0)).toBe(true);
  });

  it('scrdif 값을 지형 Δ표고로 래스터화한다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const columns = parseFlow3dScrdifCsvText(text);
    columns.scrdif[10] = -0.04;
    columns.scrdif[20] = 0.02;
    columns.scrdif[30] = -0.08;

    const scour = buildScourSeriesFromScrdifColumns(columns, { waterDepth: 0.15 });
    expect(scour).not.toBeNull();
    expect(scour!.frames).toHaveLength(columns.count);

    const delta10 = scour!.frames[10]!.deltaElevations;
    const delta20 = scour!.frames[20]!.deltaElevations;
    const delta30 = scour!.frames[30]!.deltaElevations;
    expect(Math.min(...delta10)).toBeCloseTo(-0.04, 4);
    expect(Math.max(...delta20)).toBeCloseTo(0.02, 4);
    expect(Math.min(...delta30)).toBeCloseTo(-0.08, 4);
  });

  it('1D 흐름 슬라이스는 가로 단면 전체에 scrdif 를 펼친다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const columns = parseFlow3dScrdifCsvText(text);
    columns.scrdif[5] = -0.05;

    const scour = buildScourSeriesFromScrdifColumns(columns)!;
    const { width, height } = scour.baseTerrain;
    const delta = scour.frames[5]!.deltaElevations;
    const bounds = computeBounds(columns);
    const world = dataToWorld(columns.x[5]!, columns.y[5]!, columns.z[5]!, bounds);
    const { gx } = worldXZToTerrainGrid(world.x, world.z, scour.baseTerrain);
    const ix = Math.round(gx);

    let nonZeroRows = 0;
    for (let gy = 0; gy < height; gy += 1) {
      if (Math.abs(delta[gy * width + ix]!) > 1e-9) nonZeroRows += 1;
    }
    expect(nonZeroRows).toBe(height);
    expect(delta[ix]!).toBeCloseTo(-0.05, 5);
  });
});

describe('buildSeriesFromScrdifColumns', () => {
  it('temporal-probe CSV 는 행마다 유체 프레임을 생성한다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const columns = parseFlow3dScrdifCsvText(text);
    const built = buildSeriesFromScrdifColumns(columns, { waterDepth: 0.15 });
    expect(built.fluid?.frames.length).toBe(columns.count);
    expect(built.fluid!.frames[1]!.timestampSeconds).toBe(30);
    expect(built.scour?.frames.length).toBe(columns.count);
  });

  it('temporal-probe CSV 는 지형 격자와 행별 유체 프레임을 만든다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const columns = parseFlow3dScrdifCsvText(text);
    const built = buildSeriesFromScrdifColumns(columns, { waterDepth: 0.15 });

    expect(built.fluid?.grid.width).toBeGreaterThan(0);
    expect(built.fluid?.grid.height).toBeGreaterThan(1);
    expect(built.fluid?.grid.originY).toBe(0);
    expect(built.fluid?.grid.depth).toBe(built.scour!.baseTerrain.height);
    expect(built.variables.find((v) => v.id === 'ux')?.values.length).toBe(
      built.fluid!.grid.width * built.fluid!.grid.height * built.fluid!.grid.depth,
    );
  });
});
