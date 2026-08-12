import { describe, expect, it } from 'vitest';
import {
  buildSampleProbeDashboard,
  buildSampleProbeDashboardMulti,
  computeMeanFlow,
  csvScrdifIsAllZero,
  dataToWorld,
  MAX_SCOUR_FRAMES,
  probeAtTime,
  probeSeriesValueRange,
  resolveSafeStepMultiple,
} from '@/data/buildSampleProbeDashboard';
import { terrainGridDims } from '@/constants/experiment';
import {
  datasetFromColumns,
  datasetFromTimeBlocks,
  parseSampleProbeCsvText,
  type SampleProbeColumns,
} from '@/utils/parseSampleProbeCsv';
import { worldXZToTerrainGrid } from '@/utils/fluidWorld';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SAMPLE_PATH = resolve('public/data/sampledata.csv');

function makeProbeColumns(
  rows: Array<{
    x: number;
    y: number;
    z: number;
    u?: number;
    v?: number;
    w?: number;
    scrdif?: number;
  }>,
): SampleProbeColumns {
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

/** 행마다 별도 t 블록(한 시점당 공간점 1개). */
function makeTimeSeriesDataset(
  rows: Array<{
    x: number;
    y: number;
    z: number;
    u?: number;
    v?: number;
    w?: number;
    scrdif?: number;
  }>,
) {
  return datasetFromTimeBlocks(rows.map((row) => makeProbeColumns([row])));
}

describe('resolveSafeStepMultiple', () => {
  it('t 블록 수가 한도를 넘으면 stride 를 올린다', () => {
    expect(resolveSafeStepMultiple(1, 10_000)).toBe(Math.ceil(10_000 / MAX_SCOUR_FRAMES));
    expect(resolveSafeStepMultiple(1, 10_000)).toBe(3);
  });

  it('요청 stride 가 이미 충분하면 그대로 둔다', () => {
    expect(resolveSafeStepMultiple(10, 100)).toBe(10);
  });
});

describe('buildSampleProbeDashboard', () => {
  it('sampledata.csv 는 t 블록 1개 → 프레임 1개', () => {
    const dataset = parseSampleProbeCsvText(readFileSync(SAMPLE_PATH, 'utf8'));
    const built = buildSampleProbeDashboard(dataset);
    expect(built.scour.frames.length).toBe(1);
    expect(built.probeSeries.samples.length).toBe(1);
    expect(built.probeSeries.durationSeconds).toBe(0);
    expect(built.scour.frames[0]!.timestampSeconds).toBe(0);
  });

  it('지형 격자는 FLUME terrainGridDims 와 일치한다', () => {
    const dataset = parseSampleProbeCsvText(readFileSync(SAMPLE_PATH, 'utf8'));
    const built = buildSampleProbeDashboard(dataset);
    const dims = terrainGridDims();
    expect(built.scour.baseTerrain.width).toBe(dims.width);
    expect(built.scour.baseTerrain.height).toBe(dims.height);
    expect(built.scour.baseTerrain.cellSize).toBe(dims.cellSize);
  });

  it('scrdif=0 CSV 는 합성 세굴로 대체하지 않고 delta 가 전부 0이다(실측 없음 = 세굴 없음)', () => {
    const dataset = parseSampleProbeCsvText(readFileSync(SAMPLE_PATH, 'utf8'));
    const built = buildSampleProbeDashboard(dataset);
    expect(csvScrdifIsAllZero(built.probeSeries.bounds)).toBe(true);
    expect(built.scour.baseTerrain.metadata?.piers?.length).toBe(1);

    for (const frame of built.scour.frames) {
      for (let i = 0; i < frame.deltaElevations.length; i += 1) {
        expect(frame.deltaElevations[i]).toBe(0);
      }
    }
  });

  it('scrdif=0 프레임은 세굴 버퍼가 전부 0이다', () => {
    const dataset = makeTimeSeriesDataset([
      { x: 0, y: 0, z: 0, scrdif: 0 },
      { x: 0.01, y: 0, z: 0, scrdif: 0 },
      { x: 0.02, y: 0, z: 0, scrdif: 0 },
    ]);
    const built = buildSampleProbeDashboard(dataset);
    const last = built.scour.frames.at(-1)!.deltaElevations;
    for (let i = 0; i < last.length; i += 1) {
      expect(last[i]).toBe(0);
    }
  });

  it('시점마다 별도 세굴 버퍼를 사용한다', () => {
    const dataset = makeTimeSeriesDataset([
      { x: 0, y: 0, z: 0, scrdif: -0.05 },
      { x: 0.01, y: 0, z: 0, scrdif: 0 },
    ]);
    const built = buildSampleProbeDashboard(dataset);
    expect(built.scour.frames[0]!.deltaElevations).not.toBe(
      built.scour.frames[1]!.deltaElevations,
    );
  });

  it('t 블록 수가 4096 을 넘으면 stride 를 자동으로 올린다', () => {
    const blocks = Array.from({ length: 4097 }, () =>
      makeProbeColumns([{ x: 0, y: 0, z: 0 }]),
    );
    const dataset = datasetFromTimeBlocks(blocks);
    const built = buildSampleProbeDashboard(dataset, { stepMultiple: 1 });
    expect(built.probeSeries.stepMultiple).toBeGreaterThan(1);
    expect(built.scour.frames.length).toBeLessThanOrEqual(MAX_SCOUR_FRAMES);
  });

  it('stride=2 이면 t 블록을 하나 건너뛴다', () => {
    const dataset = makeTimeSeriesDataset([
      { x: 0, y: 0, z: 0 },
      { x: 0.01, y: 0, z: 0 },
      { x: 0.02, y: 0, z: 0 },
      { x: 0.03, y: 0, z: 0 },
    ]);
    const built = buildSampleProbeDashboard(dataset, { stepMultiple: 2 });
    expect(built.scour.frames.length).toBe(2);
    expect(built.scour.frames[0]!.timestampSeconds).toBe(0);
    expect(built.scour.frames[1]!.timestampSeconds).toBe(60);
  });

  it('scrdif 가 있는 CSV 는 세굴공 중심에 교각을 둔다', () => {
    const dataset = datasetFromColumns(
      makeProbeColumns([{ x: 0.55, y: -0.04, z: 0, scrdif: -0.07 }]),
    );
    const built = buildSampleProbeDashboard(dataset, { pierCount: 1 });
    const pier = built.scour.baseTerrain.metadata?.piers?.[0];
    expect(pier).toBeDefined();
    const expected = dataToWorld(0.55, -0.04, 0, built.probeSeries.bounds);
    expect(pier!.x).toBeCloseTo(expected.x, 1);
    expect(pier!.z).toBeCloseTo(expected.z, 1);
  });

  it('scrdif 는 CSV 데이터 위치의 지형 셀에 배치된다', () => {
    const dataset = datasetFromColumns(
      makeProbeColumns([
        { x: 0.4, y: -0.05, z: 0, scrdif: -0.05 },
        { x: 0.7, y: 0.05, z: 0, scrdif: +0.04 },
      ]),
    );
    const built = buildSampleProbeDashboard(dataset);
    const terrain = built.scour.baseTerrain;
    const bounds = built.probeSeries.bounds;
    const frame = built.scour.frames[0]!;

    const scourWorld = dataToWorld(0.4, -0.05, 0, bounds);
    const depositWorld = dataToWorld(0.7, 0.05, 0, bounds);
    const scourCell = worldXZToTerrainGrid(scourWorld.x, scourWorld.z, terrain);
    const depositCell = worldXZToTerrainGrid(depositWorld.x, depositWorld.z, terrain);
    const scourIdx =
      Math.round(scourCell.gy) * terrain.width + Math.round(scourCell.gx);
    const depositIdx =
      Math.round(depositCell.gy) * terrain.width + Math.round(depositCell.gx);

    expect(frame.deltaElevations[scourIdx]).toBeLessThan(0);
    expect(frame.deltaElevations[depositIdx]).toBeGreaterThan(0);
  });

  it('probeAtTime 은 stride 에 맞는 시점을 반환한다', () => {
    const dataset = makeTimeSeriesDataset([
      { x: 0, y: 0, z: 0, u: 1 },
      { x: 0.01, y: 0, z: 0, u: 2 },
      { x: 0.02, y: 0, z: 0, u: 3 },
      { x: 0.03, y: 0, z: 0, u: 4 },
    ]);
    const built = buildSampleProbeDashboard(dataset, { stepMultiple: 2 });
    const at45 = probeAtTime(built.probeSeries, 45);
    expect(at45?.timeIndex).toBe(0);
    expect(at45?.u).toBe(1);
    const at75 = probeAtTime(built.probeSeries, 75);
    expect(at75?.timeIndex).toBe(2);
    expect(at75?.u).toBe(3);
  });

  it('한 블록의 여러 공간 행은 평균·max|scrdif| 로 집계된다', () => {
    const columns = makeProbeColumns([
      { x: 0, y: 0, z: 0, u: 0.2, scrdif: -0.02 },
      { x: 0.01, y: 0, z: 0, u: 0.4, scrdif: -0.08 },
    ]);
    const built = buildSampleProbeDashboard(datasetFromColumns(columns));
    expect(built.scour.frames.length).toBe(1);
    expect(built.probeSeries.samples[0]!.u).toBeCloseTo(0.3);
    expect(built.probeSeries.samples[0]!.scrdif).toBeCloseTo(-0.05);
    expect(built.probeSeries.durationSeconds).toBe(0);
  });

  it('한 블록 안 서로 다른 위치의 +/- scrdif 가 각자 자기 셀에 나타난다', () => {
    const dataset = datasetFromColumns(
      makeProbeColumns([
        { x: 0.35, y: -0.08, z: 0, scrdif: -0.06 },
        { x: 0.75, y: 0.08, z: 0, scrdif: +0.05 },
      ]),
    );
    const built = buildSampleProbeDashboard(dataset);
    const terrain = built.scour.baseTerrain;
    const bounds = built.probeSeries.bounds;
    const frame = built.scour.frames[0]!;

    const scourWorld = dataToWorld(0.35, -0.08, 0, bounds);
    const depositWorld = dataToWorld(0.75, 0.08, 0, bounds);
    const scourCell = worldXZToTerrainGrid(scourWorld.x, scourWorld.z, terrain);
    const depositCell = worldXZToTerrainGrid(depositWorld.x, depositWorld.z, terrain);
    const scourIdx =
      Math.round(scourCell.gy) * terrain.width + Math.round(scourCell.gx);
    const depositIdx =
      Math.round(depositCell.gy) * terrain.width + Math.round(depositCell.gx);

    expect(frame.deltaElevations[scourIdx]).toBeLessThan(0);
    expect(frame.deltaElevations[depositIdx]).toBeGreaterThan(0);
  });

  it('computeMeanFlow 는 0-유속 CSV 에 기본 inflowSpeed 폴백을 쓴다', () => {
    const columns = makeProbeColumns([{ x: 0, y: 0, z: 0 }]);
    const flow = computeMeanFlow(columns);
    expect(flow.horizontalSpeed).toBe(0);
    expect(flow.flowHeading).toBe(0);
    expect(flow.inflowSpeed).toBe(0.25);
  });

  it('probeSeriesValueRange 는 시계열 전체의 min/max 를 반환한다', () => {
    const dataset = makeTimeSeriesDataset([
      { x: 0, y: 0, z: 0, u: 0.5, scrdif: -0.02 },
      { x: 0.01, y: 0, z: 0, u: -0.3, scrdif: -0.09 },
      { x: 0.02, y: 0, z: 0, u: 0.1, scrdif: -0.05 },
    ]);
    const built = buildSampleProbeDashboard(dataset);
    expect(probeSeriesValueRange(built.probeSeries, 'u').min).toBeCloseTo(-0.3);
    expect(probeSeriesValueRange(built.probeSeries, 'u').max).toBeCloseTo(0.5);
    expect(probeSeriesValueRange(built.probeSeries, 'scrdif').min).toBeCloseTo(-0.09);
    expect(probeSeriesValueRange(built.probeSeries, 'scrdif').max).toBeCloseTo(-0.02);
  });

  it('probeSeriesValueRange 는 값이 전부 같으면 0~1 로 폴백한다', () => {
    const dataset = makeTimeSeriesDataset([
      { x: 0, y: 0, z: 0, u: 0 },
      { x: 0.01, y: 0, z: 0, u: 0 },
    ]);
    const built = buildSampleProbeDashboard(dataset);
    expect(probeSeriesValueRange(built.probeSeries, 'u')).toEqual({ min: 0, max: 1 });
  });
});

describe('buildSampleProbeDashboardMulti (교각 1개당 CSV 1개)', () => {
  it('CSV 1개면 기존 경로로 위임한다', () => {
    const dataset = makeTimeSeriesDataset([
      { x: 0, y: 0, z: 0, u: 0.3, scrdif: 0 },
      { x: 0.01, y: 0, z: 0, u: 0.3, scrdif: 0 },
    ]);
    const single = buildSampleProbeDashboard(dataset);
    const multi = buildSampleProbeDashboardMulti([dataset]);
    expect(multi.scour.frames.length).toBe(single.scour.frames.length);
    expect(multi.scour.baseTerrain.width).toBe(single.scour.baseTerrain.width);
  });

  it('교각별 CSV 는 셀 단위 |scrdif| 최대로 병합된다', () => {
    const pier1 = datasetFromColumns(
      makeProbeColumns([{ x: 0.5, y: 0, z: 0, scrdif: -0.09 }]),
    );
    const pier2 = datasetFromColumns(
      makeProbeColumns([{ x: 0.5, y: 0, z: 0, scrdif: -0.01 }]),
    );

    const built = buildSampleProbeDashboardMulti([pier1, pier2], {
      pierCount: 2,
      pierArrangement: 'across',
    });

    const terrain = built.scour.baseTerrain;
    const bounds = built.probeSeries.bounds;
    const frame = built.scour.frames[0]!;
    const world = dataToWorld(0.5, 0, 0, bounds);
    const cell = worldXZToTerrainGrid(world.x, world.z, terrain);
    const idx = Math.round(cell.gy) * terrain.width + Math.round(cell.gx);

    expect(frame.deltaElevations[idx]).toBeCloseTo(-0.09);
  });

  it('t 블록 수가 다른 CSV 는 짧은 쪽이 마지막 값을 유지(hold)한다', () => {
    const shortDs = makeTimeSeriesDataset([{ x: 0, y: 0, z: 0, u: 0.3, scrdif: -0.05 }]);
    const longDs = makeTimeSeriesDataset([
      { x: 0, y: 0, z: 0, u: 0.3, scrdif: -0.01 },
      { x: 0.01, y: 0, z: 0, u: 0.3, scrdif: -0.02 },
      { x: 0.02, y: 0, z: 0, u: 0.3, scrdif: -0.03 },
    ]);
    const built = buildSampleProbeDashboardMulti([shortDs, longDs], { pierCount: 2 });
    expect(built.scour.frames.length).toBe(3);
  });

  it('교각별 CSV 는 각 파일의 세굴 위치에 교각을 배치한다', () => {
    const pier1 = datasetFromColumns(
      makeProbeColumns([{ x: 0.45, y: -0.06, z: 0, scrdif: -0.08 }]),
    );
    const pier2 = datasetFromColumns(
      makeProbeColumns([{ x: 0.65, y: 0.05, z: 0, scrdif: -0.07 }]),
    );

    const built = buildSampleProbeDashboardMulti([pier1, pier2]);
    const piers = built.scour.baseTerrain.metadata?.piers ?? [];
    expect(piers.length).toBe(2);

    const bounds = built.probeSeries.bounds;
    const w1 = dataToWorld(0.45, -0.06, 0, bounds);
    const w2 = dataToWorld(0.65, 0.05, 0, bounds);
    expect(piers[0]!.x).toBeCloseTo(w1.x, 1);
    expect(piers[0]!.z).toBeCloseTo(w1.z, 1);
    expect(piers[1]!.x).toBeCloseTo(w2.x, 1);
    expect(piers[1]!.z).toBeCloseTo(w2.z, 1);
  });
});
