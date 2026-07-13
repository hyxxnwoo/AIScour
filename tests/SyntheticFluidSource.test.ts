import { describe, expect, it } from 'vitest';
import { SyntheticFluidSource } from '@/data/SyntheticFluidSource';
import { sampleFluidQuantity } from '@/types/fluid';

describe('SyntheticFluidSource', () => {
  it('지정한 격자/프레임 수의 데이터를 생성하고 단위가 메타에 포함된다', async () => {
    const series = await new SyntheticFluidSource({
      width: 8,
      height: 4,
      depth: 6,
      cellSize: 1,
      frameCount: 3,
      frameIntervalSeconds: 2,
    }).load();

    expect(series.grid.width).toBe(8);
    expect(series.grid.height).toBe(4);
    expect(series.grid.depth).toBe(6);
    expect(series.frames).toHaveLength(3);
    expect(series.frames[0].velocityX.length).toBe(8 * 4 * 6);
    expect(series.frames.at(-1)?.timestampSeconds).toBe(4);
    expect(series.metadata?.velocityUnit).toBe('m/s');
  });

  it('기본 흐름 방향은 +X (상류 → 하류)이다', async () => {
    const series = await new SyntheticFluidSource({
      width: 16,
      height: 6,
      depth: 16,
      cellSize: 1,
      frameCount: 1,
      inflowSpeed: 2.0,
      pier: { x: 0, z: 0, radius: 0.5 },
    }).load();
    const frame = series.frames[0];
    // 교각에서 충분히 떨어진 좌측 상단(상류) 셀의 평균 vx 가 양수여야 한다.
    // 도메인 원점 기준 좌상단 = xi=0, yi=H/2, zi=0
    const v = sampleFluidQuantity(series.grid, frame, 'velocityX', 0, 3, 0);
    expect(v).toBeGreaterThan(0);
  });

  it('교각 내부 셀(중심)은 흐름이 0 또는 매우 작다', async () => {
    const series = await new SyntheticFluidSource({
      width: 21,
      height: 6,
      depth: 21,
      cellSize: 1,
      frameCount: 1,
      pier: { x: 0, z: 0, radius: 1.5 },
    }).load();
    const frame = series.frames[0];
    // 도메인 중심: xi = 10, zi = 10 → 월드 (0, 0)
    const speed = sampleFluidQuantity(series.grid, frame, 'speed', 10, 2, 10);
    expect(speed).toBeLessThan(0.5);
  });

  it('투과 구조물은 교각 내부에서도 일부 유속이 남는다', async () => {
    const impermeable = await new SyntheticFluidSource({
      width: 21,
      height: 6,
      depth: 21,
      cellSize: 1,
      frameCount: 1,
      inflowSpeed: 2.0,
      pier: { x: 0, z: 0, radius: 1.5 },
      permeable: false,
    }).load();
    const permeable = await new SyntheticFluidSource({
      width: 21,
      height: 6,
      depth: 21,
      cellSize: 1,
      frameCount: 1,
      inflowSpeed: 2.0,
      pier: { x: 0, z: 0, radius: 1.5 },
      permeable: true,
    }).load();
    const impermeableSpeed = sampleFluidQuantity(
      impermeable.grid,
      impermeable.frames[0],
      'speed',
      10,
      2,
      10,
    );
    const permeableSpeed = sampleFluidQuantity(
      permeable.grid,
      permeable.frames[0],
      'speed',
      10,
      2,
      10,
    );
    expect(impermeableSpeed).toBeLessThan(0.5);
    expect(permeableSpeed).toBeGreaterThan(impermeableSpeed);
  });
});
