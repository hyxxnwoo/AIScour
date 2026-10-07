import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOUNDATION_DEPTH_M,
  depthAtRemainPct,
  gradeDepthThresholds,
  gradeOf,
  remainPct,
} from '@/constants/grade';

describe('grade', () => {
  const fd = DEFAULT_FOUNDATION_DEPTH_M;

  it('depthAtRemainPct at 70/40/20 % for FD 5.2', () => {
    expect(depthAtRemainPct(70, fd)).toBeCloseTo(1.56, 2);
    expect(depthAtRemainPct(40, fd)).toBeCloseTo(3.12, 2);
    expect(depthAtRemainPct(20, fd)).toBeCloseTo(4.16, 2);
  });

  it('gradeDepthThresholds matches mockup TH_DEPTH', () => {
    const [t70, t40, t20] = gradeDepthThresholds(fd);
    expect(t70).toBeCloseTo(1.56, 2);
    expect(t40).toBeCloseTo(3.12, 2);
    expect(t20).toBeCloseTo(4.16, 2);
  });

  it('remainPct clamps at zero when scour exceeds foundation', () => {
    expect(remainPct(6, fd)).toBe(0);
    expect(remainPct(fd, fd)).toBe(0);
  });

  it('gradeOf assigns four levels by remain pct', () => {
    expect(gradeOf(0, fd).key).toBe('a1');
    expect(gradeOf(1.5, fd).key).toBe('a1');
    expect(gradeOf(2.0, fd).key).toBe('a2');
    expect(gradeOf(3.5, fd).key).toBe('a3');
    expect(gradeOf(4.5, fd).key).toBe('a4');
  });

  it('remainPct at boundary values', () => {
    expect(remainPct(depthAtRemainPct(70, fd), fd)).toBeCloseTo(70, 5);
    expect(remainPct(depthAtRemainPct(40, fd), fd)).toBeCloseTo(40, 5);
    expect(remainPct(depthAtRemainPct(20, fd), fd)).toBeCloseTo(20, 5);
  });
});
