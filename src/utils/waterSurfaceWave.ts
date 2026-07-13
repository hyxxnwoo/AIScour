/** 수면 정점 Y 오프셋 (m). +X 하류 방향으로 이동하는 파형. */
export function waterSurfaceWave(x: number, z: number, t: number, amp: number): number {
  const downstream = x - t * 0.55;
  const w1 = Math.sin(downstream * 1.35 + z * 0.55) * 0.62;
  const w2 = Math.sin(downstream * 2.6 - z * 0.35 + t * 0.25) * 0.38;
  const w3 = Math.sin(downstream * 0.85 + z * 1.1) * Math.cos(downstream * 1.9) * 0.24;
  return (w1 + w2 + w3) * amp;
}
