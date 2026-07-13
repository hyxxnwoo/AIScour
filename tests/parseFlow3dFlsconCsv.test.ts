import { describe, expect, it } from 'vitest';
import { buildSeriesFromFlow3dVariables } from '@/data/buildSeriesFromFlow3dCsv';
import { loadCsvDashboard } from '@/data/loadCsvDashboard';
import { normalizeFlow3dVariableId } from '@/data/flow3dVariableDefs';
import {
  detectFlow3dFlsconCsv,
  expandFlsconTokens,
  isFlow3dFlsconCsv,
  normalizeFlsconLine,
  parseFlow3dFlsconCsv,
} from '@/utils/parseFlow3dFlsconCsv';

const FLSCON_HEADER = `flscon:  version 23.2.0.01  win64 2022
FLOW-3D   11:16:33  05/26/2026 byum
   hydr3d   version  23.2.1.1  win64     05/02/2024 HYDRO
 Simulation Template: Free Surface - TruVOF (Default)
Mesh Block   1`;

const PRINTING_LINE =
  ' printing u\t v\t w and scrdif       t=0.0  ix=3 to  3   jy=3 to  4   kz=3 to  3';
const META_LINE = '       1        1      0.000E+00      0.000E+00        3      3        3       4        3       3';
const COLUMN_HEADER = '   u               v               w               scrdif';

