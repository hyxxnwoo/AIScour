import '@/styles/main.css';
import '@/styles/viz.css';
import '@/styles/responsive.css';
import { initGlobalVizTooltips } from '@/viz/tooltip';
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
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { LoginScreen } from '@/components/LoginScreen';
import { LogoutButton } from '@/components/LogoutButton';
import { PierScourMonitor } from '@/components/PierScourMonitor';
import { GlobalNav } from '@/components/GlobalNav';
import { ViewerSubNav } from '@/components/ViewerSubNav';
import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';
import { SectionProfilePanel } from '@/components/SectionProfilePanel';
import { PlanViewOverlay } from '@/components/PlanViewOverlay';
import { PlanViewGuide } from '@/components/PlanViewGuide';
import {
  computeSectionKpi,
  defaultTransversePierId,
  longitudinalLineWorldZ,
  transverseLineWorldX,
} from '@/utils/sectionProfile';
import { formatCaseHeadline, nextCaseId } from '@/utils/issueCaseId';
import { GradeLegendPanel } from '@/components/GradeLegendPanel';
import { PierLabelOverlay } from '@/components/PierLabelOverlay';
import { PierScourTimelinePanel } from '@/components/PierScourTimelinePanel';
import { RiskJudgmentPanel } from '@/components/RiskJudgmentPanel';
import { AlertSopPage } from '@/components/AlertSopPage';
import { MockAlertSopStore } from '@/state/mockAlertSop';
import { CaseManagementPage } from '@/components/CaseManagementPage';
import { DataPipelinePage } from '@/components/DataPipelinePage';
import { ConditionSetupCaseBar } from '@/components/ConditionSetupCaseBar';
import { takePendingCsvUpload } from '@/state/pendingCaseUpload';
import {
  buildPierDepthSeries,
  computePierReachTimes,
  type PierDepthSeries,
} from '@/utils/pierTimeSeries';
import { isViewerScreen, ScreenRouter, SCREEN_TITLES, type ScreenId } from '@/app/ScreenRouter';
import { gradeOf, worstPierByDepth } from '@/constants/grade';
import { Picking } from '@/modules/Picking';
import { CaseSwitcher, DEFAULT_HEIGHT_EXAGGERATION } from '@/components/CaseSwitcher';
import type { FlowScenario } from '@/constants/scenarios';
import { buildScrdifDashboard } from '@/data/buildScrdifDashboard';
import { ViewerToast } from '@/components/ViewerToast';
import { viewState } from '@/state/viewState';
import { captureCameraView, restoreCameraView } from '@/utils/cameraView';
import { observeWidgetTier } from '@/viz/widget';
import { bindViewerScreenViz, refreshViewerScreenMotion } from '@/viz/viewerScreenViz';
import { TimeControls } from '@/components/TimeControls';
import { AnimationLoop } from '@/core/AnimationLoop';
import { CameraManager } from '@/core/CameraManager';
import { LightManager } from '@/core/LightManager';
import { RendererManager } from '@/core/RendererManager';
import { SceneManager } from '@/core/SceneManager';
import { createDataSource } from '@/data/createDataSource';
import { probeAtTime, probeSeriesValueRange, type SampleProbeSeries } from '@/data/probeSeries';
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
import {
  CSV_STRUCTURE,
  fluidGridDims,
  paramsToFlumeGeometry,
  terrainGridDims,
} from '@/constants/experiment';
import type { FluidQuantity, FluidSeries } from '@/types/fluid';
import type { ScourSeries } from '@/types/terrain';
import {
  DEFAULT_SIM_PARAMS,
  frameIntervalSeconds,
  mergePanelParams,
  type SimParams,
} from '@/types/simParams';
import { normalizeFluidQuantityRange } from '@/utils/fluidQuantityColor';
import { scalePierScourReadings } from '@/utils/pierScourDisplayScale';
import { pierScourDepths } from '@/utils/pierScourSample';
import { AxisTriad } from '@/components/AxisTriad';
import { CfdFrameReadout } from '@/components/CfdFrameReadout';
import { CfdLayerPanel } from '@/components/CfdLayerPanel';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import { cfdLayers } from '@/state/cfdLayers';
import {
  createCfdFlowField,
  estimateSpeedMax,
  type CfdFlowSource,
  type FlowPier,
} from '@/data/cfdFlowField';
import { CFD_SETTINGS } from '@/constants/cfdSettings';
import { CfdPathlines } from '@/modules/CfdPathlines';
import { CfdVectorGlyphs } from '@/modules/CfdVectorGlyphs';
import { CfdCutPlane } from '@/modules/CfdCutPlane';
import { CfdVelocityColorbar } from '@/components/CfdVelocityColorbar';
import { CfdProbePanel } from '@/components/CfdProbePanel';
import { CfdProbeMarker } from '@/modules/CfdProbeMarker';
import { computeCfdProbe } from '@/utils/cfdProbe';
import { captureSceneScreenshot, scdtScreenshotName } from '@/utils/screenshot';
import {
  alignFluidSeriesToTerrain,
  defaultFluidSliceHeight,
  fluidHeightRange,
  fluidYiAtWorldY,
  sceneViewRadius,
  sampleTerrainBedAtWorld,
  terrainDomainXZExtents,
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
  // 유속 없는 하상 변화 CSV: 하상 변화(scrdif) 범위는 CSV 전체 min/max 를 쓴다.
  const scourOnly = state.probeSeries !== null && !state.probeFluidField;
  return selected.map((q) => {
    const range =
      scourOnly && q === 'scrdif' && state.probeSeries
        ? probeSeriesValueRange(state.probeSeries, 'scrdif')
        : usePoints
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

/** 장면을 교체할 때 보던 시각·재생 상태를 이어 가는 옵션(케이스 전환용). */
interface SwapOptions {
  restoreTime?: number;
  playing?: boolean;
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
  /** 실측 CSV 는 세굴심에 표시용 배율을 적용하지 않는다. */
  pierDisplayScale: boolean;
  durationSeconds: number;
  /** 이 sim 에 종속된 지연 생성 모듈(CFD 레이어 등)의 정리 함수 */
  disposers: Array<() => void>;
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
    ...(p.scourSearchRadius !== undefined ? { scourSearchRadius: p.scourSearchRadius } : {}),
    ...(p.footing ? { footing: p.footing } : {}),
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
    piers: buildPierLayout(params).map((p) => ({
      id: p.id,
      x: p.x,
      z: p.z,
      ...(p.height !== undefined ? { height: p.height } : {}),
      ...(p.scourSearchRadius !== undefined ? { scourSearchRadius: p.scourSearchRadius } : {}),
      ...(p.footing ? { footing: p.footing } : {}),
    })),
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

  const disposers: Array<() => void> = [];
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
    pierDisplayScale: probeSeries === null,
    durationSeconds,
    disposers,
    dispose() {
      for (const fn of disposers) fn();
      disposers.length = 0;
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
  initGlobalVizTooltips();
  const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement | null;
  const appRoot = document.getElementById('app');
  const dockLeft = document.getElementById('dock-left');
  const dockRight = document.getElementById('dock-right');
  const viewerStage = document.getElementById('viewer-stage');
  const viewerCenter = document.getElementById('viewer-center');
  const viewerMain = document.getElementById('viewer-main');
  const gnbMount = document.getElementById('gnb');
  const subnavMount = document.getElementById('subnav');
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
    !placeholderHost
  ) {
    throw new Error(
      '필수 DOM (#scene-canvas, #app, docks, #viewer-stage, #viewer-center, #gnb, #subnav) 을 찾을 수 없습니다.',
    );
  }

  /** 하단 상태바 UI 제거 — 기존 update 호출부 호환용 no-op */
  const statusBar = {
    update: (..._args: unknown[]): void => {},
    setKeyboardHintsVisible: (..._args: unknown[]): void => {},
    dispose: (): void => {},
  };

  let navigateToScreen: (screen: ScreenId) => void = (screen) => {
    router.goto(screen);
  };

  const globalNav = new GlobalNav({
    onNavigate: (screen) => navigateToScreen(screen),
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
    onNavigate: (screen) => navigateToScreen(screen),
  });
  subnavMount.appendChild(viewerSubNav.element);

  const screenPlaceholder = new ScreenPlaceholder(router.screen);
  placeholderHost.appendChild(screenPlaceholder.element);

  const mockAlertSopStore = new MockAlertSopStore();
  const openSopScreen = (): void => router.goto(10);
  const alertSopPage = new AlertSopPage({
    store: mockAlertSopStore,
    caseId: '미생성',
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
      showCase(caseId);
      router.goto(4);
    },
    onOpenDataPipeline: () => router.goto(3),
    onOpenDataPipelineError: (caseId) => {
      dataPipelinePage.focusFile(caseId === 'B-015' ? 'B-015_run01.csv' : caseId);
      router.goto(3);
    },
    onStartNewSimulation: () => {
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
    statusBar.setKeyboardHintsVisible(showViewer);
  };

  syncShellLayout(router.screen);

  const conditionSetupCaseBar = new ConditionSetupCaseBar({
    onOpenPipeline: () => router.goto(3),
    onCaseChange: (caseId) => {
      showCase(caseId);
    },
  });

  const showCase = (caseId: string): void => {
    if (!caseId) {
      statusBar.update({ caseId: '미생성' });
      globalNav.setCaseLabel('케이스 미생성');
      alertSopPage.setCaseId('미생성');
      conditionSetupCaseBar.setCaseId('');
      return;
    }
    statusBar.update({ caseId });
    globalNav.setCaseLabel(headlineForCase(caseId));
    alertSopPage.setCaseId(caseId);
    conditionSetupCaseBar.setCaseId(caseId);
  };

  const headlineForCase = (caseId: string): string => {
    const row = caseManagementPage.findCase(caseId);
    if (!row) return `Case ${caseId}`;
    return formatCaseHeadline(row.id, row.shape, row.diameterM, row.pierCount);
  };

  const riskJudgmentPanel = new RiskJudgmentPanel({ onOpenSop: openSopScreen });

  const planViewOverlay = new PlanViewOverlay();
  viewerMain.appendChild(planViewOverlay.element);

  const sectionProfilePanel = new SectionProfilePanel({
    onSectionChange: (sec) => {
      viewState.setSectionId(sec);
      planViewGuide.setSection(sec);
      planViewOverlay.setSection(sec);
      planViewOverlay.setHover(null);
      planViewOverlay.setActiveTransversePierId(sectionProfilePanel.getTransversePierId());
      if (router.screen === 6) {
        statusBar.update({ extra: sec === 'A' ? '단면 A–A′' : '단면 B–B′' });
        planViewOverlay.draw();
      }
    },
    onHover: (point) => {
      planViewOverlay.setHover(point);
      if (router.screen === 6) planViewOverlay.draw();
    },
    onTransversePierChange: (pierId) => {
      viewState.setSelectedPier(pierId);
      planViewOverlay.setActiveTransversePierId(pierId);
      if (router.screen === 6) planViewOverlay.draw();
    },
  });
  viewerCenter.appendChild(sectionProfilePanel.element);
  sectionProfilePanel.element.classList.add('is-hidden');

  const planViewGuide = new PlanViewGuide({
    onSectionChange: (sec) => {
      sectionProfilePanel.setSection(sec);
      viewState.setSectionId(sec);
      planViewOverlay.setSection(sec);
      planViewOverlay.setHover(null);
      planViewOverlay.setActiveTransversePierId(sectionProfilePanel.getTransversePierId());
      if (router.screen === 6) {
        statusBar.update({ extra: sec === 'A' ? '단면 A–A′' : '단면 B–B′' });
        planViewOverlay.draw();
        sectionProfilePanel.notifyLayout();
      }
    },
  });
  viewerMain.appendChild(planViewGuide.element);

  // 보기 모드(기본/CFD)는 viewState 에 두어 5~9번 화면을 오가도 유지한다. 지금 단계는 토글·상태만 있고,
  // CFD 전용 렌더 레이어는 viewState.subscribe 로 viewMode 를 읽어 이후 단계에서 붙인다.
  const viewModeToggle = new ViewModeToggle(viewState.viewMode, {
    onChange: (mode) => viewState.setViewMode(mode),
  });
  viewerMain.appendChild(viewModeToggle.element);
  const cfdLayerPanel = new CfdLayerPanel(cfdLayers, {
    get: () => viewState.sectionId,
    set: (sec) => viewState.setSectionId(sec),
    subscribe: (fn) => viewState.subscribe(fn),
  });
  const cfdFrameReadout = new CfdFrameReadout();
  const axisTriad = new AxisTriad();
  const cfdVelocityColorbar = new CfdVelocityColorbar();
  viewerMain.append(
    cfdLayerPanel.element,
    cfdFrameReadout.element,
    axisTriad.element,
    cfdVelocityColorbar.element,
  );
  /** CFD 전용 후처리 UI 는 CFD 모드 + 5~9번 화면에서만 보인다(기본 모드에서는 계산도 하지 않는다). */
  const cfdChromeActive = (): boolean =>
    viewState.viewMode === 'cfd' && router.screen >= 5 && router.screen <= 9;
  const syncCfdChrome = (): void => {
    const on = cfdChromeActive();
    cfdLayerPanel.setVisible(on);
    cfdFrameReadout.setVisible(on);
    axisTriad.setVisible(on);
  };
  /**
   * CFD 유동장 소스는 sim 마다 처음 필요할 때 한 번만 만든다(기본 모드에서는 만들지 않는다).
   * 해석 유속(u·v·w)이 들어 있으면 실데이터, 없으면 합성 유동장(목업).
   */
  const cfdFlowCache = new WeakMap<object, CfdFlowSource>();
  const cfdBedAt =
    (state: SimState) =>
    (x: number, z: number): number | null =>
      sampleTerrainBedAtWorld(state.series.baseTerrain, undefined, x, z);
  const cfdPiersOf = (state: SimState): FlowPier[] => {
    const defaultDiameter = Math.max(params.pierDiameter, 1e-3);
    // 기둥 형상·하단부(footing)·기준 높이는 PierMarker 가 그리는 것과 같아야 유선이 실제 구조물을 통과하지 않는다.
    return state.pierDefs.map((d) => {
      const pier: FlowPier = {
        x: d.x,
        z: d.z,
        radius: (d.diameter ?? defaultDiameter) / 2,
        shape: d.shape === 'square' ? 'square' : 'circle',
        baseY: 0, // buildSimState 의 PierMarker baseElevation
      };
      if (d.footing) pier.footing = d.footing;
      return pier;
    });
  };
  const cfdFlowFor = (state: SimState): CfdFlowSource => {
    let flow = cfdFlowCache.get(state);
    if (!flow) {
      flow = createCfdFlowField({
        fluidSeries: state.fluidSeries,
        inflowSpeed: Math.abs(params.fluidU) > 1e-6 ? params.fluidU : params.inflowSpeed,
        waterLevelY: state.waterLevelY,
        bedElevation: cfdBedAt(state),
        piers: cfdPiersOf(state),
      });
      cfdFlowCache.set(state, flow);
    }
    return flow;
  };

  /** CFD 유동장 레이어(유선·벡터)는 켜질 때 처음 만들고, sim 이 교체되면 함께 정리한다. */
  interface CfdFlowViz {
    pathlines: CfdPathlines | null;
    glyphs: CfdVectorGlyphs | null;
    cut: CfdCutPlane | null;
    cutOn: boolean;
    speedMax: number;
    pathOn: boolean;
    vecOn: boolean;
  }
  const cfdVizCache = new WeakMap<object, CfdFlowViz>();
  const cfdVizFor = (state: SimState): CfdFlowViz => {
    let viz = cfdVizCache.get(state);
    if (!viz) {
      const created: CfdFlowViz = {
        pathlines: null,
        glyphs: null,
        cut: null,
        cutOn: false,
        speedMax: estimateSpeedMax(
          cfdFlowFor(state),
          terrainDomainXZExtents(state.series.baseTerrain),
          cfdBedAt(state),
          state.waterLevelY,
        ),
        pathOn: false,
        vecOn: false,
      };
      state.disposers.push(() => {
        created.pathlines?.dispose();
        created.glyphs?.dispose();
        created.cut?.dispose();
      });
      cfdVizCache.set(state, created);
      viz = created;
    }
    return viz;
  };
  const syncCfdFlowViz = (): void => {
    const chrome = cfdChromeActive();
    const planView = router.screen === 6; // 평면뷰는 상부 시점 고정이라 유동장 레이어를 숨긴다
    const wantPath = chrome && !planView && cfdLayers.isOn('pathlines');
    const wantVec = chrome && !planView && cfdLayers.isOn('vectors');
    const wantCut = chrome && !planView && cfdLayers.isOn('cutPlane');
    const existing = cfdVizCache.get(sim);
    if (!wantPath && !wantVec && !wantCut && !existing) {
      cfdVelocityColorbar.setVisible(false);
      return;
    }
    const viz = cfdVizFor(sim);
    const flow = cfdFlowFor(sim);
    const base = sim.series.baseTerrain;
    const bounds = terrainDomainXZExtents(base);
    if (wantPath && !viz.pathlines) {
      viz.pathlines = new CfdPathlines({
        scene: sceneManager.scene,
        flow,
        bounds,
        bedAt: cfdBedAt(sim),
        waterLevelY: sim.waterLevelY,
        piers: cfdPiersOf(sim),
        speedMax: viz.speedMax,
      });
    }
    if (wantVec && !viz.glyphs) {
      viz.glyphs = new CfdVectorGlyphs({
        scene: sceneManager.scene,
        flow,
        bounds,
        bedAt: cfdBedAt(sim),
        waterLevelY: sim.waterLevelY,
        speedMax: viz.speedMax,
      });
    }
    if (wantCut && !viz.cut) {
      viz.cut = new CfdCutPlane({
        scene: sceneManager.scene,
        flow,
        bounds,
        bedAt: cfdBedAt(sim),
        waterLevelY: sim.waterLevelY,
        speedMax: viz.speedMax,
      });
    }
    viz.pathOn = wantPath;
    viz.vecOn = wantVec;
    viz.cutOn = wantCut;
    viz.cut?.setVisible(wantCut);
    if (viz.cut && wantCut) {
      // 종단(A–A′)=XZ 평면(고정 Z), 횡단(B–B′)=YZ 평면(고정 X). 위치는 수동이 아니면 평면·단면 화면의 단면선(선택 교각)에 맞춘다.
      const axis = viewState.sectionId === 'A' ? 'longitudinal' : 'transverse';
      const frac = cfdLayers.cutPosition;
      const range = viz.cut.positionRange(axis);
      const pierId = viewState.selectedPierId ?? defaultTransversePierId(sim.pierDefs);
      const auto =
        axis === 'longitudinal'
          ? longitudinalLineWorldZ(sim.pierDefs, viewState.selectedPierId ?? undefined)
          : transverseLineWorldX(sim.pierDefs, pierId);
      viz.cut.setPlane(axis, frac === null ? auto : range.min + frac * (range.max - range.min));
    }
    viz.pathlines?.setVisible(wantPath);
    viz.glyphs?.setVisible(wantVec);
    viz.glyphs?.setDensity(cfdLayers.vectorDensity);
    cfdVelocityColorbar.setRange(viz.speedMax);
    cfdVelocityColorbar.setFlowOrigin(flow.origin);
    cfdVelocityColorbar.setVisible(chrome && (wantPath || wantVec || wantCut));
  };

  /**
   * 수면·교량 표시와 자유수면 교란. 기본 화면의 표시 규칙(수면 체크, 7번 화면은 교량 숨김)을 그대로 따르고,
   * CFD 모드에서만 레이어 토글(수면·교량)과 교란 파형을 추가로 적용한다. 평면뷰(6)와 조건설정(4)은 건드리지 않는다.
   */
  const applyCfdSurfaceBridge = (): void => {
    const s = router.screen;
    if (s < 5 || s > 9 || s === 6) return;
    const cfd = viewState.viewMode === 'cfd';
    const surfaceLayer = !cfd || cfdLayers.isOn('freeSurface');
    sim.terrainWater.setVisible(fluidControls.isSliceVisible() && surfaceLayer);
    sim.pierMarker.setBridgeStructureVisible(s !== 7 && (!cfd || cfdLayers.isOn('bridge')));
    sim.terrainWater.setSurfaceDisturbance(
      cfd && cfdLayers.isOn('freeSurface')
        ? {
            piers: cfdPiersOf(sim),
            inflowSpeed: Math.abs(params.fluidU) > 1e-6 ? params.fluidU : params.inflowSpeed,
            gain: CFD_SETTINGS.surfaceDisturbanceGain,
          }
        : null,
    );
  };
  let lastSurfaceOpacity = cfdLayers.surfaceOpacity;

  /** CFD 모드 하상 표현(색·등심선·메시). 기본 모드에서는 항상 기존 모래색 표현으로 되돌린다. */
  const applyCfdBedStyle = (): void => {
    const cfd = viewState.viewMode === 'cfd';
    const contour = cfd && cfdLayers.isOn('bedContour');
    sim.terrain.setColorMode(!cfd ? 'basic' : contour ? 'cfd' : 'plain');
    sim.terrain.setIsolinesVisible(cfd && cfdLayers.isOn('isolines'));
    sim.terrain.setWireframeVisible(cfd && cfdLayers.isOn('mesh'));
    legend.setStyle(cfd ? 'cfd' : 'basic');
    if (!cfd) clearCfdProbe();
    if (cfd) cfdLayerPanel.setFlowOrigin(cfdFlowFor(sim).origin);
    syncCfdFlowViz();
    applyCfdSurfaceBridge();
    if (cfd && cfdLayers.surfaceOpacity !== lastSurfaceOpacity) {
      lastSurfaceOpacity = cfdLayers.surfaceOpacity;
      fluidSliceOpacity = lastSurfaceOpacity;
      applyFluidPrimaryQuantity(fluidControls.getPrimaryQuantity());
    }
  };
  viewState.subscribe(() => {
    viewModeToggle.setMode(viewState.viewMode);
    syncCfdChrome();
    applyCfdBedStyle();
  });
  cfdLayers.subscribe(applyCfdBedStyle);

  planViewOverlay.setOnPierPick((pierId) => {
    sectionProfilePanel.setTransversePierId(pierId);
    viewState.setSelectedPier(pierId);
    planViewOverlay.setActiveTransversePierId(pierId);
    planViewOverlay.draw();
  });

  observeWidgetTier(viewerStage, (tier) => {
    viewerStage.dataset.tier = tier;
  });
  observeWidgetTier(dockLeft);
  observeWidgetTier(dockRight);

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

  const pierIdFromObjectName = (name?: string): string | null => {
    if (!name) return null;
    const m = /^pier-(P\d+)$/.exec(name);
    return m?.[1] ?? null;
  };

  const applyViewStateToViewer = (): void => {
    pierLabelOverlay.setFocusState(viewState.selectedPierId, viewState.hoveredPierId);
    if (router.screen !== 6) {
      sim.pierMarker.setPierFocus(viewState.selectedPierId, viewState.hoveredPierId);
    }
  };
  viewState.subscribe(applyViewStateToViewer);

  const pierPicking = new Picking({
    canvas,
    camera: cameraManager.camera,
    pickables: sim.pierMarker.getPierPickables(),
    hoverThrottleMs: 48,
  });
  pierPicking.onClick((hit) => {
    if (!isViewerScreen(router.screen) || router.screen === 6) return;
    const id = pierIdFromObjectName(hit?.objectName);
    if (id) viewState.setSelectedPier(id);
  });
  pierPicking.onHover((hit) => {
    if (!isViewerScreen(router.screen) || router.screen === 6) {
      viewState.setHoveredPier(null);
      canvas.classList.remove('is-pier-hover');
      return;
    }
    const id = pierIdFromObjectName(hit?.objectName);
    viewState.setHoveredPier(id);
    canvas.classList.toggle('is-pier-hover', id != null);
  });

  // ── CFD 클릭 프로브: 하상을 클릭하면 좌표·표고 변화·유속·전단응력을 보여 준다(CFD 모드 전용).
  let cfdProbeAt: { x: number; z: number } | null = null;
  const cfdProbeMarker = new CfdProbeMarker(
    sceneManager.scene,
    Math.max(sim.terrain.cellSize * 3, 0.02),
  );
  const clearCfdProbe = (): void => {
    cfdProbeAt = null;
    cfdProbePanel.setSample(null);
    cfdProbeMarker.hide();
  };
  const cfdProbePanel = new CfdProbePanel(() => clearCfdProbe());
  viewerMain.appendChild(cfdProbePanel.element);
  const refreshCfdProbe = (t: number): void => {
    if (!cfdProbeAt) return;
    const q =
      cfdChromeActive() && router.screen !== 6
        ? sim.terrain.queryAtWorld(cfdProbeAt.x, cfdProbeAt.z)
        : null;
    if (!q) {
      clearCfdProbe();
      return;
    }
    const flow = cfdFlowFor(sim);
    cfdProbePanel.setFlowOrigin(flow.origin);
    cfdProbePanel.setSample(
      computeCfdProbe({
        flow,
        x: cfdProbeAt.x,
        z: cfdProbeAt.z,
        elevation: q.elevation,
        deltaElevation: q.deltaElevation,
        baseElevation: q.baseElevation,
        waterLevelY: sim.waterLevelY,
        t,
      }),
    );
    cfdProbeMarker.setPosition(cfdProbeAt.x, q.elevation, cfdProbeAt.z);
  };
  const bedPicking = new Picking({
    canvas,
    camera: cameraManager.camera,
    pickables: [...sim.terrain.pickables, ...sim.pierMarker.getPierPickables()],
    emitOnHover: false,
  });
  // 궤도 회전(드래그) 끝에서 발생하는 click 은 프로브로 취급하지 않는다.
  let probePointerDown: { x: number; y: number } | null = null;
  let probeDragged = false;
  canvas.addEventListener('pointerdown', (e) => {
    probePointerDown = { x: e.clientX, y: e.clientY };
    probeDragged = false;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (probePointerDown) {
      probeDragged = Math.hypot(e.clientX - probePointerDown.x, e.clientY - probePointerDown.y) > 4;
    }
  });
  bedPicking.onClick((hit) => {
    if (probeDragged || !hit || !cfdChromeActive() || router.screen === 6) return;
    if (hit.objectName?.startsWith('pier-')) return; // 교각 클릭은 교각 선택으로 처리
    cfdProbeAt = { x: hit.worldX, z: hit.worldZ };
    refreshCfdProbe(timeControls.time);
  });

  const syncPierPickables = (): void => {
    pierPicking.updatePickables(sim.pierMarker.getPierPickables());
    bedPicking.updatePickables([...sim.terrain.pickables, ...sim.pierMarker.getPierPickables()]);
  };

  const timeControls = new TimeControls({
    durationSeconds: 0,
    autoPlay: false,
    loop: true,
  });
  timeControls.setTimelineEnabled(false, '「적용하고 결과 보기」 후 재생');
  viewerCenter.appendChild(timeControls.element);
  pierTimelinePanel.setScrubHandler((t) => {
    if (timeControls.isTimelineEnabled) timeControls.setTime(t);
  });

  const viewerToast = new ViewerToast();
  viewerCenter.appendChild(viewerToast.element);

  navigateToScreen = (screen: ScreenId): void => {
    if (screen === 4 && timeControls.isPlaying) timeControls.setPlaying(false);
    router.goto(screen);
  };

  /** 5~9번 진입 시 재생 불가 안내 토스트 — 세션당 1회(적용 성공 후 리셋) */
  let pendingViewerPlaybackHint = true;
  const maybeShowViewerPlaybackHint = (screen: ScreenId, prev: ScreenId): void => {
    if (screen === prev) return;
    if (screen < 5 || screen > 9) return;
    if (timeControls.isTimelineEnabled) return;
    if (!pendingViewerPlaybackHint) return;
    pendingViewerPlaybackHint = false;
    viewerToast.show(
      '4번 조건 설정에서 CSV 파싱 후 「적용하고 결과 보기」를 누르면 재생·분석을 사용할 수 있습니다.',
    );
  };

  const legend = new ColorLegend({
    title: '범례 — 세굴심 (scrdif)',
    unit: 'm',
    initialAbsMax: sim.terrain.absMax,
  });

  // 유체 필드(u/v/w/scrdif) 실측 오버레이 — 씬 위 플로팅 범례.
  const fluidFieldLegend = new FluidFieldLegend();
  viewerCenter.appendChild(fluidFieldLegend.element);
  /** 매 프레임 setProbeQuantity 에 쓰는 현재 항목의 고정 색 범위(재생 중 흔들리지 않도록). */
  let currentProbeRange: { min: number; max: number } | null = null;
  /** 하상 변화(scrdif) 표시 때 지형 높이를 키우는 배율. 「케이스」 상자에서 고른다. */
  let heightExaggeration = DEFAULT_HEIGHT_EXAGGERATION;

  let lastFluidLegendKey = '';

  const refreshFluidProbeOverlays = (primary: FluidQuantity): void => {
    const probeSeries = sim.probeSeries;
    const key = probeSeries ? probeKeyForQuantity(primary) : null;
    if (!probeSeries || !key) {
      currentProbeRange = null;
      sim.terrainWater.setColorRange(null);
      fluidFieldLegend.setVisible(false);
      return;
    }
    fluidFieldLegend.setVisible(true);
    const range = probeQuantityRange(probeSeries, primary) ?? { min: 0, max: 1 };
    currentProbeRange = range;
    sim.terrainWater.setColorRange(null);
    const label = fluidDashboardLabel(primary);
    const unit = fluidUnitForQuantity(primary, sim.fluidSeries.metadata);
    const note =
      primary === 'scrdif'
        ? '파란=세굴 · 베이지=변화 없음 · 황토=퇴적. 수면을 투명하게 하면 지형 굴곡이 잘 보입니다.'
        : '';
    fluidFieldLegend.setNoteTooltip('');
    fluidFieldLegend.setQuantity(primary, label, range, unit, note);
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
      sim.terrainWater.setVerticalExaggeration(heightExaggeration);
      sim.terrain.setVerticalExaggeration(heightExaggeration);
      sim.sedimentLayer.setVerticalExaggeration(heightExaggeration);
    } else {
      sim.terrainWater.setOpacity(fluidSliceOpacity);
      sim.terrainWater.setVerticalExaggeration(1);
      sim.terrain.setVerticalExaggeration(1);
      sim.sedimentLayer.setVerticalExaggeration(1);
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
        applyCfdSurfaceBridge();
      },
      onTracersVisibilityChange: (v) => sim.tracers.setVisible(v),
    },
  );
  fluidControls.element.classList.add('viz-widget');
  fluidControls.element.dataset.widgetId = 'fluid-controls';
  observeWidgetTier(fluidControls.element);
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
    sim.pierDisplayScale,
  );

  const syncAlertSopSnapshot = (): void => {
    const tEnd = sim.durationSeconds;
    const raw = pierScourDepths(sim.series, sim.pierDefs, tEnd);
    const depthsAtEnd = scalePierScourReadings(
      raw,
      params.foundationDepth,
      tEnd,
      sim.durationSeconds,
      sim.pierDisplayScale,
    );
    alertSopPage.setContext(depthsAtEnd, params.foundationDepth, sim.durationSeconds);
  };
  syncAlertSopSnapshot();

  const syncViewerChrome = (screen: ScreenId): void => {
    const cellMode = screen === 7;
    const gradeLabels = screen === 5 || screen === 7 || screen === 8 || screen === 9;
    const riskMode = screen === 9;
    const setupView = screen === 4;
    const analysisView = screen >= 6 && screen <= 9;
    riskJudgmentPanel.setVisible(riskMode);
    activePierMonitor.element.classList.toggle('is-hidden', riskMode || setupView);
    gradeLegendPanel.element.classList.toggle('is-hidden', !cellMode);
    pierLabelOverlay.setEnabled(gradeLabels);
    viewerStage.classList.toggle('is-viewer-analysis', analysisView);
    viewerStage.classList.toggle('is-screen-plan', screen === 6);
    viewerStage.classList.toggle('is-screen-grade', screen === 7);
    viewerStage.classList.toggle('is-screen-timeline', screen === 8);
    viewerStage.classList.toggle('is-screen-risk', screen === 9);
    activePierMonitor.element.classList.toggle(
      'pier-scour-monitor--viz',
      screen >= 5 && screen <= 8,
    );
    fluidControls.element.classList.toggle('fluid-controls--viewer', screen >= 5 && screen <= 9);
    planViewGuide.element.classList.toggle('is-hidden', screen !== 6);
    viewModeToggle.setVisible(screen >= 5 && screen <= 9);
    syncCfdChrome();
    syncCfdFlowViz();
  };

  let stopViewerScreenMotion: (() => void) | null = null;
  const kickViewerScreenMotion = (screen: ScreenId): void => {
    stopViewerScreenMotion?.();
    if (screen < 6 || screen > 9) return;
    stopViewerScreenMotion = refreshViewerScreenMotion(viewerStage);
    viewerStage.classList.add('viewer-screen--enter');
    window.setTimeout(() => viewerStage.classList.remove('viewer-screen--enter'), 880);
  };

  const unbindViewerScreenViz = bindViewerScreenViz({
    viewerStage,
    getScreen: () => router.screen,
    sectionPanel: sectionProfilePanel.element,
    timelinePanel: pierTimelinePanel.element,
    gradeLegend: gradeLegendPanel.element,
    riskPanel: riskJudgmentPanel.element,
    pierMonitor: activePierMonitor.element,
    fluidControls: fluidControls.element,
    onReachScrub: (t) => {
      if (!timeControls.isTimelineEnabled) return;
      timeControls.setTime(t);
    },
  });

  /** 4번에서 적용 완료 후 이동할 화면 */
  let navigateAfterApply: ScreenId | null = null;
  /** 이번 CSV 적용에서 발급된 ID. 이동 토스트에 한 번 적는다. */
  let issuedCaseId = '';
  /** 4번에서 파싱만 끝난 CSV 케이스들. 적용 버튼을 누를 때 장면에 넣는다. */
  let stagedCases: CsvDashboardLoadResult[] = [];
  /** 장면에 적용되어 뷰어에서 전환할 수 있는 케이스들. */
  let activeCases: CsvDashboardLoadResult[] = [];
  const caseSwitcher = new CaseSwitcher();
  /** 교각 주변만 표시(경계 영향 구역 제외). 「케이스」 상자의 체크와 같다. */
  let regionOnly = true;
  /** 케이스의 원본 격자값으로 현재 표시 범위에 맞는 세굴 시리즈를 만든다(약 50 ms). */
  const viewOfCase = (c: CsvDashboardLoadResult): ReturnType<typeof buildScrdifDashboard> =>
    buildScrdifDashboard(c.dataset, { scenario: c.scenario, regionOnly });
  // eslint-disable-next-line prefer-const -- applyParams 가 선언보다 앞에서 csvUploadPanel 참조
  let csvUploadPanel!: CsvUploadPanel;
  // eslint-disable-next-line prefer-const -- collectParams 가 선언 전 참조
  let experimentInfoPanel: ExperimentInfoPanel;

  const collectParams = (): SimParams =>
    mergePanelParams(params, experimentInfoPanel.getParams(), fluidControls.getParams(), params);

  /**
   * 실측 CSV 케이스의 조건. 고정 조건(환경조건.xlsx: 기둥 직경·기초 근입·모래지반 두께)에
   * FLOW-3D 시나리오 조건(d50·수심·유속)을 얹는다. 시나리오가 없으면 고정 조건만 쓴다.
   */
  const csvCaseParams = (scenario: FlowScenario | null): SimParams => ({
    ...collectParams(),
    pierDiameter: CSV_STRUCTURE.diameterM,
    structureShape: 'circle',
    foundationDepth: CSV_STRUCTURE.foundationDepthM,
    sedimentThickness: CSV_STRUCTURE.sedimentThicknessM,
    ...(scenario
      ? {
          waterDepth: scenario.waterDepthM,
          sandGrainSizeMm: scenario.d50Mm,
          inflowSpeed: scenario.velocityMS,
          fluidU: scenario.velocityMS,
        }
      : {}),
  });

  const applyParams = (
    newParams: SimParams,
    baseScour: ScourSeries | null = null,
    baseFluid: FluidSeries | null = null,
    coordinateFluid = false,
    probeSeries: SampleProbeSeries | null = null,
    issueCase = false,
    swapOptions: SwapOptions = {},
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
        swapSim(next, newParams, issueCase, swapOptions);
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

  const swapSim = (
    next: SimState,
    nextParams: SimParams = params,
    issueCase = false,
    swapOptions: SwapOptions = {},
  ): void => {
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
      next.pierDisplayScale,
    );
    if (issueCase) adoptIssuedCase(nextParams);
    syncAlertSopSnapshot();
    pierLabelOverlay.setPiers(next.pierDefs);

    legend.setRange(next.terrain.absMax);
    next.terrain.onFrameApplied(({ absMax }) => legend.setRange(absMax));
    const autoPlayAfterApply = navigateAfterApply === 5;
    const canPlayback = next.durationSeconds > 1e-6;
    timeControls.setDuration(canPlayback ? next.durationSeconds : 0);
    const resumeAtTime = swapOptions.restoreTime !== undefined;
    timeControls.setTime(swapOptions.restoreTime ?? 0, { force: true, silent: !canPlayback });
    timeControls.setTimelineEnabled(canPlayback, '「적용하고 결과 보기」 후 재생');
    pendingViewerPlaybackHint = !canPlayback;
    if (!canPlayback) {
      timeControls.setPlaying(false);
    } else if (resumeAtTime) {
      timeControls.setPlaying(swapOptions.playing ?? false);
    } else if (autoPlayAfterApply) {
      timeControls.setPlaying(true);
    }

    fluidControls.setHeightRange(next.fluidMinY, next.fluidMaxY);
    fluidControls.setSliceHeight(next.waterLevelY);
    next.slicePlane.setHeight(next.waterLevelY);
    next.terrainWater.setWaterLevel(next.waterLevelY);
    next.slicePlane.setVisible(false);
    // 유속 데이터가 없는 하상 변화 CSV: 유속 항목·추적 입자는 숨긴다.
    const scourOnly = next.probeSeries !== null && !next.probeFluidField;
    fluidControls.setScourOnlyMode(scourOnly);
    // 수면은 기본으로 켜 두고, 항목 전환·재생 중에도 기본 물 색을 유지한다.
    next.terrainWater.setBaseColorOnly(scourOnly);
    next.terrainWater.setVisible(true);
    fluidControls.setSliceChecked(true);
    next.arrows.setVisible(false);
    fluidControls.setTracersAvailable(!scourOnly, !scourOnly);
    next.tracers.setVisible(!scourOnly && fluidControls.isTracersVisible());
    next.tracers.setWaterLevel(next.waterLevelY);
    applyTracerVelocity(next, nextParams, 0);
    next.fluidPoints.setVisible(false);

    // sim 을 next 로 먼저 교체해야 아래 applyFluidPrimaryQuantity(항목·투명도·과장 배율 설정)가
    // 방금 폐기된 옛 인스턴스가 아니라 실제로 화면에 보이는 next 에 적용된다.
    params = nextParams;
    sim = next;
    applyCfdBedStyle();
    syncPierPickables();
    applyViewStateToViewer();
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
      if (issuedCaseId && canPlayback && target === 5) {
        viewerToast.show(
          `케이스 ${issuedCaseId} 생성 · 시뮬레이션 재생 중 — 타임라인에서 일시정지·구간 이동 가능`,
        );
      } else if (issuedCaseId) {
        viewerToast.show(`케이스 ${issuedCaseId}가 생성되었습니다.`);
      } else if (canPlayback && target === 5) {
        viewerToast.show('시뮬레이션 재생 중 — 타임라인에서 일시정지·구간 이동 가능');
      }
      issuedCaseId = '';
    }
  };

  const adoptIssuedCase = (nextParams: SimParams): void => {
    const id = nextCaseId(caseManagementPage.knownCaseIds());
    const shape = nextParams.structureShape === 'square' ? '사각기둥' : '원기둥';
    issuedCaseId = id;
    caseManagementPage.registerIssuedCase({
      id,
      shape,
      diameterM: nextParams.pierDiameter,
      pierCount: nextParams.pierCount,
      flow: nextParams.fluidU.toFixed(3),
      d50: String(nextParams.sandGrainSizeMm),
      maxScourM: null,
      status: 'run',
      updatedAt: stampCaseNow(),
      selected: true,
    });
    conditionSetupCaseBar.pinIssuedCase(id, `${id} · 해석중 · ${shape}`);
    showCase(id);
  };

  const stampCaseNow = (): string => {
    const now = new Date();
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };

  experimentInfoPanel = new ExperimentInfoPanel(params);

  csvUploadPanel = new CsvUploadPanel({
    onApplyScene: () => {
      const staged = stagedCases[0];
      if (!staged) {
        viewerToast.show('CSV 파싱을 먼저 완료한 뒤 적용해 주세요.');
        return;
      }
      if (router.screen === 4) navigateAfterApply = 5;
      activeCases = stagedCases;
      caseSwitcher.setCases(
        activeCases.map((c) => ({ name: c.caseName, scenario: c.scenario })),
        0,
      );
      const view = viewOfCase(staged);
      applyParams(
        csvCaseParams(staged.scenario),
        view.scour,
        staged.fluid,
        false,
        view.probeSeries,
        true,
      );
    },
    onLoaded: (results) => {
      stagedCases = results;
      const warnings = results.flatMap((r) => r.warnings);
      viewerToast.show(
        warnings.length > 0
          ? `CSV 파싱이 끝났습니다. 확인 필요: ${warnings.join(' / ')}`
          : 'CSV 파싱이 끝났습니다. 조건을 확인한 뒤 「적용하고 결과 보기」를 누르세요.',
      );
    },
    onInvalidated: () => {
      stagedCases = [];
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
  });
  dockLeft.append(
    conditionSetupCaseBar.element,
    csvUploadPanel.element,
    caseSwitcher.element,
    fluidControls.element,
  );
  /** 보던 시각과 재생 상태를 유지한 채 선택한 케이스를 현재 표시 범위로 다시 적용한다. */
  const reapplyCase = (index: number): void => {
    const target = activeCases[index];
    if (!target) return;
    const view = viewOfCase(target);
    applyParams(
      csvCaseParams(target.scenario),
      view.scour,
      target.fluid,
      false,
      view.probeSeries,
      false,
      { restoreTime: timeControls.time, playing: timeControls.isPlaying },
    );
  };
  caseSwitcher.onChange(reapplyCase);
  caseSwitcher.onExaggerationChange((factor) => {
    heightExaggeration = factor;
    applyFluidPrimaryQuantity(fluidControls.getPrimaryQuantity());
  });
  caseSwitcher.onRegionChange((next) => {
    regionOnly = next;
    reapplyCase(caseSwitcher.selectedIndex);
  });

  caseManagementPage.bindStartNewSimulation(() => {
    router.goto(4);
  });

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
  // 저장된 보기 모드가 CFD 이면 첫 화면부터 CFD 표현을 적용한다(관련 컨트롤이 모두 만들어진 뒤).
  applyCfdBedStyle();

  sim.terrain.onFrameApplied(({ absMax }) => legend.setRange(absMax));

  const banner = document.createElement('div');
  banner.className = 'context-banner';
  banner.textContent = 'WebGL 컨텍스트가 손실되었습니다. 복원을 시도하는 중...';
  viewerCenter.appendChild(banner);

  const applyScreenLayout = (screen: ScreenId, prevScreen?: ScreenId): void => {
    if (prevScreen && isViewerScreen(prevScreen) && prevScreen !== 6) {
      viewState.viewerCamera = captureCameraView(cameraManager);
    }
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
      csvUploadPanel.refreshSetupFlow();
      const pendingCsv = takePendingCsvUpload();
      if (pendingCsv && pendingCsv.length > 0) {
        csvUploadPanel.openSetupWithPrefilledFiles(pendingCsv);
        csvUploadPanel.pulseAttention();
      }
    }
    sectionProfilePanel.element.classList.toggle('is-hidden', !planView);
    pierTimelinePanel.element.classList.toggle('is-hidden', !timelineView);
    planViewOverlay.element.style.display = planView ? 'block' : 'none';
    fluidControls.setReadOnlyField(screen >= 5 && screen <= 9);
    fluidControls.setSetupMode(setupView);
    caseSwitcher.setScreenVisible(screen >= 5 && screen <= 9);
    syncViewerChrome(screen);
    gradeLegendPanel.setFoundationDepthM(params.foundationDepth);
    if (showViewer) {
      const size = rendererManager.applyCanvasSize();
      cameraManager.updateAspect(size.width / Math.max(1, size.height));
      syncPlanViewOverlaySize();
      pierLabelOverlay.setCamera(cameraManager.camera);
      if (planView) {
        if (prevScreen !== 6 && prevScreen && isViewerScreen(prevScreen)) {
          viewState.cameraBeforePlanView =
            viewState.viewerCamera ?? captureCameraView(cameraManager);
        }
        const planCenter = new Vector3(0, sim.waterLevelY * 0.5, 0);
        cameraManager.setPlanViewOrbitLock(true);
        cameraManager.applyPlanView(
          sceneViewRadius(sim.series.baseTerrain, sim.fluidSeries),
          planCenter,
        );
        sim.pierMarker.setBridgeStructureVisible(false);
        sim.terrainWater.setVisible(false);
        sim.tracers.setVisible(false);
        sim.pierMarker.resetPierShaftColors();
        sim.pierMarker.setPierFocus(null, null);
        statusBar.update({ extra: buildViewerStatusExtra(screen) });
        requestAnimationFrame(() => sectionProfilePanel.notifyLayout());
      } else {
        cameraManager.setPlanViewOrbitLock(false);
        if (
          prevScreen === 6 &&
          (screen === 4 || screen === 5 || screen === 7 || screen === 8 || screen === 9)
        ) {
          const cam = viewState.cameraBeforePlanView ?? viewState.viewerCamera;
          if (cam) restoreCameraView(cameraManager, cam);
        }
      }
      if (!planView && screen === 7) {
        if (viewState.viewerCamera) restoreCameraView(cameraManager, viewState.viewerCamera);
        else cameraManager.applyPreset('reset', sceneRadius);
        sim.pierMarker.setBridgeStructureVisible(false);
        sim.terrainWater.setVisible(fluidControls.isSliceVisible());
        sim.tracers.setVisible(fluidControls.isTracersVisible());
        statusBar.update({ extra: buildViewerStatusExtra(screen) });
      } else if (!planView) {
        sim.pierMarker.setBridgeStructureVisible(true);
        sim.terrainWater.setVisible(fluidControls.isSliceVisible());
        sim.tracers.setVisible(fluidControls.isTracersVisible());
        if (screen === 4) {
          sim.pierMarker.resetPierShaftColors();
          sim.pierMarker.setPierFocus(null, null);
        }
        statusBar.update({ extra: buildViewerStatusExtra(screen) });
      }
      applyCfdSurfaceBridge();
      loop.start();
    } else {
      cameraManager.setPlanViewOrbitLock(false);
      loop.stop();
      sim.pierMarker.resetPierShaftColors();
      pierLabelOverlay.setEnabled(false);
    }
    kickViewerScreenMotion(screen);
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
        scdtScreenshotName(screen, SCREEN_TITLES[screen], new Date(), viewState.viewMode),
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
    const simDt = timeControls.simulationDelta(delta);
    const dur = timeControls.duration;
    const crossedPlaybackEnd = simDt > 0 && dur > 0 && timeControls.time + simDt >= dur - 1e-6;
    timeControls.tick(delta);
    if (crossedPlaybackEnd) {
      syncTracersWithTimeline(timeControls.duration);
    }
    const t = timeControls.time;
    const timelineLive = timeControls.isTimelineEnabled && timeControls.duration > 0;
    /**
     * 적용 전(타임라인 없음)에는 실시간으로 흐름을 보여 준다.
     * 재생·정지가 있는 뒤에는 재생 중에만 입자를 옮긴다.
     * 정지 중 Δt=0 으로 tick 하면 선분 길이가 0이 되어 입자가 사라지므로, tick 자체를 건너뛴다.
     */
    let tracerAdvectDelta = 0;
    if (!timelineLive) tracerAdvectDelta = delta;
    else if (timeControls.isPlaying && simDt > 0) tracerAdvectDelta = simDt;

    sim.pierMarker.tickPierFocus(delta);
    sim.terrain.updateAtTime(t);
    sim.sedimentLayer.updateAtTime(t);
    const pierDepths = scalePierScourReadings(
      pierScourDepths(sim.series, sim.pierDefs, t),
      params.foundationDepth,
      t,
      sim.durationSeconds,
      sim.pierDisplayScale,
    );
    activePierMonitor.setFoundationDepthM(params.foundationDepth);
    activePierMonitor.update(pierDepths);
    if (router.screen === 7) {
      gradeLegendPanel.updatePierMarkers(
        pierDepths.map((d) => ({ pierId: d.pierId, scourDepthM: d.scourDepthM })),
      );
    }
    let histFrame = sim.series.frames[0];
    for (const f of sim.series.frames) {
      if (f.timestampSeconds <= t) histFrame = f;
    }
    if (histFrame?.deltaElevations?.length) {
      legend.setSampleValues(Array.from(histFrame.deltaElevations));
    }
    const worst = worstPierByDepth(
      pierDepths.map((d) => ({ pierId: d.pierId, scourDepthM: d.scourDepthM })),
    );
    if (worst) {
      const g = gradeOf(worst.scourDepthM, params.foundationDepth);
      globalNav.setBadge({ grade: g, pierId: worst.pierId });
      if (
        !viewState.selectedPierId &&
        (router.screen === 5 || router.screen === 7 || router.screen === 8 || router.screen === 9)
      ) {
        viewState.setSelectedPier(worst.pierId);
      }
    }
    viewerStage.classList.toggle(
      'is-sim-playing',
      timelineLive && timeControls.isPlaying && router.screen >= 5 && router.screen <= 9,
    );
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
    if (router.screen === 5 || router.screen === 7 || router.screen === 8 || router.screen === 9) {
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
      const sec = sectionProfilePanel.getSection();
      const transversePier = sectionProfilePanel.getTransversePierId();
      planViewOverlay.setActiveTransversePierId(transversePier);
      const depthPierId = transversePier;
      const pierDepthForKpi =
        pierDepths.find((d) => d.pierId === depthPierId)?.scourDepthM ??
        pierDepths[0]?.scourDepthM ??
        0;
      const kpi = computeSectionKpi(
        sim.series,
        sec,
        t,
        params.foundationDepth,
        pierDepthForKpi,
        sim.pierDefs,
        transversePier,
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
    if (tracerAdvectDelta > 0) sim.tracers.tick(tracerAdvectDelta);
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
          // 덮으면 행마다 다른 데이터가 사라지므로, 프로브 값은 범례 현재값에만 쓴다.
          if (sim.probeFluidField) {
            sim.terrainWater.clearProbeQuantity();
          } else {
            sim.terrainWater.setProbeQuantity(primary, value, currentProbeRange);
          }
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
    if (cfdChromeActive()) {
      cfdFrameReadout.update(t, sim.terrain.frameIndex, sim.terrain.frameCount);
      axisTriad.update(cameraManager.camera.quaternion);
      // 유동장 시각: 타임라인이 있으면 t, 없으면 실시간 시계. 입자는 재생 중(또는 타임라인 없음)에만 이동한다.
      const flowT = timelineLive ? t : ambientRippleTime;
      const viz = cfdVizCache.get(sim);
      if (viz && (viz.pathOn || viz.vecOn || viz.cutOn)) {
        const advance = !timelineLive || timeControls.isPlaying ? delta : 0;
        if (viz.pathOn) viz.pathlines?.update(flowT, advance);
        if (viz.vecOn) viz.glyphs?.update(flowT, delta);
        if (viz.cutOn) viz.cut?.update(flowT, delta);
      }
      refreshCfdProbe(flowT);
    }
    rendererManager.renderer.render(sceneManager.scene, cameraManager.camera);
  });

  router.subscribe((screen, prev) => {
    applyScreenLayout(screen, prev);
    maybeShowViewerPlaybackHint(screen, prev);
  });
  applyScreenLayout(router.screen);

  const dispose = (): void => {
    shortcuts.dispose();
    pierPicking.dispose();
    bedPicking.dispose();
    cfdProbePanel.dispose();
    cfdProbeMarker.dispose();
    loop.dispose();
    logoutButton.dispose();
    cameraPresets.dispose();
    experimentInfoPanel.dispose();
    csvUploadPanel.dispose();
    customizePanel.dispose();
    fluidControls.dispose();
    legend.dispose();
    fluidFieldLegend.dispose();
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
    alertSopPage.dispose();
    caseManagementPage.dispose();
    dataPipelinePage.dispose();
    conditionSetupCaseBar.dispose();
    planViewOverlay.dispose();
    planViewGuide.dispose();
    viewModeToggle.dispose();
    cfdLayerPanel.dispose();
    cfdFrameReadout.dispose();
    axisTriad.dispose();
    cfdVelocityColorbar.dispose();
    unbindViewerScreenViz();
    stopViewerScreenMotion?.();
    router.dispose();
    sim.dispose();
    lightManager.dispose();
    cameraManager.dispose();
    rendererManager.dispose();
    sceneManager.dispose();
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
