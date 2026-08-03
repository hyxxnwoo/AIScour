import { describe, expect, it } from 'vitest';
import {
  buildProbeFluidSeries,
  probeFluidQuantityRange,
} from '@/data/buildProbeFluidSeries';
import { FLUME } from '@/constants/experiment';
import { fluidIndex } from '@/types/fluid';
import {
  fluidGridOrigin,
  fluidHeightRange,
  sampleFluidVelocityAtWorld,
} from '@/utils/fluidWorld';
import { datasetFromTimeBlocks, type SampleProbeColumns } from '@/utils/parseSampleProbeCsv';

interface Row {
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
  w: number;
  scrdif: number;
}

function columnsFromRows(rows: Row[]): SampleProbeColumns {
  const pick = (key: keyof Row): Float32Array => Float32Array.from(rows.map((r) => r[key]));
  return {
    x: pick('x'),
    y: pick('y'),
    z: pick('z'),
    u: pick('u'),
    v: pick('v'),
    w: pick('w'),
    scrdif: pick('scrdif'),
    count: rows.length,
  };
}

const FLOW_X = [0, 0.1, 0.2];
const LATERAL_Y = [0, 0.1];
const VERTICAL_Z = [0, 0.1];

/** 3(흐름) × 2(횡단) × 2(연직) 측정점. 값은 위치마다 다르게 준다. */
function blockRows(scale: number): Row[] {
  const rows: Row[] = [];
  FLOW_X.forEach((x, ix) => {
    LATERAL_Y.forEach((y, iy) => {
      VERTICAL_Z.forEach((z, iz) => {
        rows.push({
          x,
          y,
          z,
          u: (ix + 1) * scale,
          v: (iy + 1) * 0.01,
          w: (iz + 1) * 0.1,
          scrdif: -0.01 * (ix + 1),
        });
      });
    });
  });
  return rows;
}

