import { describe, expect, it } from 'vitest';
import {
  CaseSwitcher,
  DEFAULT_HEIGHT_EXAGGERATION,
  type CaseSwitcherItem,
} from '@/components/CaseSwitcher';
import { FLOW_SCENARIOS, type FlowScenario } from '@/constants/scenarios';

function scenario(id: string): FlowScenario {
  const found = FLOW_SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`scenario not found: ${id}`);
  return found;
}

function item(name: string, id?: string): CaseSwitcherItem {
  return { name, scenario: id ? scenario(id) : null };
}

describe('CaseSwitcher', () => {
  it('케이스가 없으면 숨기고, 1개면 선택 상자 없이 보이고, 2개 이상이면 선택 상자가 보인다', () => {
    const sw = new CaseSwitcher();
    expect(sw.element.hidden).toBe(true);

    sw.setCases([item('s01', 'S01')]);
    expect(sw.element.hidden).toBe(false);
    expect(sw.element.querySelector<HTMLElement>('.case-switcher__row')?.hidden).toBe(true);

    sw.setCases([item('s01', 'S01'), item('s02', 'S02')]);
    expect(sw.element.querySelector<HTMLElement>('.case-switcher__row')?.hidden).toBe(false);
    expect(sw.element.querySelectorAll('#case-switcher-select option')).toHaveLength(2);

    sw.setCases([]);
    expect(sw.element.hidden).toBe(true);
    sw.dispose();
  });

  it('시나리오가 있으면 옵션에 ID·변경 변수를 쓰고, 없으면 케이스 이름을 쓴다', () => {
    const sw = new CaseSwitcher();
    sw.setCases([item('s02', 'S02'), item('run_a')]);
    const labels = [...sw.element.querySelectorAll('#case-switcher-select option')].map(
      (o) => o.textContent,
    );
    expect(labels).toEqual(['S02 · ① 하상·퇴적물 입경', 'run_a']);
    sw.dispose();
  });

  it('선택을 바꾸면 인덱스로 알려 주고 조건 표시가 바뀐다', () => {
    const sw = new CaseSwitcher();
    sw.setCases([item('s01', 'S01'), item('s02', 'S02'), item('s03', 'S03')], 0);
    const picked: number[] = [];
    sw.onChange((i) => picked.push(i));
    expect(sw.element.textContent).toContain('S01 · 기준조건');

    const select = sw.element.querySelector('select') as HTMLSelectElement;
    select.value = '2';
    select.dispatchEvent(new Event('change'));

    expect(picked).toEqual([2]);
    expect(sw.selectedIndex).toBe(2);
    expect(sw.element.textContent).toContain('S03 · ① 하상·퇴적물 입경');
    expect(sw.element.textContent).toContain('0.25 mm');
    sw.dispose();
  });

  it('기준(S01)과 다른 조건만 강조한다', () => {
    const sw = new CaseSwitcher();
    sw.setCases([item('s09', 'S09')]);
    const changed = [...sw.element.querySelectorAll('dd.is-changed')].map((e) => e.textContent);
    expect(changed).toEqual(['0.08 m']); // 수심만 다름
    const labels = [...sw.element.querySelectorAll('dt.is-changed')].map((e) => e.textContent);
    expect(labels).toEqual(['수심']);

    sw.setCases([item('s01', 'S01')]);
    expect(sw.element.querySelectorAll('.is-changed')).toHaveLength(0);
    sw.dispose();
  });

  it('하단부 형상 시나리오는 형상 이름을 보여 준다', () => {
    const sw = new CaseSwitcher();
    sw.setCases([item('s29', 'S29')]);
    expect(sw.element.textContent).toContain('타원형');
    expect(sw.element.querySelectorAll('dt.is-changed')[0]?.textContent).toBe('하단부');
    sw.dispose();
  });

  it('시나리오가 없는 케이스는 조건 표시를 숨긴다', () => {
    const sw = new CaseSwitcher();
    sw.setCases([item('run_a'), item('run_b')]);
    expect(sw.element.querySelector<HTMLElement>('.case-switcher__info')?.hidden).toBe(true);
    sw.dispose();
  });

  it('setCases 는 선택 위치를 범위 안으로 맞춘다', () => {
    const sw = new CaseSwitcher();
    sw.setCases([item('s01', 'S01'), item('s02', 'S02')], 9);
    expect(sw.selectedIndex).toBe(1);
    sw.dispose();
  });

  it('뷰어 화면이 아니면 is-hidden 으로 가린다', () => {
    const sw = new CaseSwitcher();
    sw.setCases([item('s01', 'S01'), item('s02', 'S02')]);
    sw.setScreenVisible(false);
    expect(sw.element.classList.contains('is-hidden')).toBe(true);
    sw.setScreenVisible(true);
    expect(sw.element.classList.contains('is-hidden')).toBe(false);
    sw.dispose();
  });

  it('Z 스케일은 기본 ×1(실제 비율)이고 바꾸면 배율을 알려 준다', () => {
    const sw = new CaseSwitcher();
    sw.setCases([item('s01', 'S01')]);
    expect(sw.exaggeration).toBe(DEFAULT_HEIGHT_EXAGGERATION);
    expect(DEFAULT_HEIGHT_EXAGGERATION).toBe(1);

    const seen: number[] = [];
    sw.onExaggerationChange((f) => seen.push(f));
    const select = sw.element.querySelector<HTMLSelectElement>('#case-switcher-exaggeration');
    if (!select) throw new Error('exaggeration select missing');
    expect([...select.options].map((o) => o.value)).toEqual(['1', '2', '4']);
    select.value = '2';
    select.dispatchEvent(new Event('change'));

    expect(seen).toEqual([2]);
    expect(sw.exaggeration).toBe(2);
    sw.dispose();
  });

  it('「교각 주변만 표시」는 기본으로 켜져 있고 바꾸면 알려 준다', () => {
    const sw = new CaseSwitcher();
    sw.setCases([item('s01', 'S01')]);
    expect(sw.regionOnly).toBe(true);

    const seen: boolean[] = [];
    sw.onRegionChange((v) => seen.push(v));
    const box = sw.element.querySelector<HTMLInputElement>('.case-switcher__region input');
    if (!box) throw new Error('region checkbox missing');
    box.checked = false;
    box.dispatchEvent(new Event('change'));

    expect(seen).toEqual([false]);
    expect(sw.regionOnly).toBe(false);
    sw.dispose();
  });
});
