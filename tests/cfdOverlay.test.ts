import { describe, expect, it } from 'vitest';
import { Euler, Quaternion } from 'three';
import { AxisTriad } from '@/components/AxisTriad';
import { CfdFrameReadout } from '@/components/CfdFrameReadout';
import { CfdLayerPanel } from '@/components/CfdLayerPanel';
import { CFD_LAYERS, CfdLayerStore } from '@/state/cfdLayers';

describe('CFD 후처리 UI', () => {
  it('시각·프레임 오버레이는 1 기반 프레임으로 표기한다', () => {
    const r = new CfdFrameReadout();
    r.update(12.34, 4, 90);
    expect(r.element.textContent).toBe('t = 012.3 s / Frame 5 / 90');
    r.update(0, -1, 0);
    expect(r.element.textContent).toBe('t = 000.0 s / Frame 0 / 0');
  });

  it('레이어 스토어는 기본값을 갖고 변경을 알린다', () => {
    const s = new CfdLayerStore();
    expect(s.isOn('bedContour')).toBe(true);
    expect(s.isOn('vectors')).toBe(false);
    let n = 0;
    s.subscribe(() => (n += 1));
    s.set('vectors', true);
    s.set('vectors', true);
    expect(n).toBe(1);
  });

  it('레이어 패널은 8개 항목을 만들고 ready 가 아닌 항목만 잠근다', () => {
    const p = new CfdLayerPanel(new CfdLayerStore());
    const boxes = p.element.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(boxes.length).toBe(CFD_LAYERS.length);
    expect([...boxes].map((b) => !b.disabled)).toEqual(CFD_LAYERS.map((l) => l.ready));
  });

  it('트라이어드는 카메라 정면에서 X 축이 오른쪽을 향한다', () => {
    const t = new AxisTriad();
    t.update(new Quaternion());
    const x = t.element.querySelectorAll('line')[0];
    expect(Number(x.getAttribute('x2'))).toBeGreaterThan(36);
    t.update(new Quaternion().setFromEuler(new Euler(0, Math.PI / 2, 0)));
    expect(Math.abs(Number(x.getAttribute('x2')) - 36)).toBeLessThan(0.5);
  });
});
