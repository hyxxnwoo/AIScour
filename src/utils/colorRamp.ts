// 세굴 깊이 → 색상 매핑.
// 양수(퇴적) → 황토색, 0 근처 → 베이지, 음수(세굴) → 청색 계열.
// turbo/viridis 같은 정밀한 컬러맵은 추후 도입.

const STOPS: Array<{ t: number; r: number; g: number; b: number }> = [
  { t: -1.0, r: 12, g: 36, b: 86 }, // 짙은 청색 (가장 깊은 세굴)
  { t: -0.5, r: 50, g: 110, b: 168 },
  { t: -0.15, r: 122, g: 178, b: 211 },
  { t: 0.0, r: 220, g: 210, b: 180 }, // 베이지 (변화 없음)
  { t: 0.3, r: 196, g: 156, b: 92 },
  { t: 1.0, r: 132, g: 88, b: 36 }, // 황토색 (퇴적)
];

// value 를 [valueMin, valueMax] → [-1, 1] 로 정규화한 뒤 stops 에서 색상을 보간한다.
export function sampleColorRamp(
  value: number,
  valueMin: number,
  valueMax: number,
  out: { r: number; g: number; b: number },
): void {
  const range = Math.max(Math.abs(valueMin), Math.abs(valueMax));
  const t = range === 0 ? 0 : Math.max(-1, Math.min(1, value / range));

  for (let i = 0; i < STOPS.length - 1; i += 1) {
    const a = STOPS[i];
    const b = STOPS[i + 1];
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
  const clamp = t <= STOPS[0].t ? STOPS[0] : STOPS[STOPS.length - 1];
  out.r = clamp.r / 255;
  out.g = clamp.g / 255;
  out.b = clamp.b / 255;
}
