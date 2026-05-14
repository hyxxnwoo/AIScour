import { WebGLRenderer } from 'three';
import { RENDERER_DEFAULTS } from '@/constants/scene';
import type { Disposable } from '@/types/disposable';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
  maxPixelRatio?: number;
}

export type ContextLossCallback = (event: WebGLContextEvent) => void;

// RendererManager: WebGLRenderer 생성, 픽셀 비율/사이즈 관리, 리사이즈 대응,
// WebGL 컨텍스트 손실/복원 이벤트 처리를 담당한다.
export class RendererManager implements Disposable {
  public readonly renderer: WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly maxPixelRatio: number;
  private resizeListener: (() => void) | undefined;
  private readonly lostListeners = new Set<ContextLossCallback>();
  private readonly restoredListeners = new Set<ContextLossCallback>();

  public constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    this.maxPixelRatio = options.maxPixelRatio ?? RENDERER_DEFAULTS.maxPixelRatio;

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: options.antialias ?? RENDERER_DEFAULTS.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio));
    this.applyCanvasSize();

    // WebGL 컨텍스트 손실은 GPU 드라이버 재시작/탭 비활성화 등으로 발생할 수 있다.
    // preventDefault() 로 브라우저가 자동 복구를 시도하도록 한다.
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    for (const cb of this.lostListeners) cb(event as WebGLContextEvent);
  };

  private onContextRestored = (event: Event): void => {
    for (const cb of this.restoredListeners) cb(event as WebGLContextEvent);
  };

  public onContextLossEvent(listener: ContextLossCallback): () => void {
    this.lostListeners.add(listener);
    return () => this.lostListeners.delete(listener);
  }

  public onContextRestoredEvent(listener: ContextLossCallback): () => void {
    this.restoredListeners.add(listener);
    return () => this.restoredListeners.delete(listener);
  }

  // 외부 호출자가 직접 사이즈 동기화를 트리거할 수 있게 노출한다.
  public applyCanvasSize(): { width: number; height: number } {
    const { clientWidth, clientHeight } = this.canvas;
    // false: 캔버스의 CSS 사이즈를 변경하지 않고 내부 드로잉 버퍼만 조정한다.
    this.renderer.setSize(clientWidth, clientHeight, false);
    return { width: clientWidth, height: clientHeight };
  }

  // 리사이즈 콜백을 등록한다. 카메라 종횡비 갱신을 위해 외부 콜백을 받는다.
  public registerResizeHandler(onResize: (size: { width: number; height: number }) => void): void {
    this.resizeListener = (): void => {
      const size = this.applyCanvasSize();
      onResize(size);
    };
    window.addEventListener('resize', this.resizeListener);
  }

  public dispose(): void {
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = undefined;
    }
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.lostListeners.clear();
    this.restoredListeners.clear();
    this.renderer.dispose();
  }
}
