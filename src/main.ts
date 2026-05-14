import '@/styles/main.css';

import { CameraPresets } from '@/components/CameraPresets';
import { CellTimeSeries } from '@/components/CellTimeSeries';
import { ColorLegend } from '@/components/ColorLegend';
import { FluidControls } from '@/components/FluidControls';
import { HudOverlay } from '@/components/HudOverlay';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { MetadataPanel } from '@/components/MetadataPanel';
import { ScourWarning } from '@/components/ScourWarning';
import { SimParamPanel } from '@/components/SimParamPanel';
import { TimeControls } from '@/components/TimeControls';
import { AnimationLoop } from '@/core/AnimationLoop';
import { CameraManager } from '@/core/CameraManager';
import { LightManager } from '@/core/LightManager';
import { RendererManager } from '@/core/RendererManager';
import { SceneManager } from '@/core/SceneManager';
import { createDataSource } from '@/data/createDataSource';
import { SyntheticFluidSource } from '@/data/SyntheticFluidSource';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import { BridgeCollapse } from '@/modules/BridgeCollapse';
import { FluidSlicePlane } from '@/modules/FluidSlicePlane';
import { Picking } from '@/modules/Picking';
import { PierMarker, type PierDefinition } from '@/modules/PierMarker';
import { Terrain } from '@/modules/Terrain';
import { VelocityArrows } from '@/modules/VelocityArrows';
import type { Scene } from 'three';
import type { FluidSeries } from '@/types/fluid';
import type { ScourSeries } from '@/types/terrain';
import { DEFAULT_SIM_PARAMS, type SimParams } from '@/types/simParams';
import { createFpsMeter } from '@/utils/fpsMeter';
import { captureSceneScreenshot } from '@/utils/screenshot';

const MANIFEST_URL = '/data/flow3d/processed/demo/manifest.json';

// 파라미터에 의존하는 모듈 묶음. Apply 시 통째로 교체.
interface SimState {
  series: ScourSeries;
  fluidSeries: FluidSeries;
  pierDefs: PierDefinition[];
  terrain: Terrain;
  pierMarker: PierMarker;
  bridgeCollapse: BridgeCollapse;
  slicePlane: FluidSlicePlane;
  arrows: VelocityArrows;
  fluidMaxY: number;
  durationSeconds: number;
  dispose(): void;
}

