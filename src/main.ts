import '@/styles/main.css';

import { CameraPresets } from '@/components/CameraPresets';
import { ColorLegend } from '@/components/ColorLegend';
import { CsvUploadPanel } from '@/components/CsvUploadPanel';
import type { CsvDashboardLoadResult } from '@/data/loadCsvDashboard';
import { DashboardCustomizePanel } from '@/components/DashboardCustomizePanel';
import {
  FluidControls,
  fluidDashboardLabel,
  type FluidRangeEntry,
} from '@/components/FluidControls';
import { FluidFieldLegend } from '@/components/FluidFieldLegend';
import { FluidTimeSeriesChart } from '@/components/FluidTimeSeriesChart';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { LoginScreen } from '@/components/LoginScreen';
import { LogoutButton } from '@/components/LogoutButton';
import { PierScourMonitor } from '@/components/PierScourMonitor';
import { GlobalNav } from '@/components/GlobalNav';
import { ViewerSubNav } from '@/components/ViewerSubNav';
import { StatusBar } from '@/components/StatusBar';
import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';
import { SectionProfilePanel } from '@/components/SectionProfilePanel';
import { PlanViewOverlay } from '@/components/PlanViewOverlay';
import { computeSectionKpi } from '@/utils/sectionProfile';
import { GradeLegendPanel } from '@/components/GradeLegendPanel';
import { PierLabelOverlay } from '@/components/PierLabelOverlay';
import { PierScourTimelinePanel } from '@/components/PierScourTimelinePanel';
import { RiskJudgmentPanel } from '@/components/RiskJudgmentPanel';
import { RiskAlertBanner } from '@/components/RiskAlertBanner';
import { AlertSopPage } from '@/components/AlertSopPage';
import { MockAlertSopStore } from '@/state/mockAlertSop';
import { CaseManagementPage } from '@/components/CaseManagementPage';
import { DataPipelinePage } from '@/components/DataPipelinePage';
import { ConditionSetupCaseBar } from '@/components/ConditionSetupCaseBar';
import { stageCsvForConditionSetup, takePendingCsvUpload } from '@/state/pendingCaseUpload';
import {
  buildPierDepthSeries,
  computePierReachTimes,
  type PierDepthSeries,
} from '@/utils/pierTimeSeries';
import { isViewerScreen, ScreenRouter, SCREEN_TITLES, type ScreenId } from '@/app/ScreenRouter';
import { gradeOf, worstPierByDepth } from '@/constants/grade';
import {
  inflowBoundaryLegendNote,
  inflowBoundaryLegendNoteShort,
} from '@/utils/flumeInflowBoundary';
import { ViewerToast } from '@/components/ViewerToast';
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
import { createEmptyFluidSeries } from '@/data/createEmptyFluidSeries';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';
import { FluidSlicePlane } from '@/modules/FluidSlicePlane';
import { FluidQuantityPoints } from '@/modules/FluidQuantityPoints';
import { FluidTracers, fluidSeriesHasFlowAtTime } from '@/modules/FluidTracers';
import { PierMarker, type PierDefinition } from '@/modules/PierMarker';
import { SedimentLayer } from '@/modules/SedimentLayer';
import { Terrain } from '@/modules/Terrain';
import { TerrainWater } from '@/modules/TerrainWater';
import { VelocityArrows } from '@/modules/VelocityArrows';
import { Vector3 } from 'three';
import type { Scene } from 'three';
import { ExperimentInfoPanel } from '@/components/ExperimentInfoPanel';
import { fluidGridDims, paramsToFlumeGeometry, terrainGridDims } from '@/constants/experiment';
import type { FluidQuantity, FluidSeries } from '@/types/fluid';
import type { ScourSeries } from '@/types/terrain';
import {
  DEFAULT_SIM_PARAMS,
  frameIntervalSeconds,
  mergePanelParams,
  type SimParams,
} from '@/types/simParams';
import { createFpsMeter } from '@/utils/fpsMeter';
import { normalizeFluidQuantityRange } from '@/utils/fluidQuantityColor';
import { scalePierScourReadings } from '@/utils/pierScourDisplayScale';
import { pierScourDepths } from '@/utils/pierScourSample';
import { captureSceneScreenshot, scdtScreenshotName } from '@/utils/screenshot';
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

