import '@/styles/main.css';

import { CameraPresets } from '@/components/CameraPresets';
import { CellTimeSeries } from '@/components/CellTimeSeries';
import { ColorLegend } from '@/components/ColorLegend';
import { CsvUploadPanel } from '@/components/CsvUploadPanel';
import { DashboardCustomizePanel } from '@/components/DashboardCustomizePanel';
import { FluidControls, fluidDashboardLabel, type FluidRangeEntry } from '@/components/FluidControls';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { ScourWarning } from '@/components/ScourWarning';
import { TimeControls } from '@/components/TimeControls';
import { AnimationLoop } from '@/core/AnimationLoop';
import { CameraManager } from '@/core/CameraManager';
import { LightManager } from '@/core/LightManager';
import { RendererManager } from '@/core/RendererManager';
import { SceneManager } from '@/core/SceneManager';
import { createDataSource } from '@/data/createDataSource';
import { probeAtTime, type SampleProbeSeries } from '@/data/buildSampleProbeDashboard';
import { SyntheticFluidSource } from '@/data/SyntheticFluidSource';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import { FluidSlicePlane } from '@/modules/FluidSlicePlane';
import { FluidQuantityPoints } from '@/modules/FluidQuantityPoints';
import { FluidTracers } from '@/modules/FluidTracers';
import { Picking } from '@/modules/Picking';
import { PierMarker, type PierDefinition } from '@/modules/PierMarker';
import { SedimentLayer } from '@/modules/SedimentLayer';
import { Terrain } from '@/modules/Terrain';
import { TerrainWater } from '@/modules/TerrainWater';
import { VelocityArrows } from '@/modules/VelocityArrows';
import { Vector3 } from 'three';
import type { Scene } from 'three';
import { ExperimentInfoPanel } from '@/components/ExperimentInfoPanel';
import { FlowDirectionBadge } from '@/components/FlowDirectionBadge';
import {
  fluidGridDims,
  paramsToFlumeGeometry,
  structureCenterX,
  terrainGridDims,
} from '@/constants/experiment';
import type { FluidQuantity, FluidSeries } from '@/types/fluid';
import type { ScourSeries } from '@/types/terrain';
import { DEFAULT_SIM_PARAMS, frameIntervalSeconds, mergePanelParams, type SimParams } from '@/types/simParams';
import { createFpsMeter } from '@/utils/fpsMeter';
import { captureSceneScreenshot } from '@/utils/screenshot';
import { injectScrdifFromScour } from '@/utils/injectScrdifFluid';
import { pierScourRatios } from '@/utils/pierScourSample';
import { yieldToMain } from '@/utils/yieldToMain';
import {
  alignFluidSeriesToTerrain,
  defaultFluidSliceHeight,
  fluidHeightRange,
  fluidYiAtWorldY,
  sceneViewRadius,
  waterSurfaceElevation,
} from '@/utils/fluidWorld';

const MANIFEST_URL = '/data/flow3d/processed/demo/manifest.json';

function fluidUnitForQuantity(q: FluidQuantity, meta?: FluidSeries['metadata']): string {
  if (q === 'scrdif') return meta?.scalarUnits?.scrdif ?? 'm';
  if (q === 'velocityX' || q === 'velocityY' || q === 'velocityZ') {
    return meta?.velocityUnit ?? 'm/s';
  }
  if (q === 'pressure') return meta?.pressureUnit ?? 'Pa';
  if (q === 'density') return meta?.densityUnit ?? 'kg/m^3';
  if (q === 'speed') return meta?.velocityUnit ?? 'm/s';
  return meta?.scalarUnits?.[q] ?? meta?.scalarLabels?.[q] ?? '';
}

