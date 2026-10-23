import { describe, expect, it } from 'vitest';
import { renderSemiRemainGauge } from '@/viz/gauge';

/** 반원 게이지: 등급 색 띠가 바늘·눈금과 같은 위쪽 반원(중심 y 이하로 내려가지 않음)에 그려져야 한다. */
describe('renderSemiRemainGauge', () => {
  it('등급 색 띠 경로의 모든 꼭짓점 y 가 중심선(cy)보다 위쪽에 있다', () => {
    const size = 128;
    const cy = size * 0.58;
    const html = renderSemiRemainGauge({ valuePct: 28, size, showGradeTicks: true });
    const paths = [...html.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    expect(paths.length).toBe(4);
    for (const d of paths) {
      // M x1 y1 A r r 0 large 1 x2 y2 L xi2 yi2 A ri ri 0 large 0 xi1 yi1 Z → 점 좌표의 y 위치
      const nums = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      for (const idx of [1, 8, 10, 17]) expect(nums[idx]).toBeLessThanOrEqual(cy + 0.01);
    }
  });

  it('바늘은 위쪽 반원 방향을 가리킨다', () => {
    const html = renderSemiRemainGauge({ valuePct: 100, size: 100 });
    const m = html.match(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="(-?[\d.]+)"[^>]*stroke-linecap="round"/)!;
    expect(m).not.toBeNull();
    expect(Number(m[4])).toBeLessThanOrEqual(Number(m[2]) + 1e-6);
  });

  it('보조 라벨은 SVG 높이 안에 들어간다', () => {
    const html = renderSemiRemainGauge({ valuePct: 0, size: 128, label: 'P1 · 여유' });
    const vb = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
    const labelY = Number(html.match(/y="([\d.]+)" text-anchor="middle" fill="#9FB6C8"/)![1]);
    expect(labelY).toBeLessThan(Number(vb[2]));
  });
});
