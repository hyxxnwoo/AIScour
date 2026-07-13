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

  it('setVerticalExaggeration 은 세굴 Δ 만 배율 적용하고 극값은 클램프된다', async () => {
    const series = await new SyntheticScourSource({
      width: 11,
      height: 11,
      cellSize: 1,
      frameCount: 8,
    }).load();
    const scene = new Scene();
    const terrain = new Terrain(scene, series);

    terrain.updateAtTime(1e9);
    terrain.setVerticalExaggeration(2);
    const cell = terrain.queryAtWorld(0, 0);
    expect(cell).not.toBeNull();
    expect(cell!.elevation).toBeCloseTo(cell!.baseElevation + cell!.deltaElevation * 2);

    terrain.setVerticalExaggeration(500);
    expect(terrain.getVerticalExaggeration()).toBe(20);

    terrain.dispose();
  });
});

describe('Terrain scour coloring', () => {
  it('세굴(음수 Δ) 구역은 퇴적 없음(0) 구역보다 청색 계열(b)이 크다', async () => {
    const series = await new SyntheticScourSource({
      width: 11,
      height: 11,
      cellSize: 0.1,
      frameCount: 8,
      pierDiameter: 0.2,
      pier: { x: 0, z: 0 },
    }).load();
    const scene = new Scene();
    const terrain = new Terrain(scene, series);

    terrain.updateAtTime(series.frames.at(-1)!.timestampSeconds);
    const scourCell = terrain.queryAtWorld(-0.2, 0);
    expect(scourCell).not.toBeNull();
    expect(scourCell!.deltaElevation).toBeLessThan(0);

    const farCell = terrain.queryAtWorld(0.45, 0.45);
    expect(farCell).not.toBeNull();
    expect(Math.abs(farCell!.deltaElevation)).toBeLessThan(1e-4);

    const mesh = scene.children[0] as import('three').Mesh;
    const colors = mesh.geometry.getAttribute('color') as import('three').BufferAttribute;
    const scourIdx = scourCell!.gridY * series.baseTerrain.width + scourCell!.gridX;
    const farIdx = farCell!.gridY * series.baseTerrain.width + farCell!.gridX;
    const scourR = colors.getX(scourIdx);
    const farR = colors.getX(farIdx);
    expect(scourR).toBeLessThan(farR);

    terrain.dispose();
  });
});
