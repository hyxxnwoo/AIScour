import { describe, expect, it } from 'vitest';
import { FLUME } from '@/constants/experiment';
import { computeBounds, dataToWorld } from '@/data/buildSampleProbeDashboard';
import {
  probeDataXToWorldX,
  probeWorldAnchor,
  probeWorldXToDataX,
} from '@/utils/probeWorldCoords';
import { type SampleProbeColumns } from '@/utils/parseSampleProbeCsv';

function columnsFromRows(rows: Array<{ x: number; y: number; z: number }>): SampleProbeColumns {
  const count = rows.length;
  const x = Float32Array.from(rows.map((r) => r.x));
  const y = Float32Array.from(rows.map((r) => r.y));
  const z = Float32Array.from(rows.map((r) => r.z));
  const zero = new Float32Array(count);
  return { x, y, z, u: zero, v: zero, w: zero, scrdif: zero, count };
}

describe('probeWorldCoords', () => {
  it('CSV x=0 은 수조 입구(-lengthX/2)에, x=lengthX 는 출구(+lengthX/2)에 대응한다', () => {
    const anchor = probeWorldAnchor(FLUME.tank.lengthX);
    expect(probeDataXToWorldX(0, anchor)).toBeCloseTo(-FLUME.tank.lengthX / 2, 6);
    expect(probeDataXToWorldX(FLUME.tank.lengthX, anchor)).toBeCloseTo(
      FLUME.tank.lengthX / 2,
      6,
    );
  });

  it('부분 CSV 범위여도 x=0 앵커는 고정이다', () => {
    const columns = columnsFromRows([
      { x: 0.2, y: 0, z: 0 },
      { x: 0.8, y: 0, z: 0 },
    ]);
    const bounds = computeBounds(columns);
    expect(bounds.centerDataX).toBeCloseTo(0.5, 6);
    expect(bounds.originDataX).toBeCloseTo(FLUME.tank.lengthX / 2, 6);
    expect(dataToWorld(0, 0, 0, bounds).x).toBeCloseTo(-FLUME.tank.lengthX / 2, 6);
    expect(probeWorldXToDataX(0, probeWorldAnchor())).toBeCloseTo(FLUME.tank.lengthX / 2, 6);
  });
});
