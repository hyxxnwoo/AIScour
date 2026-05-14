import '@/styles/main.css';

import { HudOverlay } from '@/components/HudOverlay';
import { TimeControls } from '@/components/TimeControls';
import { AnimationLoop } from '@/core/AnimationLoop';
import { CameraManager } from '@/core/CameraManager';
import { LightManager } from '@/core/LightManager';
import { RendererManager } from '@/core/RendererManager';
import { SceneManager } from '@/core/SceneManager';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import { Picking } from '@/modules/Picking';
import { Terrain } from '@/modules/Terrain';
import { createFpsMeter } from '@/utils/fpsMeter';

// 엔트리 포인트: 코어 매니저 + Terrain + TimeControls + Picking 을 조립한다.
async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement | null;
  const appRoot = document.getElementById('app');
  const hudEl = document.getElementById('hud');
  if (!canvas || !appRoot || !hudEl) {
    throw new Error('필수 DOM (#scene-canvas, #app, #hud) 을 찾을 수 없습니다.');
  }

  const sceneManager = new SceneManager();
  const rendererManager = new RendererManager({ canvas });
  const cameraManager = new CameraManager({
    domElement: canvas,
    aspect: canvas.clientWidth / canvas.clientHeight,
  });
  const lightManager = new LightManager(sceneManager.scene);
  const fpsMeter = createFpsMeter(appRoot);
  const loop = new AnimationLoop();

  // 합성 데이터 로딩 → Terrain 생성. 추후 SyntheticScourSource 만 실제 어댑터로 교체하면 된다.
  const dataSource = new SyntheticScourSource({ width: 96, height: 96, frameCount: 90 });
  const series = await dataSource.load();
  const terrain = new Terrain(sceneManager.scene, series);

  const hud = new HudOverlay(hudEl, {
    initial: {
      Grid: `${series.baseTerrain.width}×${series.baseTerrain.height} (cell ${series.baseTerrain.cellSize}m)`,
      Frames: `${terrain.frameCount} (duration ${terrain.durationSeconds.toFixed(1)}s)`,
      Pick: '— (마우스를 지형 위로 이동)',
    },
  });

  const timeControls = new TimeControls({
    durationSeconds: terrain.durationSeconds,
    autoPlay: true,
    loop: true,
  });
  appRoot.appendChild(timeControls.element);

  const picking = new Picking({
    canvas,
    camera: cameraManager.camera,
    pickables: terrain.pickables,
  });
  picking.onHover((hit) => {
    if (!hit) {
      hud.set('Pick', '— (지형 밖)');
      return;
    }
    const cell = terrain.queryAtWorld(hit.worldX, hit.worldZ);
    if (!cell) {
      hud.set('Pick', '— (지형 밖)');
      return;
    }
    hud.set(
      'Pick',
      `cell (${cell.gridX}, ${cell.gridY}) · base ${cell.baseElevation.toFixed(2)}m · Δ ${cell.deltaElevation.toFixed(2)}m · z ${cell.elevation.toFixed(2)}m`,
    );
  });

  rendererManager.registerResizeHandler(({ width, height }) => {
    cameraManager.updateAspect(width / height);
  });

  loop.add((delta) => {
    fpsMeter.begin();
    timeControls.tick(delta);
    terrain.updateAtTime(timeControls.time);
    cameraManager.update();
    rendererManager.renderer.render(sceneManager.scene, cameraManager.camera);
    fpsMeter.end();
  });

  loop.start();

  const dispose = (): void => {
    loop.dispose();
    picking.dispose();
    timeControls.dispose();
    hud.dispose();
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
