import { describe, expect, it } from 'vitest';
import { scalePierScourDepthM, scalePierScourReadings } from '@/utils/pierScourDisplayScale';

describe('pierScourDisplayScale', () => {
  it('P2 is deeper than P1 at end of run', () => {
    const fd = 0.127;
    const dur = 1800;
    const raw = 0.022;
    const p1 = scalePierScourDepthM(raw, 'P1', fd, dur, dur);
    const p2 = scalePierScourDepthM(raw, 'P2', fd, dur, dur);
    expect(p2).toBeGreaterThan(p1);
    expect(p2).toBeGreaterThan(fd * 0.45);
  });

  it('early time is milder than late time', () => {
    const fd = 0.127;
    const early = scalePierScourDepthM(0.02, 'P2', fd, 60, 1800);
    const late = scalePierScourDepthM(0.02, 'P2', fd, 1800, 1800);
    expect(late).toBeGreaterThan(early);
  });

  it('scalePierScourReadings preserves pier ids', () => {
    const out = scalePierScourReadings(
      [
        { pierId: 'P1', scourDepthM: 0.01 },
        { pierId: 'P2', scourDepthM: 0.015 },
      ],
      0.127,
      900,
      1800,
    );
    expect(out.map((r) => r.pierId)).toEqual(['P1', 'P2']);
    expect(out[1]!.scourDepthM).toBeGreaterThan(out[0]!.scourDepthM);
  });
});
