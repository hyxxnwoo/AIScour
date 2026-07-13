import { describe, expect, it } from 'vitest';
import {
  discoverXyzCsvLayout,
  parseXyzCsvHeader,
  stripBom,
} from '@/utils/flow3dXyzColumns';
import { isFlow3dXyzCsv, parseFlow3dXyzCsv } from '@/utils/parseFlow3dXyzCsv';
import { buildSeriesFromFlow3dVariables } from '@/data/buildSeriesFromFlow3dCsv';

function makeFile(content: string, name = 'fluid_xyz.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('parseXyzCsvHeader', () => {
  it('x·y·z 와 유체량 열을 인식한다', () => {
    const layout = parseXyzCsvHeader(['x', 'y', 'z', 'ux', 'vy', 'vz', 'tke']);
    expect(layout).not.toBeNull();
    expect(layout?.xCol).toBe(0);
    expect(layout?.yCol).toBe(1);
    expect(layout?.zCol).toBe(2);
    expect(layout?.variableCols.map((c) => c.id)).toEqual(['ux', 'vy', 'vz', 'tke']);
  });

  it('한글 좌표 헤더를 인식한다', () => {
    const layout = parseXyzCsvHeader(['X좌표', 'Y좌표', 'Z좌표', 'ux', 'scrp']);
    expect(layout?.variableCols.map((c) => c.id)).toEqual(['ux', 'scrp']);
  });

  it('BOM 이 붙은 x 열을 인식한다', () => {
    const layout = parseXyzCsvHeader([`${stripBom('\ufeffx')}`, 'y', 'z', 'ux']);
    expect(layout?.xCol).toBe(0);
  });

  it('알 수 없는 유체량 열 이름도 허용한다', () => {
    const layout = parseXyzCsvHeader(['x', 'y', 'z', 'Velocity', 'Pressure']);
    expect(layout?.variableCols.map((c) => c.id)).toEqual(['velocity', 'pressure']);
  });

  it('탭 구분 헤더를 discover 로 찾는다', () => {
    const layout = discoverXyzCsvLayout(['x\ty\tz\tux\tvy']);
    expect(layout?.variableCols.map((c) => c.id)).toEqual(['ux', 'vy']);
  });
});

describe('discoverXyzCsvLayout', () => {
  it('FLOW-3D 메타 행 뒤의 헤더를 찾는다', () => {
    const lines = [
      '변수명추정,물리량',
      '0,0,0,9.9,8.8,7.7',
      'x,y,z,ux,vy,vz',
      '1,0,0,1,0,0',
    ];
    const layout = discoverXyzCsvLayout(lines);
    expect(layout?.xCol).toBe(0);
    expect(layout?.variableCols.map((c) => c.id)).toEqual(['ux', 'vy', 'vz']);
  });

  it('숫자 행이 먼저 나와도 헤더가 있으면 헤더를 우선한다', () => {
    const lines = ['0,0,0,1,2,3', 'x,y,z,ux,vy,vz', '1,0,0,4,5,6'];
    const layout = discoverXyzCsvLayout(lines);
    expect(layout?.headerless).toBeUndefined();
    expect(layout?.variableCols.map((c) => c.id)).toEqual(['ux', 'vy', 'vz']);
  });

  it('헤더 없이 숫자만 있으면 열을 추정한다', () => {
    const layout = discoverXyzCsvLayout(['0,0,0,1.2,0.3', '1,0,0,2.1,0.1']);
    expect(layout?.headerless).toBe(true);
    expect(layout?.variableCols.length).toBe(2);
  });
});

describe('parseFlow3dXyzCsv', () => {
  it('정수 격자 인덱스 좌표로 유체량을 3D 필드에 매핑한다', async () => {
    const csv = `x,y,z,ux,vy,vz
0,0,0,1,0,0
1,0,0,2,0,0
0,1,0,0,1,0
0,0,1,0,0,1`;

    expect(await isFlow3dXyzCsv(makeFile(csv))).toBe(true);

    const { variables, resolvedMeta } = await parseFlow3dXyzCsv(makeFile(csv));
    const built = buildSeriesFromFlow3dVariables(variables, resolvedMeta);

    expect(built.fluid?.grid).toEqual({
      width: 2,
      height: 2,
      depth: 2,
      cellSize: 1,
      originX: 0,
      originY: 0,
      originZ: 0,
    });
    const ux = built.fluid?.frames[0]?.velocityX;
    expect(ux?.[0]).toBe(1);
    expect(ux?.[1]).toBe(2);
    expect(built.fluid?.frames[0]?.velocityY?.[2]).toBe(1);
    expect(built.fluid?.frames[0]?.velocityZ?.[4]).toBe(1);
  });

  it('메타 행 뒤 헤더가 있어도 파싱한다', async () => {
    const csv = `변수명추정,물리량
0,0,0,9.9,8.8,7.7
x,y,z,ux,vy,vz
0,0,0,1,0,0
1,0,0,2,0,0`;

    const { variables } = await parseFlow3dXyzCsv(makeFile(csv));
    const ux = variables.find((v) => v.id === 'ux');
    expect(ux?.values[0]).toBe(1);
    expect(ux?.values[1]).toBe(2);
  });

  it('월드 좌표는 meta cellSize 로 격자에 매핑한다', async () => {
    const csv = `x,y,z,ux
0,0,0,10
1,0,0,20
0,1,0,30`;

    const { variables, resolvedMeta } = await parseFlow3dXyzCsv(makeFile(csv), {
      meta: { width: 2, height: 2, depth: 1, cellSize: 1, originX: 0, originY: 0, originZ: 0 },
    });
    const built = buildSeriesFromFlow3dVariables(variables, resolvedMeta);
    expect(built.fluid?.frames[0]?.velocityX?.[0]).toBe(10);
    expect(built.fluid?.frames[0]?.velocityX?.[1]).toBe(20);
    expect(built.fluid?.frames[0]?.velocityX?.[2]).toBe(30);
  });
});
