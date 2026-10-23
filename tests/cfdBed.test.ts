import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { Terrain } from '@/modules/Terrain';
import { cfdScourGradientCss, sampleCfdScourColor } from '@/utils/cfdScourColor';
import { computeIsolines, niceIsolineStep } from '@/utils/isolines';
import type { ScourSeries } from '@/types/terrain';

describe('CFD 하상 컬러맵', () => {
  const c = { r: 0, g: 0, b: 0 };

  it('0 은 흰색, 세굴은 적색, 퇴적은 청색', () => {
    sampleCfdScourColor(0, 1, c);
    expect([c.r, c.g, c.b]).toEqual([1, 1, 1]);
    sampleCfdScourColor(-1, 1, c);
    expect(c.r).toBeGreaterThan(c.b);
    sampleCfdScourColor(1, 1, c);
    expect(c.b).toBeGreaterThan(c.r);
  });

  it('범위를 벗어난 값은 양 끝 색으로 고정되고 absMax=0 이면 흰색', () => {
    sampleCfdScourColor(-9, 1, c);
    const a = { ...c };
    sampleCfdScourColor(-1, 1, c);
    expect(a).toEqual(c);
    sampleCfdScourColor(5, 0, c);
    expect([c.r, c.g, c.b]).toEqual([1, 1, 1]);
    expect(cfdScourGradientCss()).toContain('linear-gradient');
  });
});

describe('등심선', () => {
  it('간격은 absMax 의 약 1/4 이고 0.5 m 를 넘지 않는다', () => {
    expect(niceIsolineStep(0.04)).toBeCloseTo(0.01, 10);
    expect(niceIsolineStep(100)).toBe(0.5);
    expect(niceIsolineStep(0)).toBe(0.5);
  });

  it('경사면에서 등치선 위치가 선형 보간과 일치한다', () => {
    // x 방향으로 증가하는 4x2 격자, step 1 → x=1, x=2 에 선이 생긴다.
    const values = [0, 1, 2, 2.5, 0, 1, 2, 2.5];
    const segs: Array<[number, number, number, number, number]> = [];
    computeIsolines(values, 4, 2, 1, (k, ax, ay, bx, by) => segs.push([k, ax, ay, bx, by]));
    const levels = segs.map((s) => s[0]).sort();
    expect(levels).toEqual([1, 2]);
    for (const [k, ax, , bx] of segs) {
      expect(ax).toBeCloseTo(k, 10);
      expect(bx).toBeCloseTo(k, 10);
    }
  });

  it('0 등치선은 만들지 않고, 안장점은 선분 2개를 낸다', () => {
    const flat: number[] = [];
    computeIsolines([0, 0, 0, 0], 2, 2, 1, (...a) => flat.push(a[0]));
    expect(flat).toEqual([]);
    const n: number[] = [];
    computeIsolines([1.5, 0, 0, 1.5], 2, 2, 1, (k) => n.push(k));
    expect(n.length).toBe(2);
  });
});

describe('Terrain CFD 표현', () => {
  const series: ScourSeries = {
    baseTerrain: { width: 4, height: 4, cellSize: 0.1, elevations: new Float32Array(16) },
    frames: [
      {
        timestampSeconds: 0,
        deltaElevations: Float32Array.from({ length: 16 }, (_, i) => -0.01 * (i % 4)),
      },
    ],
  };

  it('색 방식과 등심선·와이어프레임을 바꿔도 예외 없이 동작하고 dispose 된다', () => {
    const scene = new Scene();
    const t = new Terrain(scene, series);
    const before = scene.children.length;
    t.setColorMode('cfd');
    t.setIsolinesVisible(true);
    t.setWireframeVisible(true);
    expect(scene.children.length).toBeGreaterThan(before);
    t.setIsolineStep(0.005);
    t.setColorMode('plain');
    t.setColorMode('basic');
    t.setIsolinesVisible(false);
    t.setWireframeVisible(false);
    t.dispose();
    expect(scene.children.length).toBe(0);
  });
});
