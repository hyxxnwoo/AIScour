import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { SyntheticCfdFlow } from '@/data/cfdFlowField';
import { CfdCutPlane } from '@/modules/CfdCutPlane';
import { CfdLayerPanel } from '@/components/CfdLayerPanel';
import { CfdLayerStore } from '@/state/cfdLayers';

const bounds = { minX: -0.8, maxX: 0.8, minZ: -0.4, maxZ: 0.4 };
const bed = (): number => 0;
const flow = new SyntheticCfdFlow({
  inflowSpeed: 0.25,
  waterLevelY: 0.15,
  bedElevation: bed,
  piers: [{ x: 0, z: 0, radius: 0.04 }],
});

describe('CfdCutPlane', () => {
  const make = (scene: Scene): CfdCutPlane =>
    new CfdCutPlane({ scene, flow, bounds, bedAt: bed, waterLevelY: 0.15, speedMax: 0.5 });

  it('축에 따라 위치 범위가 달라지고 범위 밖은 클램프된다', () => {
    const scene = new Scene();
    const c = make(scene);
    c.setPlane('longitudinal', 9);
    expect(c.currentPosition).toBe(bounds.maxZ);
    c.setPlane('transverse', -9);
    expect(c.currentPosition).toBe(bounds.minX);
    expect(c.positionRange('longitudinal')).toEqual({ min: bounds.minZ, max: bounds.maxZ });
    c.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('유속 컨투어는 유효 영역은 불투명, 교각 내부는 투명하게 칠한다', () => {
    const scene = new Scene();
    const c = make(scene);
    c.setPlane('longitudinal', 0); // 교각 중심을 지나는 종단면
    c.update(0, 0);
    const plane = scene.children[0] as unknown as { material: { map: { image: { data: Uint8Array } } } };
    const px = plane.material.map.image.data;
    const TEX_W = 96;
    const TEX_H = 32;
    // 단면 가운데(교각 위치) 열은 모든 높이에서 고체라 투명
    const mid = Math.floor(TEX_W / 2);
    let solid = 0;
    for (let j = 0; j < TEX_H; j += 1) if (px[(j * TEX_W + mid) * 4 + 3] === 0) solid += 1;
    expect(solid).toBeGreaterThan(TEX_H * 0.8);
    // 상류 첫 열은 유속이 있어 불투명
    let fluid = 0;
    for (let j = 0; j < TEX_H; j += 1) if (px[(j * TEX_W + 1) * 4 + 3] > 0) fluid += 1;
    expect(fluid).toBeGreaterThan(TEX_H * 0.8);
    c.dispose();
  });
});

describe('단면 레이어 패널', () => {
  it('단면 위치는 수동 지정 후 연동 버튼으로 되돌린다', () => {
    const store = new CfdLayerStore();
    let section: 'A' | 'B' = 'A';
    const listeners = new Set<() => void>();
    const panel = new CfdLayerPanel(store, {
      get: () => section,
      set: (s) => {
        section = s;
        listeners.forEach((fn) => fn());
      },
      subscribe: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    });
    const cut = panel.element.querySelector<HTMLElement>('.cfd-layer-panel__cut')!;
    expect(store.cutPosition).toBeNull();
    const range = cut.querySelector<HTMLInputElement>('input[type=range]')!;
    range.value = '30';
    range.dispatchEvent(new Event('input'));
    expect(store.cutPosition).toBeCloseTo(0.3, 5);
    cut.querySelector<HTMLButtonElement>('.cfd-layer-panel__link')!.click();
    expect(store.cutPosition).toBeNull();
    cut.querySelectorAll<HTMLButtonElement>('.cfd-layer-panel__seg button')[1].click();
    expect(section).toBe('B');
  });
});
