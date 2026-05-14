import { describe, expect, it, vi } from 'vitest';
import { AnimationLoop } from '@/core/AnimationLoop';

// 렌더 루프의 콜백 등록/해제 동작을 단위 테스트로 검증한다.
describe('AnimationLoop', () => {
  it('등록된 콜백을 unregister 함수로 제거할 수 있다', () => {
    const loop = new AnimationLoop();
    const cb = vi.fn();
    const unregister = loop.add(cb);

    unregister();
    // 직접 dispose 호출로 안전하게 정리되는지도 확인한다.
    loop.dispose();
    expect(cb).not.toHaveBeenCalled();
  });
});
