import { describe, expect, it } from 'vitest';
import { normalizeFlow3dVariableId } from '@/data/flow3dVariableDefs';
import { parseFlow3dVariableCsv } from '@/utils/parseFlow3dVariableCsv';

function makeFile(content: string, name = 'flow3d.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('parseFlow3dVariableCsv', () => {
  it('변수명/단위 메타 + A열 값 블록을 변수별로 파싱한다', async () => {
    const csv = `변수명추정,ux
물리량,x방향 유속
물리량단위추정,m/s
1
2
3
4
변수명추정,vy
물리량,y방향 유속
물리량단위추정,m/s
0.1
0.2
0.3
0.4`;

    const vars = await parseFlow3dVariableCsv(makeFile(csv), { expectedCellCount: 4 });
    expect(vars).toHaveLength(2);
    const ux = vars.find((v) => v.id === 'ux');
    const vy = vars.find((v) => v.id === 'vy');
    expect(ux?.unit).toBe('m/s');
    expect(Array.from(ux?.values ?? [])).toEqual([1, 2, 3, 4]);
    expect(vy?.values).toEqual(Float32Array.from([0.1, 0.2, 0.3, 0.4]));
  });

  it('와이드 헤더 형식을 파싱한다', async () => {
    const csv = `변수명추정,ux,vy
물리량단위추정,m/s,m/s
1,2
3,4`;
    const vars = await parseFlow3dVariableCsv(makeFile(csv));
    expect(vars.find((v) => v.id === 'ux')?.values).toEqual(Float32Array.from([1, 3]));
    expect(vars.find((v) => v.id === 'vy')?.values).toEqual(Float32Array.from([2, 4]));
  });
});

describe('normalizeFlow3dVariableId', () => {
  it('한글 설명에서 변수 id 를 추출한다', () => {
    expect(normalizeFlow3dVariableId('tke')).toBe('tke');
    expect(normalizeFlow3dVariableId('난류 운동 에너지')).toBe('tke');
    expect(normalizeFlow3dVariableId('scrp')).toBe('scrp');
  });
});
