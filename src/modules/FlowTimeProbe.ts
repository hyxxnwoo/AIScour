import {
  ArrowHelper,
  BufferAttribute,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';
import type { Disposable } from '@/types/disposable';
import type { TimeProbeSeries } from '@/data/buildTimeProbeSeries';
import {
  probeRowAtTime,
  type InterpolatedProbeState,
} from '@/data/buildTimeProbeSeries';
import { colorForFluidQuantity } from '@/utils/fluidQuantityColor';

export interface FlowTimeProbeOptions {
  scene: Scene;
  series: TimeProbeSeries;
  /** CSV 행 u·v·w 기반 스트릭(입자) 수. */
  streakCount?: number;
}

interface Streak {
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
  age: number;
}

const MARKER_RADIUS = 0.025;
const ARROW_MAX_LENGTH = 0.35;
const ARROW_MIN_LENGTH = 0.04;
const STREAK_COUNT = 280;
const STREAK_BOOST = 4.5;
const STREAK_SPAWN = 0.12;
const MIN_STREAK_LEN = 0.022;
const MIN_PROBE_FLOW = 0.012;

export class FlowTimeProbe implements Disposable {
  private readonly scene: Scene;
  private readonly series: TimeProbeSeries;
  private readonly scrdifMin: number;
  private readonly scrdifMax: number;
  private readonly marker: Mesh;
  private readonly arrow: ArrowHelper;
  private readonly trailLine: Line;
  private readonly trailPositions: Float32Array;
  private readonly trailColors: Float32Array;
  private readonly streakMesh: LineSegments;
  private readonly streakPositions: Float32Array;
  private readonly streakColors: Float32Array;
  private readonly streaks: Streak[];
  private readonly tmpColor = { r: 0, g: 0, b: 0 };
  private readonly flowDir = new Vector3();
  private readonly seriesHasFlow: boolean;
  private userVisible = true;
  private streaksVisible = true;
  private currentState: InterpolatedProbeState | null = null;
  private speedMax = 1;
  private lastTimeSeconds = -1;
  private lastSegmentIndex = -1;

  public constructor(options: FlowTimeProbeOptions) {
    this.scene = options.scene;
    this.series = options.series;

    let maxSpeed = 0;
    for (const s of this.series.samples) {
      const sp = Math.hypot(s.u, s.v, s.w);
      if (sp > maxSpeed) maxSpeed = sp;
    }
    this.seriesHasFlow = maxSpeed >= MIN_PROBE_FLOW;
    this.speedMax = Math.max(maxSpeed, MIN_PROBE_FLOW);

    const { minScrdif, maxScrdif } = this.series.bounds;
    this.scrdifMin = minScrdif;
    this.scrdifMax = maxScrdif === minScrdif ? minScrdif + 1 : maxScrdif;

    const n = this.series.samples.length;
    this.trailPositions = new Float32Array(Math.max(n, 1) * 3);
    this.trailColors = new Float32Array(Math.max(n, 1) * 3);

    for (let i = 0; i < n; i += 1) {
      const s = this.series.samples[i]!;
      this.trailPositions[i * 3] = s.worldX;
      this.trailPositions[i * 3 + 1] = s.worldY;
      this.trailPositions[i * 3 + 2] = s.worldZ;
      colorForFluidQuantity('scrdif', s.scrdif, this.scrdifMin, this.scrdifMax, this.tmpColor);
      this.trailColors[i * 3] = this.tmpColor.r;
      this.trailColors[i * 3 + 1] = this.tmpColor.g;
      this.trailColors[i * 3 + 2] = this.tmpColor.b;
    }

    const trailGeom = new BufferGeometry();
    trailGeom.setAttribute('position', new BufferAttribute(this.trailPositions, 3));
    trailGeom.setAttribute('color', new BufferAttribute(this.trailColors, 3));
    const trailMat = new LineBasicMaterial({ vertexColors: true, linewidth: 2 });
    this.trailLine = new Line(trailGeom, trailMat);
    this.trailLine.frustumCulled = false;
    this.trailLine.renderOrder = 6;
    this.scene.add(this.trailLine);

    const streakN = options.streakCount ?? STREAK_COUNT;
    this.streaks = Array.from({ length: streakN }, () => ({
      x: 0,
      y: 0,
      z: 0,
      px: 0,
      py: 0,
      pz: 0,
      age: 0,
    }));
    this.streakPositions = new Float32Array(streakN * 6);
    this.streakColors = new Float32Array(streakN * 6);
    const streakGeom = new BufferGeometry();
    streakGeom.setAttribute('position', new BufferAttribute(this.streakPositions, 3));
    streakGeom.setAttribute('color', new BufferAttribute(this.streakColors, 3));
    const streakMat = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.streakMesh = new LineSegments(streakGeom, streakMat);
    this.streakMesh.frustumCulled = false;
    this.streakMesh.renderOrder = 12;
    this.scene.add(this.streakMesh);

    const markerGeom = new SphereGeometry(MARKER_RADIUS, 16, 12);
    const markerMat = new MeshStandardMaterial({
      color: 0xffcc33,
      emissive: 0x664400,
      emissiveIntensity: 0.4,
      metalness: 0.2,
      roughness: 0.35,
    });
    this.marker = new Mesh(markerGeom, markerMat);
    this.marker.renderOrder = 8;
    this.scene.add(this.marker);

    this.arrow = new ArrowHelper(
      new Vector3(1, 0, 0),
      new Vector3(0, 0, 0),
      ARROW_MIN_LENGTH,
      0x44ccff,
      ARROW_MIN_LENGTH * 0.35,
      ARROW_MIN_LENGTH * 0.2,
    );
    this.arrow.renderOrder = 9;
    this.scene.add(this.arrow);

    this.updateAtTime(0);
    this.respawnAllStreaks();
    this.applyVisibility(true);
    if (this.shouldShowStreaks()) this.writeStreakGeometry();
  }

  public setVisible(visible: boolean): void {
    this.userVisible = visible;
    this.applyVisibility();
  }

  public get hasProbeFlow(): boolean {
    return this.seriesHasFlow;
  }

  /** CSV 모드에서 좌측 「유체 추적 입자」 토글과 연동. */
  public setStreaksVisible(visible: boolean): void {
    this.streaksVisible = visible;
    this.applyVisibility();
  }

  public get isStreaksVisible(): boolean {
    return this.streaksVisible;
  }

  public get isVisible(): boolean {
    return this.userVisible;
  }

  public get durationSeconds(): number {
    return this.series.durationSeconds;
  }

  public currentInfo(): InterpolatedProbeState | null {
    return this.currentState;
  }

  public updateAtTime(timeSeconds: number): void {
    if (this.lastTimeSeconds >= 0 && timeSeconds + 0.02 < this.lastTimeSeconds) {
      this.respawnAllStreaks();
    }
    this.lastTimeSeconds = timeSeconds;

    const state = probeRowAtTime(this.series, timeSeconds);
    this.currentState = state;
    if (!state) {
      this.applyVisibility(false);
      return;
    }

    if (state.segmentIndex !== this.lastSegmentIndex) {
      this.lastSegmentIndex = state.segmentIndex;
      this.respawnAllStreaks();
    }

    this.applyVisibility(true);
    this.marker.position.set(state.worldX, state.worldY, state.worldZ);

    const flowSpeed = this.resolveFlow(state);
    const arrowLen =
      flowSpeed > 0
        ? Math.max(ARROW_MIN_LENGTH, (flowSpeed / this.speedMax) * ARROW_MAX_LENGTH)
        : ARROW_MIN_LENGTH * 0.5;

    if (flowSpeed > 0) {
      this.arrow.setDirection(this.flowDir);
      this.arrow.position.copy(this.marker.position);
      this.arrow.setLength(arrowLen, arrowLen * 0.35, arrowLen * 0.2);
    }

    this.updateTrailDrawRange(state);
    if (this.shouldShowStreaks()) this.writeStreakGeometry();
  }

  private hasActiveFlow(state: InterpolatedProbeState): boolean {
    return state.speed >= MIN_PROBE_FLOW;
  }

  private shouldShowStreaks(): boolean {
    return (
      this.seriesHasFlow &&
      this.streaksVisible &&
      this.userVisible &&
      this.currentState !== null &&
      this.hasActiveFlow(this.currentState)
    );
  }

  /** 현재 CSV 행 u·v·w 로 스트릭을 한 프레임 이동. */
  public tick(deltaSeconds: number): void {
    if (!this.shouldShowStreaks() || !this.currentState) return;

    const state = this.currentState;
    const flowSpeed = this.resolveFlow(state);
    const dt = Math.min(0.05, Math.max(0, deltaSeconds)) * STREAK_BOOST;

    for (const streak of this.streaks) {
      streak.px = streak.x;
      streak.py = streak.y;
      streak.pz = streak.z;
      streak.age += deltaSeconds;

      streak.x += this.flowDir.x * flowSpeed * dt;
      streak.y += this.flowDir.y * flowSpeed * dt;
      streak.z += this.flowDir.z * flowSpeed * dt;

      const dx = streak.x - state.worldX;
      const dy = streak.y - state.worldY;
      const dz = streak.z - state.worldZ;
      if (Math.hypot(dx, dy, dz) > STREAK_SPAWN * 1.15 || streak.age > 1.6) {
        this.respawnStreak(streak);
      }
    }

    this.writeStreakGeometry();
  }

  /** CSV 행 u·v·w 가 유의미할 때만 흐름 방향·속력을 반환한다. */
  private resolveFlow(state: InterpolatedProbeState): number {
    if (state.speed >= MIN_PROBE_FLOW) {
      this.flowDir.set(state.worldU, state.worldV, state.worldW);
      const len = this.flowDir.length();
      if (len > 1e-9) {
        this.flowDir.divideScalar(len);
        return state.speed;
      }
    }
    this.flowDir.set(1, 0, 0);
    return 0;
  }

  private respawnAllStreaks(): void {
    for (const streak of this.streaks) this.respawnStreak(streak);
  }

  private respawnStreak(streak: Streak): void {
    const state = this.currentState;
    if (!state) return;
    const r = STREAK_SPAWN;
    streak.x = state.worldX + (Math.random() - 0.5) * r;
    streak.y = state.worldY + (Math.random() - 0.5) * r * 0.5;
    streak.z = state.worldZ + (Math.random() - 0.5) * r;
    streak.px = streak.x;
    streak.py = streak.y;
    streak.pz = streak.z;
    streak.age = 0;
  }

  private writeStreakGeometry(): void {
    const state = this.currentState;
    if (!state || !this.hasActiveFlow(state)) return;

    this.resolveFlow(state);
    const scrdif = state.scrdif;
    if (this.scrdifMin === this.scrdifMax) {
      // scrdif 변화가 없을 때는 물면 위에서도 보이는 흐름색
      this.tmpColor.r = 0.35;
      this.tmpColor.g = 0.92;
      this.tmpColor.b = 1;
    } else {
      colorForFluidQuantity('scrdif', scrdif, this.scrdifMin, this.scrdifMax, this.tmpColor);
    }

    for (let i = 0; i < this.streaks.length; i += 1) {
      const s = this.streaks[i]!;
      const base = i * 6;
      let tx = s.px;
      let ty = s.py;
      let tz = s.pz;
      let hx = s.x;
      let hy = s.y;
      let hz = s.z;

      let dx = hx - tx;
      let dy = hy - ty;
      let dz = hz - tz;
      let len = Math.hypot(dx, dy, dz);
      if (len < MIN_STREAK_LEN) {
        hx = tx + this.flowDir.x * MIN_STREAK_LEN;
        hy = ty + this.flowDir.y * MIN_STREAK_LEN;
        hz = tz + this.flowDir.z * MIN_STREAK_LEN;
        dx = hx - tx;
        dy = hy - ty;
        dz = hz - tz;
        len = MIN_STREAK_LEN;
      }

      this.streakPositions[base] = tx;
      this.streakPositions[base + 1] = ty;
      this.streakPositions[base + 2] = tz;
      this.streakPositions[base + 3] = hx;
      this.streakPositions[base + 4] = hy;
      this.streakPositions[base + 5] = hz;

      if (len < 1e-5) continue;

      const head = Math.min(1, len * 20);
      const tail = head * 0.35;

      this.streakColors[base] = tail * this.tmpColor.r * 0.65;
      this.streakColors[base + 1] = tail * this.tmpColor.g * 0.8;
      this.streakColors[base + 2] = tail * this.tmpColor.b;
      this.streakColors[base + 3] = head * this.tmpColor.r;
      this.streakColors[base + 4] = head * this.tmpColor.g;
      this.streakColors[base + 5] = head * this.tmpColor.b;
    }

    const posAttr = this.streakMesh.geometry.attributes['position'] as BufferAttribute;
    const colAttr = this.streakMesh.geometry.attributes['color'] as BufferAttribute;
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  private clearStreakGeometry(): void {
    this.streakPositions.fill(0);
    this.streakColors.fill(0);
    const posAttr = this.streakMesh.geometry.attributes['position'] as BufferAttribute;
    const colAttr = this.streakMesh.geometry.attributes['color'] as BufferAttribute;
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  private applyVisibility(forceShow?: boolean): void {
    const show = forceShow !== undefined ? forceShow && this.userVisible : this.userVisible;
    const flow = this.currentState !== null && this.hasActiveFlow(this.currentState);
    const flowViz = this.seriesHasFlow && this.streaksVisible;
    this.marker.visible = show;
    this.arrow.visible = show && flow;
    this.trailLine.visible = show && flowViz;
    const showStreaks = show && this.shouldShowStreaks();
    this.streakMesh.visible = showStreaks;
    if (!showStreaks) this.clearStreakGeometry();
  }

  private updateTrailDrawRange(state: InterpolatedProbeState): void {
    const { samples } = this.series;
    const n = samples.length;
    if (n === 0) return;

    const posAttr = this.trailLine.geometry.attributes['position'] as BufferAttribute;
    const pos = posAttr.array as Float32Array;

    if (n === 1) {
      pos[0] = state.worldX;
      pos[1] = state.worldY;
      pos[2] = state.worldZ;
      posAttr.needsUpdate = true;
      this.trailLine.geometry.setDrawRange(0, 1);
      return;
    }

    const segIdx = state.segmentIndex;
    const headIdx = Math.min(segIdx + 1, n - 1);

    for (let i = 0; i <= headIdx && i < n; i += 1) {
      const s = samples[i]!;
      pos[i * 3] = s.worldX;
      pos[i * 3 + 1] = s.worldY;
      pos[i * 3 + 2] = s.worldZ;
    }

    if (state.alpha > 1e-6 && headIdx < n) {
      const insertIdx = headIdx + 1;
      if (insertIdx < n) {
        pos[insertIdx * 3] = state.worldX;
        pos[insertIdx * 3 + 1] = state.worldY;
        pos[insertIdx * 3 + 2] = state.worldZ;
        colorForFluidQuantity('scrdif', state.scrdif, this.scrdifMin, this.scrdifMax, this.tmpColor);
        const colAttr = this.trailLine.geometry.attributes['color'] as BufferAttribute;
        const col = colAttr.array as Float32Array;
        col[insertIdx * 3] = this.tmpColor.r;
        col[insertIdx * 3 + 1] = this.tmpColor.g;
        col[insertIdx * 3 + 2] = this.tmpColor.b;
        colAttr.needsUpdate = true;
        posAttr.needsUpdate = true;
        this.trailLine.geometry.setDrawRange(0, insertIdx + 1);
        return;
      }
    }

    posAttr.needsUpdate = true;
    this.trailLine.geometry.setDrawRange(0, headIdx + 1);
  }

  public dispose(): void {
    this.scene.remove(this.marker);
    this.scene.remove(this.arrow);
    this.scene.remove(this.trailLine);
    this.scene.remove(this.streakMesh);
    this.marker.geometry.dispose();
    (this.marker.material as MeshStandardMaterial).dispose();
    this.arrow.dispose();
    this.trailLine.geometry.dispose();
    (this.trailLine.material as LineBasicMaterial).dispose();
    this.streakMesh.geometry.dispose();
    (this.streakMesh.material as LineBasicMaterial).dispose();
  }
}