function buildFluidRangeEntries(
  state: SimState,
  selected: FluidQuantity[],
  primary: FluidQuantity,
): FluidRangeEntry[] {
  const meta = state.fluidSeries.metadata;
  const usePoints = state.fluidPoints.isVisible;
  return selected.map((q) => {
    const range = usePoints
      ? state.fluidPoints.computeRangeForQuantity(q)
      : state.terrainWater.computeRangeForQuantity(q);
    return {
      quantity: q,
      label: fluidDashboardLabel(q),
      min: range.min,
      max: range.max,
      unit: fluidUnitForQuantity(q, meta),
      primary: q === primary,
    };
  });
}

function fluidRangeLegendKey(entries: FluidRangeEntry[]): string {
  return entries.map((e) => `${e.quantity}|${e.min}|${e.max}|${e.unit}`).join(';');
}

// 파라미터에 의존하는 모듈 묶음. Apply 시 통째로 교체.
interface SimState {
  series: ScourSeries;
  fluidSeries: FluidSeries;
  pierDefs: PierDefinition[];
  terrain: Terrain;
  sedimentLayer: SedimentLayer;
  pierMarker: PierMarker;
  slicePlane: FluidSlicePlane;
  terrainWater: TerrainWater;
  arrows: VelocityArrows;
  tracers: FluidTracers;
  fluidPoints: FluidQuantityPoints;
  fluidMinY: number;
  fluidMaxY: number;
  waterLevelY: number;
  coordinateFluid: boolean;
  probeSeries: SampleProbeSeries | null;
  durationSeconds: number;
  dispose(): void;
}

function syncProbeTracers(
  tracers: FluidTracers,
  probeSeries: SampleProbeSeries | null,
  timeSeconds: number,
): void {
  if (!probeSeries) {
    tracers.clearProbeVelocity();
    return;
  }
  const sample = probeAtTime(probeSeries, timeSeconds);
  if (!sample) {
    tracers.setProbeVelocity({ u: 0, v: 0, w: 0 });
    return;
  }
  tracers.setProbeVelocity({ u: sample.u, v: sample.v, w: sample.w });
}

