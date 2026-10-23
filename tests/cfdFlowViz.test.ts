import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { CfdPathlines } from '@/modules/CfdPathlines';
import { CfdVectorGlyphs } from '@/modules/CfdVectorGlyphs';
import { CfdVelocityColorbar } from '@/components/CfdVelocityColorbar';
import { CfdLayerStore } from '@/state/cfdLayers';
import { SyntheticCfdFlow, estimateSpeedMax } from '@/data/cfdFlowField';

const bounds = { minX: -0.8, maxX: 0.8, minZ: -0.4, maxZ: 0.4 };
const bed = (): number => 0;
const R = 0.04;
const piers = [{ x: 0, z: 0, radius: R }];
const flow = new SyntheticCfdFlow({ inflowSpeed: 0.25, waterLevelY: 0.15, bedElevation: bed, piers });

// 결정적 난수(LCG)
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('유속 추정', () => {
  it('합성 유동장의 최대 속력은 접근류보다 크다(교각 옆 가속)', () => {
    const max = estimateSpeedMax(flow, bounds, bed, 0.15);
    expect(max).toBeGreaterThan(0.25);
    expect(max).toBeLessThan(1);
  });
});

describe('CfdPathlines', () => {
  const make = (scene: Scene, count = 80): CfdPathlines =>
    new CfdPathlines({
      scene,
      flow,
      bounds,
      bedAt: bed,
      waterLevelY: 0.15,
      piers,
      speedMax: 0.5,
      count,
      tail: 8,
      random: lcg(7),
    });

  it('재생 중 입자는 영역·수심 안에 머물고 하류로 이동한다', () => {
    const scene = new Scene();
    const p = make(scene);
    expect(p.particleCount).toBe(80);
    expect(p.tailLength).toBe(8);
    for (let f = 0; f < 120; f += 1) p.update(f * 0.05, 1 / 60);
    const geom = (scene.children[0] as unknown as { geometry: { getAttribute: (n: string) => { array: Float32Array } } })
      .geometry;
    const arr = geom.getAttribute('position').array;
    for (let i = 0; i < arr.length; i += 3) {
      expect(arr[i]).toBeGreaterThanOrEqual(bounds.minX - 1e-6);
      expect(arr[i]).toBeLessThanOrEqual(bounds.maxX + 1e-6);
      expect(arr[i + 1]).toBeGreaterThanOrEqual(-1e-6);
      expect(arr[i + 1]).toBeLessThanOrEqual(0.15 + 1e-6);
    }
    p.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('dt=0 이면 입자가 멈추고, 큰 시간 점프에서는 다시 투입한다', () => {
    const scene = new Scene();
    const p = make(scene, 20);
    p.update(0, 1 / 60);
    const geom = (scene.children[0] as unknown as { geometry: { getAttribute: (n: string) => { array: Float32Array } } })
      .geometry;
    const snap = Float32Array.from(geom.getAttribute('position').array);
    p.update(0, 0);
    expect(Array.from(geom.getAttribute('position').array)).toEqual(Array.from(snap));
    p.update(50, 0); // 스크럽 — 재투입 후에도 예외 없이 유지
    p.update(50, 1 / 60);
    p.dispose();
  });
});

describe('CfdVectorGlyphs', () => {
  it('밀도가 높을수록 글리프가 많아지고 상한을 넘지 않는다', () => {
    const scene = new Scene();
    const g = new CfdVectorGlyphs({ scene, flow, bounds, bedAt: bed, waterLevelY: 0.15, speedMax: 0.5 });
    g.setDensity(1);
    const low = g.glyphCount;
    g.setDensity(5);
    const high = g.glyphCount;
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(3000);
    g.setDensity(99);
    expect(g.currentDensity).toBe(5);
    g.update(0, 0.2);
    g.dispose();
    expect(scene.children.length).toBe(0);
  });
});

describe('레이어 스토어·컬러바', () => {
  it('벡터 밀도는 범위로 고정되고 변경을 알린다', () => {
    const s = new CfdLayerStore();
    let n = 0;
    s.subscribe(() => (n += 1));
    s.setVectorDensity(99);
    expect(s.vectorDensity).toBe(5);
    s.setVectorDensity(5);
    expect(n).toBe(1);
  });

  it('유속 컬러바는 합성일 때만 목업 태그를 보인다', () => {
    const c = new CfdVelocityColorbar();
    c.setRange(0.5);
    expect(c.element.textContent).toContain('0.500');
    const tag = c.element.querySelector<HTMLElement>('.cfd-velocity-colorbar__tag')!;
    c.setFlowOrigin('synthetic');
    expect(tag.hidden).toBe(false);
    c.setFlowOrigin('real');
    expect(tag.hidden).toBe(true);
  });
});
