import {
  CSV_STRUCTURE,
  paramsToFlumeGeometry,
  structureCenterX,
  terrainPhysicalSize,
} from '@/constants/experiment';
import { BASELINE_SCENARIO, FOOTING_SPECS } from '@/constants/scenarios';
import type { PierDefinition } from '@/modules/PierMarker';
import type { PierArrangement, SimParams } from '@/types/simParams';

/** 기둥 개수를 1~3 범위로 보정한다. */
export function clampPierCount(count: number): number {
  return Math.min(3, Math.max(1, Math.round(count)));
}

type LayoutParams = Pick<
  SimParams,
  | 'tankLengthX'
  | 'tankWidthZ'
  | 'tankHeightY'
  | 'structureFrontX'
  | 'pierDiameter'
  | 'pierCount'
  | 'pierArrangement'
>;

function pierSpacing(params: LayoutParams, _arrangement: PierArrangement): number {
  const geom = paramsToFlumeGeometry(params);
  const { widthZ } = terrainPhysicalSize(geom);
  const count = clampPierCount(params.pierCount);
  const span = widthZ;
  const minSpacing = 2.5 * params.pierDiameter;
  const fromTank = span / (count + 1);
  const ideal = Math.max(minSpacing, fromTank);
  const maxSpan = span * 0.85;
  const maxSpacing = count <= 1 ? 0 : maxSpan / (count - 1);
  return count <= 1 ? 0 : Math.min(ideal, maxSpacing);
}

/** 가로(흐름) 배치: structureCenterX(전방)에서 하류(+X)로 이어지는 간격. */
function pierSpacingAlong(params: LayoutParams): number {
  const count = clampPierCount(params.pierCount);
  if (count <= 1) return 0;

  const geom = paramsToFlumeGeometry(params);
  const { lengthX } = terrainPhysicalSize(geom);
  const startX = structureCenterX(geom);
  const edgePad = params.pierDiameter * 0.5;
  const maxX = lengthX / 2 - edgePad;
  const availableSpan = Math.max(0, maxX - startX);
  const maxSpacing = count <= 1 ? 0 : availableSpan / (count - 1);

  const minSpacing = 2.5 * params.pierDiameter;
  const preferred = Math.max(minSpacing, params.pierDiameter * 3.5);
  return Math.min(preferred, maxSpacing > 0 ? maxSpacing : preferred);
}

/** 폭(Z) 방향 기둥 간격(미터). */
export function pierSpacingZ(
  params: Pick<
    SimParams,
    'tankLengthX' | 'tankWidthZ' | 'tankHeightY' | 'structureFrontX' | 'pierDiameter' | 'pierCount'
  >,
): number {
  return pierSpacing({ ...params, pierArrangement: 'across' }, 'across');
}

/** 흐름(X) 방향 기둥 간격(미터). */
export function pierSpacingX(params: LayoutParams): number {
  return pierSpacingAlong(params);
}

function symmetricLinePositions(count: number, spacing: number): number[] {
  if (count === 1) return [0];
  const totalSpan = spacing * (count - 1);
  const start = -totalSpan / 2;
  return Array.from({ length: count }, (_, i) => start + i * spacing);
}

/** Z 좌표 배열(폭 방향·지형 중심 z=0 대칭). */
export function pierZPositions(
  params: Pick<
    SimParams,
    'tankLengthX' | 'tankWidthZ' | 'tankHeightY' | 'structureFrontX' | 'pierDiameter' | 'pierCount'
  >,
): number[] {
  return symmetricLinePositions(clampPierCount(params.pierCount), pierSpacingZ(params));
}

/** X 좌표 배열(흐름 방향·structureCenterX 에서 하류로 순차 배치). */
export function pierXPositions(params: LayoutParams): number[] {
  const geom = paramsToFlumeGeometry(params);
  const startX = structureCenterX(geom);
  const spacing = pierSpacingAlong(params);
  const count = clampPierCount(params.pierCount);
  const { lengthX } = terrainPhysicalSize(geom);
  const maxX = lengthX / 2 - params.pierDiameter * 0.5;

  return Array.from({ length: count }, (_, i) => Math.min(startX + i * spacing, maxX));
}