async function buildSimState(
  params: SimParams,
  scene: Scene,
  baseScourSeries: ScourSeries | null,
  baseFluidSeries: FluidSeries | null = null,
  coordinateFluid = false,
  probeSeries: SampleProbeSeries | null = null,
): Promise<SimState> {
  const geom = paramsToFlumeGeometry(params);
  const terrainDims = terrainGridDims(geom);
  const fluidDims = fluidGridDims(geom);
  const pierX = structureCenterX(geom);
  const interval = frameIntervalSeconds(params);

  // ── 세굴 데이터
  const scourSrc = new SyntheticScourSource({
    width: terrainDims.width,
    height: terrainDims.height,
    cellSize: terrainDims.cellSize,
    frameCount: params.frameCount,
    frameIntervalSeconds: interval,
    pierDiameter: params.pierDiameter,
    scourRate: params.scourRate * (params.scrdifMax / 0.12),
    sandGrainSizeMm: params.sandGrainSizeMm,
    tankHeightY: params.tankHeightY,
    permeable: params.structurePermeable,
    inflowSpeed: params.inflowSpeed,
    pier: { x: pierX, z: 0 },
  });
  const activeSeries = baseScourSeries ?? (await scourSrc.load());

  const pierDefs: PierDefinition[] = (
    activeSeries.baseTerrain.metadata?.piers ?? []
  ).map((p) => ({
    id: p.id,
    x: p.x,
    z: p.z,
    ...(p.diameter !== undefined ? { diameter: p.diameter } : {}),
    ...(p.height !== undefined ? { height: p.height } : {}),
  }));

  const pierHeight = params.tankHeightY + 0.03;
  const resolvedPierDefs: PierDefinition[] =
    pierDefs.length > 0
      ? pierDefs.map((p) => ({
          ...p,
          shape: p.shape ?? params.structureShape,
        }))
      : [
          {
            id: 'P1',
            x: pierX,
            z: 0,
            diameter: params.pierDiameter,
            height: pierHeight,
            shape: params.structureShape,
          },
        ];

  const terrain = new Terrain(scene, activeSeries);
  const sedimentLayer = new SedimentLayer({
    scene,
    series: activeSeries,
    thicknessM: params.sedimentThickness,
  });
  const pierMarker = new PierMarker({ scene, baseElevation: 0 }, resolvedPierDefs);

  // ── 유체 데이터
  let fluidSeries =
    baseFluidSeries ??
    (await new SyntheticFluidSource({
      width: fluidDims.width,
      height: fluidDims.height,
      depth: fluidDims.depth,
      cellSize: fluidDims.cellSize,
      frameCount: params.frameCount,
      frameIntervalSeconds: interval,
      fluidU: params.fluidU,
      fluidV: params.fluidV,
      fluidW: params.fluidW,
      permeable: params.structurePermeable,
      pier: resolvedPierDefs[0]
        ? { x: resolvedPierDefs[0].x, z: resolvedPierDefs[0].z, radius: params.pierDiameter / 2 }
        : { x: pierX, z: 0, radius: params.pierDiameter / 2 },
    }).load());

  if (baseFluidSeries) {
    fluidSeries = alignFluidSeriesToTerrain(fluidSeries, activeSeries.baseTerrain);
  }

  const { min: fluidMinY, max: fluidMaxY } = fluidHeightRange(fluidSeries.grid);
  // 합성 데이터: 하상 표고 + 수심 = 수면. 유체 격자 Y 범위 안으로 클램프.
  const initialFluidY = baseFluidSeries
    ? defaultFluidSliceHeight(fluidSeries, activeSeries.baseTerrain)
    : Math.max(
        fluidMinY,
        Math.min(fluidMaxY, waterSurfaceElevation(activeSeries.baseTerrain, params.waterDepth)),
      );

  if (!baseFluidSeries) {
    injectScrdifFromScour(fluidSeries, activeSeries, initialFluidY);
  }

  const slicePlane = new FluidSlicePlane({
    scene,
    series: fluidSeries,
    initialQuantity: 'velocityX',
    initialHeight: initialFluidY,
  });
  slicePlane.setVisible(false);

  const terrainWater = new TerrainWater({
    scene,
    scourSeries: activeSeries,
    fluidSeries,
    waterLevel: initialFluidY,
    initialQuantity: 'velocityX',
  });
  const arrows = new VelocityArrows({
    scene,
    series: fluidSeries,
    stride: 3,
    ySliceIndex: fluidYiAtWorldY(fluidSeries.grid, initialFluidY),
    maxArrowLength: fluidDims.cellSize * 4.5,
  });
  arrows.setVisible(false);
  const tracers = new FluidTracers({
    scene,
    fluidSeries,
    scourSeries: activeSeries,
    waterLevel: initialFluidY,
    piers: resolvedPierDefs,
    structurePermeable: params.structurePermeable,
    baseElevation: 0,
  });
  tracers.setVisible(true);
  const fluidPoints = new FluidQuantityPoints({
    scene,
    series: fluidSeries,
    stride: coordinateFluid ? 4 : 2,
    initialQuantity: 'velocityX',
  });
  // 지형·교량과 함께 볼 때는 수평 슬라이스·화살표가 겹침에 유리하다.
  fluidPoints.setVisible(false);

  const durationSeconds = Math.max(
    terrain.durationSeconds,
    fluidSeries.frames.at(-1)?.timestampSeconds ?? 0,
    probeSeries?.durationSeconds ?? 0,
  );

  return {
    series: activeSeries,
    fluidSeries,
    pierDefs: resolvedPierDefs,
    terrain,
    sedimentLayer,
    pierMarker,
    slicePlane,
    terrainWater,
    arrows,
    tracers,
    fluidPoints,
    fluidMinY,
    fluidMaxY,
    waterLevelY: initialFluidY,
    coordinateFluid,
    probeSeries,
    durationSeconds,
    dispose() {
      fluidPoints.dispose();
      tracers.dispose();
      arrows.dispose();
      terrainWater.dispose();
      slicePlane.dispose();
      pierMarker.dispose();
      sedimentLayer.dispose();
      terrain.dispose();
    },
  };
}

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement | null;
  const appRoot = document.getElementById('app');
  const dockLeft = document.getElementById('dock-left');
  const dockRight = document.getElementById('dock-right');
  if (!canvas || !appRoot || !dockLeft || !dockRight) {
    throw new Error(
      '필수 DOM (#scene-canvas, #app, #dock-left, #dock-right) 을 찾을 수 없습니다.',
    );
  }

  const sceneManager = new SceneManager();
  const rendererManager = new RendererManager({ canvas });
  const cameraManager = new CameraManager({
    domElement: canvas,
    aspect: canvas.clientWidth / canvas.clientHeight,
  });
  const lightManager = new LightManager(sceneManager.scene);
  const fpsMeter = createFpsMeter(appRoot, { rightInsetPx: 300 });
  const loop = new AnimationLoop();

  // ── 최초 베이스 데이터 (manifest 있으면 사용, 없으면 null → buildSimState 내부에서 합성)
  await createDataSource({ manifestUrl: MANIFEST_URL });

  let params: SimParams = { ...DEFAULT_SIM_PARAMS };
  let sim = await buildSimState(params, sceneManager.scene, null);

  /** 사용자화 패널에서 유지되는 값 (재시뮬 후에도 동일하게 적용) */
  let fluidSliceOpacity = 0.92;

  const sceneRadius =
    (Math.hypot(sim.series.baseTerrain.width, sim.series.baseTerrain.height) *
      sim.series.baseTerrain.cellSize) /
    2;

  // 씬 크기에 맞춰 초기 카메라를 도메인 중심으로 프레이밍한다(실험실 스케일 대응).
  cameraManager.focusOnDomain(
    new Vector3(0, sim.waterLevelY * 0.5, 0),
    sceneViewRadius(sim.series.baseTerrain, sim.fluidSeries),
  );

  const timeControls = new TimeControls({
    durationSeconds: sim.durationSeconds,
    autoPlay: true,
    loop: true,
  });
  appRoot.appendChild(timeControls.element);

  const flowDirectionBadge = new FlowDirectionBadge();
  appRoot.appendChild(flowDirectionBadge.element);

  const legend = new ColorLegend({
    title: '지반 변화량 (세굴 ↔ 퇴적)',
    unit: 'm',
    initialAbsMax: sim.terrain.absMax,
  });

  let lastFluidLegendKey = '';

  const applyFluidPrimaryQuantity = (primary: FluidQuantity): void => {
    sim.slicePlane.setQuantity(primary);
    sim.terrainWater.setQuantity(primary);
    sim.fluidPoints.setQuantity(primary);
    fluidControls.setLegendForQuantity(primary);
  };

  const syncFluidFieldLegend = (): void => {
    const entries = buildFluidRangeEntries(
      sim,
      fluidControls.getSelectedQuantities(),
      fluidControls.getPrimaryQuantity(),
    );
    const key = fluidRangeLegendKey(entries);
    if (key !== lastFluidLegendKey) {
      lastFluidLegendKey = key;
      fluidControls.setRanges(entries);
    }
  };

  let fluidControls!: FluidControls;

  fluidControls = new FluidControls(
    {
      initialParams: params,
      initialQuantities: ['velocityX'],
      initialPrimary: 'velocityX',
      minHeight: sim.fluidMinY,
      maxHeight: sim.fluidMaxY,
      initialHeight: sim.waterLevelY,
      initialTracersVisible: true,
      initialPointsVisible: false,
      velocityUnit: sim.fluidSeries.metadata?.velocityUnit ?? 'm/s',
      scrdifUnit: sim.fluidSeries.metadata?.scalarUnits?.scrdif ?? 'm',
    },
    {
      onQuantitiesChange: (_selected, primary) => {
        applyFluidPrimaryQuantity(primary);
        lastFluidLegendKey = '';
        syncFluidFieldLegend();
      },
      onApply: () => {
        applyParams(collectParams());
      },
      onSliceHeightChange: (y) => {
        sim.slicePlane.setHeight(y);
        sim.terrainWater.setWaterLevel(y);
        sim.tracers.setWaterLevel(y);
        lastFluidLegendKey = '';
        syncFluidFieldLegend();
      },
      onSliceVisibilityChange: (v) => {
        sim.terrainWater.setVisible(v);
        sim.slicePlane.setVisible(false);
      },
      onTracersVisibilityChange: (v) => sim.tracers.setVisible(v),
      onPointsVisibilityChange: (v) => {
        sim.fluidPoints.setVisible(v);
        lastFluidLegendKey = '';
        syncFluidFieldLegend();
      },
    },
  );
  dockLeft.appendChild(fluidControls.element);
  applyFluidPrimaryQuantity(fluidControls.getPrimaryQuantity());
  syncFluidFieldLegend();

  const cameraPresets = new CameraPresets({
    onSelect: (preset) => cameraManager.applyPreset(preset, sceneRadius),
  });
  dockRight.appendChild(cameraPresets.element);
  dockRight.appendChild(legend.element);

  let activeScourWarning = new ScourWarning({
    pierCount: sim.pierDefs.length,
    pierIds: sim.pierDefs.map((p) => p.id),
    criticalDepthM: params.criticalScourDepth,
  });
  dockRight.insertBefore(activeScourWarning.element, legend.element);

  const cellSeries = new CellTimeSeries({ series: sim.series });
  appRoot.appendChild(cellSeries.element);

  const picking = new Picking({
    canvas,
    camera: cameraManager.camera,
    pickables: sim.terrain.pickables,
    emitOnHover: false,
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

  let customizePanel: DashboardCustomizePanel;
  let experimentInfoPanel!: ExperimentInfoPanel;

  const collectParams = (): SimParams =>
    mergePanelParams(params, experimentInfoPanel.getParams(), fluidControls.getParams(), params);

  const applyParams = (
    newParams: SimParams,
    baseScour: ScourSeries | null = null,
    baseFluid: FluidSeries | null = null,
    coordinateFluid = false,
    probeSeries: SampleProbeSeries | null = null,
  ): void => {
    experimentInfoPanel.setLoading(true);
    fluidControls.setLoading(true);
    void buildSimState(
      newParams,
      sceneManager.scene,
      baseScour,
      baseFluid,
      coordinateFluid,
      probeSeries,
    ).then((next) => {
        swapSim(next, newParams);
        experimentInfoPanel.setLoading(false);
        fluidControls.setLoading(false);
      },
    );
  };

  const swapSim = (next: SimState, nextParams: SimParams = params): void => {
    loop.stop();
    const old = sim;
    old.dispose();
    activeScourWarning.dispose();
    activeScourWarning = new ScourWarning({
      pierCount: next.pierDefs.length,
      pierIds: next.pierDefs.map((p) => p.id),
      criticalDepthM: nextParams.criticalScourDepth,
    });
    dockRight.insertBefore(activeScourWarning.element, legend.element);

    picking.updatePickables(next.terrain.pickables);
    cellSeries.updateSeries(next.series);
    legend.setRange(next.terrain.absMax);
    next.terrain.onFrameApplied(({ absMax }) => legend.setRange(absMax));
    timeControls.setDuration(next.durationSeconds);
    timeControls.setTime(0);

    fluidControls.setHeightRange(next.fluidMinY, next.fluidMaxY);
    fluidControls.setSliceHeight(next.waterLevelY);
    next.slicePlane.setHeight(next.waterLevelY);
    next.terrainWater.setWaterLevel(next.waterLevelY);
    next.slicePlane.setVisible(false);
    next.terrainWater.setVisible(true);
    next.arrows.setVisible(false);
    next.tracers.setVisible(fluidControls.isTracersVisible());
    next.tracers.setWaterLevel(next.waterLevelY);
    syncProbeTracers(next.tracers, next.probeSeries, 0);
    fluidControls.setPointsVisible(false);
    applyFluidPrimaryQuantity(fluidControls.getPrimaryQuantity());
    lastFluidLegendKey = '';
    syncFluidFieldLegend();

    params = nextParams;
    sim = next;
    lastFluidLegendKey = '';
    experimentInfoPanel.setParams(nextParams);
    fluidControls.setParams(nextParams);
    fluidControls.setProbeMode(next.probeSeries !== null);
    if (next.probeSeries) {
      const sample = probeAtTime(next.probeSeries, 0);
      if (sample) {
        fluidControls.setProbeReadout({
          u: sample.u,
          v: sample.v,
          w: sample.w,
          scrdif: sample.scrdif,
          t: sample.t,
          rowIndex: sample.rowIndex,
        });
      }
    }
    sim.terrainWater.setOpacity(fluidSliceOpacity);
    loop.start();
  };

  experimentInfoPanel = new ExperimentInfoPanel(params, {
    onApply: () => applyParams(collectParams()),
  });
  dockRight.appendChild(experimentInfoPanel.element);

  const csvUploadPanel = new CsvUploadPanel({
    onLoaded: async (result) => {
      await yieldToMain();
      const next = await buildSimState(
        params,
        sceneManager.scene,
        result.scour,
        null,
        false,
        result.probeSeries,
      );
      await yieldToMain();
      swapSim(next);
      cameraManager.applyPreset(
        'reset',
        sceneViewRadius(next.series.baseTerrain, next.fluidSeries),
      );
    },
    getLoadOptions: () => ({
      pierDiameter: params.pierDiameter,
      scourRate: params.scourRate * (params.scrdifMax / 0.12),
      sandGrainSizeMm: params.sandGrainSizeMm,
      permeable: params.structurePermeable,
      inflowSpeed: params.inflowSpeed,
      tankHeightY: params.tankHeightY,
    }),
  });
  dockLeft.prepend(csvUploadPanel.element);

  customizePanel = new DashboardCustomizePanel({
    onBackgroundHex: (hex) => {
      sceneManager.setBackground(hex);
    },
    onFluidSliceOpacity: (v) => {
      fluidSliceOpacity = v;
      sim.terrainWater.setOpacity(v);
      sim.slicePlane.setOpacity(v);
    },
  });
  dockLeft.appendChild(customizePanel.element);

  sim.terrainWater.setOpacity(fluidSliceOpacity);
  sim.slicePlane.setOpacity(fluidSliceOpacity);

  sim.terrain.onFrameApplied(({ absMax }) => legend.setRange(absMax));

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

  loop.add((delta, elapsed) => {
    fpsMeter.begin();
    timeControls.tick(delta);
    const t = timeControls.time;

    sim.terrain.updateAtTime(t);
    sim.sedimentLayer.updateAtTime(t);
    activeScourWarning.update(
      pierScourRatios(sim.series, sim.pierDefs, t, params.criticalScourDepth),
      params.criticalScourDepth,
    );
    sim.terrainWater.updateAtTime(t);
    sim.terrainWater.tickRipple(elapsed);
    sim.tracers.updateAtTime(t);
    syncProbeTracers(sim.tracers, sim.probeSeries, t);
    sim.tracers.tick(delta);
    sim.slicePlane.updateAtTime(t);
    sim.arrows.updateAtTime(t);
    sim.fluidPoints.updateAtTime(t);
    cellSeries.setTime(t);
    if (sim.probeSeries) {
      const sample = probeAtTime(sim.probeSeries, t);
      if (sample) {
        fluidControls.setProbeReadout({
          u: sample.u,
          v: sample.v,
          w: sample.w,
          scrdif: sample.scrdif,
          t: sample.t,
          rowIndex: sample.rowIndex,
        });
      }
    }
    syncFluidFieldLegend();

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
    experimentInfoPanel.dispose();
    csvUploadPanel.dispose();
    customizePanel.dispose();
    fluidControls.dispose();
    legend.dispose();
    timeControls.dispose();
    activeScourWarning.dispose();
    flowDirectionBadge.dispose();
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
