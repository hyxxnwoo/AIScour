import { describe, expect, it } from 'vitest';
import {
  isBlockedByPiers,
  isInsidePierSolid,
  resolvePierCollision,
} from '@/utils/pierCollision';
import type { PierDefinition } from '@/modules/PierMarker';

const PIER: PierDefinition = {
  id: 'P1',
  x: 0,
  z: 0,
  diameter: 0.1,
  height: 1,
  shape: 'circle',
};

describe('pierCollision', () => {
  it('원형 기둥 내부 좌표를 표면 밖으로 밀어낸다', () => {
    const resolved = resolvePierCollision(0, 0.2, 0, [PIER], {
      permeable: false,
      baseElevation: 0,
    });
    expect(Math.hypot(resolved.x, resolved.z)).toBeGreaterThanOrEqual(0.05);
  });

  it('투과성 기둥은 코어 0.5R 까지 통과를 허용한다', () => {
    expect(
      isInsidePierSolid(0, 0.2, 0, PIER, { permeable: true, baseElevation: 0 }),
    ).toBe(false);
    expect(
      isInsidePierSolid(0.04, 0.2, 0, PIER, { permeable: true, baseElevation: 0 }),
    ).toBe(true);
  });

  it('respawn 차단 판별이 동작한다', () => {
    expect(
      isBlockedByPiers(0, 0.2, 0, [PIER], { permeable: false, baseElevation: 0 }),
    ).toBe(true);
    expect(
      isBlockedByPiers(0.2, 0.2, 0, [PIER], { permeable: false, baseElevation: 0 }),
    ).toBe(false);
  });
});
