import { describe, expect, it } from 'vitest';
import {
  buildTimeProbeSeries,
  dataToWorld,
  interpolateProbeAtTime,
  probeRowAtTime,
  scrdifTemporalDurationSeconds,
} from '@/data/buildTimeProbeSeries';
import type { Flow3dScrdifColumns } from '@/utils/parseFlow3dScrdifCsv';

function makeColumns(count: number): Flow3dScrdifColumns {
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const u = new Float32Array(count);
  const v = new Float32Array(count);
  const w = new Float32Array(count);
  const scrdif = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    x[i] = i * 0.01;
    y[i] = 0.2;
    z[i] = -0.1 + i * 0.001;
    u[i] = 0.1 * i;
    v[i] = 0;
    w[i] = 0.05;
    scrdif[i] = i * 0.001;
  }
  return { x, y, z, u, v, w, scrdif, count };
}

describe('buildTimeProbeSeries', () => {
  it('각 행에 30초 간격 타임스탬프를 부여하고 총 길이는 행×30초', () => {
    const series = buildTimeProbeSeries(makeColumns(5));
    expect(series.samples.map((s) => s.t)).toEqual([0, 30, 60, 90, 120]);
    expect(series.durationSeconds).toBe(150);
    expect(series.rowCount).toBe(5);
    expect(scrdifTemporalDurationSeconds(5)).toBe(150);
    expect(series.baseIntervalSeconds).toBe(30);
  });

  it('stepMultiple=2 이면 0·2·4행만 선택하고 총 길이는 전체 행×30초', () => {
    const series = buildTimeProbeSeries(makeColumns(5), { stepMultiple: 2 });
    expect(series.samples.map((s) => s.rowIndex)).toEqual([0, 2, 4]);
    expect(series.samples.map((s) => s.t)).toEqual([0, 60, 120]);
    expect(series.durationSeconds).toBe(150);
  });

  it('dataToWorld 는 바운딩박스 중심을 원점으로 평행이동한다', () => {
    const series = buildTimeProbeSeries(makeColumns(3));
    const center = series.bounds;
    const world = dataToWorld(center.centerDataX, center.centerDataY, center.centerDataZ, center);
    expect(world.x).toBeCloseTo(0, 6);
    expect(world.y).toBeCloseTo(0, 6);
    expect(world.z).toBeCloseTo(0, 6);
  });

  it('probeRowAtTime 은 30초 구간마다 해당 CSV 행 값을 반환한다', () => {
    const series = buildTimeProbeSeries(makeColumns(3));
    const at0 = probeRowAtTime(series, 0)!;
    const at29 = probeRowAtTime(series, 29)!;
    const at30 = probeRowAtTime(series, 30)!;
    expect(at0.u).toBe(0);
    expect(at29.u).toBe(0);
    expect(at30.u).toBeCloseTo(0.1, 5);
    expect(at30.scrdif).toBeCloseTo(0.001, 5);
    expect(at30.alpha).toBe(0);
  });

  it('interpolateProbeAtTime 은 구간 중간을 보간한다', () => {
    const series = buildTimeProbeSeries(makeColumns(3));
    const mid = interpolateProbeAtTime(series, 15);
    expect(mid).not.toBeNull();
    expect(mid!.t).toBe(15);
    expect(mid!.worldX).toBeCloseTo(
      (series.samples[0]!.worldX + series.samples[1]!.worldX) / 2,
      5,
    );
    expect(mid!.alpha).toBeCloseTo(0.5, 5);
  });
});
