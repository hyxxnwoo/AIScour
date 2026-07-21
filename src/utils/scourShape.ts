/**
 * 교각 주변 세굴 강도(0~1). flowHeading 방향 유입 기준 horseshoe·상류 집중·하류 억제.
 * 기둥 접촉대(r≤R)는 하상 유지, 상류·측면 말굽에서 최심, rim까지 완만한 경사.
 */
export function flowScourIntensity(
  worldX: number,
  worldZ: number,
  pierX: number,
  pierZ: number,
  pierRadius: number,
  flowHeading = 0,
): number {
  const dx = worldX - pierX;
  const dz = worldZ - pierZ;
  const cosH = Math.cos(flowHeading);
  const sinH = Math.sin(flowHeading);
  const dAlong = dx * cosH + dz * sinH;
  const dCross = -dx * sinH + dz * cosH;
  const r = Math.hypot(dx, dz);

  const holeRadius = pierRadius * 3.5;
  if (r <= pierRadius || r > holeRadius) return 0;

  const angRel = Math.atan2(dCross, dAlong);
  const upstreamW = (1 - Math.cos(angRel)) * 0.5;
  const sideW = Math.abs(Math.sin(angRel));
  let dirAmp = 0.12 + 0.64 * upstreamW + 0.44 * sideW;

  // 하류(흐름 방향) 반쪽은 유속 약화·퇴적 경향으로 세굴을 크게 억제
  if (dAlong > 0) {
    dirAmp *= 0.18 + 0.28 * Math.exp(-dAlong / (pierRadius * 1.8));
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
    dAlong > pierRadius && Math.abs(dCross) < pierRadius * 0.55
      ? 0.05 *
        Math.exp(-(dAlong - pierRadius) / (pierRadius * 5)) *
        Math.exp(-(dCross * dCross) / (pierRadius * pierRadius * 0.5))
      : 0;

  return Math.min(1, dirAmp * radial + wake);
}

/** 원거리 후류 퇴적 Δ표고(양수). 근거리 하류(≈1.35R)는 세굴(음수)로 유지한다. */
function flowDepositionDelta(
  dAlong: number,
  dCross: number,
  pierRadius: number,
  equilibriumDepth: number,
  timeProgress: number,
): number {
  if (dAlong <= pierRadius * 2) return 0;
  if (Math.abs(dCross) >= pierRadius * 0.8) return 0;

  const logNorm = Math.log1p(3);
  const timeFactor = Math.log1p(3 * timeProgress) / logNorm;
  const alongDecay = Math.exp(-(dAlong - pierRadius * 2) / (pierRadius * 4));
  const crossDecay = Math.exp(-(dCross * dCross) / (pierRadius * pierRadius * 0.4));
  const depositIntensity = 0.12 * alongDecay * crossDecay;
  return equilibriumDepth * depositIntensity * timeFactor;
}

/** 세굴 Δ표고(음수). timeProgress 0→1 에 따라 깊어진다. 후류 원거리는 퇴적(+). */
export function flowScourDelta(
  worldX: number,
  worldZ: number,
  pierX: number,
  pierZ: number,
  pierRadius: number,
  equilibriumDepth: number,
  timeProgress: number,
  flowHeading = 0,
): number {
  const dx = worldX - pierX;
  const dz = worldZ - pierZ;
  const cosH = Math.cos(flowHeading);
  const sinH = Math.sin(flowHeading);
  const dAlong = dx * cosH + dz * sinH;
  const dCross = -dx * sinH + dz * cosH;

  const intensity = flowScourIntensity(
    worldX,
    worldZ,
    pierX,
    pierZ,
    pierRadius,
    flowHeading,
  );
  const logNorm = Math.log1p(3);
  const timeFactor = Math.log1p(3 * timeProgress) / logNorm;

  const scour =
    intensity > 0 ? -equilibriumDepth * intensity * timeFactor : 0;
  const deposition = flowDepositionDelta(
    dAlong,
    dCross,
    pierRadius,
    equilibriumDepth,
    timeProgress,
  );

  return scour + deposition;
}

export interface ScourPierRef {
  x: number;
  z: number;
  radius: number;
}

/** 여러 교각 세굴을 합성한다. 각 셀은 가장 깊은(최솟값) Δ표고를 사용한다. */
export function combinedFlowScourDelta(
  worldX: number,
  worldZ: number,
  piers: ScourPierRef[],
  equilibriumDepth: number,
  timeProgress: number,
  flowHeading = 0,
): number {
  if (piers.length === 0) return 0;

  let delta = 0;
  for (const pier of piers) {
    delta = Math.min(
      delta,
      flowScourDelta(
        worldX,
        worldZ,
        pier.x,
        pier.z,
        pier.radius,
        equilibriumDepth,
        timeProgress,
        flowHeading,
      ),
    );
  }
  return delta;
}
