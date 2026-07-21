import { describe, expect, it } from 'vitest';
import {
  buildSampleProbeDashboard,
  buildSampleProbeDashboardMulti,
  computeMeanFlow,
  csvScrdifIsAllZero,
  dataToWorld,
  MAX_SCOUR_FRAMES,
  probeAtTime,
  resolveSafeStepMultiple,
} from '@/data/buildSampleProbeDashboard';
import { structureCenterX } from '@/constants/experiment';
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

  it('scrdif=0 CSV 는 합성 세굴로 대체하지 않고 delta 가 전부 0이다(실측 없음 = 세굴 없음)', () => {
    const columns = parseSampleProbeCsvText(readFileSync(SAMPLE_PATH, 'utf8'));
    const built = buildSampleProbeDashboard(columns);
    expect(csvScrdifIsAllZero(built.probeSeries.bounds)).toBe(true);
    expect(built.scour.baseTerrain.metadata?.piers?.length).toBe(3);

    for (const frame of built.scour.frames) {
      for (let i = 0; i < frame.deltaElevations.length; i += 1) {
        expect(frame.deltaElevations[i]).toBe(0);
      }
    }
  });

  it('scrdif=0 프레임은 세굴 버퍼가 전부 0이다', () => {
    const columns = makeProbeColumns([
      { x: 0, y: 0, z: 0, scrdif: 0 },
      { x: 0.01, y: 0, z: 0, scrdif: 0 },
      { x: 0.02, y: 0, z: 0, scrdif: 0 },
    ]);
    const built = buildSampleProbeDashboard(columns);
    const last = built.scour.frames.at(-1)!.deltaElevations;
    for (let i = 0; i < last.length; i += 1) {
      expect(last[i]).toBe(0);
    }
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

  it('실측 유속 방향에 따라 세굴 패턴이 회전한다(scrdif≠0일 때만 세굴 발생)', () => {
    const columnsX = makeProbeColumns([
      { x: 0, y: 0, z: 0, u: 0.3, v: 0, w: 0, scrdif: -0.05 },
      { x: 0.01, y: 0, z: 0, u: 0.3, v: 0, w: 0, scrdif: -0.08 },
    ]);
    const columnsZ = makeProbeColumns([
      { x: 0, y: 0, z: 0, u: 0, v: 0.3, w: 0, scrdif: -0.05 },
      { x: 0.01, y: 0, z: 0, u: 0, v: 0.3, w: 0, scrdif: -0.08 },
    ]);
    const builtX = buildSampleProbeDashboard(columnsX);
    const builtZ = buildSampleProbeDashboard(columnsZ);
    const terrain = builtX.scour.baseTerrain;
    const pierX = structureCenterX();
    const pierZ = 0;
    const idxUpstreamX = worldXZToTerrainGrid(pierX - 0.06, pierZ, terrain);
    const idxUpstreamZ = worldXZToTerrainGrid(pierX, pierZ - 0.06, terrain);
    const iX =
      Math.round(idxUpstreamX.gy) * terrain.width + Math.round(idxUpstreamX.gx);
    const iZ =
      Math.round(idxUpstreamZ.gy) * terrain.width + Math.round(idxUpstreamZ.gx);
    const lastX = builtX.scour.frames.at(-1)!.deltaElevations[iX]!;
    const lastZ = builtZ.scour.frames.at(-1)!.deltaElevations[iZ]!;
    expect(lastX).toBeLessThan(0);
    expect(lastZ).toBeLessThan(0);
    expect(Math.abs(lastZ)).toBeGreaterThan(Math.abs(lastX) * 0.5);
  });

  it('computeMeanFlow 는 0-유속 CSV 에 기본 inflowSpeed 폴백을 쓴다', () => {
    const columns = makeProbeColumns([{ x: 0, y: 0, z: 0 }]);
    const flow = computeMeanFlow(columns);
    expect(flow.horizontalSpeed).toBe(0);
    expect(flow.flowHeading).toBe(0);
    expect(flow.inflowSpeed).toBe(0.25);
  });
});

