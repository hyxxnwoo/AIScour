// 유체 필드 시각화용 컬러맵 — 수면·어두운 UI 와 어울리는 청록→샌드 그라디언트.

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

interface UniStop {
  t: number;
  r: number;
  g: number;
  b: number;
}

export const FLUID_STOPS: readonly UniStop[] = [
  { t: 0.0, r: 22, g: 58, b: 92 },
  { t: 0.18, r: 38, g: 98, b: 128 },
  { t: 0.38, r: 58, g: 142, b: 148 },
  { t: 0.58, r: 112, g: 182, b: 162 },
  { t: 0.78, r: 196, g: 218, b: 178 },
  { t: 1.0, r: 248, g: 238, b: 208 },
];

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

export function fluidColorRampToCss(direction = 'to right'): string {
  const stops = FLUID_STOPS.map((s) => `rgb(${s.r}, ${s.g}, ${s.b}) ${(s.t * 100).toFixed(1)}%`);
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}