function makeFile(content: string, name = 'flscon.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

function makeMiniFlscon(rows: string[]): string {
  return [FLSCON_HEADER, PRINTING_LINE, META_LINE, COLUMN_HEADER, ...rows].join('\n');
}

describe('normalizeFlow3dVariableId (flscon aliases)', () => {
  it('u/v/w 단독 이름을 ux/vy/vz 로 매핑한다', () => {
    expect(normalizeFlow3dVariableId('u')).toBe('ux');
    expect(normalizeFlow3dVariableId('v')).toBe('vy');
    expect(normalizeFlow3dVariableId('w')).toBe('vz');
  });
});

describe('detectFlow3dFlsconCsv', () => {
  it('flscon 헤더와 printing 행을 감지한다', () => {
    expect(detectFlow3dFlsconCsv(FLSCON_HEADER)).toBe(true);
    expect(detectFlow3dFlsconCsv(`${PRINTING_LINE}\n${COLUMN_HEADER}`)).toBe(true);
    expect(detectFlow3dFlsconCsv('변수명추정,ux\n1\n2')).toBe(false);
  });
});

describe('normalizeFlsconLine', () => {
  it('쉼표로 쪼개진 printing 행을 재조합한다', () => {
    const joined = normalizeFlsconLine(
      '"printing u","v","w and scrdif       t=0.0  ix=3 to  3   jy=3 to  4   kz=3 to  3"',
    );
    expect(joined).toContain('printing u v w and scrdif');
    expect(joined).toContain('ix=3 to 3');
  });
});

describe('expandFlsconTokens', () => {
  it('한 셀 안의 공백 구분 숫자를 펼친다', () => {
    expect(expandFlsconTokens(['0.0  1.0  2.0  3.0'])).toEqual(['0.0', '1.0', '2.0', '3.0']);
  });

  it('한 셀 안의 변수 헤더를 펼친다', () => {
    expect(expandFlsconTokens(['u  v  w  scrdif'])).toEqual(['u', 'v', 'w', 'scrdif']);
  });
});

describe('parseFlow3dFlsconCsv', () => {
  it('flscon 와이드 블록을 ux/vy/vz/scrdif 로 파싱한다', async () => {
    const csv = makeMiniFlscon([
      '   1.0000000E+00   2.0000000E+00   3.0000000E+00   4.0000000E-02',
      '   5.0000000E-01   6.0000000E-01   7.0000000E-01   8.0000000E-02',
    ]);

    const { variables, gridMeta } = await parseFlow3dFlsconCsv(makeFile(csv));
    expect(gridMeta).toEqual({
      width: 1,
      height: 2,
      depth: 1,
      intervalSeconds: 0,
    });

    expect(variables.map((v) => v.id).sort()).toEqual(['scrdif', 'ux', 'vy', 'vz']);
    expect(Array.from(variables.find((v) => v.id === 'ux')!.values)).toEqual([1, 0.5]);
    expect(variables.find((v) => v.id === 'vy')!.values[0]).toBe(2);
    expect(variables.find((v) => v.id === 'vy')!.values[1]).toBeCloseTo(0.6);
    expect(variables.find((v) => v.id === 'vz')!.values[0]).toBe(3);
    expect(variables.find((v) => v.id === 'vz')!.values[1]).toBeCloseTo(0.7);
    expect(variables.find((v) => v.id === 'scrdif')!.values[0]).toBeCloseTo(0.04);
    expect(variables.find((v) => v.id === 'scrdif')!.values[1]).toBeCloseTo(0.08);
  });

  it('ix/jy/kz 만 있는 행( printing 없음)을 파싱한다', async () => {
    const csv = [
      FLSCON_HEADER,
      'w and scrdif       t=0.0  ix=3 to  3   jy=3 to  4   kz=3 to  3',
      META_LINE,
      COLUMN_HEADER,
      '   1.0000000E+00   2.0000000E+00   3.0000000E+00   4.0000000E-02',
      '   5.0000000E-01   6.0000000E-01   7.0000000E-01   8.0000000E-02',
    ].join('\n');

    const { variables, gridMeta } = await parseFlow3dFlsconCsv(makeFile(csv));
    expect(gridMeta.width).toBe(1);
    expect(variables.map((v) => v.id).sort()).toEqual(['scrdif', 'ux', 'vy', 'vz']);
  });

  it('한 CSV 셀에 공백 구분 4값이 있는 행을 파싱한다', async () => {
    const csv = makeMiniFlscon([
      '"0.0000000E+00   0.0000000E+00   0.0000000E+00   0.0000000E+00"',
      '"1.0000000E+00   2.0000000E+00   3.0000000E+00   4.0000000E-02"',
    ]);

    const { variables } = await parseFlow3dFlsconCsv(makeFile(csv));
    expect(Array.from(variables.find((v) => v.id === 'ux')!.values)).toEqual([0, 1]);
    expect(variables.find((v) => v.id === 'scrdif')!.values[1]).toBeCloseTo(0.04);
  });

  it('헤더와 데이터가 각각 한 CSV 셀에 있어도 파싱한다', async () => {
    const csv = [
      FLSCON_HEADER,
      PRINTING_LINE,
      META_LINE,
      '"u               v               w               scrdif"',
      '"0.0000000E+00   0.0000000E+00   0.0000000E+00   0.0000000E+00"',
      '"0.0000000E+00   0.0000000E+00   0.0000000E+00   0.0000000E+00"',
    ].join('\n');

    const { variables, gridMeta } = await parseFlow3dFlsconCsv(makeFile(csv));
    expect(gridMeta.height).toBe(2);
    expect(variables.map((v) => v.id).sort()).toEqual(['scrdif', 'ux', 'vy', 'vz']);
  });

  it('Excel CSV 단일열(0.0,,,) 행을 파싱한다', async () => {
    const csv = [
      FLSCON_HEADER,
      PRINTING_LINE,
      META_LINE,
      'u,v,w,scrdif',
      '1.0,,,',
      ',2.0,,',
      ',,3.0,',
      ',,,4.0',
      '5.0,,,',
      ',6.0,,',
      ',,7.0,',
      ',,,8.0',
    ].join('\n');

    const { variables } = await parseFlow3dFlsconCsv(makeFile(csv));
    expect(variables.find((v) => v.id === 'ux')?.values).toEqual(Float32Array.from([1, 5]));
    expect(variables.find((v) => v.id === 'vy')?.values).toEqual(Float32Array.from([2, 6]));
    expect(variables.find((v) => v.id === 'vz')?.values).toEqual(Float32Array.from([3, 7]));
    expect(variables.find((v) => v.id === 'scrdif')?.values).toEqual(Float32Array.from([4, 8]));
  });

  it('A열 한 값씩 세로 나열된 행을 파싱한다', async () => {
    const csv = [
      FLSCON_HEADER,
      PRINTING_LINE,
      META_LINE,
      COLUMN_HEADER,
      '1.0',
      '2.0',
      '3.0',
      '4.0',
      '5.0',
      '6.0',
      '7.0',
      '8.0',
    ].join('\n');

    const { variables } = await parseFlow3dFlsconCsv(makeFile(csv));
    expect(Array.from(variables.find((v) => v.id === 'ux')!.values)).toEqual([1, 5]);
    expect(Array.from(variables.find((v) => v.id === 'scrdif')!.values)).toEqual([4, 8]);
  });
});

describe('loadCsvDashboard (flscon)', () => {
  it('buildSeriesFromFlow3dVariables 가 scrdif 스칼라를 유지한다', async () => {
    const csv = makeMiniFlscon([
      '   0.0000000E+00   0.0000000E+00   0.0000000E+00   0.0100000E+00',
      '   0.0000000E+00   0.0000000E+00   0.0000000E+00   0.0200000E+00',
    ]);
    const { variables, gridMeta } = await parseFlow3dFlsconCsv(makeFile(csv));
    const built = buildSeriesFromFlow3dVariables(variables, gridMeta);
    const scrdif = built.fluid?.frames[0]?.scalars?.scrdif;
    expect(scrdif?.[0]).toBeCloseTo(0.01);
    expect(scrdif?.[1]).toBeCloseTo(0.02);
  });
});
