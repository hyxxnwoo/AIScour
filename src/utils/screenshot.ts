import type { Scene, Camera, WebGLRenderer } from 'three';

// captureSceneScreenshot: 현재 씬을 즉시 다시 렌더 후 캔버스를 PNG 로 다운로드한다.
// preserveDrawingBuffer 가 false 인 기본 설정에서도 toBlob 직전에 render 를 호출하여 안전하게 캡처한다.
//
// 호출자는 fileName 을 지정하거나 자동 timestamp 기반 이름을 사용한다.
export function captureSceneScreenshot(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  fileName?: string,
): Promise<void> {
  // 렌더 호출 직후 toBlob 을 동기적으로 호출해야 드로잉 버퍼가 비워지기 전에 캡처할 수 있다.
  renderer.render(scene, camera);
  const canvas = renderer.domElement;
  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('스크린샷 생성 실패: Blob 이 null 입니다.'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName ?? defaultFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      // URL 해제는 다음 tick 에. 즉시 해제하면 일부 브라우저에서 다운로드 실패 가능.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, 'image/png');
  });
}

function defaultFileName(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `bridge-scour-${ts}.png`;
}
