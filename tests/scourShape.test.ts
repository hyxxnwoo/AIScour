import { describe, expect, it } from 'vitest';
import { combinedFlowScourDelta, flowScourDelta, flowScourIntensity } from '@/utils/scourShape';

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

  it('flowHeading=π/2 이면 상류 집중이 −Z 방향으로 회전한다', () => {
    const heading = Math.PI / 2;
    const dist = radius * 1.35;
    const upstreamAlongFlow = flowScourIntensity(
      pierX,
      pierZ - dist,
      pierX,
      pierZ,
      radius,
      heading,
    );
    const farDownstream = flowScourIntensity(
      pierX,
      pierZ + radius * 6,
      pierX,
      pierZ,
      radius,
      heading,
    );
    expect(upstreamAlongFlow).toBeGreaterThan(farDownstream);
    expect(upstreamAlongFlow).toBeGreaterThan(0);
  });

  it('원거리 후류에는 퇴적(+Δ)이 생긴다', () => {
    const dist = radius * 2.5;
    const deposition = flowScourDelta(pierX + dist, pierZ, pierX, pierZ, radius, 0.13, 1);
    expect(deposition).toBeGreaterThan(0);
  });
});

describe('combinedFlowScourDelta 교각별 heading/depth (실측 데이터 기반 세굴)', () => {
  const commonRadius = 0.1;

  it('교각마다 다른 heading 을 주면 같은 좌표에서 다른 delta 가 나온다(형상 회전)', () => {
    const upstreamPoint = { x: -commonRadius * 1.35, z: 0 };

    const withHeading0 = combinedFlowScourDelta(
      upstreamPoint.x,
      upstreamPoint.z,
      [{ x: 0, z: 0, radius: commonRadius, heading: 0, depth: 0.05 }],
      0,
      1,
      0,
    );
    const withHeading90 = combinedFlowScourDelta(
      upstreamPoint.x,
      upstreamPoint.z,
      [{ x: 0, z: 0, radius: commonRadius, heading: Math.PI / 2, depth: 0.05 }],
      0,
      1,
      0,
    );

    expect(withHeading0).not.toBeCloseTo(withHeading90, 6);
  });

  it('교각마다 다른 depth 를 주면 최대 침식 크기가 실측값에 비례해 달라진다', () => {
    const deepPier = { x: -0.5, z: 0, radius: commonRadius, heading: 0, depth: 0.1 };
    const shallowPier = { x: 0.5, z: 0, radius: commonRadius, heading: 0, depth: 0.02 };

    const upstreamOfDeep = combinedFlowScourDelta(
      deepPier.x - commonRadius * 1.35,
      deepPier.z,
      [deepPier],
      0,
      1,
      0,
    );
    const upstreamOfShallow = combinedFlowScourDelta(
      shallowPier.x - commonRadius * 1.35,
      shallowPier.z,
      [shallowPier],
      0,
      1,
      0,
    );

    expect(upstreamOfDeep).toBeLessThan(0);
    expect(upstreamOfShallow).toBeLessThan(0);
    expect(Math.abs(upstreamOfDeep)).toBeGreaterThan(Math.abs(upstreamOfShallow));
  });

  it('여러 교각이 같은 pierRadius/공통 flowHeading 을 공유해도 heading/depth 를 각자 지정하면 같은 모양의 복사본이 되지 않는다', () => {
    const piers = [
      { x: -0.6, z: 0, radius: commonRadius, heading: 0, depth: 0.09 },
      { x: 0, z: 0, radius: commonRadius, heading: Math.PI / 4, depth: 0.05 },
      { x: 0.6, z: 0, radius: commonRadius, heading: Math.PI / 2, depth: 0.02 },
    ];
    // 각 교각 자신의 상류(heading 방향) 지점에서 delta 를 뽑아 서로 다른지 확인.
    const readings = piers.map((pier) => {
      const cosH = Math.cos(pier.heading);
      const sinH = Math.sin(pier.heading);
      const upstreamX = pier.x - cosH * commonRadius * 1.35;
      const upstreamZ = pier.z - sinH * commonRadius * 1.35;
      return combinedFlowScourDelta(upstreamX, upstreamZ, [pier], 0, 1, 0);
    });

    expect(readings[0]).toBeLessThan(0);
    expect(readings[1]).toBeLessThan(0);
    expect(readings[2]).toBeLessThan(0);
    // 세 값이 모두 달라야 한다(하나라도 같으면 형상이 복사됐다는 뜻).
    expect(readings[0]).not.toBeCloseTo(readings[1]!, 6);
    expect(readings[1]).not.toBeCloseTo(readings[2]!, 6);
    expect(readings[0]).not.toBeCloseTo(readings[2]!, 6);
  });

  it('pier.depth 지정 시 timeProgress 로 다시 스케일하지 않는다(이미 실측 시점값)', () => {
    const pier = { x: 0, z: 0, radius: commonRadius, heading: 0, depth: 0.05 };
    const point = { x: -commonRadius * 1.35, z: 0 };
    const atProgress0 = combinedFlowScourDelta(point.x, point.z, [pier], 0, 0, 0);
    const atProgress1 = combinedFlowScourDelta(point.x, point.z, [pier], 0, 1, 0);
    expect(atProgress0).toBeCloseTo(atProgress1, 10);
  });
});
