import '@/styles/main.css';

import { CameraPresets } from '@/components/CameraPresets';
import { CellTimeSeries } from '@/components/CellTimeSeries';
import { ColorLegend } from '@/components/ColorLegend';
import { CsvUploadPanel } from '@/components/CsvUploadPanel';
import { DashboardCustomizePanel } from '@/components/DashboardCustomizePanel';
import { FluidControls, fluidDashboardLabel, type FluidRangeEntry } from '@/components/FluidControls';
import { FluidFieldLegend } from '@/components/FluidFieldLegend';
import { FluidTimeSeriesChart } from '@/components/FluidTimeSeriesChart';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { LoginScreen } from '@/components/LoginScreen';
import { LogoutButton } from '@/components/LogoutButton';
import { ScourWarning } from '@/components/ScourWarning';
import { TimeControls } from '@/components/TimeControls';
import { AnimationLoop } from '@/core/AnimationLoop';
import { CameraManager } from '@/core/CameraManager';
import { LightManager } from '@/core/LightManager';
import { RendererManager } from '@/core/RendererManager';
import { SceneManager } from '@/core/SceneManager';
import { createDataSource } from '@/data/createDataSource';
import {
  probeAtTime,
  probeSeriesValueRange,
  type SampleProbeSeries,
} from '@/data/buildSampleProbeDashboard';
import { probeFluidQuantityRange } from '@/data/buildProbeFluidSeries';
import { buildPierLayout } from '@/utils/pierLayout';
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
import { normalizeFluidQuantityRange } from '@/utils/fluidQuantityColor';
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
const AUTH_STORAGE_KEY = 'aiscour.authenticated';

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
  /** CSV t 블록 행 데이터로 만든 3D 유체 필드를 쓰는 중인지. */
  probeFluidField: boolean;
  durationSeconds: number;
  dispose(): void;
}

/**
 * FluidQuantity → CSV 프로브 컬럼 키.
 * 월드 축 규약(X=흐름, Y=연직, Z=횡단)에 맞춘다. FLOW-3D CSV 는 z 가 연직이므로
 * velocityY ↔ w, velocityZ ↔ v 로 대응해야 수면 색·유속 화살표·추적 입자가 같은 값을 가리킨다.
 */
function probeKeyForQuantity(q: FluidQuantity): 'u' | 'v' | 'w' | 'scrdif' | null {
  switch (q) {
    case 'velocityX':
      return 'u';
    case 'velocityY':
      return 'w';
    case 'velocityZ':
      return 'v';
    case 'scrdif':
      return 'scrdif';
    default:
      return null;
  }
}

/** 시계열 차트·수면 색이 항목별로 구분되도록 고정 팔레트를 쓴다. */
function chartColorForQuantity(q: FluidQuantity): string {
  switch (q) {
    case 'velocityX':
      return '#7ec8e3';
    case 'velocityY':
      return '#c9a4e0';
    case 'velocityZ':
      return '#f4a261';
    case 'scrdif':
      return '#e07a5f';
    default:
      return '#7ec8e3';
  }
}

/** 프로브 시계열 전체(재생 구간 전체) 기준 안정적 색 범위. u/v/w 는 0 대칭. */
function probeQuantityRange(
  probeSeries: SampleProbeSeries,
  q: FluidQuantity,
): { min: number; max: number } | null {
  const key = probeKeyForQuantity(q);
  if (!key) return null;
  const raw = probeSeriesValueRange(probeSeries, key);
  return normalizeFluidQuantityRange(q, raw.min, raw.max);
}

function probeSeriesTimesValues(
  probeSeries: SampleProbeSeries,
  key: 'u' | 'v' | 'w' | 'scrdif',
): { times: number[]; values: number[] } {
  const times = probeSeries.samples.map((s) => s.t);
  const values = probeSeries.samples.map((s) => s[key]);
  return { times, values };
}

/**
 * 추적 입자 이동 방식을 결정한다.
 * 공간 유체 필드가 있으면(CSV t 블록 행 데이터) 격자 유속을 삼선형 보간해 위치별로
 * 다르게 흐르므로 단일 대표값을 덮어쓰지 않는다. 필드가 없을 때만 블록 평균 u·v·w 로 이동한다.
 */
