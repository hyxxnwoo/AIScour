// 세굴 깊이 → 색상 매핑.
// 양수(퇴적) → 황토색, 0 근처 → 베이지, 음수(세굴) → 청색 계열.
// turbo/viridis 같은 정밀한 컬러맵은 추후 도입.

export interface ColorStop {
  t: number;
  r: number;
  g: number;
  b: number;
}

// 컬러맵 정점. -1.0(가장 깊은 세굴) ~ +1.0(가장 두꺼운 퇴적) 범위로 정규화된 t 기준.
export const COLOR_STOPS: readonly ColorStop[] = [
  { t: -1.0, r: 12, g: 36, b: 86 }, // 짙은 청색 (가장 깊은 세굴)
  { t: -0.5, r: 50, g: 110, b: 168 },
  { t: -0.15, r: 122, g: 178, b: 211 },
  { t: 0.0, r: 214, g: 178, b: 118 }, // 따뜻한 모래 (변화 없음)
  { t: 0.35, r: 168, g: 118, b: 62 }, // 퇴적 중간
  { t: 1.0, r: 92, g: 62, b: 26 }, // 진한 퇴적 모래
];

// 범례 등 외부 UI 가 동일한 그라디언트를 그릴 수 있게 CSS linear-gradient 문자열을 생성한다.
export function colorRampToCssGradient(direction = 'to right'): string {
  const stops = COLOR_STOPS.map((s) => {
    // t in [-1, 1] → percent in [0, 100]
    const pct = ((s.t + 1) / 2) * 100;
    return `rgb(${s.r}, ${s.g}, ${s.b}) ${pct.toFixed(1)}%`;
  });
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}

// value 를 [valueMin, valueMax] → [-1, 1] 로 정규화한 뒤 stops 에서 색상을 보간한다.
export function sampleColorRamp(
  value: number,
  valueMin: number,
  valueMax: number,
  out: { r: number; g: number; b: number },
): void {
  const range = Math.max(Math.abs(valueMin), Math.abs(valueMax));
  const t = range === 0 ? 0 : Math.max(-1, Math.min(1, value / range));

  for (let i = 0; i < COLOR_STOPS.length - 1; i += 1) {
    const a = COLOR_STOPS[i];
    const b = COLOR_STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      const k = span === 0 ? 0 : (t - a.t) / span;
      out.r = (a.r + (b.r - a.r) * k) / 255;
      out.g = (a.g + (b.g - a.g) * k) / 255;
      out.b = (a.b + (b.b - a.b) * k) / 255;
      return;
    }
  }
  // t 가 범위를 벗어나면 양 끝 색상으로 클램프
  const clamp = t <= COLOR_STOPS[0].t ? COLOR_STOPS[0] : COLOR_STOPS[COLOR_STOPS.length - 1];
  out.r = clamp.r / 255;
  out.g = clamp.g / 255;
  out.b = clamp.b / 255;
}

/** 격자 위치 기반 미세 명암(±4%) — 평평한 하상에 모래 알갱이 느낌. */
export function sandGrainFactor(gridX: number, gridY: number): number {
  return (((gridX * 73 + gridY * 37) & 0xff) / 255) * 0.08 - 0.04;
}

/**
 * 하상 메시 정점 색: 기본 모래 톤 + Δ(세굴/퇴적).
 * 퇴적(+)은 기본 모래보다 진한 갈색으로 구분하고, 세굴(-)은 청색 계열을 유지한다.
 */
export function sampleTerrainSandColor(
  delta: number,
  absMax: number,
  gridX: number,
  gridY: number,
  out: { r: number; g: number; b: number },
): void {
  const grain = sandGrainFactor(gridX, gridY);
  const baseR = 0.84 + grain;
  const baseG = 0.7 + grain * 0.75;
  const baseB = 0.44 + grain * 0.5;

  if (absMax <= 1e-12) {
    out.r = baseR;
    out.g = baseG;
    out.b = baseB;
    return;
  }

  const norm = Math.max(-1, Math.min(1, delta / absMax));

  if (norm > 1e-6) {
    const k = norm ** 0.55;
    const depR = 0.36;
    const depG = 0.24;
    const depB = 0.1;
    out.r = baseR + (depR - baseR) * k;
    out.g = baseG + (depG - baseG) * k;
    out.b = baseB + (depB - baseB) * k;
    return;
  }

  if (norm < -1e-6) {
    sampleColorRamp(delta, -absMax, absMax, out);
    if (norm > -0.22) {
      const blend = (norm + 0.22) / 0.22;
      out.r = out.r * (1 - blend) + baseR * blend;
      out.g = out.g * (1 - blend) + baseG * blend;
      out.b = out.b * (1 - blend) + baseB * blend;
    }
    return;
  }

  out.r = baseR;
  out.g = baseG;
  out.b = baseB;
}

/** 하상 모래색 — 표고가 낮을수록(세굴공) 어둡고 습한 색. */
export function sampleSandBedColor(
  elevation: number,
  surfaceRef: number,
  deepestRef: number,
  out: { r: number; g: number; b: number },
): void {
  const span = Math.max(0.003, surfaceRef - deepestRef);
  const t = Math.max(0, Math.min(1, (elevation - deepestRef) / span));
  out.r = 0.42 + t * 0.28;
  out.g = 0.3 + t * 0.24;
  out.b = 0.16 + t * 0.14;
}
