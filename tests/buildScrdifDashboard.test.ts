import { describe, expect, it } from 'vitest';
import { CSV_STRUCTURE } from '@/constants/experiment';
import { FLOW_SCENARIOS, type FlowScenario } from '@/constants/scenarios';
import type { PierFooting } from '@/types/terrain';
import { buildScrdifDashboard, MAX_SCRDIF_FRAMES } from '@/data/buildScrdifDashboard';
import { probeSeriesValueRange } from '@/data/probeSeries';
import { parseScrdifTimeCsvText } from '@/utils/parseScrdifTimeCsv';
import { makeScrdifCsv } from './helpers/scrdifCsv';

describe('buildScrdifDashboard', () => {
  it('시간 열마다 세굴 프레임을 만들고 지형을 CSV 영역 중심에 맞춘다', () => {
    const ds = parseScrdifTimeCsvText(makeScrdifCsv());
    const built = buildScrdifDashboard(ds);
    const { baseTerrain, frames } = built.scour;

    expect(frames.length).toBe(3);
    expect(frames.map((f) => f.timestampSeconds)).toEqual([0, 30, 60]);
    expect(baseTerrain.width).toBe(20);
    expect(baseTerrain.height).toBe(10);
    expect(baseTerrain.cellSize).toBeCloseTo(0.01, 6);
    expect(frames[0].deltaElevations.every((v) => v === 0)).toBe(true);
    expect(Math.min(...frames[2].deltaElevations)).toBeLessThan(0);
    expect(built.probeSeries.durationSeconds).toBe(60);
    expect(built.probeSeries.bounds.originDataX).toBeCloseTo(0.095, 5);
    expect(built.scrdifAllZero).toBe(false);
  });

  it('CSV 격자점 값을 지형 격자에 그대로 옮긴다(셀 간격이 같으면 보간 오차 없음)', () => {
    const ds = parseScrdifTimeCsvText(makeScrdifCsv({ nx: 6, ny: 4, pierCells: [] }));
    const built = buildScrdifDashboard(ds);
    const delta = built.scour.frames[1].deltaElevations;
    const row = 2 * 6 + 3; // yi=2, xi=3
    expect(delta[row]).toBeCloseTo(ds.frames[1][row], 6);
  });

  it('모든 시간에서 0 인 셀 덩어리를 교각으로 검출한다', () => {
    const ds = parseScrdifTimeCsvText(makeScrdifCsv());
    const { piers } = buildScrdifDashboard(ds);
    expect(piers.length).toBe(1);
    expect(piers[0].id).toBe('P1');
    // x 인덱스 9~10 → data x 0.095, 중심 0.095 → 월드 x≈0
    expect(piers[0].x).toBeCloseTo(0, 5);
    expect(piers[0].z).toBeCloseTo(0, 5);
    expect(piers[0].diameter).toBeCloseTo(CSV_STRUCTURE.diameterM, 6);
    expect(piers[0].height).toBeCloseTo(CSV_STRUCTURE.exposedHeightM, 6);
    expect(piers[0].footing).toEqual({
      shape: 'square',
      lengthX: 0.13,
      widthZ: 0.13,
      height: CSV_STRUCTURE.footingExposedM,
    });
    expect(piers[0].scourSearchRadius).toBeCloseTo(CSV_STRUCTURE.diameterM * 2, 6);
  });

  it('구조물이 여러 개면 월드 z 오름차순으로 P1…Pn 을 붙인다', () => {
    const ds = parseScrdifTimeCsvText(
      makeScrdifCsv({
        nx: 30,
        ny: 20,
        pierCells: [
          [10, 14],
          [11, 14],
          [10, 15],
          [11, 15],
          [10, 3],
          [11, 3],
          [10, 4],
          [11, 4],
        ],
      }),
    );
    const { piers } = buildScrdifDashboard(ds);
    expect(piers.map((p) => p.id)).toEqual(['P1', 'P2']);
    expect(piers[0].z).toBeLessThan(piers[1].z);
  });

  it('격자 가장자리에 닿은 0 영역·너무 작은 영역은 교각으로 보지 않는다', () => {
    const edge = parseScrdifTimeCsvText(
      makeScrdifCsv({
        pierCells: [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ],
      }),
    );
    expect(buildScrdifDashboard(edge).piers).toEqual([]);

    const tiny = parseScrdifTimeCsvText(makeScrdifCsv({ pierCells: [[9, 4]] }));
    expect(buildScrdifDashboard(tiny).piers).toEqual([]);
  });

  it('시간 열이 하나뿐이면 교각을 검출하지 않는다', () => {
    const ds = parseScrdifTimeCsvText(makeScrdifCsv({ times: [0] }));
    expect(buildScrdifDashboard(ds).piers).toEqual([]);
  });

  it('stepMultiple 은 시간 열 stride 로 반영된다', () => {
    const times = Array.from({ length: 20 }, (_, i) => i * 30);
    const ds = parseScrdifTimeCsvText(makeScrdifCsv({ nx: 4, ny: 4, times, pierCells: [] }));
    const built = buildScrdifDashboard(ds, { stepMultiple: 10 });
    expect(built.scour.frames.length).toBe(2);
    expect(built.stepMultiple).toBe(10);
    expect(built.probeSeries.durationSeconds).toBe(19 * 30);
  });

  it('프레임 한도를 넘기면 stride 를 자동으로 올린다', () => {
    const count = MAX_SCRDIF_FRAMES + 10;
    const times = Array.from({ length: count }, (_, i) => i * 30);
    const ds = parseScrdifTimeCsvText(makeScrdifCsv({ nx: 2, ny: 2, times, pierCells: [] }));
    const built = buildScrdifDashboard(ds);
    expect(built.stepMultiple).toBeGreaterThan(1);
    expect(built.scour.frames.length).toBeLessThanOrEqual(MAX_SCRDIF_FRAMES);
  });

  it('CSV 값이 전부 0 이면 scrdifAllZero 를 true 로 둔다', () => {
    const csv = makeScrdifCsv({ times: [0, 30], pierCells: [] }).replace(/-\d\.\d+e-\d+/g, '0');
    const ds = parseScrdifTimeCsvText(csv);
    expect(buildScrdifDashboard(ds).scrdifAllZero).toBe(true);
  });

  it('프로브 샘플은 프레임의 대표 세굴(|값| 최대, 부호 유지)이고 범위는 CSV 전체 min/max 다', () => {
    const ds = parseScrdifTimeCsvText(makeScrdifCsv());
    const built = buildScrdifDashboard(ds);
    const { samples, bounds } = built.probeSeries;
    const last = ds.frames[ds.frames.length - 1];
    expect(samples[0].scrdif).toBe(0);
    expect(samples[2].scrdif).toBeCloseTo(Math.min(...last), 9);
    expect(samples[2].scrdif).toBeLessThan(0);

    const range = probeSeriesValueRange(built.probeSeries, 'scrdif');
    expect(range.min).toBeCloseTo(bounds.minScrdif, 9);
    expect(range.max).toBeCloseTo(bounds.maxScrdif, 9);
  });

  describe('시나리오 연동', () => {
    /** 간격 0.27 m 로 구조물 3개(2×2 셀)를 둔 CSV. 셀 0.01 m, y 인덱스 8/35/62 근처. */
    function threePierDataset(): ReturnType<typeof parseScrdifTimeCsvText> {
      const cells: Array<[number, number]> = [];
      for (const yi of [8, 35, 62]) {
        cells.push([14, yi], [15, yi], [14, yi + 1], [15, yi + 1]);
      }
      return parseScrdifTimeCsvText(makeScrdifCsv({ nx: 30, ny: 71, pierCells: cells }));
    }
    const byId = (id: string): FlowScenario => {
      const found = FLOW_SCENARIOS.find((s) => s.id === id);
      if (!found) throw new Error(`scenario not found: ${id}`);
      return found;
    };
    const s01 = byId('S01');

    it('CSV 간격이 시나리오와 맞으면 경고 없이 CSV 에서 검출한 위치를 쓴다', () => {
      const built = buildScrdifDashboard(threePierDataset(), { scenario: s01 });
      expect(built.pierSource).toBe('detected');
      expect(built.warnings).toEqual([]);
      expect(built.piers.map((p) => p.id)).toEqual(['P1', 'P2', 'P3']);
      expect((built.piers[2].z - built.piers[0].z) / 2).toBeCloseTo(0.27, 3);
    });

    it('CSV 간격이 시나리오와 다르면 경고하되 CSV 값을 따른다', () => {
      const s23 = byId('S23');
      const built = buildScrdifDashboard(threePierDataset(), { scenario: s23 });
      expect(built.pierSource).toBe('detected');
      expect(built.warnings).toHaveLength(1);
      expect(built.warnings[0]).toContain('S23');
      expect((built.piers[2].z - built.piers[0].z) / 2).toBeCloseTo(0.27, 3);
    });

    it('검출 개수가 시나리오와 다르면 시나리오 간격으로 배치한다', () => {
      const ds = parseScrdifTimeCsvText(makeScrdifCsv({ pierCells: [] }));
      const built = buildScrdifDashboard(ds, { scenario: s01 });
      expect(built.pierSource).toBe('scenario');
      expect(built.warnings[0]).toContain('S01');
      expect(built.piers.map((p) => p.z)).toEqual([-0.27, 0, 0.27]);
      expect(built.piers.every((p) => p.x === 0)).toBe(true);
    });

    it('시나리오가 없으면 검출 결과를 그대로 쓰고 경고하지 않는다', () => {
      const built = buildScrdifDashboard(threePierDataset());
      expect(built.pierSource).toBe('detected');
      expect(built.warnings).toEqual([]);
    });

    it('하단부 형상을 시나리오에서 가져온다(S29 타원형, S30 직사각형, S28 원형)', () => {
      const ds = threePierDataset();
      const pick = (id: string): PierFooting | undefined =>
        buildScrdifDashboard(ds, { scenario: byId(id) }).piers[0].footing;
      expect(pick('S28')).toMatchObject({ shape: 'circle', lengthX: 0.13, widthZ: 0.13 });
      expect(pick('S29')).toMatchObject({ shape: 'ellipse', lengthX: 0.26, widthZ: 0.13 });
      expect(pick('S30')).toMatchObject({ shape: 'rectangle', lengthX: 0.26, widthZ: 0.13 });
    });

    it('세굴 탐색 반경은 이웃 교각 간격의 절반을 넘지 않는다', () => {
      const wide = buildScrdifDashboard(threePierDataset(), { scenario: s01 });
      expect(wide.piers[0].scourSearchRadius).toBeCloseTo(CSV_STRUCTURE.diameterM * 2, 6);

      const narrow = buildScrdifDashboard(
        parseScrdifTimeCsvText(makeScrdifCsv({ pierCells: [] })),
        { scenario: byId('S23') },
      );
      expect(narrow.piers[0].scourSearchRadius).toBeCloseTo(0.15625 / 2, 6);
    });
  });

  describe('교각 주변 표시 범위', () => {
    const NX = 200;
    const NY = 91;
    /** x 0~1.99 m, y ±0.45 m 의 넓은 격자. 교각은 한가운데(x≈1.0, y≈0)에 한 개. 값은 어디서나 0 이 아니다. */
    function wideDataset(): ReturnType<typeof parseScrdifTimeCsvText> {
      return parseScrdifTimeCsvText(
        makeScrdifCsv({
          nx: NX,
          ny: NY,
          pierCells: [
            [100, 44],
            [101, 44],
            [100, 45],
            [101, 45],
          ],
        }),
      );
    }
    /** 지형 격자의 (data x, 행 gy) 위치 값. 격자 시작이 x=0 이고 셀이 0.01 m 라서 gx = x / 0.01. */
    function valueAt(
      built: ReturnType<typeof buildScrdifDashboard>,
      dataX: number,
      gy: number,
    ): number {
      const { width } = built.scour.baseTerrain;
      const last = built.scour.frames[built.scour.frames.length - 1];
      return last.deltaElevations[gy * width + Math.round(dataX / 0.01)];
    }

    it('기본값: 교각 앞 0.4 m·뒤 0.6 m·옆 0.3 m 밖은 0 으로 가린다', () => {
      const built = buildScrdifDashboard(wideDataset());
      expect(built.regionApplied).toBe(true);
      expect(valueAt(built, 0.2, 45)).toBeCloseTo(0, 12); // 유입 쪽(교각 앞 0.8 m)
      expect(valueAt(built, 1.9, 45)).toBeCloseTo(0, 12); // 유출 쪽(교각 뒤 0.9 m)
      expect(valueAt(built, 1.0, 0)).toBeCloseTo(0, 12); // 측벽 쪽(옆 0.45 m)
      expect(valueAt(built, 0.8, 45)).toBeLessThan(0); // 교각 앞 0.2 m
      expect(valueAt(built, 1.3, 45)).toBeLessThan(0); // 교각 뒤 0.3 m
    });

    it('범위 안쪽 값은 원본과 같고, 경계에서는 서서히 줄어든다', () => {
      const all = buildScrdifDashboard(wideDataset(), { regionOnly: false });
      const roi = buildScrdifDashboard(wideDataset());
      expect(valueAt(roi, 0.8, 45)).toBeCloseTo(valueAt(all, 0.8, 45), 9);
      // 상류 경계 x = 0.995 - 0.4 - 0.005 ≈ 0.6 m: 바깥으로 갈수록 작아진다.
      const edge = [0.58, 0.54, 0.5].map((x) => Math.abs(valueAt(roi, x, 45)));
      expect(edge[0]).toBeGreaterThan(edge[1]);
      expect(edge[1]).toBeGreaterThan(edge[2]);
      expect(edge[0]).toBeLessThan(Math.abs(valueAt(all, 0.58, 45)));
    });

    it('regionOnly=false 면 CSV 전체를 그대로 쓴다', () => {
      const built = buildScrdifDashboard(wideDataset(), { regionOnly: false });
      expect(built.regionApplied).toBe(false);
      expect(valueAt(built, 0.2, 45)).toBeLessThan(0);
      expect(valueAt(built, 1.9, 45)).toBeLessThan(0);
    });

    it('범례 범위(bounds)는 가린 뒤의 값으로 계산한다', () => {
      const all = buildScrdifDashboard(wideDataset(), { regionOnly: false });
      const roi = buildScrdifDashboard(wideDataset());
      expect(Math.abs(roi.probeSeries.bounds.minScrdif)).toBeLessThan(
        Math.abs(all.probeSeries.bounds.minScrdif),
      );
    });

    it('교각이 없으면 가리지 않는다', () => {
      const ds = parseScrdifTimeCsvText(makeScrdifCsv({ nx: NX, ny: NY, pierCells: [] }));
      const built = buildScrdifDashboard(ds);
      expect(built.regionApplied).toBe(false);
      expect(valueAt(built, 0.2, 45)).toBeLessThan(0);
    });
  });
});
