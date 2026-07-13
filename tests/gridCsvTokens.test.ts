import { describe, expect, it } from 'vitest';
import {
  isColumnarDataRow,
  isNumericDataRow,
  normalizeRowTokens,
  tokenizeGridLine,
} from '@/utils/gridCsvTokens';

describe('gridCsvTokens', () => {
  it('후행 쉼표로 생기는 빈 열을 보존한다', () => {
    expect(tokenizeGridLine('1,2,3,')).toEqual(['1', '2', '3', '']);
  });

  it('부족한 열을 0 으로 패딩한다', () => {
    expect(normalizeRowTokens(['1', '2', '3', '4'], 1, 5)).toEqual(['1', '2', '3', '4', '0']);
  });

  it('행 인덱스 열을 제거한다', () => {
    expect(normalizeRowTokens(['1', '2', '3'], 1, 2)).toEqual(['2', '3']);
  });

  it('숫자 행과 헤더 행을 구분한다', () => {
    expect(isNumericDataRow(['1', '2.5', ''])).toBe(true);
    expect(isNumericDataRow(['x', 'y', 'z'])).toBe(false);
  });

  it('A열 단일 컬럼 행을 구분한다', () => {
    expect(isColumnarDataRow(['1.5'])).toBe(true);
    expect(isColumnarDataRow(['1.5', ''])).toBe(true);
    expect(isColumnarDataRow(['1', '2'])).toBe(false);
  });
});
