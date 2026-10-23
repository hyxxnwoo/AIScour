// CFD 유동장의 고체(교각 기둥 + 하단부 footing) 모델. PierMarker 가 그리는 형상과 같은 치수를 쓴다.
//  - 기둥: 'circle' → 반경 d/2 원기둥, 'square' → 한 변 d 인 각기둥 (하상 기준면부터 위로 수면을 넘어 계속)
//  - 하단부: 'circle'·'ellipse' → 반축 (lengthX/2, widthZ/2) 타원기둥, 'square'·'rectangle' → lengthX × widthZ 각기둥,
//    기준면부터 height 까지만 존재

export type SolidShape2D = 'circle' | 'ellipse' | 'square' | 'rectangle';

export interface SolidFootingSpec {
  shape: SolidShape2D;
  lengthX: number;
  widthZ: number;
  height: number;
}

export interface FlowSolidSpec {
  x: number;
  z: number;
  /** 기둥 형상('circle' | 'square')과 반폭(= 직경/2) */
  shape: 'circle' | 'square';
  half: number;
  footing?: SolidFootingSpec;
  /** 기둥·하단부가 시작하는 월드 높이(PierMarker.baseElevation) */
  baseY: number;
}

const EPS = 1e-4;

function isRound(shape: SolidShape2D): boolean {
  return shape === 'circle' || shape === 'ellipse';
}

/** 2D 단면 안(경계 포함하지 않음)인지. a,b 는 x,z 반축. */
function inside2D(round: boolean, dx: number, dz: number, a: number, b: number): boolean {
  if (round) return (dx / a) ** 2 + (dz / b) ** 2 < 1;
  return Math.abs(dx) < a && Math.abs(dz) < b;
}

/** 2D 단면 안의 점을 경계 바깥(+EPS)으로 민다. 이동 거리와 새 좌표를 돌려준다. */
function push2D(
  round: boolean,
  dx: number,
  dz: number,
  a: number,
  b: number,
): { dx: number; dz: number; dist: number } {
  if (round) {
    const rho = Math.sqrt((dx / a) ** 2 + (dz / b) ** 2);
    if (rho < 1e-9) return { dx: a + EPS, dz: 0, dist: a + EPS };
    const k = (1 + EPS / Math.min(a, b)) / rho;
    const nx = dx * k;
    const nz = dz * k;
    return { dx: nx, dz: nz, dist: Math.hypot(nx - dx, nz - dz) };
  }
  const penX = a - Math.abs(dx);
  const penZ = b - Math.abs(dz);
  if (penX < penZ) {
    const nx = (dx >= 0 ? 1 : -1) * (a + EPS);
    return { dx: nx, dz, dist: penX + EPS };
  }
  const nz = (dz >= 0 ? 1 : -1) * (b + EPS);
  return { dx, dz: nz, dist: penZ + EPS };
}

/** (x,y,z) 가 기둥 또는 하단부 안인지. */
export function solidContains(s: FlowSolidSpec, x: number, y: number, z: number): boolean {
  if (y < s.baseY) return false;
  const dx = x - s.x;
  const dz = z - s.z;
  if (inside2D(s.shape === 'circle', dx, dz, s.half, s.half)) return true;
  const f = s.footing;
  if (f && y <= s.baseY + f.height) {
    return inside2D(isRound(f.shape), dx, dz, f.lengthX / 2, f.widthZ / 2);
  }
  return false;
}

/**
 * 고체 안의 점을 가장 가까운 표면 밖으로 민다. 바깥이면 null.
 * 하단부 윗면 가까이에서는 위로 올라타고, 그 밖에는 수평으로 밀어낸다.
 */
export function pushOutOfSolid(
  s: FlowSolidSpec,
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number } | null {
  if (!solidContains(s, x, y, z)) return null;
  const dx = x - s.x;
  const dz = z - s.z;
  let outX = x;
  let outY = y;
  let outZ = z;

  const f = s.footing;
  const shaftIn = inside2D(s.shape === 'circle', dx, dz, s.half, s.half);
  const inFooting =
    !!f &&
    y <= s.baseY + f.height &&
    inside2D(isRound(f.shape), dx, dz, f.lengthX / 2, f.widthZ / 2);

  if (inFooting && f) {
    const hp = push2D(isRound(f.shape), dx, dz, f.lengthX / 2, f.widthZ / 2);
    const up = s.baseY + f.height + EPS - y;
    // 기둥 안쪽이면 위로 올라타도 다시 기둥 안이므로 수평으로만 민다.
    if (!shaftIn && up < hp.dist) {
      outY = s.baseY + f.height + EPS;
    } else {
      outX = s.x + hp.dx;
      outZ = s.z + hp.dz;
    }
  } else if (shaftIn) {
    const p = push2D(s.shape === 'circle', dx, dz, s.half, s.half);
    outX = s.x + p.dx;
    outZ = s.z + p.dz;
  }
  return { x: outX, y: outY, z: outZ };
}

/** 높이 y 에서 흐름이 '막힌 것으로 보는' 등가 반경 — 하단부 높이 이하에서는 하단부가 지배한다. */
export function effectiveRadius(s: FlowSolidSpec, y: number): number {
  const shaft = s.shape === 'circle' ? s.half : s.half * Math.SQRT2;
  const f = s.footing;
  if (f && y >= s.baseY && y <= s.baseY + f.height) {
    const fr = isRound(f.shape)
      ? Math.max(f.lengthX, f.widthZ) / 2
      : Math.hypot(f.lengthX, f.widthZ) / 2;
    return Math.max(shaft, fr);
  }
  return shaft;
}

/** 평면에서 고체가 차지하는 최대 반경 — 입자 투입 위치를 고체 밖에 두는 데 쓴다. */
export function footprintRadius(s: FlowSolidSpec): number {
  const shaft = s.shape === 'circle' ? s.half : s.half * Math.SQRT2;
  const f = s.footing;
  if (!f) return shaft;
  const fr = isRound(f.shape)
    ? Math.max(f.lengthX, f.widthZ) / 2
    : Math.hypot(f.lengthX, f.widthZ) / 2;
  return Math.max(shaft, fr);
}
