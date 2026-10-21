/** 경량화 CSV(x_m,y_m,tNNNNs…) 테스트용 합성 데이터. 기본으로 중앙에 값이 항상 0 인 구조물 2×2 셀을 둔다. */
export interface SyntheticScrdifCsvOptions {
  nx?: number;
  ny?: number;
  times?: number[];
  cell?: number;
  /** 구조물 점유 셀(x 인덱스, y 인덱스 쌍 목록). 기본: 중앙 2×2. */
  pierCells?: Array<[number, number]>;
}

export function makeScrdifCsv(options: SyntheticScrdifCsvOptions = {}): string {
  const nx = options.nx ?? 20;
  const ny = options.ny ?? 10;
  const cell = options.cell ?? 0.01;
  const times = options.times ?? [0, 30, 60];
  const pierCells =
    options.pierCells ??
    ([
      [9, 4],
      [10, 4],
      [9, 5],
      [10, 5],
    ] as Array<[number, number]>);
  const pier = new Set(pierCells.map(([xi, yi]) => `${xi},${yi}`));

  const header = ['x_m', 'y_m', ...times.map((t) => `t${String(t).padStart(4, '0')}s`)];
  const lines = [header.join(',')];
  for (let yi = 0; yi < ny; yi += 1) {
    for (let xi = 0; xi < nx; xi += 1) {
      const x = xi * cell;
      const y = (yi - (ny - 1) / 2) * cell;
      const values = times.map((t, ti) => {
        if (ti === 0 || pier.has(`${xi},${yi}`)) return 0;
        return -0.001 * (t / 30) * (1 + xi / nx);
      });
      lines.push([x.toFixed(6), y.toFixed(6), ...values.map((v) => v.toExponential(7))].join(','));
    }
  }
  return lines.join('\n');
}
