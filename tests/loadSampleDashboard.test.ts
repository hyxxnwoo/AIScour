import { describe, expect, it } from 'vitest';
import {
  caseNameFromFileName,
  loadCsvDashboard,
  loadCsvDashboards,
  MAX_CSV_CASES,
} from '@/data/loadCsvDashboard';
import { isCsvParseAbortError } from '@/utils/csvParseAbort';
import { makeScrdifCsv } from './helpers/scrdifCsv';

function csvFile(text: string, name = 'case.csv'): File {
  return new File([text], name, { type: 'text/csv' });
}

describe('loadCsvDashboard (경량화 CSV)', () => {
  it('파일 1개에서 세굴 프레임·교각·프리뷰 열을 만든다', async () => {
    const phases: string[] = [];
    const result = await loadCsvDashboard([csvFile(makeScrdifCsv())], {
      onProgress: (p) => phases.push(p.phase),
    });

    expect(result.scour.frames.length).toBe(3);
    expect(result.fluid).toBeNull();
    expect(result.piers.length).toBe(1);
    expect(result.columns.count).toBe(200);
    expect(result.columns.timeColumnCount).toBe(3);
    expect(result.dataset.times).toEqual([0, 30, 60]);
    expect(result.probeSeries.durationSeconds).toBe(60);
    expect(result.autoAdjusted).toBe(false);
    expect(result.csvScrdifAllZero).toBe(false);
    expect(phases).toContain('classify');
    expect(phases).toContain('parse');
    expect(phases).toContain('build');
  });

  it('여러 파일을 고르면 첫 CSV 만 사용한다', async () => {
    const result = await loadCsvDashboard([
      csvFile(makeScrdifCsv({ times: [0, 30] }), 'a.csv'),
      csvFile(makeScrdifCsv({ times: [0, 30, 60, 90] }), 'b.csv'),
    ]);
    expect(result.dataset.times).toEqual([0, 30]);
  });

  it('stepMultiple 은 시간 열 stride 로 반영된다', async () => {
    const times = Array.from({ length: 20 }, (_, i) => i * 30);
    const result = await loadCsvDashboard([csvFile(makeScrdifCsv({ times, pierCells: [] }))], {
      stepMultiple: 10,
    });
    expect(result.scour.frames.length).toBe(2);
    expect(result.stepMultiple).toBe(10);
    expect(result.requestedStepMultiple).toBe(10);
    expect(result.autoAdjusted).toBe(false);
  });

  it('CSV 가 아니거나 양식이 다르면 오류를 낸다', async () => {
    await expect(loadCsvDashboard([csvFile('x', 'a.txt')])).rejects.toThrow(/CSV 파일/);
    await expect(
      loadCsvDashboard([csvFile('x,y,z,u,v,w,scrdif\n1,2,3,4,5,6,7', 'old.csv')]),
    ).rejects.toThrow(/지원하지 않는 CSV 형식/);
  });

  it('중지 신호가 있으면 중단 오류를 낸다', async () => {
    const controller = new AbortController();
    controller.abort();
    const err = await loadCsvDashboard([csvFile(makeScrdifCsv())], {
      signal: controller.signal,
    }).catch((e: unknown) => e);
    expect(isCsvParseAbortError(err)).toBe(true);
  });

  it('결과에 파일명에서 뽑은 케이스 이름이 들어간다', async () => {
    const result = await loadCsvDashboard([csvFile(makeScrdifCsv(), 's01_all_timesteps.csv')]);
    expect(result.caseName).toBe('s01');
  });
});

describe('caseNameFromFileName', () => {
  it('확장자와 _all_timesteps 꼬리를 뗀다', () => {
    expect(caseNameFromFileName('s01_all_timesteps.csv')).toBe('s01');
    expect(caseNameFromFileName('C:\\data\\s02-all-timesteps.CSV')).toBe('s02');
    expect(caseNameFromFileName('run_a.csv')).toBe('run_a');
    expect(caseNameFromFileName('_all_timesteps.csv')).toBe('_all_timesteps.csv');
  });
});

describe('loadCsvDashboards (여러 케이스)', () => {
  it('파일마다 케이스 하나씩 순서대로 만든다', async () => {
    const results = await loadCsvDashboards([
      csvFile(makeScrdifCsv({ times: [0, 30] }), 's01_all_timesteps.csv'),
      csvFile(makeScrdifCsv({ times: [0, 30, 60] }), 's02_all_timesteps.csv'),
    ]);
    expect(results.map((r) => r.caseName)).toEqual(['s01', 's02']);
    expect(results.map((r) => r.scour.frames.length)).toEqual([2, 3]);
  });

  it('진행률은 파일 순번과 개수를 함께 보고한다', async () => {
    const seen = new Set<string>();
    await loadCsvDashboards(
      [csvFile(makeScrdifCsv(), 'a.csv'), csvFile(makeScrdifCsv(), 'b.csv')],
      {
        onProgress: (p) => seen.add(`${p.fileIndex}/${p.fileCount}`),
      },
    );
    expect([...seen].sort()).toEqual(['0/2', '1/2']);
  });

  it('최대 개수를 넘기면 거부한다', async () => {
    const files = Array.from({ length: MAX_CSV_CASES + 1 }, (_, i) =>
      csvFile(makeScrdifCsv({ nx: 2, ny: 2, pierCells: [] }), `s${i}.csv`),
    );
    await expect(loadCsvDashboards(files)).rejects.toThrow(/최대/);
  });

  it('CSV 가 하나도 없으면 오류를 낸다', async () => {
    await expect(loadCsvDashboards([csvFile('x', 'a.txt')])).rejects.toThrow(/CSV 파일/);
  });
});

describe('loadCsvDashboard (시나리오 연결)', () => {
  it('s01 은 S01 시나리오와 연결된다', async () => {
    const result = await loadCsvDashboard([csvFile(makeScrdifCsv(), 's01_all_timesteps.csv')]);
    expect(result.scenario?.id).toBe('S01');
    expect(result.scenario?.pierSpacingM).toBe(0.27);
  });

  it('시나리오 이름이 아니면 시나리오 없이 CSV 값만 쓴다', async () => {
    const result = await loadCsvDashboard([csvFile(makeScrdifCsv(), 'run_a.csv')]);
    expect(result.scenario).toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.piers.length).toBe(1);
  });

  it('검출한 교각 수가 시나리오와 다르면 경고하고 시나리오 배치를 쓴다', async () => {
    // 합성 CSV 는 구조물이 1개뿐이라 S01(3개)과 어긋난다.
    const result = await loadCsvDashboard([csvFile(makeScrdifCsv(), 's01_all_timesteps.csv')]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('S01');
    expect(result.piers.map((p) => p.z)).toEqual([-0.27, 0, 0.27]);
  });
});