/** CSV 3D 유체 격자 우선. 해당 시각 격자 유속이 전부 0이면 조건 설정 u,v,w 로 입자를 구동한다. */
function applyTracerVelocity(
  state: Pick<SimState, 'tracers' | 'probeSeries' | 'probeFluidField' | 'fluidSeries'>,
  simParams: SimParams,
  timeSeconds: number,
): void {
  if (state.probeFluidField) {
    if (fluidSeriesHasFlowAtTime(state.fluidSeries, timeSeconds)) {
      state.tracers.clearProbeVelocity();
    } else {
      state.tracers.setProbeVelocity({
        u: simParams.fluidU,
        v: simParams.fluidV,
        w: simParams.fluidW,
      });
    }
    return;
  }
  if (state.probeSeries) {
    syncProbeTracers(state.tracers, state.probeSeries, timeSeconds, false);
    return;
  }
  state.tracers.setProbeVelocity({
    u: simParams.fluidU,
    v: simParams.fluidV,
    w: simParams.fluidW,
  });
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

  // ── 유체 데이터 (CSV 미적용 시 전 셀 0, CSV 적용 후에만 실측값)
  let fluidSeries =
    baseFluidSeries ??
    createEmptyFluidSeries({
      width: fluidDims.width,
      height: fluidDims.height,
      depth: fluidDims.depth,
      cellSize: fluidDims.cellSize,
      frameCount: params.frameCount,
      frameIntervalSeconds: interval,
    });

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
  tracers.setVisible(false);
  // CSV 격자는 측정점 간격을 따르므로 셀 수가 합성 격자보다 훨씬 많을 수 있다 —
  // 점 표시 수가 폭발하지 않도록 격자 크기에서 stride 를 역산한다.
  const fluidCellCount = fluidSeries.grid.width * fluidSeries.grid.height * fluidSeries.grid.depth;
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

async function bootstrap(router: ScreenRouter): Promise<void> {
  const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement | null;
  const appRoot = document.getElementById('app');
  const dockLeft = document.getElementById('dock-left');
  const dockRight = document.getElementById('dock-right');
  const viewerStage = document.getElementById('viewer-stage');
  const viewerCenter = document.getElementById('viewer-center');
  const viewerMain = document.getElementById('viewer-main');
  const gnbMount = document.getElementById('gnb');
  const subnavMount = document.getElementById('subnav');
  const sbarMount = document.getElementById('sbar');
  const placeholderHost = document.getElementById('screen-placeholder-host');
  if (
    !canvas ||
    !appRoot ||
    !dockLeft ||
    !dockRight ||
    !viewerStage ||
    !viewerCenter ||
    !viewerMain ||
    !gnbMount ||
    !subnavMount ||
    !sbarMount ||
    !placeholderHost
  ) {
    throw new Error(
      '필수 DOM (#scene-canvas, #app, docks, #viewer-stage, #viewer-center, #gnb, #subnav, #sbar) 을 찾을 수 없습니다.',
    );
  }

  const globalNav = new GlobalNav({
    onNavigate: (screen) => router.goto(screen),
    onReportUnavailable: () => {
      console.info('[SCDT] 리포트는 1차년도 범위 밖입니다 (2차년도 예정)');
    },
  });
  gnbMount.appendChild(globalNav.element);

  const logoutButton = new LogoutButton({
    onLogout: () => {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      window.location.reload();
    },
  });
  globalNav.element.querySelector('.global-nav__right')?.appendChild(logoutButton.element);

  const viewerSubNav = new ViewerSubNav({
    onNavigate: (screen) => router.goto(screen),
  });
  subnavMount.appendChild(viewerSubNav.element);

  const statusBar = new StatusBar({
    caseId: 'A-032',
    coordinateSystem: 'Local (model)',
    units: 'm, m/s',
    foundationDepthM: DEFAULT_SIM_PARAMS.foundationDepth,
    convertedAt: '2026-10-02 09:05',
    frameIndex: 0,
    frameCount: DEFAULT_SIM_PARAMS.frameCount,
  });
  sbarMount.appendChild(statusBar.element);

  const screenPlaceholder = new ScreenPlaceholder(router.screen);
  placeholderHost.appendChild(screenPlaceholder.element);

  const mockAlertSopStore = new MockAlertSopStore();
  const openSopScreen = (): void => router.goto(10);
  const alertSopPage = new AlertSopPage({
    store: mockAlertSopStore,
    caseId: 'A-032',
    durationSeconds: 0,
    onChanged: () => {
      /* 목업 SOP 상태만 갱신 */
    },
  });
  placeholderHost.appendChild(alertSopPage.element);

  const dataPipelinePage = new DataPipelinePage({
    onOpenCases: () => router.goto(2),
    onOpenConditionSetup: () => router.goto(4),
  });
  placeholderHost.appendChild(dataPipelinePage.element);

  const caseManagementPage = new CaseManagementPage({
    onOpenViewer: (caseId) => {
      statusBar.update({ caseId });
      conditionSetupCaseBar.setCaseId(caseId);
      router.goto(4);
    },
    onOpenDataPipeline: () => router.goto(3),
    onOpenDataPipelineError: (caseId) => {
      dataPipelinePage.focusFile(caseId === 'B-015' ? 'B-015_run01.csv' : caseId);
      router.goto(3);
    },
    onStartNewSimulation: (files) => {
      if (files && files.length > 0) {
        stageCsvForConditionSetup(files);
        const stem = files[0].name.replace(/\.csv$/i, '');
        const caseGuess =
          stem.match(/^[A-Z]-\d+/i)?.[0]?.toUpperCase() ?? `NEW · ${stem.slice(0, 20)}`;
        statusBar.update({ caseId: caseGuess });
      }
      router.goto(4);
    },
  });
  placeholderHost.appendChild(caseManagementPage.element);

  const syncShellLayout = (screen: ScreenId): void => {
    viewerSubNav.setVisible(isViewerScreen(screen));
    if (isViewerScreen(screen)) viewerSubNav.setActive(screen);
    globalNav.setActiveForScreen(screen);

    const showViewer =
      screen === 4 || screen === 5 || screen === 6 || screen === 7 || screen === 8 || screen === 9;
    const showAlertPage = screen === 10;
    const showCasePage = screen === 2;
    const showDataPage = screen === 3;

    viewerStage.classList.toggle('is-hidden', !showViewer);
    placeholderHost.classList.toggle('is-active', !showViewer);

    screenPlaceholder.element.classList.toggle(
      'is-hidden',
      showAlertPage || showCasePage || showDataPage,
    );
    alertSopPage.setVisible(showAlertPage);
    caseManagementPage.setVisible(showCasePage);
    dataPipelinePage.setVisible(showDataPage);
    if (!showViewer && !showCasePage && !showDataPage && !showAlertPage) {
      screenPlaceholder.setScreen(screen);
    }
  };

  syncShellLayout(router.screen);

  const conditionSetupCaseBar = new ConditionSetupCaseBar({
    onOpenPipeline: () => router.goto(3),
    onCaseChange: (caseId) => {
      statusBar.update({ caseId });
    },
  });

  const riskJudgmentPanel = new RiskJudgmentPanel({ onOpenSop: openSopScreen });
  const riskAlertBanner = new RiskAlertBanner({ onOpenSop: openSopScreen });
  viewerMain.appendChild(riskAlertBanner.element);

  const planViewOverlay = new PlanViewOverlay();
  viewerMain.appendChild(planViewOverlay.element);
  const planViewHint = document.createElement('div');
  planViewHint.className = 'plan-view-hint';
  planViewHint.textContent = '평면뷰(TOP) · 교량 레이어 자동 숨김';
  viewerMain.appendChild(planViewHint);

  const sectionProfilePanel = new SectionProfilePanel({
    onSectionChange: (sec) => {
      planViewOverlay.setSection(sec);
      if (router.screen === 6) {
        statusBar.update({ extra: sec === 'A' ? '단면 A–A′' : '단면 B–B′' });
      }
    },
  });
  viewerCenter.appendChild(sectionProfilePanel.element);
  sectionProfilePanel.element.classList.add('is-hidden');

  const pierTimelinePanel = new PierScourTimelinePanel();
  viewerCenter.appendChild(pierTimelinePanel.element);

  const pierLabelOverlay = new PierLabelOverlay();
  viewerMain.appendChild(pierLabelOverlay.element);

  const gradeLegendPanel = new GradeLegendPanel(DEFAULT_SIM_PARAMS.foundationDepth);
  gradeLegendPanel.element.classList.add('is-hidden');

  const syncPlanViewOverlaySize = (): void => {
    planViewOverlay.resize(viewerMain.clientWidth, viewerMain.clientHeight);
  };

  const sceneManager = new SceneManager();
  const rendererManager = new RendererManager({ canvas });
  const cameraManager = new CameraManager({
    domElement: canvas,
    aspect: canvas.clientWidth / canvas.clientHeight,
  });
  const lightManager = new LightManager(sceneManager.scene);
  const fpsMeter = createFpsMeter(viewerMain, { rightInsetPx: 12 });
  const loop = new AnimationLoop();

  // ── 최초 베이스 데이터 (manifest 있으면 사용, 없으면 null → buildSimState 내부에서 합성)
  await createDataSource({ manifestUrl: MANIFEST_URL });

  let params: SimParams = { ...DEFAULT_SIM_PARAMS };
  let sim = await buildSimState(params, sceneManager.scene, null);
  pierLabelOverlay.setPiers(sim.pierDefs);
  gradeLegendPanel.setFoundationDepthM(params.foundationDepth);

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
    durationSeconds: 0,
    autoPlay: false,
    loop: true,
  });
  timeControls.setTimelineEnabled(false, '「적용하고 결과 보기」 후 재생');
  viewerCenter.appendChild(timeControls.element);

  const viewerToast = new ViewerToast();
  viewerCenter.appendChild(viewerToast.element);

  const legend = new ColorLegend({
    title: '범례 — 세굴심 (scrdif)',
    unit: 'm',
    initialAbsMax: sim.terrain.absMax,
  });

  // 유체 필드(u/v/w/scrdif) 실측 시계열 오버레이 — 씬 위 플로팅 범례 + 하단 라인 차트.
  const fluidFieldLegend = new FluidFieldLegend();
  viewerCenter.appendChild(fluidFieldLegend.element);
  const fluidTimeSeriesChart = new FluidTimeSeriesChart();
  viewerCenter.appendChild(fluidTimeSeriesChart.element);
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
    let note =
      primary === 'scrdif'
        ? '파란=세굴 · 베이지=변화 없음 · 황토=퇴적. 수면을 투명하게 하면 지형 굴곡이 잘 보입니다.'
        : '';
    if (primary === 'scrdif' && sim.series.baseTerrain.metadata?.inflowBoundaryMasked) {
      note = note ? `${note} ${inflowBoundaryLegendNoteShort()}` : inflowBoundaryLegendNoteShort();
      fluidFieldLegend.setNoteTooltip(inflowBoundaryLegendNote());
    } else {
      fluidFieldLegend.setNoteTooltip('');
    }
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

  const fluidControls = new FluidControls(
    {
      initialParams: params,
      initialQuantities: ['velocityX'],
      initialPrimary: 'velocityX',
      minHeight: sim.fluidMinY,
      maxHeight: sim.fluidMaxY,
      initialHeight: sim.waterLevelY,
      initialTracersVisible: false,
      velocityUnit: sim.fluidSeries.metadata?.velocityUnit ?? 'm/s',
      scrdifUnit: sim.fluidSeries.metadata?.scalarUnits?.scrdif ?? 'm',
      readOnlyField: router.screen >= 5 && router.screen <= 9,
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
    },
  );
  dockLeft.appendChild(fluidControls.element);
  applyFluidPrimaryQuantity(fluidControls.getPrimaryQuantity());
  syncFluidFieldLegend();
  /** 재생 종료로 자동 해제한 추적 입자 — 슬라이더를 끝 이전으로 되돌리면 다시 켠다. */
  let tracersAutoOffAtEnd = false;
  let ephemeralStatusNote = '';
  let ephemeralStatusTimer: ReturnType<typeof setTimeout> | null = null;

  const buildViewerStatusExtra = (screen: ScreenId): string => {
    const parts: string[] = [];
    if (screen === 6) {
      parts.push(sectionProfilePanel.getSection() === 'A' ? '단면 A–A′' : '단면 B–B′');
    } else if (screen === 7) {
      parts.push('교각 색·라벨 = 시점별 등급 (우측 범례)');
    } else if (screen >= 5 && screen <= 9) {
      const primary = fluidControls.getPrimaryQuantity();
      if (sim.probeSeries && primary === 'scrdif') {
        parts.push('지형 색 = 하상 Δ · 수면 = scrdif');
        if (sim.series.baseTerrain.metadata?.inflowBoundaryMasked) {
          parts.push(inflowBoundaryLegendNoteShort());
        }
      }
    }
    if (ephemeralStatusNote) parts.push(ephemeralStatusNote);
    return parts.join(' · ');
  };

  const setEphemeralStatusNote = (message: string, durationMs = 8000): void => {
    ephemeralStatusNote = message;
    statusBar.update({ extra: buildViewerStatusExtra(router.screen) });
    if (ephemeralStatusTimer) clearTimeout(ephemeralStatusTimer);
    ephemeralStatusTimer = setTimeout(() => {
      ephemeralStatusNote = '';
      ephemeralStatusTimer = null;
      statusBar.update({ extra: buildViewerStatusExtra(router.screen) });
    }, durationMs);
  };

  const syncTracersWithTimeline = (t: number): void => {
    const d = timeControls.duration;
    if (d <= 0) return;
    if (t >= d - 1e-4) {
      if (fluidControls.isTracersVisible()) {
        tracersAutoOffAtEnd = true;
        fluidControls.setTracersVisible(false);
        const msg = '재생 종료 — 추적 입자를 껐습니다. 되감으면 다시 켜집니다.';
        fluidControls.setTracersNotice(msg);
        setEphemeralStatusNote(msg);
      }
      return;
    }
    if (tracersAutoOffAtEnd) {
      tracersAutoOffAtEnd = false;
      fluidControls.setTracersVisible(true);
      fluidControls.setTracersNotice(null);
    }
  };
  timeControls.onChange((t) => syncTracersWithTimeline(t));

  const cameraPresets = new CameraPresets({
    onSelect: (preset) => cameraManager.applyPreset(preset, sceneRadius),
  });
  dockRight.appendChild(cameraPresets.element);
  dockRight.appendChild(legend.element);

  let activePierMonitor = new PierScourMonitor({
    pierIds: sim.pierDefs.map((p) => p.id),
    foundationDepthM: params.foundationDepth,
  });
  dockRight.insertBefore(activePierMonitor.element, legend.element);
  dockRight.insertBefore(gradeLegendPanel.element, activePierMonitor.element);
  dockRight.insertBefore(riskJudgmentPanel.element, gradeLegendPanel.element);

  let pierDepthSeriesCache: PierDepthSeries[] = buildPierDepthSeries(
    sim.series,
    sim.pierDefs,
    params.foundationDepth,
  );

  const syncAlertSopSnapshot = (): void => {
    const tEnd = sim.durationSeconds;
    const raw = pierScourDepths(sim.series, sim.pierDefs, tEnd);
    const depthsAtEnd = scalePierScourReadings(
      raw,
      params.foundationDepth,
      tEnd,
      sim.durationSeconds,
    );
    alertSopPage.setContext(depthsAtEnd, params.foundationDepth, sim.durationSeconds);
  };
  syncAlertSopSnapshot();

  const syncViewerChrome = (screen: ScreenId): void => {
    const cellMode = screen === 7;
    const gradeLabels = screen === 7 || screen === 8 || screen === 9;
    const riskMode = screen === 9;
    const setupView = screen === 4;
    riskAlertBanner.setVisible(riskMode);
    riskJudgmentPanel.setVisible(riskMode);
    activePierMonitor.element.classList.toggle('is-hidden', riskMode || setupView);
    gradeLegendPanel.element.classList.toggle('is-hidden', !cellMode);
    pierLabelOverlay.setEnabled(gradeLabels);
  };

  /** 4번에서 적용 완료 후 이동할 화면 */
  let navigateAfterApply: ScreenId | null = null;
  /** 4번에서 파싱만 끝난 CSV. 적용 버튼을 누를 때 장면에 넣는다. */
  let stagedCsv: CsvDashboardLoadResult | null = null;
  // eslint-disable-next-line prefer-const -- applyParams 가 선언보다 앞에서 csvUploadPanel 참조
  let csvUploadPanel!: CsvUploadPanel;
  // eslint-disable-next-line prefer-const -- collectParams 가 선언 전 참조
  let experimentInfoPanel: ExperimentInfoPanel;

  const collectParams = (): SimParams =>
    mergePanelParams(params, experimentInfoPanel.getParams(), fluidControls.getParams(), params);

  const applyParams = (
    newParams: SimParams,
    baseScour: ScourSeries | null = null,
    baseFluid: FluidSeries | null = null,
    coordinateFluid = false,
    probeSeries: SampleProbeSeries | null = null,
  ): void => {
    csvUploadPanel.setApplyLoading(true);
    fluidControls.setLoading(true);
    void buildSimState(
      newParams,
      sceneManager.scene,
      baseScour,
      baseFluid,
      coordinateFluid,
      probeSeries,
    ).then(
      (next) => {
        swapSim(next, newParams);
        csvUploadPanel.setApplyLoading(false);
        fluidControls.setLoading(false);
      },
      (err: unknown) => {
        console.error('[applyParams]', err);
        csvUploadPanel.setApplyLoading(false);
        fluidControls.setLoading(false);
      },
    );
  };

  const swapSim = (next: SimState, nextParams: SimParams = params): void => {
    loop.stop();
    const old = sim;
    old.dispose();
    activePierMonitor.dispose();
    activePierMonitor = new PierScourMonitor({
      pierIds: next.pierDefs.map((p) => p.id),
      foundationDepthM: nextParams.foundationDepth,
    });
    dockRight.insertBefore(activePierMonitor.element, legend.element);
    pierDepthSeriesCache = buildPierDepthSeries(
      next.series,
      next.pierDefs,
      nextParams.foundationDepth,
    );
    syncAlertSopSnapshot();
    pierLabelOverlay.setPiers(next.pierDefs);

    legend.setRange(next.terrain.absMax);
    next.terrain.onFrameApplied(({ absMax }) => legend.setRange(absMax));
    const autoPlayAfterApply = navigateAfterApply === 5;
    const canPlayback = next.durationSeconds > 1e-6;
    timeControls.setDuration(canPlayback ? next.durationSeconds : 0);
    timeControls.setTime(0, { force: true, silent: !canPlayback });
    timeControls.setTimelineEnabled(canPlayback, '「적용하고 결과 보기」 후 재생');
    if (!canPlayback) {
      timeControls.setPlaying(false);
    } else if (autoPlayAfterApply) {
      timeControls.setPlaying(true);
    }

    fluidControls.setHeightRange(next.fluidMinY, next.fluidMaxY);
    fluidControls.setSliceHeight(next.waterLevelY);
    next.slicePlane.setHeight(next.waterLevelY);
    next.terrainWater.setWaterLevel(next.waterLevelY);
    next.slicePlane.setVisible(false);
    next.terrainWater.setVisible(true);
    next.arrows.setVisible(false);
    next.tracers.setVisible(fluidControls.isTracersVisible());
    next.tracers.setWaterLevel(next.waterLevelY);
    applyTracerVelocity(next, nextParams, 0);
    next.fluidPoints.setVisible(false);

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
    if (navigateAfterApply !== null) {
      const target = navigateAfterApply;
      navigateAfterApply = null;
      router.goto(target);
      if (canPlayback && target === 5) {
        viewerToast.show('시뮬레이션 재생 중 — 타임라인에서 일시정지·구간 이동 가능');
      }
    }
  };

  experimentInfoPanel = new ExperimentInfoPanel(params);

  csvUploadPanel = new CsvUploadPanel({
    onApplyScene: () => {
      const staged = stagedCsv;
      if (!staged) {
        viewerToast.show('CSV 파싱을 먼저 완료한 뒤 적용해 주세요.');
        return;
      }
      if (router.screen === 4) navigateAfterApply = 5;
      const next = collectParams();
      applyParams(next, staged.scour, staged.fluid, false, staged.probeSeries);
    },
    onLoaded: (result) => {
      stagedCsv = result;
      viewerToast.show(
        'CSV 파싱이 끝났습니다. 조건을 확인한 뒤 「적용하고 결과 보기」를 누르세요.',
      );
    },
    onInvalidated: () => {
      stagedCsv = null;
    },
    onError: (message) => {
      console.error('[CSV]', message);
    },
    onAnalysisPierCountChange: (count) => {
      params = { ...params, pierCount: count };
      experimentInfoPanel.setParams(params);
    },
    onSetupApplied: (selection) => {
      params = {
        ...params,
        pierCount: selection.pierCount,
        bridgeEnabled: selection.bridgeEnabled,
        bridgeType: selection.bridgeType,
      };
      experimentInfoPanel.setParams(params);
    },
    getStructure: () => {
      const current = experimentInfoPanel.getParams();
      const count = current.pierCount <= 1 ? 1 : current.pierCount === 2 ? 2 : 3;
      return {
        pierCount: count,
        bridgeEnabled: current.bridgeEnabled,
        bridgeType: current.bridgeType,
      };
    },
    getLoadOptions: () => {
      const count = params.pierCount;
      return {
        pierCount: count,
        pierArrangement: count >= 2 ? ('along' as const) : params.pierArrangement,
        pierDiameter: params.pierDiameter,
        sandGrainSizeMm: params.sandGrainSizeMm,
        permeable: params.structurePermeable,
        inflowSpeed: params.inflowSpeed,
        tankHeightY: params.tankHeightY,
      };
    },
  });
  dockLeft.append(conditionSetupCaseBar.element, csvUploadPanel.element, fluidControls.element);

  const customizePanel = new DashboardCustomizePanel({
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
  viewerCenter.appendChild(banner);

  const applyScreenLayout = (screen: ScreenId): void => {
    syncShellLayout(screen);
    const showViewer =
      screen === 4 || screen === 5 || screen === 6 || screen === 7 || screen === 8 || screen === 9;
    const showAlertPage = screen === 10;
    const setupView = screen === 4;
    const planView = screen === 6;
    const timelineView = screen === 8;
    viewerStage.classList.toggle('is-plan-view', planView);
    viewerStage.classList.toggle('is-timeline-view', timelineView);
    if (planView || timelineView) {
      viewerCenter.appendChild(timeControls.element);
    }
    if (showAlertPage) syncAlertSopSnapshot();
    document.getElementById('app')?.classList.toggle('is-condition-setup', setupView);
    conditionSetupCaseBar.setVisible(setupView);
    csvUploadPanel.element.classList.toggle('is-hidden', !setupView);
    customizePanel.element.classList.toggle('is-hidden', setupView);
    cameraPresets.element.classList.toggle('is-hidden', setupView);
    legend.element.classList.toggle('is-hidden', setupView);
    if (setupView) {
      const pendingCsv = takePendingCsvUpload();
      if (pendingCsv && pendingCsv.length > 0) {
        void csvUploadPanel.ingestExternalFiles(pendingCsv, true);
        csvUploadPanel.pulseAttention();
      }
    }
    sectionProfilePanel.element.classList.toggle('is-hidden', !planView);
    pierTimelinePanel.element.classList.toggle('is-hidden', !timelineView);
    planViewOverlay.element.style.display = planView ? 'block' : 'none';
    fluidControls.setReadOnlyField(screen >= 5 && screen <= 9);
    fluidControls.setSetupMode(setupView);
    syncViewerChrome(screen);
    gradeLegendPanel.setFoundationDepthM(params.foundationDepth);
    if (showViewer) {
      const size = rendererManager.applyCanvasSize();
      cameraManager.updateAspect(size.width / Math.max(1, size.height));
      syncPlanViewOverlaySize();
      pierLabelOverlay.setCamera(cameraManager.camera);
      if (planView) {
        cameraManager.applyPreset('top', sceneViewRadius(sim.series.baseTerrain, sim.fluidSeries));
        sim.pierMarker.setBridgeStructureVisible(false);
        sim.terrainWater.setVisible(false);
        sim.tracers.setVisible(false);
        sim.pierMarker.resetPierShaftColors();
        statusBar.update({ extra: buildViewerStatusExtra(screen) });
        requestAnimationFrame(() => sectionProfilePanel.notifyLayout());
      } else if (screen === 7) {
        cameraManager.applyPreset('reset', sceneRadius);
        sim.pierMarker.setBridgeStructureVisible(false);
        sim.terrainWater.setVisible(fluidControls.isSliceVisible());
        sim.tracers.setVisible(fluidControls.isTracersVisible());
        statusBar.update({ extra: buildViewerStatusExtra(screen) });
      } else {
        sim.pierMarker.setBridgeStructureVisible(true);
        sim.terrainWater.setVisible(fluidControls.isSliceVisible());
        sim.tracers.setVisible(fluidControls.isTracersVisible());
        if (screen !== 8 && screen !== 9) sim.pierMarker.resetPierShaftColors();
        statusBar.update({ extra: buildViewerStatusExtra(screen) });
      }
      loop.start();
    } else {
      loop.stop();
      sim.pierMarker.resetPierShaftColors();
      pierLabelOverlay.setEnabled(false);
    }
  };

  rendererManager.onContextLossEvent(() => {
    banner.classList.add('is-visible');
    loop.stop();
  });
  rendererManager.onContextRestoredEvent(() => {
    banner.classList.remove('is-visible');
    if (router.screen >= 4 && router.screen <= 9) loop.start();
  });

  const shortcuts = new KeyboardShortcuts({
    togglePlay: () => {
      if (!timeControls.isTimelineEnabled) return;
      timeControls.setPlaying(!timeControls.isPlaying);
    },
    seekRelative: (delta) => {
      if (!timeControls.isTimelineEnabled) return;
      timeControls.setTime(timeControls.time + delta);
    },
    seekAbsolute: (t) => {
      if (!timeControls.isTimelineEnabled) return;
      timeControls.setTime(t);
    },
    duration: () => timeControls.time + 1,
    applyPreset: (preset) => cameraManager.applyPreset(preset, sceneRadius),
    screenshot: () => {
      const screen = router.screen;
      void captureSceneScreenshot(
        rendererManager.renderer,
        sceneManager.scene,
        cameraManager.camera,
        scdtScreenshotName(screen, SCREEN_TITLES[screen]),
      );
    },
  });

  rendererManager.registerResizeHandler(({ width, height }) => {
    cameraManager.updateAspect(width / height);
    syncPlanViewOverlaySize();
  });

  /** 시나리오 시간(t)과 무관 — 수면 리플·줄무늬용 실시간 시계 */
  let ambientRippleTime = 0;

  loop.add((delta) => {
    fpsMeter.begin();
    const simDt = timeControls.simulationDelta(delta);
    const dur = timeControls.duration;
    const crossedPlaybackEnd = simDt > 0 && dur > 0 && timeControls.time + simDt >= dur - 1e-6;
    timeControls.tick(delta);
    if (crossedPlaybackEnd) {
      syncTracersWithTimeline(timeControls.duration);
    }
    const t = timeControls.time;
    const simDelta =
      timeControls.isTimelineEnabled && timeControls.isPlaying && timeControls.duration > 0
        ? simDt
        : delta;
    /** 재생 중이 아니어도 추적 입자는 실시간 Δt 로 움직여야 선분이 그려진다(Δt=0 이면 길이 0). */
    const tracerAdvectDelta = simDelta > 0 ? simDelta : delta;

    sim.terrain.updateAtTime(t);
    sim.sedimentLayer.updateAtTime(t);
    const pierDepths = scalePierScourReadings(
      pierScourDepths(sim.series, sim.pierDefs, t),
      params.foundationDepth,
      t,
      sim.durationSeconds,
    );
    activePierMonitor.setFoundationDepthM(params.foundationDepth);
    activePierMonitor.update(pierDepths);
    const worst = worstPierByDepth(
      pierDepths.map((d) => ({ pierId: d.pierId, scourDepthM: d.scourDepthM })),
    );
    if (worst) {
      const g = gradeOf(worst.scourDepthM, params.foundationDepth);
      globalNav.setBadge({ grade: g, pierId: worst.pierId });
    }
    const frameIdx = Math.round(
      (t / Math.max(sim.durationSeconds, 1e-9)) * Math.max(1, params.frameCount - 1),
    );
    statusBar.update({
      foundationDepthM: params.foundationDepth,
      frameIndex: frameIdx,
      frameCount: params.frameCount,
      extra: buildViewerStatusExtra(router.screen),
    });
    const gradeColorMap = new Map(
      pierDepths.map((d) => [d.pierId, gradeOf(d.scourDepthM, params.foundationDepth)] as const),
    );
    const viewW = viewerMain.clientWidth;
    const viewH = viewerMain.clientHeight;
    if (router.screen === 7 || router.screen === 8 || router.screen === 9) {
      sim.pierMarker.setPierShaftColors(
        new Map([...gradeColorMap.entries()].map(([id, g]) => [id, g.color])),
      );
      pierLabelOverlay.updateGrades(gradeColorMap, viewW, viewH);
    }
    if (router.screen === 9 && worst) {
      riskJudgmentPanel.update(
        pierDepths,
        pierDepthSeriesCache,
        t,
        params.foundationDepth,
        sim.pierDefs,
      );
      riskAlertBanner.update(pierDepths, pierDepthSeriesCache, t, params.foundationDepth, worst);
    }
    if (router.screen === 8) {
      const reach = pierDepthSeriesCache.map((ps) =>
        computePierReachTimes(ps, params.foundationDepth),
      );
      pierTimelinePanel.update(
        pierDepthSeriesCache,
        reach,
        t,
        params.foundationDepth,
        sim.durationSeconds,
      );
    }
    if (router.screen === 6) {
      const p2Depth =
        pierDepths.find((d) => d.pierId === 'P2')?.scourDepthM ?? pierDepths[0]?.scourDepthM ?? 0;
      const sec = sectionProfilePanel.getSection();
      const kpi = computeSectionKpi(
        sim.series,
        sec,
        t,
        params.foundationDepth,
        p2Depth,
        sim.pierDefs,
      );
      sectionProfilePanel.update(sim.series, t, params.foundationDepth, sim.pierDefs, kpi);
      planViewOverlay.setContext(sim.series, sim.pierDefs, cameraManager.camera);
      planViewOverlay.draw();
    }
    sim.terrainWater.updateAtTime(t);
    ambientRippleTime += delta;
    sim.terrainWater.tickRipple(ambientRippleTime);
    sim.terrainWater.setCameraPosition(cameraManager.camera.position);
    sim.tracers.updateAtTime(t);
    applyTracerVelocity(sim, params, t);
    sim.tracers.tick(tracerAdvectDelta);
    sim.slicePlane.updateAtTime(t);
    sim.arrows.updateAtTime(t);
    sim.fluidPoints.updateAtTime(t);
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

  router.subscribe((screen) => applyScreenLayout(screen));
  applyScreenLayout(router.screen);

  const dispose = (): void => {
    shortcuts.dispose();
    loop.dispose();
    logoutButton.dispose();
    cameraPresets.dispose();
    experimentInfoPanel.dispose();
    csvUploadPanel.dispose();
    customizePanel.dispose();
    fluidControls.dispose();
    legend.dispose();
    fluidFieldLegend.dispose();
    fluidTimeSeriesChart.dispose();
    timeControls.dispose();
    viewerToast.dispose();
    activePierMonitor.dispose();
    globalNav.dispose();
    viewerSubNav.dispose();
    statusBar.dispose();
    screenPlaceholder.dispose();
    sectionProfilePanel.dispose();
    pierTimelinePanel.dispose();
    pierLabelOverlay.dispose();
    gradeLegendPanel.dispose();
    riskJudgmentPanel.dispose();
    riskAlertBanner.dispose();
    alertSopPage.dispose();
    caseManagementPage.dispose();
    dataPipelinePage.dispose();
    conditionSetupCaseBar.dispose();
    planViewOverlay.dispose();
    router.dispose();
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

  let router: ScreenRouter | null = null;
  let bootstrapped = false;

  const launch = (): void => {
    appRoot.classList.add('is-authenticated');
    if (!router) {
      window.history.replaceState(null, '', '#s/2');
      router = new ScreenRouter(2);
    }
    if (!bootstrapped) {
      bootstrapped = true;
      bootstrap(router).catch((err: unknown) => {
        console.error('애플리케이션 부트스트랩 실패:', err);
      });
    } else {
      router.goto(2);
    }
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
      window.history.replaceState(null, '', '#s/2');
      launch();
    },
  });
  document.body.appendChild(loginScreen.element);
}

start();