describe('buildSampleProbeDashboardMulti (교각 1개당 CSV 1개)', () => {
  it('CSV 1개면 기존 합성 하이브리드 경로로 위임한다', () => {
    const columns = makeProbeColumns([
      { x: 0, y: 0, z: 0, u: 0.3, scrdif: 0 },
      { x: 0.01, y: 0, z: 0, u: 0.3, scrdif: 0 },
    ]);
    const single = buildSampleProbeDashboard(columns);
    const multi = buildSampleProbeDashboardMulti([columns]);
    expect(multi.scour.frames.length).toBe(single.scour.frames.length);
    expect(multi.scour.baseTerrain.width).toBe(single.scour.baseTerrain.width);
  });

  it('교각마다 실측 scrdif·유향이 다르면 세굴 형상도 서로 다르다', () => {
    // 교각 1: 강한 침식, +X 유입(상류=-X)
    const pier1Columns = makeProbeColumns([
      { x: 0, y: 0, z: 0, u: 0.3, v: 0, scrdif: -0.09 },
      { x: 0.01, y: 0, z: 0, u: 0.3, v: 0, scrdif: -0.1 },
    ]);
    // 교각 2: 약한 침식, +Z 유입(상류=-Z, 다른 방향)
    const pier2Columns = makeProbeColumns([
      { x: 0, y: 0, z: 0, u: 0, v: 0.3, scrdif: -0.01 },
      { x: 0.01, y: 0, z: 0, u: 0, v: 0.3, scrdif: -0.015 },
    ]);

    const built = buildSampleProbeDashboardMulti([pier1Columns, pier2Columns], {
      pierCount: 2,
      pierArrangement: 'across',
    });

    expect(built.scour.baseTerrain.metadata?.piers?.length).toBe(2);
    const [p1, p2] = built.scour.baseTerrain.metadata!.piers!;
    const terrain = built.scour.baseTerrain;
    const lastFrame = built.scour.frames.at(-1)!;

    // 교각 1 은 자기 유향(+X)의 상류(-X) 쪽에서 깊게 파여야 한다.
    const p1Upstream = worldXZToTerrainGrid(p1!.x - 0.06, p1!.z, terrain);
    const p1Idx = Math.round(p1Upstream.gy) * terrain.width + Math.round(p1Upstream.gx);
    // 교각 2 는 자기 유향(+Z)의 상류(-Z) 쪽에서 파여야 한다.
    const p2Upstream = worldXZToTerrainGrid(p2!.x, p2!.z - 0.06, terrain);
    const p2Idx = Math.round(p2Upstream.gy) * terrain.width + Math.round(p2Upstream.gx);

    const p1Depth = Math.abs(lastFrame.deltaElevations[p1Idx]!);
    const p2Depth = Math.abs(lastFrame.deltaElevations[p2Idx]!);

    expect(p1Depth).toBeGreaterThan(0);
    expect(p2Depth).toBeGreaterThan(0);
    // 실측 scrdif 가 교각 1이 훨씬 크므로 깊이도 훨씬 커야 한다(고정 수식 복사가 아니라는 증거).
    expect(p1Depth).toBeGreaterThan(p2Depth * 2);
  });

  it('행 수가 다른 CSV 는 짧은 쪽이 마지막 값을 유지(hold)한다', () => {
    const shortColumns = makeProbeColumns([{ x: 0, y: 0, z: 0, u: 0.3, scrdif: -0.05 }]);
    const longColumns = makeProbeColumns([
      { x: 0, y: 0, z: 0, u: 0.3, scrdif: -0.01 },
      { x: 0.01, y: 0, z: 0, u: 0.3, scrdif: -0.02 },
      { x: 0.02, y: 0, z: 0, u: 0.3, scrdif: -0.03 },
    ]);
    const built = buildSampleProbeDashboardMulti([shortColumns, longColumns], { pierCount: 2 });
    expect(built.scour.frames.length).toBe(3);
  });
});
