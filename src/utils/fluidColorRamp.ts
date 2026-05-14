// 유체 물리량(0~1 정규화) 시각화용 viridis-like 컬러맵.
// scour 컬러맵(베이지 중심)과는 다른 단방향 그라디언트 — 물리량 강도를 직관적으로 보여주기 위함.

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

interface UniStop {
  t: number; // 0..1
  r: number;
  g: number;
  b: number;
}

// viridis 의 8 stops 근사값
export const FLUID_STOPS: readonly UniStop[] = [
  { t: 0.0, r: 68, g: 1, b: 84 },
  { t: 0.14, r: 71, g: 39, b: 117 },
  { t: 0.28, r: 59, g: 81, b: 139 },
  { t: 0.43, r: 44, g: 113, b: 142 },
  { t: 0.57, r: 33, g: 144, b: 141 },
  { t: 0.71, r: 39, g: 173, b: 129 },
  { t: 0.85, r: 92, g: 200, b: 99 },
  { t: 1.0, r: 253, g: 231, b: 37 },
];

// value(any) → [vMin, vMax] 정규화 → 색상 보간. 결과는 0..1 RGB 로 out 에 채운다.
export function sampleFluidColor(value: number, vMin: number, vMax: number, out: ColorRGB): void {
  const span = vMax - vMin;
  const t = span <= 0 ? 0 : Math.max(0, Math.min(1, (value - vMin) / span));
  for (let i = 0; i < FLUID_STOPS.length - 1; i += 1) {
    const a = FLUID_STOPS[i];
    const b = FLUID_STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / Math.max(b.t - a.t, 1e-9);
      out.r = (a.r + (b.r - a.r) * k) / 255;
      out.g = (a.g + (b.g - a.g) * k) / 255;
      out.b = (a.b + (b.b - a.b) * k) / 255;
      return;
    }
  }
  const clamp = t <= 0 ? FLUID_STOPS[0] : FLUID_STOPS[FLUID_STOPS.length - 1];
  out.r = clamp.r / 255;
  out.g = clamp.g / 255;
  out.b = clamp.b / 255;
}

// 범례 등 UI 가 동일 그라디언트를 그릴 수 있게 CSS 문자열을 생성.
export function fluidColorRampToCss(direction = 'to right'): string {
  const stops = FLUID_STOPS.map((s) => `rgb(${s.r}, ${s.g}, ${s.b}) ${(s.t * 100).toFixed(1)}%`);
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}
