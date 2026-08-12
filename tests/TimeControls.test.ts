import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TimeControls } from '@/components/TimeControls';

describe('TimeControls', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('재생 중일 때 tick 이 시간을 진행시키고 onChange 가 호출된다', () => {
    const tc = new TimeControls({ durationSeconds: 10, autoPlay: true, loop: true });
    const cb = vi.fn();
    tc.onChange(cb);

    tc.tick(1.0);
    expect(tc.time).toBeCloseTo(1.0, 5);
    expect(cb).toHaveBeenCalled();
    tc.dispose();
  });

  it('일시정지 상태에서는 tick 으로 시간이 진행되지 않는다', () => {
    const tc = new TimeControls({ durationSeconds: 10, autoPlay: false });
    tc.tick(1.0);
    expect(tc.time).toBe(0);
    tc.dispose();
  });

  it('loop=true 일 때 끝에 도달하면 처음으로 되돌아간다', () => {
    const tc = new TimeControls({ durationSeconds: 5, autoPlay: true, loop: true });
    tc.tick(7); // duration 초과
    expect(tc.time).toBeCloseTo(2, 5);
    expect(tc.isPlaying).toBe(true);
    tc.dispose();
  });

  it('loop=false 일 때 끝에 도달하면 정지하고 duration 으로 클램프된다', () => {
    const tc = new TimeControls({ durationSeconds: 5, autoPlay: true, loop: false });
    tc.tick(10);
    expect(tc.time).toBe(5);
    expect(tc.isPlaying).toBe(false);
    tc.dispose();
  });

  it('simulationDelta 는 일시정지·스크럽 중 0, 재생 중에는 배속을 반영한다', () => {
    const tc = new TimeControls({ durationSeconds: 10, autoPlay: false });
    expect(tc.simulationDelta(0.016)).toBe(0);

    tc.setPlaying(true);
    expect(tc.simulationDelta(0.016)).toBeCloseTo(0.016, 6);

    const speedSelect = tc.element.querySelector('.time-controls__speed') as HTMLSelectElement;
    speedSelect.value = '2';
    speedSelect.dispatchEvent(new Event('change'));
    expect(tc.playbackSpeed).toBe(2);
    expect(tc.simulationDelta(0.016)).toBeCloseTo(0.032, 6);

    tc.setPlaying(false);
    expect(tc.simulationDelta(0.016)).toBe(0);
    tc.dispose();
  });
});
