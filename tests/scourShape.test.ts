import { describe, expect, it } from 'vitest';
import { flowScourDelta, flowScourIntensity } from '@/utils/scourShape';

describe('flowScourShape', () => {
  const pierX = 0;
  const pierZ = 0;
  const radius = 0.05;

  it('상류(+X 반대)가 하류 원거리보다 굴착 강도가 크다', () => {
    const upstream = flowScourIntensity(pierX - radius * 1.5, pierZ, pierX, pierZ, radius);
    const farDownstream = flowScourIntensity(pierX + radius * 6, pierZ, pierX, pierZ, radius);
    expect(upstream).toBeGreaterThan(farDownstream);
  });

  it('시간이 지날수록 세굴 Δ가 깊어진다', () => {
    const early = flowScourDelta(pierX - radius * 1.4, pierZ, pierX, pierZ, radius, 0.1, 0.2);
    const late = flowScourDelta(pierX - radius * 1.4, pierZ, pierX, pierZ, radius, 0.1, 1);
    expect(early).toBeLessThan(0);
    expect(late).toBeLessThan(early);
  });

  it('기둥 접촉대(r≤R)에는 세굴이 없고 말굽(r≈1.35R)이 원거리보다 깊다', () => {
    const atPierFace = flowScourIntensity(pierX - radius, pierZ, pierX, pierZ, radius);
    const atHorseshoe = flowScourIntensity(pierX - radius * 1.35, pierZ, pierX, pierZ, radius);
    const atOuterRing = flowScourIntensity(pierX - radius * 2, pierZ, pierX, pierZ, radius);
    expect(atPierFace).toBe(0);
    expect(atHorseshoe).toBeGreaterThan(atOuterRing);
    expect(atHorseshoe).toBeGreaterThan(0);
  });

  it('같은 거리에서 상류(왼쪽)가 하류(오른쪽)보다 세굴이 깊다', () => {
    const dist = radius * 1.35;
    const upstream = flowScourDelta(pierX - dist, pierZ, pierX, pierZ, radius, 0.13, 1);
    const downstream = flowScourDelta(pierX + dist, pierZ, pierX, pierZ, radius, 0.13, 1);
    expect(upstream).toBeLessThan(0);
    expect(downstream).toBeLessThan(0);
    expect(upstream).toBeLessThan(downstream);
    expect(Math.abs(upstream)).toBeGreaterThan(Math.abs(downstream) * 1.5);
  });
});
