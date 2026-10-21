import { Mesh, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { SedimentLayer } from '@/modules/SedimentLayer';
import type { ScourSeries } from '@/types/terrain';

function pitSeries(): ScourSeries {
  const width = 7;
  const height = 7;
  const delta = new Float32Array(width * height);
  delta[3 * width + 3] = -0.02; // 가운데 한 칸만 파인 구덩이
  return {
    baseTerrain: {
      width,
      height,
      cellSize: 0.01,
      elevations: new Float32Array(width * height),
    },
    frames: [{ timestampSeconds: 0, deltaElevations: delta }],
  };
}

/** 벽면 꼭짓점 중 가장 높은 y(구덩이 가장자리 높이). */
function wallTopY(scene: Scene): number {
  const mesh = scene.children.find((c): c is Mesh => c instanceof Mesh);
  if (!mesh) throw new Error('sediment mesh not found');
  const pos = mesh.geometry.getAttribute('position');
  const drawCount = mesh.geometry.drawRange.count;
  let top = -Infinity;
  for (let i = 0; i < drawCount; i += 1) top = Math.max(top, pos.getY(i));
  return top;
}

describe('SedimentLayer', () => {
  it('세굴이 있으면 구덩이 벽면을 만든다', () => {
    const scene = new Scene();
    const layer = new SedimentLayer({ scene, series: pitSeries(), thicknessM: 0.08 });
    expect(wallTopY(scene)).toBeLessThan(0);
    layer.dispose();
  });

  it('과장 배율을 키우면 벽면이 지형과 같은 비율로 더 깊어진다', () => {
    const scene = new Scene();
    const layer = new SedimentLayer({ scene, series: pitSeries(), thicknessM: 0.08 });
    const flat = wallTopY(scene);
    layer.setVerticalExaggeration(4);
    const exaggerated = wallTopY(scene);
    expect(exaggerated).toBeLessThan(flat);
    expect(exaggerated).toBeCloseTo(flat * 4, 6);
    layer.dispose();
  });
});
