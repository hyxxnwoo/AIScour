import { describe, expect, it } from 'vitest';
import { computeVirtualWindow } from '@/utils/virtualRows';

describe('computeVirtualWindow', () => {
  it('빈 데이터는 0 범위를 반환한다', () => {
    expect(
      computeVirtualWindow({
        scrollTop: 0,
        viewportHeight: 400,
        rowHeight: 28,
        totalRows: 0,
      }),
    ).toEqual({
      startIndex: 0,
      endIndex: 0,
      offsetY: 0,
      totalHeight: 0,
    });
  });

  it('스크롤 위치에 따라 보이는 범위를 계산한다', () => {
    const window = computeVirtualWindow({
      scrollTop: 280,
      viewportHeight: 280,
      rowHeight: 28,
      totalRows: 100,
      overscan: 4,
    });

    expect(window.startIndex).toBe(6);
    expect(window.endIndex).toBe(24);
    expect(window.offsetY).toBe(168);
    expect(window.totalHeight).toBe(2800);
  });

  it('끝단에서 endIndex 가 totalRows 를 넘지 않는다', () => {
    const window = computeVirtualWindow({   
      scrollTop: 2500,
      viewportHeight: 280,
      rowHeight: 28,
      totalRows: 100,
      overscan: 8,
    });

    expect(window.endIndex).toBe(100);
    expect(window.startIndex).toBeLessThan(100);
  });

  it('viewportHeight 가 0 이면 overscan 기준 최소 행을 렌더한다', () => {
    const window = computeVirtualWindow({
      scrollTop: 0,
      viewportHeight: 0,
      rowHeight: 28,
      totalRows: 50,
      overscan: 8,
    });

    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBe(17);
  });
});
