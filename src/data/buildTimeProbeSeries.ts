import type { Flow3dScrdifColumns } from '@/utils/parseFlow3dScrdifCsv';

/** CSV 한 행 = 한 시각의 프로브 샘플. */
export interface TimeProbeSample {
  /** 시뮬레이션 시각(초). */
  t: number;
  /** 원본 CSV 행 인덱스(0-based). */
  rowIndex: number;
  /** 원본 데이터 좌표(m). */
  dataX: number;
  dataY: number;
  dataZ: number;
  /** 월드 좌표(m) — dataToWorld 적용 후. */
  worldX: number;
  worldY: number;
  worldZ: number;
  u: number;
  v: number;
  w: number;
  scrdif: number;
}

export interface TimeProbeBounds {
  minDataX: number;
  maxDataX: number;
  minDataY: number;
  maxDataY: number;
  minDataZ: number;
  maxDataZ: number;
  centerDataX: number;
  centerDataY: number;
  centerDataZ: number;
  minScrdif: number;
  maxScrdif: number;
}

export interface TimeProbeSeries {
  samples: TimeProbeSample[];
  /** 원본 CSV 전체 행 수 (duration = rowCount × interval). */
  rowCount: number;
  baseIntervalSeconds: number;
  stepMultiple: number;
  durationSeconds: number;
  bounds: TimeProbeBounds;
}

export interface BuildTimeProbeSeriesOptions {
  /** 행당 기본 간격(초). 기본 30. */
  baseIntervalSeconds?: number;
  /** 행 건너뛰기 배수. 1=매 행, 2=30초 간격에서 1분마다(0,2,4행). */
  stepMultiple?: number;
}

/** CSV 행=시각 시계열의 총 길이(초). N행 → N × interval. */
export function scrdifTemporalDurationSeconds(
  rowCount: number,
  intervalSeconds = 30,
): number {
  return Math.max(0, rowCount) * intervalSeconds;
}

/** 시각 t 에 해당하는 CSV 행 인덱스(0-based, 30초 단위 내림). */
export function scrdifRowIndexAtTime(
  rowCount: number,
  timeSeconds: number,
  intervalSeconds = 30,
): number {
  if (rowCount <= 0) return 0;
  return Math.min(rowCount - 1, Math.max(0, Math.floor(timeSeconds / intervalSeconds)));
}

/**
 * FLOW-3D 데이터 좌표 → Three.js 월드 좌표.
 * 기본: x→월드X(흐름), y→월드Z(횡방향), z→월드Y(연직).
 * 바운딩박스 중심을 원점으로 평행이동한다.
 */
export function dataToWorld(
  dataX: number,
  dataY: number,
  dataZ: number,
  bounds: TimeProbeBounds,
): { x: number; y: number; z: number } {
  return {
    x: dataX - bounds.centerDataX,
    y: dataZ - bounds.centerDataZ,
    z: dataY - bounds.centerDataY,
  };
}

export function computeBounds(columns: Flow3dScrdifColumns): TimeProbeBounds {
  let minDataX = Infinity;
  let maxDataX = -Infinity;
  let minDataY = Infinity;
  let maxDataY = -Infinity;
  let minDataZ = Infinity;
  let maxDataZ = -Infinity;
  let minScrdif = Infinity;
  let maxScrdif = -Infinity;

  for (let i = 0; i < columns.count; i += 1) {
    const x = columns.x[i]!;
    const y = columns.y[i]!;
    const z = columns.z[i]!;
    const s = columns.scrdif[i]!;
    if (x < minDataX) minDataX = x;
    if (x > maxDataX) maxDataX = x;
    if (y < minDataY) minDataY = y;
    if (y > maxDataY) maxDataY = y;
    if (z < minDataZ) minDataZ = z;
    if (z > maxDataZ) maxDataZ = z;
    if (s < minScrdif) minScrdif = s;
    if (s > maxScrdif) maxScrdif = s;
  }

  if (!isFinite(minDataX)) {
    minDataX = maxDataX = minDataY = maxDataY = minDataZ = maxDataZ = 0;
    minScrdif = maxScrdif = 0;
  }

  return {
    minDataX,
    maxDataX,
    minDataY,
    maxDataY,
    minDataZ,
    maxDataZ,
    centerDataX: (minDataX + maxDataX) / 2,
    centerDataY: (minDataY + maxDataY) / 2,
    centerDataZ: (minDataZ + maxDataZ) / 2,
    minScrdif,
    maxScrdif,
  };
}

