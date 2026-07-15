/**
 * 교각 주변 세굴 강도(0~1). −X 유입(좌→우) 기준 horseshoe·상류 집중·하류 억제.
 * 기둥 접촉대(r≤R)는 하상 유지, 상류·측면 말굽에서 최심, rim까지 완만한 경사.
 */
export function flowScourIntensity(
  worldX: number,
  worldZ: number,
  pierX: number,
  pierZ: number,
  pierRadius: number,
): number {
  const dx = worldX - pierX;
  const dz = worldZ - pierZ;
  const r = Math.hypot(dx, dz);

  const holeRadius = pierRadius * 3.5;
  if (r <= pierRadius || r > holeRadius) return 0;

  const ang = Math.atan2(dz, dx);
  const upstreamW = (1 - Math.cos(ang)) * 0.5;
  const sideW = Math.abs(Math.sin(ang));
  let dirAmp = 0.12 + 0.64 * upstreamW + 0.44 * sideW;

  // 하류(+X) 반쪽은 유속 약화·퇴적 경향으로 세굴을 크게 억제
  if (dx > 0) {
    dirAmp *= 0.18 + 0.28 * Math.exp(-dx / (pierRadius * 1.8));
  }

  const span = holeRadius - pierRadius;
  const t = (r - pierRadius) / span;
  const peakT = (pierRadius * 0.35) / span;
  const radial =
    t <= peakT
      ? Math.pow(t / peakT, 0.85)
      : Math.pow((1 - t) / (1 - peakT), 1.3);

  // 하류 중앙 좁은 wake — 상류 세굴을 압도하지 않도록 약하게
  const wake =
    dx > pierRadius && Math.abs(dz) < pierRadius * 0.55
      ? 0.05 *
        Math.exp(-(dx - pierRadius) / (pierRadius * 5)) *
        Math.exp(-(dz * dz) / (pierRadius * pierRadius * 0.5))
      : 0;

  return Math.min(1, dirAmp * radial + wake);
}

/** 세굴 Δ표고(음수). timeProgress 0→1 에 따라 깊어진다. */
export function flowScourDelta(
  worldX: number,
  worldZ: number,
  pierX: number,
  pierZ: number,
  pierRadius: number,
  equilibriumDepth: number,
  timeProgress: number,
): number {
  const intensity = flowScourIntensity(worldX, worldZ, pierX, pierZ, pierRadius);
  if (intensity <= 0) return 0;
  const logNorm = Math.log1p(3);
  const timeFactor = Math.log1p(3 * timeProgress) / logNorm;
  return -equilibriumDepth * intensity * timeFactor;
}
