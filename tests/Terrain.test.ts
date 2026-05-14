import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import { Terrain } from '@/modules/Terrain';

describe('Terrain.queryAtWorld', () => {
  it('월드 좌표가 그리드 중심에 있을 때 중앙 셀을 반환한다', async () => {
    const series = await new SyntheticScourSource({
      width: 11,
      height: 11,
      cellSize: 1,
      frameCount: 3,
    }).load();
    const scene = new Scene();
    const terrain = new Terrain(scene, series);

    const cell = terrain.queryAtWorld(0, 0);
    expect(cell).not.toBeNull();
    expect(cell?.gridX).toBe(5);
    expect(cell?.gridY).toBe(5);
    terrain.dispose();
  });

  it('그리드 외부 좌표는 null 을 반환한다', async () => {
    const series = await new SyntheticScourSource({
      width: 11,
      height: 11,
      cellSize: 1,
      frameCount: 1,
    }).load();
    const scene = new Scene();
    const terrain = new Terrain(scene, series);

    expect(terrain.queryAtWorld(100, 0)).toBeNull();
    expect(terrain.queryAtWorld(0, -100)).toBeNull();
    terrain.dispose();
  });
});
