// CFD 모드 하상 컬러맵 — 세굴 적색 / 0 = 흰색 / 퇴적 청색 발산형(ColorBrewer RdBu 계열).
// 기본 모드의 모래색 컬러맵(colorRamp.ts)과 분리해 두어, 기본 화면은 그대로 유지한다.

interface Stop {
  t: number;
  r: number;
  g: number;
  b: number;
}

// t: -1(최대 세굴) ~ +1(최대 퇴적)
const CFD_SCOUR_STOPS: readonly Stop[] = [
  { t: -1.0, r: 178, g: 24, b: 43 },
  { t: -0.5, r: 239, g: 138, b: 98 },
  { t: 0.0, r: 255, g: 255, b: 255 },
  { t: 0.5, r: 103, g: 169, b: 207 },
  { t: 1.0, r: 33, g: 102, b: 172 },
];

/** Δ표고(음수=세굴, 양수=퇴적)를 [-absMax, absMax] 대칭 범위로 색칠한다. 출력은 0~1. */
export function sampleCfdScourColor(
  delta: number,
  absMax: number,
  out: { r: number; g: number; b: number },
): void {
  const t = absMax <= 1e-12 ? 0 : Math.max(-1, Math.min(1, delta / absMax));
  for (let i = 0; i < CFD_SCOUR_STOPS.length - 1; i += 1) {
    const a = CFD_SCOUR_STOPS[i];
    const b = CFD_SCOUR_STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / (b.t - a.t);
      out.r = (a.r + (b.r - a.r) * k) / 255;
      out.g = (a.g + (b.g - a.g) * k) / 255;
      out.b = (a.b + (b.b - a.b) * k) / 255;
      return;
    }
  }
}

export function cfdScourGradientCss(direction = 'to right'): string {
  const stops = CFD_SCOUR_STOPS.map(
    (s) => `rgb(${s.r}, ${s.g}, ${s.b}) ${(((s.t + 1) / 2) * 100).toFixed(1)}%`,
  );
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}
