import '@/styles/main.css';

import { AnimationLoop } from '@/core/AnimationLoop';
import { CameraManager } from '@/core/CameraManager';
import { LightManager } from '@/core/LightManager';
import { RendererManager } from '@/core/RendererManager';
import { SceneManager } from '@/core/SceneManager';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import { Terrain } from '@/modules/Terrain';
import { createFpsMeter } from '@/utils/fpsMeter';

// 엔트리 포인트: 코어 매니저 + Terrain 모듈을 조립하고 합성 데이터로 렌더 루프를 시작한다.
async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error('#scene-canvas 엘리먼트를 찾을 수 없습니다.');
  }

  const sceneManager = new SceneManager();
  const rendererManager = new RendererManager({ canvas });
  const cameraManager = new CameraManager({
    domElement: canvas,
    aspect: canvas.clientWidth / canvas.clientHeight,
  });
  const lightManager = new LightManager(sceneManager.scene);
  const fpsMeter = createFpsMeter(document.getElementById('app'));
  const loop = new AnimationLoop();

  // 합성 데이터 로딩 → Terrain 생성. 추후 SyntheticScourSource 만 실제 어댑터로 교체하면 된다.
  const dataSource = new SyntheticScourSource({ width: 96, height: 96, frameCount: 90 });
  const series = await dataSource.load();
  const terrain = new Terrain(sceneManager.scene, series);

  // HUD 텍스트 갱신
  const hud = document.getElementById('hud');
  if (hud) {
    hud.textContent = `Bridge Scour Demo · grid ${series.baseTerrain.width}×${series.baseTerrain.height} · ${terrain.frameCount} frames`;
  }

  rendererManager.registerResizeHandler(({ width, height }) => {
    cameraManager.updateAspect(width / height);
  });

  loop.add((_delta, elapsed) => {
    fpsMeter.begin();
    terrain.updateAtTime(elapsed);
    cameraManager.update();
    rendererManager.renderer.render(sceneManager.scene, cameraManager.camera);
    fpsMeter.end();
  });

  loop.start();

  const dispose = (): void => {
    loop.dispose();
    terrain.dispose();
    lightManager.dispose();
    cameraManager.dispose();
    rendererManager.dispose();
    sceneManager.dispose();
    fpsMeter.dispose();
  };
  window.addEventListener('beforeunload', dispose);
  if (import.meta.hot) {
    import.meta.hot.dispose(dispose);
  }
}

bootstrap().catch((err: unknown) => {
  console.error('애플리케이션 부트스트랩 실패:', err);
});
