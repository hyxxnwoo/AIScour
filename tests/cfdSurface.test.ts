import { Scene, ShaderMaterial, type Mesh, type Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SyntheticFluidSource } from '@/data/SyntheticFluidSource';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import { MAX_SURFACE_PIERS, TerrainWater } from '@/modules/TerrainWater';
import { CfdLayerPanel } from '@/components/CfdLayerPanel';
import { CfdLayerStore } from '@/state/cfdLayers';

async function makeWater(): Promise<{ water: TerrainWater; scene: Scene }> {
  const scour = await new SyntheticScourSource({ width: 11, height: 11, cellSize: 1, frameCount: 1 }).load();
  const fluid = await new SyntheticFluidSource({ width: 11, height: 4, depth: 11, cellSize: 1, frameCount: 1 }).load();
  const scene = new Scene();
  const water = new TerrainWater({ scene, scourSeries: scour, fluidSeries: fluid, waterLevel: 1 });
  return { water, scene };
}

function surfaceUniforms(scene: Scene): ShaderMaterial['uniforms'] {
  const mesh = scene.children.find(
    (c) => (c as Mesh).material instanceof ShaderMaterial,
  ) as Mesh;
  return (mesh.material as ShaderMaterial).uniforms;
}

describe('CFD 자유수면 교란', () => {
  it('옵션을 주면 유니폼이 설정되고 null 이면 꺼진다', async () => {
    const { water, scene } = await makeWater();
    const u = surfaceUniforms(scene);
    expect(u['uCfd'].value).toBe(0);
    water.setSurfaceDisturbance({
      piers: [
        { x: 0, z: -1, radius: 0.2 },
        { x: 0, z: 1, radius: 0.2 },
      ],
      inflowSpeed: 0.25,
      gain: 6,
    });
    expect(u['uCfd'].value).toBe(1);
    expect(u['uPierCount'].value).toBe(2);
    expect((u['uPiers'].value as Vector3[])[1].toArray()).toEqual([0, 1, 0.2]);
    water.setSurfaceDisturbance(null);
    expect(u['uCfd'].value).toBe(0);
    expect(u['uPierCount'].value).toBe(0);
    water.dispose();
  });

  it('교각이 상한보다 많아도 상한까지만 반영한다', async () => {
    const { water, scene } = await makeWater();
    water.setSurfaceDisturbance({
      piers: Array.from({ length: MAX_SURFACE_PIERS + 3 }, (_, i) => ({ x: i, z: 0, radius: 0.1 })),
      inflowSpeed: 0.2,
      gain: 1,
    });
    expect(surfaceUniforms(scene)['uPierCount'].value).toBe(MAX_SURFACE_PIERS);
    water.dispose();
  });
});

describe('수면 투명도·목업 표시', () => {
  it('투명도는 0.05~1 로 고정되고 변경을 알린다', () => {
    const s = new CfdLayerStore();
    let n = 0;
    s.subscribe(() => (n += 1));
    s.setSurfaceOpacity(5);
    expect(s.surfaceOpacity).toBe(1);
    s.setSurfaceOpacity(-1);
    expect(s.surfaceOpacity).toBe(0.05);
    expect(n).toBe(2);
  });

  it('수면 레이어는 실데이터여도 목업 태그를 유지하고, 유선은 합성일 때만 보인다', () => {
    const p = new CfdLayerPanel(new CfdLayerStore());
    p.setFlowOrigin('real');
    const tags = [...p.element.querySelectorAll<HTMLElement>('.cfd-layer-panel__tag')];
    const visibleParents = tags
      .filter((t) => !t.hidden)
      .map((t) => t.parentElement?.textContent ?? '');
    expect(visibleParents).toHaveLength(1);
    expect(visibleParents[0]).toContain('수면');
    p.setFlowOrigin('synthetic');
    expect(tags.every((t) => !t.hidden)).toBe(true);
  });
});
