import { describe, expect, it } from 'vitest';
import { formatCaseHeadline, nextCaseId } from '@/utils/issueCaseId';

describe('nextCaseId', () => {
  it('같은 계열의 가장 큰 번호 다음을 발급한다', () => {
    expect(nextCaseId(['A-030', 'A-032', 'B-200', 'A-041'])).toBe('A-042');
  });

  it('해당 계열이 없으면 001부터 시작한다', () => {
    expect(nextCaseId(['B-015'])).toBe('A-001');
  });

  it('상단 문구는 발급 ID와 적용한 제원을 담는다', () => {
    expect(formatCaseHeadline('A-151', '원기둥', 0.1, 2)).toBe(
      'Case A-151 · 원기둥 D=0.1 m · 교각 2',
    );
  });
});
