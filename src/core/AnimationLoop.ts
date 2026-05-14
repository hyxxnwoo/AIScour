import type { Disposable } from '@/types/disposable';

export type FrameCallback = (deltaSeconds: number, elapsedSeconds: number) => void;

// AnimationLoop: requestAnimationFrame 기반 렌더 루프를 관리한다.
// 다중 콜백을 등록할 수 있어 카메라 업데이트/씬 갱신/통계 측정 등을 분리할 수 있다.
export class AnimationLoop implements Disposable {
  private rafId: number | null = null;
  private readonly callbacks = new Set<FrameCallback>();
  private lastTimestamp = 0;
  private startTimestamp = 0;
  private running = false;

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.startTimestamp = performance.now();
    this.lastTimestamp = this.startTimestamp;
    this.tick(this.startTimestamp);
  }

  public stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public add(callback: FrameCallback): () => void {
    this.callbacks.add(callback);
    // 등록 해제 함수 반환: 호출자가 lifecycle 을 명시적으로 관리할 수 있다.
    return () => this.callbacks.delete(callback);
  }

  private tick = (timestamp: number): void => {
    if (!this.running) return;
    const deltaSeconds = (timestamp - this.lastTimestamp) / 1000;
    const elapsedSeconds = (timestamp - this.startTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    for (const cb of this.callbacks) {
      cb(deltaSeconds, elapsedSeconds);
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  public dispose(): void {
    this.stop();
    this.callbacks.clear();
  }
}
