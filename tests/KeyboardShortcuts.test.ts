import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';

describe('KeyboardShortcuts', () => {
  const handlers = {
    togglePlay: vi.fn(),
    seekRelative: vi.fn(),
    seekAbsolute: vi.fn(),
    duration: vi.fn(() => 60),
    applyPreset: vi.fn(),
    screenshot: vi.fn(),
  };

  let shortcuts: KeyboardShortcuts;

  beforeEach(() => {
    Object.values(handlers).forEach((fn) => fn.mockReset?.());
    handlers.duration.mockReturnValue(60);
    shortcuts = new KeyboardShortcuts(handlers);
  });

  afterEach(() => {
    shortcuts.dispose();
  });

  function press(code: string, init: KeyboardEventInit = {}): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, ...init, bubbles: true }));
  }

  it('Space 는 togglePlay 를 호출한다', () => {
    press('Space');
    expect(handlers.togglePlay).toHaveBeenCalledOnce();
  });

  it('ArrowLeft/Right 는 seekRelative ±1 을 호출한다', () => {
    press('ArrowLeft');
    press('ArrowRight');
    expect(handlers.seekRelative).toHaveBeenNthCalledWith(1, -1);
    expect(handlers.seekRelative).toHaveBeenNthCalledWith(2, 1);
  });

  it('Shift+Arrow 는 ±5 로 가속한다', () => {
    press('ArrowRight', { shiftKey: true });
    expect(handlers.seekRelative).toHaveBeenCalledWith(5);
  });

  it('Home/End 는 0 / duration 으로 점프한다', () => {
    press('Home');
    press('End');
    expect(handlers.seekAbsolute).toHaveBeenNthCalledWith(1, 0);
    expect(handlers.seekAbsolute).toHaveBeenNthCalledWith(2, 60);
  });

  it('R/T/F/X 는 카메라 프리셋을 호출한다', () => {
    press('KeyR');
    press('KeyT');
    press('KeyF');
    press('KeyX');
    const calls = handlers.applyPreset.mock.calls.map((c): unknown => c[0]);
    expect(calls).toEqual(['reset', 'top', 'front', 'side']);
  });

  it('input 포커스 시 단축키를 무시한다', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    expect(handlers.togglePlay).not.toHaveBeenCalled();
    input.remove();
  });
});