describe('buildProbeFluidSeries', () => {
  it('CSV 좌표를 격자로 삼아 t 블록마다 프레임을 만든다', () => {
    const dataset = datasetFromTimeBlocks([
      columnsFromRows(blockRows(1)),
      columnsFromRows(blockRows(2)),
    ]);

    const fluid = buildProbeFluidSeries(dataset);

    expect(fluid).not.toBeNull();
    expect(fluid!.grid.width).toBe(FLOW_X.length);
    expect(fluid!.grid.height).toBe(VERTICAL_Z.length);
    expect(fluid!.grid.depth).toBe(LATERAL_Y.length);
    expect(fluid!.frames.map((f) => f.timestampSeconds)).toEqual([0, 30]);
  });

  it('행마다 읽은 u·v·w·scrdif 를 자기 좌표 셀에 넣는다 (연직=CSV w, 횡단=CSV v)', () => {
    const dataset = datasetFromTimeBlocks([
      columnsFromRows(blockRows(1)),
      columnsFromRows(blockRows(2)),
    ]);
    const fluid = buildProbeFluidSeries(dataset)!;
    const grid = fluid.grid;

    // x = 0.2(흐름 2), z = 0.1(연직 1), y = 0(횡단 0) 인 행.
    const i = fluidIndex(grid, 2, 1, 0);
    const first = fluid.frames[0]!;

    expect(first.velocityX[i]).toBeCloseTo(3, 5);
    expect(first.velocityY[i]).toBeCloseTo(0.2, 5);
    expect(first.velocityZ[i]).toBeCloseTo(0.01, 5);
    expect(first.scalars?.scrdif?.[i]).toBeCloseTo(-0.03, 5);

    // 두 번째 t 블록은 같은 좌표에서 값만 바뀐다.
    expect(fluid.frames[1]!.velocityX[i]).toBeCloseTo(6, 5);
  });

  it('행마다 값이 달라 공간 변화가 평균으로 사라지지 않는다', () => {
    const dataset = datasetFromTimeBlocks([columnsFromRows(blockRows(1))]);
    const fluid = buildProbeFluidSeries(dataset)!;
    const grid = fluid.grid;
    const frame = fluid.frames[0]!;

    const upstream = frame.velocityX[fluidIndex(grid, 0, 0, 0)]!;
    const downstream = frame.velocityX[fluidIndex(grid, 2, 0, 0)]!;
    expect(upstream).toBeCloseTo(1, 5);
    expect(downstream).toBeCloseTo(3, 5);

    // 추적 입자는 월드 좌표에서 삼선형 보간으로 유속을 읽는다.
    const o = fluidGridOrigin(grid);
    const cs = grid.cellSize;
    const near = sampleFluidVelocityAtWorld(grid, frame, o.x, o.y, o.z);
    const far = sampleFluidVelocityAtWorld(grid, frame, o.x + 2 * cs, o.y, o.z);
    expect(near?.vx).toBeCloseTo(1, 5);
    expect(far?.vx).toBeCloseTo(3, 5);
  });

  it('측정면이 1개인 축은 그 값으로 전 구간을 채운다', () => {
    const rows: Row[] = FLOW_X.map((x, ix) => ({
      x,
      y: -0.2231,
      z: -0.1222,
      u: ix + 1,
      v: 0,
      w: 0,
      scrdif: 0,
    }));
    const fluid = buildProbeFluidSeries(datasetFromTimeBlocks([columnsFromRows(rows)]))!;
    const grid = fluid.grid;
    const frame = fluid.frames[0]!;

    expect(grid.height).toBeGreaterThan(1);
    expect(grid.depth).toBeGreaterThan(1);

    for (let yi = 0; yi < grid.height; yi += 1) {
      for (let zi = 0; zi < grid.depth; zi += 1) {
        expect(frame.velocityX[fluidIndex(grid, 2, yi, zi)]).toBeCloseTo(3, 5);
      }
    }
  });

  it('X 는 수조 입구 기준, Z 는 CSV y 그대로, 연직은 CSV z 표고를 그대로 쓴다', () => {
    // CSV z 는 퇴적물 표면 = 0 기준 표고다. 하상 아래(-)에서 시작하면 그 값이 원점이 된다.
    const rows: Row[] = [-0.12, -0.06, 0, 0.06].flatMap((z, iz) =>
      FLOW_X.map((x) => ({ x, y: 0, z, u: 0.1 * (iz + 1), v: 0, w: 0, scrdif: 0 })),
    );
    const fluid = buildProbeFluidSeries(datasetFromTimeBlocks([columnsFromRows(rows)]))!;
    const grid = fluid.grid;
    const o = fluidGridOrigin(grid);

    expect(o.x).toBeCloseTo(-FLUME.tank.lengthX / 2, 6);
    expect(o.z).toBeCloseTo(0, 6);
    expect(o.y).toBeCloseTo(-0.12, 6);

    // 하상(월드 Y = 0)에 해당하는 셀은 z = 0 측정값을 가진다.
    const bedYi = Math.round((0 - o.y) / grid.cellSize);
    expect(fluid.frames[0]!.velocityX[fluidIndex(grid, 0, bedYi, 0)]).toBeCloseTo(0.3, 5);
  });

  it('연직 측정 구간이 하상 아래에 그쳐도 수심만큼 격자를 확장한다', () => {
    // 확장 구간은 최상단 측정면 값으로 채운다 — 수면·추적 입자가 격자 밖으로 나가지 않게.
    const rows: Row[] = [-0.12, -0.08, -0.04, 0].flatMap((z) =>
      FLOW_X.map((x) => ({ x, y: 0, z, u: 0.3, v: 0, w: 0, scrdif: 0 })),
    );
    const fluid = buildProbeFluidSeries(datasetFromTimeBlocks([columnsFromRows(rows)]))!;
    const grid = fluid.grid;
    const { min, max } = fluidHeightRange(grid);

    expect(min).toBeCloseTo(-0.12, 6);
    expect(max).toBeGreaterThan(FLUME.waterDepthM - 0.01);
    expect(
      fluid.frames[0]!.velocityX[fluidIndex(grid, 0, grid.height - 1, 0)],
    ).toBeCloseTo(0.3, 5);
  });

  it('stepMultiple 로 t 블록을 건너뛴다', () => {
    const dataset = datasetFromTimeBlocks([
      columnsFromRows(blockRows(1)),
      columnsFromRows(blockRows(2)),
      columnsFromRows(blockRows(3)),
      columnsFromRows(blockRows(4)),
    ]);

    const fluid = buildProbeFluidSeries(dataset, { stepMultiple: 2 })!;

    expect(fluid.frames.map((f) => f.timestampSeconds)).toEqual([0, 60]);
  });

  it('프레임 상한을 넘으면 균등 간격으로 추린다', () => {
    const dataset = datasetFromTimeBlocks(
      Array.from({ length: 9 }, (_, i) => columnsFromRows(blockRows(i + 1))),
    );

    const fluid = buildProbeFluidSeries(dataset, { maxFrames: 3 })!;

    expect(fluid.frames.length).toBeLessThanOrEqual(3);
    expect(fluid.frames[0]!.timestampSeconds).toBe(0);
  });

  it('셀 수 상한을 넘으면 셀 크기를 키워 메모리를 지킨다', () => {
    const dataset = datasetFromTimeBlocks([columnsFromRows(blockRows(1))]);

    const fluid = buildProbeFluidSeries(dataset, { maxCellsPerFrame: 8 })!;
    const cells = fluid.grid.width * fluid.grid.height * fluid.grid.depth;

    expect(cells).toBeLessThanOrEqual(8);
  });

  it('공간 행이 없으면 null 을 반환한다', () => {
    const dataset = datasetFromTimeBlocks([columnsFromRows([])]);

    expect(buildProbeFluidSeries(dataset)).toBeNull();
  });

  it('probeFluidQuantityRange 는 필드 전체에서 0 대칭 범위를 만든다', () => {
    const dataset = datasetFromTimeBlocks([
      columnsFromRows(blockRows(1)),
      columnsFromRows(blockRows(2)),
    ]);
    const fluid = buildProbeFluidSeries(dataset)!;

    const range = probeFluidQuantityRange(fluid, 'velocityX');

    expect(range.max).toBeCloseTo(6, 5);
    expect(range.min).toBeCloseTo(-6, 5);
  });
});