async function buildSimState(
  params: SimParams,
  scene: Scene,
  baseScourSeries: ScourSeries | null, // manifest 에서 받은 베이스 (없으면 합성)
): Promise<SimState> {
  // ── 세굴 데이터
  const scourSrc = new SyntheticScourSource({
    width: 96,
    height: 96,
    cellSize: 0.5,
    frameCount: params.frameCount,
    frameIntervalSeconds: params.frameIntervalSeconds,
    pierDiameter: params.pierDiameter,
    scourRate: params.scourRate,
  });
  const series = baseScourSeries ?? (await scourSrc.load());
  // manifest 를 쓰더라도 파라미터가 바뀌면 합성으로 교체
  const activeSeries = baseScourSeries === null ? series : await scourSrc.load();

  const pierDefs: PierDefinition[] = (activeSeries.baseTerrain.metadata?.piers ?? []).map((p) => ({
    id: p.id,
    x: p.x,
    z: p.z,
    ...(p.diameter !== undefined ? { diameter: p.diameter } : {}),
    ...(p.height !== undefined ? { height: p.height } : {}),
  }));

  const terrain = new Terrain(scene, activeSeries);
  const pierMarker = new PierMarker({ scene, baseElevation: -1.5 }, pierDefs);

  const bridgeCollapse = new BridgeCollapse({
    scene,
    series: activeSeries,
    piers: pierDefs,
    criticalScourDepth: params.criticalScourDepth,
    baseElevation: -1.5,
  });

  // ── 유체 데이터
  const fluidSource = new SyntheticFluidSource({
    width: 48,
    height: 12,
    depth: 32,
    cellSize: 0.5,
    frameCount: params.frameCount,
    inflowSpeed: params.inflowSpeed,
    pier: pierDefs[0]
      ? { x: pierDefs[0].x, z: pierDefs[0].z, radius: params.pierDiameter / 2 }
      : { x: 0, z: 0, radius: params.pierDiameter / 2 },
  });
  const fluidSeries = await fluidSource.load();
  const fluidMaxY = (fluidSeries.grid.height - 1) * fluidSeries.grid.cellSize;

  const slicePlane = new FluidSlicePlane({
    scene,
    series: fluidSeries,
    initialQuantity: 'speed',
    initialHeight: fluidMaxY * 0.4,
  });
  const arrows = new VelocityArrows({ scene, series: fluidSeries, stride: 4 });

  const durationSeconds = Math.max(
    terrain.durationSeconds,
    fluidSeries.frames.at(-1)?.timestampSeconds ?? 0,
  );

  return {
    series: activeSeries,
    fluidSeries,
    pierDefs,
    terrain,
    pierMarker,
    bridgeCollapse,
    slicePlane,
    arrows,
    fluidMaxY,
    durationSeconds,
    dispose() {
      arrows.dispose();
      slicePlane.dispose();
      bridgeCollapse.dispose();
      pierMarker.dispose();
      terrain.dispose();
    },
  };
}

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

  // ── 최초 베이스 데이터 (manifest 있으면 사용, 없으면 null → buildSimState 내부에서 합성)
  const { origin } = await createDataSource({
    manifestUrl: MANIFEST_URL,
    syntheticOptions: { width: 96, height: 96, frameCount: 90 },
  });

  let params: SimParams = { ...DEFAULT_SIM_PARAMS };
  let sim = await buildSimState(params, sceneManager.scene, null);

  const sceneRadius =
    (Math.hypot(sim.series.baseTerrain.width, sim.series.baseTerrain.height) *
      sim.series.baseTerrain.cellSize) /
    2;

  // ── 파라미터 독립적인 UI
  const hud = new HudOverlay(hudEl, {
    initial: {
      Source: origin === 'manifest' ? `manifest (${MANIFEST_URL})` : 'synthetic (fallback)',
      Grid: `${sim.series.baseTerrain.width}×${sim.series.baseTerrain.height} (cell ${sim.series.baseTerrain.cellSize}m)`,
      Frames: `${sim.terrain.frameCount} (duration ${sim.terrain.durationSeconds.toFixed(1)}s)`,
      Fluid: `${sim.fluidSeries.grid.width}×${sim.fluidSeries.grid.height}×${sim.fluidSeries.grid.depth} · ${sim.fluidSeries.frames.length}f`,
      Pick: '— (마우스를 지형 위로 이동)',
      Keys: 'Space=Play · ←/→=Seek · R/T/F/X=Camera · P=PNG',
    },
  });

  const timeControls = new TimeControls({
    durationSeconds: sim.durationSeconds,
    autoPlay: true,
    loop: true,
  });
  appRoot.appendChild(timeControls.element);

  const legend = new ColorLegend({
    title: '세굴 ↔ 퇴적 (Δ elevation)',
    unit: 'm',
    initialAbsMax: sim.terrain.absMax,
  });
  appRoot.appendChild(legend.element);

  const fluidControls = new FluidControls(
    {
      initialQuantity: 'speed',
      minHeight: 0,
      maxHeight: sim.fluidMaxY,
      initialHeight: sim.fluidMaxY * 0.4,
      units: {
        speed: sim.fluidSeries.metadata?.velocityUnit ?? 'm/s',
        pressure: sim.fluidSeries.metadata?.pressureUnit ?? 'Pa',
        density: sim.fluidSeries.metadata?.densityUnit ?? 'kg/m^3',
      },
    },
    {
      onQuantityChange: (q) => {
        sim.slicePlane.setQuantity(q);
        const r = sim.slicePlane.currentRangeForLegend;
        const unit =
          q === 'pressure'
            ? (sim.fluidSeries.metadata?.pressureUnit ?? 'Pa')
            : q === 'density'
              ? (sim.fluidSeries.metadata?.densityUnit ?? 'kg/m^3')
              : (sim.fluidSeries.metadata?.velocityUnit ?? 'm/s');
        fluidControls.setRange(r.min, r.max, unit);
      },
      onSliceHeightChange: (y) => sim.slicePlane.setHeight(y),
      onSliceVisibilityChange: (v) => sim.slicePlane.setVisible(v),
      onArrowsVisibilityChange: (v) => sim.arrows.setVisible(v),
    },
  );
  appRoot.appendChild(fluidControls.element);
  {
    const r = sim.slicePlane.currentRangeForLegend;
    fluidControls.setRange(r.min, r.max, sim.fluidSeries.metadata?.velocityUnit ?? 'm/s');
  }

  const scourWarning = new ScourWarning({
    pierCount: sim.pierDefs.length,
    pierIds: sim.pierDefs.map((p) => p.id),
    criticalDepthM: params.criticalScourDepth,
  });
  appRoot.appendChild(scourWarning.element);

  sim.bridgeCollapse.onCollapse((evt) => {
    scourWarning.showCollapse(evt);
    hud.set('Pick', `⚠ 교각 ${evt.pierId} 붕괴 (t=${evt.timestampSeconds.toFixed(1)}s)`);
  });

  const metadataPanel = new MetadataPanel({
    metadata: sim.series.baseTerrain.metadata,
    extra: {
      Source: origin,
      Grid: `${sim.series.baseTerrain.width} × ${sim.series.baseTerrain.height}`,
      Cell: `${sim.series.baseTerrain.cellSize} m`,
      Frames: String(sim.terrain.frameCount),
      Duration: `${sim.terrain.durationSeconds.toFixed(1)} s`,
      Piers: String(sim.pierDefs.length),
    },
  });
  appRoot.appendChild(metadataPanel.element);

  const cellSeries = new CellTimeSeries({ series: sim.series });
  appRoot.appendChild(cellSeries.element);

  // ── 파라미터 패널
  const simParamPanel = new SimParamPanel(params, {
    onApply: (newParams) => {
      simParamPanel.setLoading(true);
      loop.stop();
      const old = sim;

      void buildSimState(newParams, sceneManager.scene, null).then((next) => {
        old.dispose();
        // ScourWarning 리셋
        scourWarning.element.remove();
        // ScourWarning 은 pierCount 고정(P1) 이므로 재사용하되 내부 상태 리셋
        const newScourWarning = new ScourWarning({
          pierCount: next.pierDefs.length,
          pierIds: next.pierDefs.map((p) => p.id),
          criticalDepthM: newParams.criticalScourDepth,
        });
        // ScourWarning 재삽입 (simParamPanel 앞에)
        appRoot.insertBefore(newScourWarning.element, simParamPanel.element);

        next.bridgeCollapse.onCollapse((evt) => {
          newScourWarning.showCollapse(evt);
          hud.set('Pick', `⚠ 교각 ${evt.pierId} 붕괴 (t=${evt.timestampSeconds.toFixed(1)}s)`);
        });

        // Picking 은 terrain 메쉬가 바뀌므로 새 terrain 의 pickables 로 갱신
        picking.updatePickables(next.terrain.pickables);

        // CellTimeSeries 는 series 교체
        cellSeries.updateSeries(next.series);

        // ColorLegend 범위 리셋
        legend.setRange(next.terrain.absMax);
        next.terrain.onFrameApplied(({ absMax }) => legend.setRange(absMax));

        // TimeControls 기간 갱신
        timeControls.setDuration(next.durationSeconds);
        timeControls.setTime(0);

        // HUD 갱신
        hud.set(
          'Frames',
          `${next.terrain.frameCount} (duration ${next.terrain.durationSeconds.toFixed(1)}s)`,
        );
        hud.set(
          'Fluid',
          `${next.fluidSeries.grid.width}×${next.fluidSeries.grid.height}×${next.fluidSeries.grid.depth} · ${next.fluidSeries.frames.length}f`,
        );

        params = newParams;
        sim = next;
        simParamPanel.setLoading(false);
        loop.start();
      });
    },
  });
  appRoot.appendChild(simParamPanel.element);

  sim.terrain.onFrameApplied(({ absMax }) => legend.setRange(absMax));

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
    pickables: sim.terrain.pickables,
  });
  picking.onHover((hit) => {
    if (!hit) {
      hud.set('Pick', '— (지형 밖)');
      return;
    }
    const cell = sim.terrain.queryAtWorld(hit.worldX, hit.worldZ);
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
    const cell = sim.terrain.queryAtWorld(hit.worldX, hit.worldZ);
    if (!cell) return;
    cellSeries.setCell(cell.gridX, cell.gridY);
    cellSeries.element.classList.add('is-active');
  });

  const shortcuts = new KeyboardShortcuts({
    togglePlay: () => timeControls.setPlaying(!timeControls.isPlaying),
    seekRelative: (delta) => timeControls.setTime(timeControls.time + delta),
    seekAbsolute: (t) => timeControls.setTime(t),
    duration: () => timeControls.time + 1,
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
    const t = timeControls.time;

    sim.terrain.updateAtTime(t);
    sim.bridgeCollapse.updateAtTime(t);
    scourWarning.update(sim.bridgeCollapse.getScourRatios(t), params.criticalScourDepth);
    sim.slicePlane.updateAtTime(t);
    sim.arrows.updateAtTime(t);
    cellSeries.setTime(t);

    {
      const r = sim.slicePlane.currentRangeForLegend;
      const q = sim.slicePlane.currentQuantityName;
      const unit =
        q === 'pressure'
          ? (sim.fluidSeries.metadata?.pressureUnit ?? 'Pa')
          : q === 'density'
            ? (sim.fluidSeries.metadata?.densityUnit ?? 'kg/m^3')
            : (sim.fluidSeries.metadata?.velocityUnit ?? 'm/s');
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
    simParamPanel.dispose();
    fluidControls.dispose();
    legend.dispose();
    timeControls.dispose();
    hud.dispose();
    scourWarning.dispose();
    sim.dispose();
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