/** CSV 열 데이터를 행=시각 프로브 시리즈로 변환한다. */
export function buildTimeProbeSeries(
  columns: Flow3dScrdifColumns,
  options: BuildTimeProbeSeriesOptions = {},
): TimeProbeSeries {
  const baseIntervalSeconds = options.baseIntervalSeconds ?? 30;
  const stepMultiple = Math.max(1, Math.floor(options.stepMultiple ?? 1));
  const bounds = computeBounds(columns);
  const samples: TimeProbeSample[] = [];

  for (let rowIndex = 0; rowIndex < columns.count; rowIndex += stepMultiple) {
    const dataX = columns.x[rowIndex]!;
    const dataY = columns.y[rowIndex]!;
    const dataZ = columns.z[rowIndex]!;
    const world = dataToWorld(dataX, dataY, dataZ, bounds);
    samples.push({
      t: rowIndex * baseIntervalSeconds,
      rowIndex,
      dataX,
      dataY,
      dataZ,
      worldX: world.x,
      worldY: world.y,
      worldZ: world.z,
      u: columns.u[rowIndex]!,
      v: columns.v[rowIndex]!,
      w: columns.w[rowIndex]!,
      scrdif: columns.scrdif[rowIndex]!,
    });
  }

  const durationSeconds = scrdifTemporalDurationSeconds(columns.count, baseIntervalSeconds);

  return {
    samples,
    rowCount: columns.count,
    baseIntervalSeconds,
    stepMultiple,
    durationSeconds,
    bounds,
  };
}

/** 시각 t 에 맞는 CSV 행을 읽어 u·v·w·scrdif 를 반환한다(행 단위, 보간 없음). */
export function probeRowAtTime(
  series: TimeProbeSeries,
  timeSeconds: number,
): InterpolatedProbeState | null {
  const { samples, baseIntervalSeconds, stepMultiple, rowCount } = series;
  if (samples.length === 0 || rowCount <= 0) return null;

  let rowIndex = scrdifRowIndexAtTime(rowCount, timeSeconds, baseIntervalSeconds);
  rowIndex -= rowIndex % stepMultiple;

  let sample = samples[0]!;
  let segmentIndex = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i]!;
    if (s.rowIndex <= rowIndex) {
      sample = s;
      segmentIndex = i;
    } else {
      break;
    }
  }

  const speed = Math.hypot(sample.u, sample.v, sample.w);
  return {
    t: rowIndex * baseIntervalSeconds,
    worldX: sample.worldX,
    worldY: sample.worldY,
    worldZ: sample.worldZ,
    dataX: sample.dataX,
    dataY: sample.dataY,
    dataZ: sample.dataZ,
    u: sample.u,
    v: sample.v,
    w: sample.w,
    scrdif: sample.scrdif,
    speed,
    worldU: sample.u,
    worldV: sample.w,
    worldW: sample.v,
    rowIndex: sample.rowIndex,
    segmentIndex,
    alpha: 0,
  };
}

/** 시각 t 에서 보간된 프로브 상태. */
export interface InterpolatedProbeState {
  t: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  dataX: number;
  dataY: number;
  dataZ: number;
  u: number;
  v: number;
  w: number;
  scrdif: number;
  speed: number;
  /** 월드 좌표계 유속 (x=data u, y=data w, z=data v). */
  worldU: number;
  worldV: number;
  worldW: number;
  /** 보간 구간 시작 CSV 행 인덱스. */
  rowIndex: number;
  /** samples 배열에서 보간 구간 시작 인덱스. */
  segmentIndex: number;
  /** 구간 내 보간 비율 [0,1]. */
  alpha: number;
}

