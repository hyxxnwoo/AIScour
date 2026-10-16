/** 이미 있는 `A-032` 같은 ID 다음 번호를 발급한다. */
export function nextCaseId(existingIds: readonly string[], series = 'A'): string {
  const pattern = new RegExp(`^${series}-(\\d+)$`);
  let max = 0;
  for (const id of existingIds) {
    const match = pattern.exec(id);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return `${series}-${String(max + 1).padStart(3, '0')}`;
}

export function formatDiameterM(diameterM: number): string {
  const rounded = Math.round(diameterM * 100) / 100;
  return String(rounded);
}

/** 상단에 보일 현재 시뮬레이션 한 줄 */
export function formatCaseHeadline(
  id: string,
  shape: string,
  diameterM: number,
  pierCount: number,
): string {
  return `Case ${id} · ${shape} D=${formatDiameterM(diameterM)} m · 교각 ${pierCount}`;
}
