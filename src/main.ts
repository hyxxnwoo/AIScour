import '@/styles/main.css';

import { CameraPresets } from '@/components/CameraPresets';
import { CellTimeSeries } from '@/components/CellTimeSeries';
import { ColorLegend } from '@/components/ColorLegend';
import { HudOverlay } from '@/components/HudOverlay';
import { MetadataPanel } from '@/components/MetadataPanel';
import { TimeControls } from '@/components/TimeControls';
import { AnimationLoop } from '@/core/AnimationLoop';
import { CameraManager } from '@/core/CameraManager';
import { LightManager } from '@/core/LightManager';
import { RendererManager } from '@/core/RendererManager';
import { SceneManager } from '@/core/SceneManager';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import { Picking } from '@/modules/Picking';
import { PierMarker } from '@/modules/PierMarker';
import { Terrain } from '@/modules/Terrain';
import { createFpsMeter } from '@/utils/fpsMeter';

// 엔트리 포인트: 코어 매니저 + Terrain + UI(타임/HUD/범례/메타/시계열/카메라 프리셋) + Picking + PierMarker.
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

  // 합성 데이터 → Terrain. ManifestSource 로 교체 시:
  //   const dataSource = new ManifestSource({ manifestUrl: '/data/flow3d/processed/demo/manifest.json' });
  const dataSource = new SyntheticScourSource({ width: 96, height: 96, frameCount: 90 });
  const series = await dataSource.load();
  const terrain = new Terrain(sceneManager.scene, series);

  // 데모 교각: 격자 중심에 단일 교각 배치 (실제 데이터에서는 메타에서 위치를 받아온다)
  const piers = new PierMarker({ scene: sceneManager.scene, baseElevation: -1.5 }, [
    { id: 'P1', x: 0, z: 0, diameter: 1.5, height: 8 },
  ]);

  const sceneRadius =
    (Math.hypot(series.baseTerrain.width, series.baseTerrain.height) *
      series.baseTerrain.cellSize) /
    2;

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

  const legend = new ColorLegend({
    title: '세굴 ↔ 퇴적 (Δ elevation)',
    unit: 'm',
    initialAbsMax: terrain.absMax,
  });
  appRoot.appendChild(legend.element);
  terrain.onFrameApplied(({ absMax }) => legend.setRange(absMax));

  const metadataPanel = new MetadataPanel({
    metadata: series.baseTerrain.metadata,
    extra: {
      Grid: `${series.baseTerrain.width} × ${series.baseTerrain.height}`,
      Cell: `${series.baseTerrain.cellSize} m`,
      Frames: String(terrain.frameCount),
      Duration: `${terrain.durationSeconds.toFixed(1)} s`,
    },
  });
  appRoot.appendChild(metadataPanel.element);

  const cellSeries = new CellTimeSeries({ series });
  appRoot.appendChild(cellSeries.element);

  const cameraPresets = new CameraPresets({
    onSelect: (preset) => cameraManager.applyPreset(preset, sceneRadius),
  });
  appRoot.appendChild(cameraPresets.element);

  // WebGL 컨텍스트 손실 안내 배너
  const banner = document.createElement('div');
  banner.className = 'context-banner';
  banner.textContent = 'WebGL 컨텍스트가 손실되었습니다. 복원을 시도하는 중...';
  appRoot.appendChild(banner);
  rendererManager.onContextLossEvent(() => {
    banner.classList.add('is-visible');
    loop.stop();
  });
  rendererManager.onContextRestoredEvent(() => {
    banner.classList.remove('is-visible');
    loop.start();
  });

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
  picking.onClick((hit) => {
    if (!hit) {
      cellSeries.clear();
      cellSeries.element.classList.remove('is-active');
      return;
    }
    const cell = terrain.queryAtWorld(hit.worldX, hit.worldZ);
    if (!cell) return;
    cellSeries.setCell(cell.gridX, cell.gridY);
    cellSeries.element.classList.add('is-active');
  });

  rendererManager.registerResizeHandler(({ width, height }) => {
    cameraManager.updateAspect(width / height);
  });

  loop.add((delta) => {
    fpsMeter.begin();
    timeControls.tick(delta);
    terrain.updateAtTime(timeControls.time);
    cellSeries.setTime(timeControls.time);
    cameraManager.update();
    rendererManager.renderer.render(sceneManager.scene, cameraManager.camera);
    fpsMeter.end();
  });

  loop.start();

  const dispose = (): void => {
    loop.dispose();
    picking.dispose();
    cameraPresets.dispose();
    cellSeries.dispose();
    metadataPanel.dispose();
    legend.dispose();
    timeControls.dispose();
    hud.dispose();
    piers.dispose();
    terrain.dispose();
    lightManager.dispose();
    cameraManager.dispose();
    rendererManager.dispose();
    sceneManager.dispose();
    fpsMeter.dispose();
    banner.remove();
  };
  window.addEventListener('beforeunload', dispose);
  if (import.meta.hot) {
    import.meta.hot.dispose(dispose);
  }
}

bootstrap().catch((err: unknown) => {
  console.error('애플리케이션 부트스트랩 실패:', err);
});
