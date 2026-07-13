import { describe, expect, it } from 'vitest';
import {
  buildSampleProbeDashboard,
  dataToWorld,
  MAX_SCOUR_FRAMES,
  probeAtTime,
  resolveSafeStepMultiple,
} from '@/data/buildSampleProbeDashboard';
import { terrainGridDims } from '@/constants/experiment';
import type { SampleProbeColumns } from '@/utils/parseSampleProbeCsv';
import { parseSampleProbeCsvText } from '@/utils/parseSampleProbeCsv';
import { worldXZToTerrainGrid } from '@/utils/fluidWorld';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SAMPLE_PATH = resolve('public/data/sampledata.csv');

function makeProbeColumns(rows: Array<{
  x: number;
  y: number;
  z: number;
  u?: number;
  v?: number;
  w?: number;
  scrdif?: number;
}>): SampleProbeColumns {
  const count = rows.length;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const u = new Float32Array(count);
  const v = new Float32Array(count);
  const w = new Float32Array(count);
  const scrdif = new Float32Array(count);
  rows.forEach((row, i) => {
    x[i] = row.x;
    y[i] = row.y;
    z[i] = row.z;
    u[i] = row.u ?? 0;
    v[i] = row.v ?? 0;
    w[i] = row.w ?? 0;
    scrdif[i] = row.scrdif ?? 0;
  });
  return { x, y, z, u, v, w, scrdif, count };
}

describe('resolveSafeStepMultiple', () => {
  it('행 수가 한도를 넘으면 stride 를 올린다', () => {
    expect(resolveSafeStepMultiple(1, 10_000)).toBe(Math.ceil(10_000 / MAX_SCOUR_FRAMES));
    expect(resolveSafeStepMultiple(1, 10_000)).toBe(3);
  });

  it('요청 stride 가 이미 충분하면 그대로 둔다', () => {
    expect(resolveSafeStepMultiple(10, 100)).toBe(10);
  });
});

