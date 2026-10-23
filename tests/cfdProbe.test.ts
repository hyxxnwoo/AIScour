import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { SyntheticCfdFlow } from '@/data/cfdFlowField';
import { computeCfdProbe } from '@/utils/cfdProbe';
import { CfdProbePanel } from '@/components/CfdProbePanel';
import { CfdProbeMarker } from '@/modules/CfdProbeMarker';

const bed = (): number => 0;
const flow = new SyntheticCfdFlow({
  inflowSpeed: 0.25,
  waterLevelY: 0.15,
  bedElevation: bed,
  piers: [{ x: 0, z: 0, radius: 0.04 }],
});
const base = { flow, baseElevation: 0, waterLevelY: 0.15, t: 0, elevation: -0.01, deltaElevation: -0.01 };

describe('CFD 클릭 프로브', () => {
  it('하상 한 점의 좌표·표고 변화·유속·전단응력을 돌려준다', () => {
    const p = computeCfdProbe({ ...base, x: -0.5, z: 0.3 });
    expect(p.noFlow).toBe(false);
    expect(p.x).toBe(-0.5);
    expect(p.z).toBe(0.3);
    expect(p.y).toBe(-0.01);
    expect(p.deltaElevation).toBe(-0.01);
    expect(p.speed).toBeGreaterThan(0.2);
    expect(p.shearStress).toBeGreaterThan(0);
  });

  it('교각 내부는 유속 없음으로 표시한다', () => {
    const p = computeCfdProbe({ ...base, x: 0.01, z: 0 });
    expect(p.noFlow).toBe(true);
    expect(p.speed).toBe(0);
  });

  it('패널은 값과 목업·잠정 표시를 그리고 null 이면 숨는다', () => {
    let closed = 0;
    const panel = new CfdProbePanel(() => (closed += 1));
    panel.setSample(computeCfdProbe({ ...base, x: -0.5, z: 0.3 }));
    const text = panel.element.textContent ?? '';
    expect(panel.element.classList.contains('is-hidden')).toBe(false);
    expect(text).toContain('X (흐름)');
    expect(text).toContain('표고 변화');
    expect(text).toContain('전단응력');
    expect(text).toContain('목업');
    expect(text).toContain('잠정');
    panel.setFlowOrigin('real');
    panel.setSample(computeCfdProbe({ ...base, x: -0.5, z: 0.3 }));
    expect(panel.element.textContent).not.toContain('목업');
    panel.element.querySelector<HTMLButtonElement>('.cfd-probe-panel__close')!.click();
    expect(closed).toBe(1);
    panel.setSample(null);
    expect(panel.element.classList.contains('is-hidden')).toBe(true);
  });

  it('마커는 위치를 지정하면 보이고 dispose 하면 씬에서 사라진다', () => {
    const scene = new Scene();
    const m = new CfdProbeMarker(scene, 0.03);
    expect(m.visible).toBe(false);
    m.setPosition(0.1, 0, 0.2);
    expect(m.visible).toBe(true);
    m.hide();
    expect(m.visible).toBe(false);
    m.dispose();
    expect(scene.children.length).toBe(0);
  });
});
