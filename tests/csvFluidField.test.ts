import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { buildSampleProbeDashboard } from '@/data/buildSampleProbeDashboard';
import { FluidTracers } from '@/modules/FluidTracers';
import { alignFluidSeriesToTerrain, defaultFluidSliceHeight } from '@/utils/fluidWorld';
import { parseSampleProbeCsvText } from '@/utils/parseSampleProbeCsv';

const FLOW_XS = Array.from({ length: 12 }, (_, i) => 0.01 * i);
const LATERAL_YS = [-0.2, -0.1, 0];
/** 퇴적물 표면(표고 0) 아래·위를 함께 덮는 측정면. */
const VERTICAL_ZS = [-0.12, -0.04, 0.04, 0.12];

function exp(v: number): string {
  return v.toExponential(7).toUpperCase();
}

/** FLOW-3D 출력 형식(C열 t 마커 + 헤더 + 공간 행)을 시점 여러 개로 만든다. */
function makeCsvText(timeCount: number): string {
  const lines = [
    '  flscon:  version 23.2.0.01  win64 2022 ,,',
    'Mesh Block   1,,',
  ];

  for (let ti = 0; ti < timeCount; ti += 1) {
    lines.push(
      ` printing u, v, w and scrdif       t=${(ti * 30).toFixed(1)}  ix=3 to  14   jy=3 to  5  kz=3 to  6 `,
    );
    lines.push(
      '   x               y               z               u               v               w               scrdif,,',
    );
    FLOW_XS.forEach((x, ix) => {
      for (const y of LATERAL_YS) {
        for (const z of VERTICAL_ZS) {
          // 흐름 방향으로 가속하고 시점마다 세굴이 깊어지는 장.
          const u = 0.3 + 0.02 * ix;
          const v = 0.01;
          const w = 0.005;
          const scrdif = -0.002 * ti * (ix + 1);
          lines.push(
            `  ${exp(x)}  ${exp(y)}  ${exp(z)}  ${exp(u)}  ${exp(v)}  ${exp(w)}  ${exp(scrdif)},,`,
          );
        }
      }
    });
  }

  return lines.join('\n');
}

describe('CSV t 블록 → 유체 필드 → 추적 입자', () => {
  it('t 블록마다 프레임을, 행마다 셀 값을 가진 유체 필드를 만든다', () => {
    const dataset = parseSampleProbeCsvText(makeCsvText(3));
    expect(dataset.blocks).toHaveLength(3);

    const built = buildSampleProbeDashboard(dataset);
    const fluid = built.fluid;

    expect(fluid).not.toBeNull();
    expect(fluid!.grid.width).toBe(FLOW_XS.length);
    expect(fluid!.frames).toHaveLength(3);
    // 세굴 프레임과 시각이 같아야 재생 위치가 어긋나지 않는다.
    expect(fluid!.frames.map((f) => f.timestampSeconds)).toEqual(
      built.scour.frames.map((f) => f.timestampSeconds),
    );

    // 상류 → 하류로 유속이 커지는 공간 변화가 남아 있어야 한다.
    const frame = fluid!.frames[0]!;
    const upstream = frame.velocityX[0]!;
    const downstream = frame.velocityX[fluid!.grid.width - 1]!;
    expect(downstream).toBeGreaterThan(upstream);
  });

  it('추적 입자가 CSV 유체 필드를 따라 흐른다', () => {
    const dataset = parseSampleProbeCsvText(makeCsvText(2));
    const built = buildSampleProbeDashboard(dataset);
    const fluid = alignFluidSeriesToTerrain(built.fluid!, built.scour.baseTerrain);
    const waterLevel = defaultFluidSliceHeight(fluid, built.scour.baseTerrain);

    const scene = new Scene();
    const tracers = new FluidTracers({
      scene,
      fluidSeries: fluid,
      scourSeries: built.scour,
      waterLevel,
      particleCount: 120,
    });
    tracers.updateAtTime(0);

    const geometry = (
      scene.children[0] as unknown as {
        geometry: { attributes: { position: { array: Float32Array } } };
      }
    ).geometry;
    const before = geometry.attributes.position.array.slice();

    // 프로브 대표값을 넣지 않았으므로 격자 유속만으로 움직여야 한다.
    for (let i = 0; i < 3; i += 1) {
      tracers.tick(1 / 240);
    }
    const after = geometry.attributes.position.array;

    let movedDownstream = 0;
    for (let i = 0; i < before.length; i += 6) {
      // 각 입자는 (이전 위치, 현재 위치) 두 정점으로 그려진다 — 머리 정점만 비교한다.
      if (after[i + 3]! - before[i + 3]! > 1e-4) movedDownstream += 1;
    }

    expect(tracers.isVisible).toBe(true);
    expect(movedDownstream).toBeGreaterThan(30);

    tracers.dispose();
  });
});
