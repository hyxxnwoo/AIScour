export interface VirtualWindowInput {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  totalRows: number;
  overscan?: number;
}

export interface VirtualWindow {
  startIndex: number;
  endIndex: number;
  offsetY: number;
  totalHeight: number;
}

/**
 * 가상 스크롤에 필요한 시작/끝 인덱스와 오프셋을 계산한다.
 * endIndex 는 배타적(exclusive)이다.
 */
export function computeVirtualWindow(input: VirtualWindowInput): VirtualWindow {
  const { scrollTop, viewportHeight, rowHeight, totalRows } = input;
  const overscan = input.overscan ?? 8;

  if (totalRows <= 0 || rowHeight <= 0) {
    return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 };
  }

  const totalHeight = totalRows * rowHeight;
  const firstVisible = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visibleCount =
    viewportHeight > 0 ? Math.ceil(viewportHeight / rowHeight) : Math.min(totalRows, overscan + 1);

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(totalRows, firstVisible + visibleCount + overscan);
  const offsetY = startIndex * rowHeight;

  return { startIndex, endIndex, offsetY, totalHeight };
}
