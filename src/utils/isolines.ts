// 격자 스칼라장의 등치선(marching squares). 격자 좌표(소수 허용)로 선분을 내보낸다.

/** 지시서 기준 등심선 간격 상한(m). 데이터 범위가 작으면 자동으로 더 촘촘해진다. */
export const ISOLINE_MAX_STEP_M = 0.5;

/** absMax 를 대략 4등분하는 1·2·5×10^n 간격. 상한(maxStep)을 넘지 않는다. */
export function niceIsolineStep(absMax: number, maxStep = ISOLINE_MAX_STEP_M): number {
  if (!(absMax > 1e-12)) return maxStep;
  const raw = absMax / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const mant = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return Math.min(maxStep, mant * pow);
}

export type IsolineEmit = (
  levelIndex: number,
  gx1: number,
  gy1: number,
  gx2: number,
  gy2: number,
) => void;

/**
 * values[y*width+x] 위의 level = k·step (k≠0) 등치선을 구한다.
 * 한 셀에서 값 범위가 걸치는 k 만 검사하므로 비용은 셀 수에 거의 비례한다.
 */
export function computeIsolines(
  values: ArrayLike<number>,
  width: number,
  height: number,
  step: number,
  emit: IsolineEmit,
  maxLevelIndex = 40,
): void {
  if (width < 2 || height < 2 || !(step > 0)) return;
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const i00 = y * width + x;
      const v00 = values[i00];
      const v10 = values[i00 + 1];
      const v01 = values[i00 + width];
      const v11 = values[i00 + width + 1];
      const lo = Math.min(v00, v10, v01, v11);
      const hi = Math.max(v00, v10, v01, v11);
      const kMin = Math.max(-maxLevelIndex, Math.ceil(lo / step));
      const kMax = Math.min(maxLevelIndex, Math.floor(hi / step));
      for (let k = kMin; k <= kMax; k += 1) {
        if (k === 0) continue;
        cellSegments(k, k * step, x, y, v00, v10, v11, v01, emit);
      }
    }
  }
}

function cellSegments(
  k: number,
  level: number,
  x: number,
  y: number,
  v00: number,
  v10: number,
  v11: number,
  v01: number,
  emit: IsolineEmit,
): void {
  const in00 = v00 >= level;
  const in10 = v10 >= level;
  const in11 = v11 >= level;
  const in01 = v01 >= level;
  const inside = (in00 ? 1 : 0) + (in10 ? 1 : 0) + (in11 ? 1 : 0) + (in01 ? 1 : 0);
  if (inside === 0 || inside === 4) return;

  // 변 교차점: 0 아래(y), 1 오른쪽(x+1), 2 위(y+1), 3 왼쪽(x)
  const frac = (a: number, b: number): number => (level - a) / (b - a);
  const edge = (e: number): [number, number] => {
    switch (e) {
      case 0:
        return [x + frac(v00, v10), y];
      case 1:
        return [x + 1, y + frac(v10, v11)];
      case 2:
        return [x + frac(v01, v11), y + 1];
      default:
        return [x, y + frac(v00, v01)];
    }
  };
  const seg = (e1: number, e2: number): void => {
    const [ax, ay] = edge(e1);
    const [bx, by] = edge(e2);
    emit(k, ax, ay, bx, by);
  };

  if (inside === 2 && in00 === in11) {
    // 안장점: 중심값으로 어느 코너를 분리할지 정한다.
    const centerIn = (v00 + v10 + v11 + v01) / 4 >= level;
    if (in00 !== centerIn) seg(0, 3);
    if (in10 !== centerIn) seg(0, 1);
    if (in11 !== centerIn) seg(1, 2);
    if (in01 !== centerIn) seg(2, 3);
    return;
  }

  // 일반 경우: 교차하는 두 변을 잇는다.
  const crossed: number[] = [];
  if (in00 !== in10) crossed.push(0);
  if (in10 !== in11) crossed.push(1);
  if (in01 !== in11) crossed.push(2);
  if (in00 !== in01) crossed.push(3);
  if (crossed.length === 2) seg(crossed[0], crossed[1]);
}
