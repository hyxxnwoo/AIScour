import '@/styles/main.css';

import { CameraPresets } from '@/components/CameraPresets';
import { CellTimeSeries } from '@/components/CellTimeSeries';
import { ColorLegend } from '@/components/ColorLegend';
import { HudOverlay } from '@/components/HudOverlay';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { MetadataPanel } from '@/components/MetadataPanel';
import { TimeControls } from '@/components/TimeControls';
import { AnimationLoop } from '@/core/AnimationLoop';
import { CameraManager } from '@/core/CameraManager';
import { LightManager } from '@/core/LightManager';
import { RendererManager } from '@/core/RendererManager';
import { SceneManager } from '@/core/SceneManager';
import { createDataSource } from '@/data/createDataSource';
import { Picking } from '@/modules/Picking';
import { PierMarker, type PierDefinition } from '@/modules/PierMarker';
import { Terrain } from '@/modules/Terrain';
import { createFpsMeter } from '@/utils/fpsMeter';
import { captureSceneScreenshot } from '@/utils/screenshot';

const MANIFEST_URL = '/data/flow3d/processed/demo/manifest.json';

// 엔트리 포인트: 모든 코어 매니저 + UI + Picking + PierMarker + 단축키/스크린샷.
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

  // 데이터 소스: manifest.json 이 있으면 실 데이터, 없으면 합성 데이터로 자동 폴백
  const { source, origin } = await createDataSource({
    manifestUrl: MANIFEST_URL,
    syntheticOptions: { width: 96, height: 96, frameCount: 90 },
  });
  const series = await source.load();
  const terrain = new Terrain(sceneManager.scene, series);

  // 메타데이터에 교각이 정의되어 있으면 그대로, 없으면 빈 배열
  const pierDefs: PierDefinition[] = (series.baseTerrain.metadata?.piers ?? []).map((p) => ({
    id: p.id,
    x: p.x,
    z: p.z,
    ...(p.diameter !== undefined ? { diameter: p.diameter } : {}),
    ...(p.height !== undefined ? { height: p.height } : {}),
  }));
  const piers = new PierMarker({ scene: sceneManager.scene, baseElevation: -1.5 }, pierDefs);

  const sceneRadius =
    (Math.hypot(series.baseTerrain.width, series.baseTerrain.height) *
      series.baseTerrain.cellSize) /
    2;

  const hud = new HudOverlay(hudEl, {
    initial: {
      Source: origin === 'manifest' ? `manifest (${MANIFEST_URL})` : 'synthetic (fallback)',
      Grid: `${series.baseTerrain.width}×${series.baseTerrain.height} (cell ${series.baseTerrain.cellSize}m)`,
      Frames: `${terrain.frameCount} (duration ${terrain.durationSeconds.toFixed(1)}s)`,
      Pick: '— (마우스를 지형 위로 이동)',
      Keys: 'Space=Play · ←/→=Seek · R/T/F/X=Camera · P=PNG',
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
      Source: origin,
      Grid: `${series.baseTerrain.width} × ${series.baseTerrain.height}`,
      Cell: `${series.baseTerrain.cellSize} m`,
      Frames: String(terrain.frameCount),
      Duration: `${terrain.durationSeconds.toFixed(1)} s`,
      Piers: String(pierDefs.length),
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

  // 키보드 단축키
  const shortcuts = new KeyboardShortcuts({
    togglePlay: () => timeControls.setPlaying(!timeControls.isPlaying),
    seekRelative: (delta) => timeControls.setTime(timeControls.time + delta),
    seekAbsolute: (t) => timeControls.setTime(t),
    duration: () => terrain.durationSeconds,
    applyPreset: (preset) => cameraManager.applyPreset(preset, sceneRadius),
    screenshot: () => {
      void captureSceneScreenshot(
        rendererManager.renderer,
        sceneManager.scene,
        cameraManager.camera,
      );
    },
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
    shortcuts.dispose();
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
