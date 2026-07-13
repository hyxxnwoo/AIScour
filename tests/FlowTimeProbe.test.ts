import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { buildTimeProbeSeries } from '@/data/buildTimeProbeSeries';
import { FlowTimeProbe } from '@/modules/FlowTimeProbe';
import type { Flow3dScrdifColumns } from '@/utils/parseFlow3dScrdifCsv';

function makeColumns(speed = 0.2): Flow3dScrdifColumns {
  const count = 4;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const u = new Float32Array(count);
  const v = new Float32Array(count);
  const w = new Float32Array(count);
  const scrdif = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    x[i] = i * 0.05;
    y[i] = 0;
    z[i] = 0.1;
    u[i] = speed;
    v[i] = 0;
    w[i] = 0;
    scrdif[i] = 0;
  }
  return { x, y, z, u, v, w, scrdif, count };
}

describe('FlowTimeProbe', () => {
  it('updateAtTime 으로 마커 위치가 변한다', () => {
    const series = buildTimeProbeSeries(makeColumns());
    const scene = new Scene();
    const probe = new FlowTimeProbe({ scene, series });

    probe.updateAtTime(0);
    const at0 = probe.currentInfo()!;
    expect(at0.worldX).toBeCloseTo(series.samples[0]!.worldX, 5);

    probe.updateAtTime(30);
    const at30 = probe.currentInfo()!;
    expect(at30.worldX).toBeCloseTo(series.samples[1]!.worldX, 5);
    expect(at30.worldX).not.toBeCloseTo(at0.worldX, 4);

    probe.dispose();
  });

  it('setVisible(false) 이면 마커를 숨긴다', () => {
    const series = buildTimeProbeSeries(makeColumns());
    const scene = new Scene();
    const probe = new FlowTimeProbe({ scene, series });
    probe.updateAtTime(0);

    const marker = scene.children.find((c) => 'geometry' in c && c.type === 'Mesh') as {
      visible: boolean;
    };
    expect(marker.visible).toBe(true);

    probe.setVisible(false);
    expect(marker.visible).toBe(false);

    probe.dispose();
  });

  it('30초 미만 시각에서는 해당 CSV 행(0행) 위치를 유지한다', () => {
    const series = buildTimeProbeSeries(makeColumns());
    const scene = new Scene();
    const probe = new FlowTimeProbe({ scene, series });

    probe.updateAtTime(15);
    const info = probe.currentInfo()!;
    expect(info.worldX).toBeCloseTo(series.samples[0]!.worldX, 5);
    expect(info.alpha).toBe(0);
    expect(info.rowIndex).toBe(0);

    probe.dispose();
  });

  it('u·v·w=0 이면 스트릭과 궤적(trail)을 숨긴다', () => {
    const series = buildTimeProbeSeries(makeColumns(0));
    const scene = new Scene();
    const probe = new FlowTimeProbe({ scene, series, streakCount: 4 });
    probe.updateAtTime(0);

    const streaks = scene.children.find((c) => c.type === 'LineSegments') as { visible: boolean };
    const trail = scene.children.find((c) => c.type === 'Line') as { visible: boolean };
    expect(streaks.visible).toBe(false);
    expect(trail.visible).toBe(false);
    expect(probe.hasProbeFlow).toBe(false);

    probe.dispose();
  });

  it('u=0 이고 v·w만 있으면 스트릭을 표시한다', () => {
    const columns = makeColumns(0);
    columns.v[0] = 0.3;
    columns.w[0] = 0.2;
    const series = buildTimeProbeSeries(columns);
    const scene = new Scene();
    const probe = new FlowTimeProbe({ scene, series, streakCount: 4 });
    probe.setStreaksVisible(true);
    probe.updateAtTime(0);

    const streaks = scene.children.find((c) => c.type === 'LineSegments') as { visible: boolean };
    expect(streaks.visible).toBe(true);
    expect(probe.hasProbeFlow).toBe(true);

    probe.dispose();
  });

  it('setStreaksVisible 로 입자 스트릭 표시를 끈다', () => {
    const series = buildTimeProbeSeries(makeColumns());
    const scene = new Scene();
    const probe = new FlowTimeProbe({ scene, series, streakCount: 8 });
    probe.updateAtTime(0);

    const streaks = scene.children.find((c) => c.type === 'LineSegments') as { visible: boolean };
    expect(streaks.visible).toBe(true);

    probe.setStreaksVisible(false);
    expect(streaks.visible).toBe(false);
    expect(probe.isStreaksVisible).toBe(false);

    probe.dispose();
  });

  it('생성 직후 스트릭이 프로브 위치 근처에 배치된다', () => {
    const series = buildTimeProbeSeries(makeColumns());
    const scene = new Scene();
    const probe = new FlowTimeProbe({ scene, series, streakCount: 4 });
    probe.updateAtTime(0);

    const info = probe.currentInfo()!;
    const streakMesh = scene.children.find((c) => c.type === 'LineSegments')!;
    const pos = (streakMesh as { geometry: { attributes: { position: { array: Float32Array } } } })
      .geometry.attributes.position.array;
    const headX = pos[3]!;
    expect(Math.abs(headX - info.worldX)).toBeLessThan(0.2);

    probe.dispose();
  });

  it('tick 으로 u·v·w 방향으로 스트릭이 이동한다', () => {
    const series = buildTimeProbeSeries(makeColumns());
    const scene = new Scene();
    const probe = new FlowTimeProbe({ scene, series, streakCount: 4 });
    probe.updateAtTime(0);

    const info = probe.currentInfo()!;
    const streakMesh = scene.children.find((c) => c.type === 'LineSegments')!;
    const posBefore = (streakMesh as { geometry: { attributes: { position: { array: Float32Array } } } })
      .geometry.attributes.position.array;
    const headXBefore = posBefore[3]!;

    probe.tick(0.2);

    const posAfter = (streakMesh as { geometry: { attributes: { position: { array: Float32Array } } } })
      .geometry.attributes.position.array;
    const headXAfter = posAfter[3]!;
    expect(headXAfter).toBeGreaterThan(headXBefore);
    expect(Math.abs(headXAfter - info.worldX)).toBeLessThan(0.25);

    probe.dispose();
  });
});
