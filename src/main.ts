import '@/styles/main.css';

import { CameraPresets } from '@/components/CameraPresets';
import { CellTimeSeries } from '@/components/CellTimeSeries';
import { ColorLegend } from '@/components/ColorLegend';
import { FluidControls } from '@/components/FluidControls';
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
import { SyntheticFluidSource } from '@/data/SyntheticFluidSource';
import { FluidSlicePlane } from '@/modules/FluidSlicePlane';
import { Picking } from '@/modules/Picking';
import { PierMarker, type PierDefinition } from '@/modules/PierMarker';
import { Terrain } from '@/modules/Terrain';
import { VelocityArrows } from '@/modules/VelocityArrows';
import { createFpsMeter } from '@/utils/fpsMeter';
import { captureSceneScreenshot } from '@/utils/screenshot';

const MANIFEST_URL = '/data/flow3d/processed/demo/manifest.json';

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

  // ── 지형/세굴 데이터
  const { source, origin } = await createDataSource({
    manifestUrl: MANIFEST_URL,
    syntheticOptions: { width: 96, height: 96, frameCount: 90 },
  });
  const series = await source.load();
  const terrain = new Terrain(sceneManager.scene, series);

  const pierDefs: PierDefinition[] = (series.baseTerrain.metadata?.piers ?? []).map((p) => ({
    id: p.id,
    x: p.x,
    z: p.z,
    ...(p.diameter !== undefined ? { diameter: p.diameter } : {}),
    ...(p.height !== undefined ? { height: p.height } : {}),
  }));
  const piers = new PierMarker({ scene: sceneManager.scene, baseElevation: -1.5 }, pierDefs);

  // ── 유체 데이터 (현재는 합성 데이터만 지원, 추후 ManifestFluidSource 추가 가능)
  const fluidSource = new SyntheticFluidSource({
    width: 48,
    height: 12,
    depth: 32,
    cellSize: 0.5,
    frameCount: 90,
    pier: pierDefs[0]
      ? { x: pierDefs[0].x, z: pierDefs[0].z, radius: (pierDefs[0].diameter ?? 1.5) / 2 }
      : { x: 0, z: 0, radius: 0.75 },
  });
  const fluidSeries = await fluidSource.load();
  const fluidMaxY = (fluidSeries.grid.height - 1) * fluidSeries.grid.cellSize;

  const slicePlane = new FluidSlicePlane({
    scene: sceneManager.scene,
    series: fluidSeries,
    initialQuantity: 'speed',
    initialHeight: fluidMaxY * 0.4,
  });
  const arrows = new VelocityArrows({
    scene: sceneManager.scene,
    series: fluidSeries,
    stride: 4,
  });

  const sceneRadius =
    (Math.hypot(series.baseTerrain.width, series.baseTerrain.height) *
      series.baseTerrain.cellSize) /
    2;

  const hud = new HudOverlay(hudEl, {
    initial: {
      Source: origin === 'manifest' ? `manifest (${MANIFEST_URL})` : 'synthetic (fallback)',
      Grid: `${series.baseTerrain.width}×${series.baseTerrain.height} (cell ${series.baseTerrain.cellSize}m)`,
      Frames: `${terrain.frameCount} (duration ${terrain.durationSeconds.toFixed(1)}s)`,
      Fluid: `${fluidSeries.grid.width}×${fluidSeries.grid.height}×${fluidSeries.grid.depth} · ${fluidSeries.frames.length}f`,
      Pick: '— (마우스를 지형 위로 이동)',
      Keys: 'Space=Play · ←/→=Seek · R/T/F/X=Camera · P=PNG',
    },
  });

  const timeControls = new TimeControls({
    durationSeconds: Math.max(
      terrain.durationSeconds,
      fluidSeries.frames.at(-1)?.timestampSeconds ?? 0,
    ),
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

  // 유체 컨트롤 (좌측 상단)
  const fluidControls = new FluidControls(
    {
      initialQuantity: 'speed',
      minHeight: 0,
      maxHeight: fluidMaxY,
      initialHeight: fluidMaxY * 0.4,
      units: {
        speed: fluidSeries.metadata?.velocityUnit ?? 'm/s',
        pressure: fluidSeries.metadata?.pressureUnit ?? 'Pa',
        density: fluidSeries.metadata?.densityUnit ?? 'kg/m^3',
      },
    },
    {
      onQuantityChange: (q) => {
        slicePlane.setQuantity(q);
        const r = slicePlane.currentRangeForLegend;
        const unit =
          q === 'pressure'
            ? (fluidSeries.metadata?.pressureUnit ?? 'Pa')
            : q === 'density'
              ? (fluidSeries.metadata?.densityUnit ?? 'kg/m^3')
              : (fluidSeries.metadata?.velocityUnit ?? 'm/s');
        fluidControls.setRange(r.min, r.max, unit);
      },
      onSliceHeightChange: (y) => slicePlane.setHeight(y),
      onSliceVisibilityChange: (v) => slicePlane.setVisible(v),
      onArrowsVisibilityChange: (v) => arrows.setVisible(v),
    },
  );
  appRoot.appendChild(fluidControls.element);
  // 초기 범위 라벨 갱신
  {
    const r = slicePlane.currentRangeForLegend;
    fluidControls.setRange(r.min, r.max, fluidSeries.metadata?.velocityUnit ?? 'm/s');
  }

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

  const shortcuts = new KeyboardShortcuts({
    togglePlay: () => timeControls.setPlaying(!timeControls.isPlaying),
    seekRelative: (delta) => timeControls.setTime(timeControls.time + delta),
    seekAbsolute: (t) => timeControls.setTime(t),
    duration: () => timeControls.time + 1, // duration getter 가 없어 단순 구현; 0/end 점프는 setAbsolute 가 클램프
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
    slicePlane.updateAtTime(timeControls.time);
    arrows.updateAtTime(timeControls.time);
    cellSeries.setTime(timeControls.time);
    // 슬라이스 범위가 시간/양 변경에 따라 갱신될 수 있으므로 매 프레임 라벨 동기화
    {
      const r = slicePlane.currentRangeForLegend;
      const q = slicePlane.currentQuantityName;
      const unit =
        q === 'pressure'
          ? (fluidSeries.metadata?.pressureUnit ?? 'Pa')
          : q === 'density'
            ? (fluidSeries.metadata?.densityUnit ?? 'kg/m^3')
            : (fluidSeries.metadata?.velocityUnit ?? 'm/s');
      fluidControls.setRange(r.min, r.max, unit);
    }
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
    fluidControls.dispose();
    legend.dispose();
    timeControls.dispose();
    hud.dispose();
    arrows.dispose();
    slicePlane.dispose();
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