/** 궤적 접선(월드)과 경로 속도. u·v·w=0 일 때 스트릭·화살표 보조용. */
export function pathMotionAtTime(
  series: TimeProbeSeries,
  timeSeconds: number,
): { tangentX: number; tangentY: number; tangentZ: number; pathSpeed: number } {
  const { samples, baseIntervalSeconds, stepMultiple } = series;
  if (samples.length < 2) {
    return { tangentX: 1, tangentY: 0, tangentZ: 0, pathSpeed: 0.05 };
  }

  const t = Math.max(0, Math.min(timeSeconds, series.durationSeconds));
  let idx = 0;
  for (let i = 0; i < samples.length - 1; i += 1) {
    if (samples[i + 1]!.t <= t) idx = i + 1;
    else break;
  }

  const segStart = Math.max(0, idx - (idx >= samples.length - 1 ? 1 : 0));
  const a = samples[segStart]!;
  const b = samples[Math.min(segStart + 1, samples.length - 1)]!;
  const dx = b.worldX - a.worldX;
  const dy = b.worldY - a.worldY;
  const dz = b.worldZ - a.worldZ;
  const dist = Math.hypot(dx, dy, dz);
  const dt = Math.max(1e-6, b.t - a.t || baseIntervalSeconds * stepMultiple);
  if (dist < 1e-9) {
    return { tangentX: 1, tangentY: 0, tangentZ: 0, pathSpeed: dist / dt };
  }
  return {
    tangentX: dx / dist,
    tangentY: dy / dist,
    tangentZ: dz / dist,
    pathSpeed: dist / dt,
  };
}

export function interpolateProbeAtTime(
  series: TimeProbeSeries,
  timeSeconds: number,
): InterpolatedProbeState | null {
  const { samples } = series;
  if (samples.length === 0) return null;
  if (samples.length === 1) {
    const s = samples[0]!;
    const speed = Math.hypot(s.u, s.v, s.w);
    return {
      t: timeSeconds,
      worldX: s.worldX,
      worldY: s.worldY,
      worldZ: s.worldZ,
      dataX: s.dataX,
      dataY: s.dataY,
      dataZ: s.dataZ,
      u: s.u,
      v: s.v,
      w: s.w,
      scrdif: s.scrdif,
      speed,
      worldU: s.u,
      worldV: s.w,
      worldW: s.v,
      rowIndex: s.rowIndex,
      segmentIndex: 0,
      alpha: 0,
    };
  }

  const t = Math.max(0, Math.min(timeSeconds, series.durationSeconds));

  let idx = 0;
  for (let i = 0; i < samples.length - 1; i += 1) {
    if (samples[i + 1]!.t <= t) idx = i + 1;
    else break;
  }

  const a = samples[idx]!;
  const b = samples[Math.min(idx + 1, samples.length - 1)]!;
  const span = b.t - a.t;
  const alpha = span > 1e-9 ? (t - a.t) / span : 0;
  const lerp = (va: number, vb: number): number => va + (vb - va) * alpha;

  const u = lerp(a.u, b.u);
  const v = lerp(a.v, b.v);
  const w = lerp(a.w, b.w);
  const worldU = u;
  const worldV = w;
  const worldW = v;

  return {
    t,
    worldX: lerp(a.worldX, b.worldX),
    worldY: lerp(a.worldY, b.worldY),
    worldZ: lerp(a.worldZ, b.worldZ),
    dataX: lerp(a.dataX, b.dataX),
    dataY: lerp(a.dataY, b.dataY),
    dataZ: lerp(a.dataZ, b.dataZ),
    u,
    v,
    w,
    scrdif: lerp(a.scrdif, b.scrdif),
    speed: Math.hypot(u, v, w),
    worldU,
    worldV,
    worldW,
    rowIndex: a.rowIndex,
    segmentIndex: idx,
    alpha,
  };
}
