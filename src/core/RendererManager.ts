import { WebGLRenderer } from 'three';
import { RENDERER_DEFAULTS } from '@/constants/scene';
import type { Disposable } from '@/types/disposable';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
  maxPixelRatio?: number;
}

// RendererManager: WebGLRenderer 생성, 픽셀 비율/사이즈 관리, 리사이즈 대응을 담당한다.
// 윈도우 리사이즈 핸들러를 직접 등록하여 호출자는 별도 보일러플레이트 없이 사용할 수 있다.
export class RendererManager implements Disposable {
  public readonly renderer: WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly maxPixelRatio: number;
  private resizeListener: (() => void) | undefined;

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
    this.renderer.dispose();
  }
}
