// CFD 모드 유속 컬러맵 — 세굴 컬러맵(적-백-청)·위험 등급 4색과 겹치지 않는 별도 순차형(viridis 계열).

import type { ColorRGB } from '@/utils/fluidColorRamp';

interface Stop {
  t: number;
  r: number;
  g: number;
  b: number;
}

export const CFD_VELOCITY_STOPS: readonly Stop[] = [
  { t: 0.0, r: 68, g: 1, b: 84 },
  { t: 0.25, r: 59, g: 82, b: 139 },
  { t: 0.5, r: 33, g: 144, b: 140 },
  { t: 0.75, r: 93, g: 200, b: 99 },
  { t: 1.0, r: 200, g: 224, b: 32 },
];

/** value 를 [vMin, vMax] 로 정규화해 색을 구한다(0~1 출력). */
export function sampleCfdVelocityColor(
  value: number,
  vMin: number,
  vMax: number,
  out: ColorRGB,
): void {
  const span = vMax - vMin;
  const t = span <= 0 ? 0 : Math.max(0, Math.min(1, (value - vMin) / span));
  for (let i = 0; i < CFD_VELOCITY_STOPS.length - 1; i += 1) {
    const a = CFD_VELOCITY_STOPS[i];
    const b = CFD_VELOCITY_STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / (b.t - a.t);
      out.r = (a.r + (b.r - a.r) * k) / 255;
      out.g = (a.g + (b.g - a.g) * k) / 255;
      out.b = (a.b + (b.b - a.b) * k) / 255;
      return;
    }
  }
}

export function cfdVelocityGradientCss(direction = 'to right'): string {
  const stops = CFD_VELOCITY_STOPS.map(
    (s) => `rgb(${s.r}, ${s.g}, ${s.b}) ${(s.t * 100).toFixed(1)}%`,
  );
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}