function pierSpacingAlongCentered(params: LayoutParams): number {
  const count = clampPierCount(params.pierCount);
  if (count <= 1) return 0;

  const geom = paramsToFlumeGeometry(params);
  const { lengthX } = terrainPhysicalSize(geom);
  const maxSpan = lengthX * 0.85;
  const minSpacing = 2.5 * params.pierDiameter;
  const preferred = Math.max(minSpacing, params.pierDiameter * 3.5);
  const maxSpacing = maxSpan / (count - 1);
  return Math.min(preferred, maxSpacing);
}

/** 도메인 중심(x=0, z=0) 기준 교각 배치. CSV 대시보드용. */
export function buildCenteredPierLayout(params: SimParams): PierDefinition[] {
  const pierHeight = params.tankHeightY + 0.03;
  const count = clampPierCount(params.pierCount);
  const arrangement = params.pierArrangement ?? 'along';

  if (count === 1) {
    return [
      {
        id: 'P1',
        x: 0,
        z: 0,
        diameter: params.pierDiameter,
        height: pierHeight,
        shape: params.structureShape,
      },
    ];
  }

  if (arrangement === 'along') {
    const spacing = pierSpacingAlongCentered(params);
    const xPositions = symmetricLinePositions(count, spacing);
    return xPositions.map((x, i) => ({
      id: `P${i + 1}`,
      x,
      z: 0,
      diameter: params.pierDiameter,
      height: pierHeight,
      shape: params.structureShape,
    }));
  }

  const spacing = pierSpacingZ(params);
  const zPositions = symmetricLinePositions(count, spacing);
  return zPositions.map((z, i) => ({
    id: `P${i + 1}`,
    x: 0,
    z,
    diameter: params.pierDiameter,
    height: pierHeight,
    shape: params.structureShape,
  }));
}

/**
 * CSV 업로드 후와 같은 구조물 배치(기준 케이스 S01). 수조 중심(x = 0)에서 횡(Z)으로 나란히 놓고,
 * 간격·높이·하단부는 환경조건·시나리오 표 값을 쓴다. CSV 업로드 전 기본 화면용.
 */
export function buildCsvLikePierLayout(
  params: Pick<SimParams, 'pierCount' | 'pierDiameter' | 'structureShape'>,
): PierDefinition[] {
  const count = clampPierCount(params.pierCount);
  const spacing = BASELINE_SCENARIO.pierSpacingM;
  const spec = FOOTING_SPECS[BASELINE_SCENARIO.footingShape];
  const radius =
    count > 1 ? Math.min(params.pierDiameter * 2, spacing / 2) : params.pierDiameter * 2;
  return symmetricLinePositions(count, spacing).map((z, i) => ({
    id: `P${i + 1}`,
    x: 0,
    z,
    diameter: params.pierDiameter,
    height: CSV_STRUCTURE.exposedHeightM,
    shape: params.structureShape,
    scourSearchRadius: radius,
    footing: {
      shape: BASELINE_SCENARIO.footingShape,
      lengthX: spec.lengthX,
      widthZ: spec.widthZ,
      height: CSV_STRUCTURE.footingExposedM,
    },
  }));
}

/** SimParams 기준 교각 정의 배열(P1…Pn). 횡 배치(across)는 CSV 와 같은 위치·형상을 쓴다. */
export function buildPierLayout(params: SimParams): PierDefinition[] {
  const geom = paramsToFlumeGeometry(params);
  const pierHeight = params.tankHeightY + 0.03;
  const arrangement = params.pierArrangement ?? 'along';

  if (arrangement === 'across') return buildCsvLikePierLayout(params);

  if (arrangement === 'along') {
    const xPositions = pierXPositions(params);
    return xPositions.map((x, i) => ({
      id: `P${i + 1}`,
      x,
      z: 0,
      diameter: params.pierDiameter,
      height: pierHeight,
      shape: params.structureShape,
    }));
  }

  const pierX = structureCenterX(geom);
  const zPositions = pierZPositions(params);
  return zPositions.map((z, i) => ({
    id: `P${i + 1}`,
    x: pierX,
    z,
    diameter: params.pierDiameter,
    height: pierHeight,
    shape: params.structureShape,
  }));
}