describe('buildSampleProbeDashboard', () => {
  it('sampledata.csv 는 행 수와 동일한 프레임을 만든다', () => {
    const columns = parseSampleProbeCsvText(readFileSync(SAMPLE_PATH, 'utf8'));
    const built = buildSampleProbeDashboard(columns);
    expect(built.scour.frames.length).toBe(columns.count);
    expect(built.probeSeries.samples.length).toBe(columns.count);
    expect(built.probeSeries.durationSeconds).toBe(columns.count * 30);
  });

  it('지형 격자는 FLUME terrainGridDims 와 일치한다', () => {
    const columns = parseSampleProbeCsvText(readFileSync(SAMPLE_PATH, 'utf8'));
    const built = buildSampleProbeDashboard(columns);
    const dims = terrainGridDims();
    expect(built.scour.baseTerrain.width).toBe(dims.width);
    expect(built.scour.baseTerrain.height).toBe(dims.height);
    expect(built.scour.baseTerrain.cellSize).toBe(dims.cellSize);
  });

  it('scrdif=0 프레임은 deltaElevations 버퍼를 공유한다', () => {
    const columns = makeProbeColumns([
      { x: 0, y: 0, z: 0, scrdif: 0 },
      { x: 0.01, y: 0, z: 0, scrdif: 0 },
      { x: 0.02, y: 0, z: 0, scrdif: 0 },
    ]);
    const built = buildSampleProbeDashboard(columns);
    expect(built.scour.frames[0]!.deltaElevations).toBe(
      built.scour.frames[1]!.deltaElevations,
    );
    expect(built.scour.frames[1]!.deltaElevations).toBe(
      built.scour.frames[2]!.deltaElevations,
    );
  });

  it('scrdif≠0 프레임은 별도 버퍼를 사용한다', () => {
    const columns = makeProbeColumns([
      { x: 0, y: 0, z: 0, scrdif: -0.05 },
      { x: 0.01, y: 0, z: 0, scrdif: 0 },
    ]);
    const built = buildSampleProbeDashboard(columns);
    expect(built.scour.frames[0]!.deltaElevations).not.toBe(
      built.scour.frames[1]!.deltaElevations,
    );
  });

  it('프레임 수가 4096 을 넘으면 메모리 가드 오류를 던진다', () => {
    const count = 4097;
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    const z = new Float32Array(count);
    const u = new Float32Array(count);
    const v = new Float32Array(count);
    const w = new Float32Array(count);
    const scrdif = new Float32Array(count);
    const columns: SampleProbeColumns = { x, y, z, u, v, w, scrdif, count };
    expect(() => buildSampleProbeDashboard(columns)).toThrow(/메모리가 너무 큽니다/);
  });

  it('stride=2 이면 프레임 수가 절반이다', () => {
    const columns = makeProbeColumns([
      { x: 0, y: 0, z: 0 },
      { x: 0.01, y: 0, z: 0 },
      { x: 0.02, y: 0, z: 0 },
      { x: 0.03, y: 0, z: 0 },
    ]);
    const built = buildSampleProbeDashboard(columns, { stepMultiple: 2 });
    expect(built.scour.frames.length).toBe(2);
    expect(built.scour.frames[0]!.timestampSeconds).toBe(0);
    expect(built.scour.frames[1]!.timestampSeconds).toBe(60);
  });

  it('scrdif 는 프로브 위치 주변 셀에만 적용된다', () => {
    const columns = makeProbeColumns([
      { x: 0, y: 0, z: 0, scrdif: -0.05 },
      { x: 0.02, y: 0, z: 0, scrdif: 0 },
      { x: 0.04, y: 0, z: 0, scrdif: 0 },
    ]);
    const built = buildSampleProbeDashboard(columns);
    const terrain = built.scour.baseTerrain;
    const bounds = built.probeSeries.bounds;
    const world = dataToWorld(columns.x[0]!, columns.y[0]!, columns.z[0]!, bounds);
    const center = worldXZToTerrainGrid(world.x, world.z, terrain);
    const centerIdx =
      Math.round(center.gy) * terrain.width + Math.round(center.gx);

    const frame = built.scour.frames[0]!;
    expect(Math.abs(frame.deltaElevations[centerIdx]!)).toBeGreaterThan(0);

    let farNonZero = 0;
    for (let i = 0; i < frame.deltaElevations.length; i += 1) {
      if (i === centerIdx) continue;
      if (Math.abs(frame.deltaElevations[i]!) > 1e-6) farNonZero += 1;
    }
    expect(farNonZero).toBeGreaterThan(0);
    expect(farNonZero).toBeLessThan(frame.deltaElevations.length);
  });

  it('probeAtTime 은 stride 에 맞는 행을 반환한다', () => {
    const columns = makeProbeColumns([
      { x: 0, y: 0, z: 0, u: 1 },
      { x: 0.01, y: 0, z: 0, u: 2 },
      { x: 0.02, y: 0, z: 0, u: 3 },
      { x: 0.03, y: 0, z: 0, u: 4 },
    ]);
    const built = buildSampleProbeDashboard(columns, { stepMultiple: 2 });
    const at45 = probeAtTime(built.probeSeries, 45);
    expect(at45?.rowIndex).toBe(0);
    expect(at45?.u).toBe(1);
    const at75 = probeAtTime(built.probeSeries, 75);
    expect(at75?.rowIndex).toBe(2);
    expect(at75?.u).toBe(3);
  });

  it('parse stride 가 적용된 열은 올바른 타임스탬프와 전체 duration 을 유지한다', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const columns = parseSampleProbeCsvText(text, { stepMultiple: 2 });
    const built = buildSampleProbeDashboard(columns, { stepMultiple: 1 });
    expect(built.scour.frames.length).toBe(columns.count);
    expect(built.probeSeries.durationSeconds).toBe(columns.stats!.dataRowCount * 30);
    expect(built.scour.frames[1]!.timestampSeconds).toBe(60);
    expect(built.probeSeries.stepMultiple).toBe(2);
  });
});
