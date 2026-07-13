import Stats from 'stats.js';

export interface FpsMeter {
  begin(): void;
  end(): void;
  dispose(): void;
}

export interface FpsMeterOptions {
  /** 우측 레일 등과 겹치지 않도록 `right` 오프셋(px). 기본 12 */
  rightInsetPx?: number;
}

// stats.js 래퍼: DOM 마운트 위치와 패널 종류를 캡슐화한다.
// 추후 자체 HUD 표시로 교체할 가능성을 고려해 인터페이스로 추상화한다.
export function createFpsMeter(container: HTMLElement | null, options?: FpsMeterOptions): FpsMeter {
  const stats = new Stats();
  stats.showPanel(0); // 0 = FPS, 1 = MS, 2 = MB
  const dom = stats.dom;
  dom.style.position = 'absolute';
  dom.style.top = '12px';
  dom.style.right = `${options?.rightInsetPx ?? 12}px`;
  dom.style.left = 'auto';
  (container ?? document.body).appendChild(dom);

  return {
    begin: (): void => {
      stats.begin();
    },
    end: (): void => {
      stats.end();
    },
    dispose: (): void => {
      dom.parentElement?.removeChild(dom);
    },
  };
}
