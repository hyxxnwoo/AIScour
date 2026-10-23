import { describe, expect, it } from 'vitest';
import { cfdVelocityGradientCss, sampleCfdVelocityColor } from '@/utils/cfdVelocityColor';
import { sampleCfdScourColor } from '@/utils/cfdScourColor';
import { GRADES } from '@/constants/grade';

const rgbDist = (a: number[], b: number[]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const hex = (h: string): number[] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

describe('CFD 유속 컬러맵', () => {
  it('등급 4색·세굴 컬러맵 주요 색과 충분히 떨어져 있다', () => {
    const avoid: number[][] = GRADES.map((g) => hex(g.color));
    const c = { r: 0, g: 0, b: 0 };
    for (const d of [-1, -0.5, 0.5, 1]) {
      sampleCfdScourColor(d, 1, c);
      avoid.push([c.r * 255, c.g * 255, c.b * 255]);
    }
    let minDist = Infinity;
    for (let v = 0; v <= 1.0001; v += 0.02) {
      sampleCfdVelocityColor(v, 0, 1, c);
      for (const a of avoid) {
        minDist = Math.min(minDist, rgbDist([c.r * 255, c.g * 255, c.b * 255], a));
      }
    }
    expect(minDist).toBeGreaterThan(35);
  });

  it('범위 밖은 양 끝 색으로 고정되고 CSS 그라디언트를 만든다', () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 0, g: 0, b: 0 };
    sampleCfdVelocityColor(-5, 0, 1, a);
    sampleCfdVelocityColor(0, 0, 1, b);
    expect(a).toEqual(b);
    expect(cfdVelocityGradientCss()).toContain('linear-gradient');
  });
});