function syncProbeTracers(
  tracers: FluidTracers,
  probeSeries: SampleProbeSeries | null,
  timeSeconds: number,
  useFluidField: boolean,
): void {
  if (useFluidField || !probeSeries) {
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

/** CSV 대시보드가 terrain metadata 에 기록한 교각 정의를 PierMarker 용으로 변환한다. */
function pierDefsFromScourMetadata(
  series: ScourSeries,
  params: SimParams,
): PierDefinition[] | null {
  const meta = series.baseTerrain.metadata?.piers;
  if (!meta || meta.length === 0) return null;
  return meta.map((p) => ({
    id: p.id,
    x: p.x,
    z: p.z,
    diameter: p.diameter ?? params.pierDiameter,
    height: p.height ?? params.tankHeightY + 0.03,
    shape: params.structureShape,
  }));
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
    piers: buildPierLayout(params).map((p) => ({ id: p.id, x: p.x, z: p.z })),
  });
  const activeSeries = baseScourSeries ?? (await scourSrc.load());
  const resolvedPierDefs =
    pierDefsFromScourMetadata(activeSeries, params) ?? buildPierLayout(params);

  const terrain = new Terrain(scene, activeSeries);
  const sedimentLayer = new SedimentLayer({
    scene,
    series: activeSeries,
    thicknessM: params.sedimentThickness,
  });
  const pierMarker = new PierMarker(
    { scene, baseElevation: 0, bridgeEnabled: params.bridgeEnabled, bridgeType: params.bridgeType },
    resolvedPierDefs,
  );

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
    const isProbeCsv = baseFluidSeries.metadata?.simulationId === 'sample-probe-csv';
    if (!isProbeCsv) {
      fluidSeries = alignFluidSeriesToTerrain(fluidSeries, activeSeries.baseTerrain);
    }
  }
  // CSV 업로드 경로: t 블록의 행 데이터가 그대로 유체 격자 값이므로 합성 유속·프로브 대표값이 아니라
  // 이 필드가 수면 색·유속 화살표·추적 입자를 구동한다.
  const probeFluidField = baseFluidSeries !== null && probeSeries !== null;

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
    maxArrowLength: fluidSeries.grid.cellSize * 4.5,
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
  // CSV 격자는 측정점 간격을 따르므로 셀 수가 합성 격자보다 훨씬 많을 수 있다 —
  // 점 표시 수가 폭발하지 않도록 격자 크기에서 stride 를 역산한다.
  const fluidCellCount =
    fluidSeries.grid.width * fluidSeries.grid.height * fluidSeries.grid.depth;
  const fluidPoints = new FluidQuantityPoints({
    scene,
    series: fluidSeries,
    stride: probeFluidField
      ? Math.max(2, Math.ceil(Math.cbrt(fluidCellCount / 20_000)))
      : coordinateFluid
        ? 4
        : 2,
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
    probeFluidField,
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

  // 유체 필드(u/v/w/scrdif) 실측 시계열 오버레이 — 씬 위 플로팅 범례 + 하단 라인 차트.
  const fluidFieldLegend = new FluidFieldLegend();
  appRoot.appendChild(fluidFieldLegend.element);
  const fluidTimeSeriesChart = new FluidTimeSeriesChart();
  appRoot.appendChild(fluidTimeSeriesChart.element);
  /** 매 프레임 setProbeQuantity 에 쓰는 현재 항목의 고정 색 범위(재생 중 흔들리지 않도록). */
  let currentProbeRange: { min: number; max: number } | null = null;

  let lastFluidLegendKey = '';

  const refreshFluidProbeOverlays = (primary: FluidQuantity): void => {
    const probeSeries = sim.probeSeries;
    const key = probeSeries ? probeKeyForQuantity(primary) : null;
    if (!probeSeries || !key) {
      currentProbeRange = null;
      sim.terrainWater.setColorRange(null);
      fluidFieldLegend.setVisible(false);
      fluidTimeSeriesChart.setVisible(false);
      return;
    }
    fluidFieldLegend.setVisible(true);
    fluidTimeSeriesChart.setVisible(true);
    // 공간 필드가 있으면 수면 색과 범례가 같은 눈금을 쓰도록 필드 전체 범위로 고정한다.
    const range = sim.probeFluidField
      ? probeFluidQuantityRange(sim.fluidSeries, primary)
      : (probeQuantityRange(probeSeries, primary) ?? { min: 0, max: 1 });
    currentProbeRange = range;
    sim.terrainWater.setColorRange(sim.probeFluidField ? range : null);
    const label = fluidDashboardLabel(primary);
    const unit = fluidUnitForQuantity(primary, sim.fluidSeries.metadata);
    const note =
      primary === 'scrdif'
        ? '파란색 = 세굴(하상이 깊어짐) · 베이지 = 변화 없음 · 황토색 = 퇴적(하상이 쌓임). 아래 물을 투명하게 하면 실제 구덩이 형태를 볼 수 있습니다.'
        : '';
    fluidFieldLegend.setQuantity(primary, label, range, unit, note);
    const { times, values } = probeSeriesTimesValues(probeSeries, key);
    fluidTimeSeriesChart.setSeries({
      times,
      values,
      label,
      unit,
      colorHex: chartColorForQuantity(primary),
    });
  };

  const applyFluidPrimaryQuantity = (primary: FluidQuantity): void => {
    sim.slicePlane.setQuantity(primary);
    sim.terrainWater.setQuantity(primary);
    sim.fluidPoints.setQuantity(primary);
    fluidControls.setLegendForQuantity(primary);
    refreshFluidProbeOverlays(primary);

    // scrdif 는 색만으로는 "구덩이가 생겼다"는 걸 전달하기 어렵다 — 실제로 지형이 파인
    // 3D 형태를 보여주는 게 훨씬 직관적이므로, 물을 투명하게 하고 굴곡을 과장해 드러낸다.
    if (primary === 'scrdif') {
      sim.terrainWater.setOpacity(Math.min(fluidSliceOpacity, 0.35));
      sim.terrainWater.setVerticalExaggeration(4);
      sim.terrain.setVerticalExaggeration(4);
    } else {
      sim.terrainWater.setOpacity(fluidSliceOpacity);
      sim.terrainWater.setVerticalExaggeration(1);
      sim.terrain.setVerticalExaggeration(1);
    }
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

  const logoutButton = new LogoutButton({
    onLogout: () => {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      window.location.reload();
    },
  });
  dockRight.appendChild(logoutButton.element);

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
    syncProbeTracers(next.tracers, next.probeSeries, 0, next.probeFluidField);
    fluidControls.setPointsVisible(false);

    // sim 을 next 로 먼저 교체해야 아래 applyFluidPrimaryQuantity(항목·투명도·과장 배율 설정)가
    // 방금 폐기된 옛 인스턴스가 아니라 실제로 화면에 보이는 next 에 적용된다.
    params = nextParams;
    sim = next;
    applyFluidPrimaryQuantity(fluidControls.getPrimaryQuantity());
    lastFluidLegendKey = '';
    syncFluidFieldLegend();

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
        result.fluid,
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
      pierCount: params.pierCount,
      pierArrangement: params.pierArrangement,
      pierDiameter: params.pierDiameter,
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
    sim.terrainWater.setCameraPosition(cameraManager.camera.position);
    sim.tracers.updateAtTime(t);
    syncProbeTracers(sim.tracers, sim.probeSeries, t, sim.probeFluidField);
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
        const primary = fluidControls.getPrimaryQuantity();
        const key = probeKeyForQuantity(primary);
        if (key && currentProbeRange) {
          const value = sample[key];
          // 공간 필드가 있으면 수면은 셀별 실측값으로 칠한다. 단일 대표값으로 균일하게
          // 덮으면 행마다 다른 데이터가 사라지므로, 프로브 값은 범례 현재값·차트에만 쓴다.
          if (sim.probeFluidField) {
            sim.terrainWater.clearProbeQuantity();
          } else {
            sim.terrainWater.setProbeQuantity(primary, value, currentProbeRange);
          }
          fluidTimeSeriesChart.setTime(sample.t);
          fluidFieldLegend.setCurrentValue(value);
        }
      }
      sim.terrainWater.setFlowVector(sample?.u ?? 0, sample?.v ?? 0);
    } else {
      sim.terrainWater.clearProbeQuantity();
      sim.terrainWater.setFlowVector(params.fluidU, params.fluidV);
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
    logoutButton.dispose();
    cameraPresets.dispose();
    cellSeries.dispose();
    experimentInfoPanel.dispose();
    csvUploadPanel.dispose();
    customizePanel.dispose();
    fluidControls.dispose();
    legend.dispose();
    fluidFieldLegend.dispose();
    fluidTimeSeriesChart.dispose();
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

function start(): void {
  const appRoot = document.getElementById('app');
  if (!appRoot) {
    throw new Error('필수 DOM (#app) 을 찾을 수 없습니다.');
  }

  const launch = (): void => {
    appRoot.classList.add('is-authenticated');
    bootstrap().catch((err: unknown) => {
      console.error('애플리케이션 부트스트랩 실패:', err);
    });
  };

  if (sessionStorage.getItem(AUTH_STORAGE_KEY) === '1') {
    launch();
    return;
  }

  appRoot.classList.remove('is-authenticated');
  const loginScreen = new LoginScreen({
    onSuccess: () => {
      sessionStorage.setItem(AUTH_STORAGE_KEY, '1');
      loginScreen.dispose();
      launch();
    },
  });
  document.body.appendChild(loginScreen.element);
}

start();
