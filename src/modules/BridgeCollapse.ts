import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Scene,
} from 'three';
import type { ScourSeries } from '@/types/terrain';
import type { PierDefinition } from '@/modules/PierMarker';
import type { Disposable } from '@/types/disposable';

export interface BridgeCollapseOptions {
  scene: Scene;
  series: ScourSeries;
  piers: PierDefinition[];
  criticalScourDepth?: number;
  baseElevation?: number;
}

export interface CollapseEvent {
  pierIndex: number;
  pierId: string;
  timestampSeconds: number;
  scourDepth: number;
}

interface PierState {
  group: Group;
  shaftMat: MeshStandardMaterial;
  capMat?: MeshStandardMaterial;
  tiltDir: number;
  height: number;
  diameter: number;
}

const SHAKE_DURATION = 1.5;
const TILT_DURATION = 5.0;

// BridgeCollapse: 세굴 깊이·시간에 따라 교각(기둥) 붕괴를 표현한다. 타임라인 되감기 시 상태를 복원한다.
export class BridgeCollapse implements Disposable {
  private readonly scene: Scene;
  private readonly series: ScourSeries;
  private readonly piers: PierDefinition[];
  private readonly criticalDepth: number;
  private readonly baseElevation: number;

  private readonly group = new Group();
  private readonly pierStates: PierState[] = [];

  private readonly collapseListeners = new Set<(evt: CollapseEvent) => void>();
  /** pierIndex@onsetTime — 붕괴 알림 중복 방지 */
  private readonly collapseNotified = new Set<string>();
  private readonly disposableGeoms: Array<{ dispose(): void }> = [];
  private readonly disposableMats: Array<{ dispose(): void }> = [];

  public constructor(options: BridgeCollapseOptions) {
    this.scene = options.scene;
    this.series = options.series;
    this.piers = options.piers;
    this.criticalDepth = options.criticalScourDepth ?? 3.0;
    this.baseElevation = options.baseElevation ?? 0;

    for (const pier of this.piers) {
      this.addPier(pier);
    }
    this.scene.add(this.group);
  }

  private addPier(pier: PierDefinition): void {
    const diameter = pier.diameter ?? 1.0;
    const height = pier.height ?? 6.0;
    const radius = diameter / 2;
    const shape = pier.shape ?? 'circle';

    const pierGroup = new Group();
    pierGroup.position.set(pier.x, this.baseElevation, pier.z);

    const shaftMat = new MeshStandardMaterial({ color: 0x8899aa, roughness: 0.75, metalness: 0.1 });
    let shaft: Mesh;
    let capMat: MeshStandardMaterial | undefined;

    if (shape === 'square') {
      const shaftGeom = new BoxGeometry(diameter * 0.92, height, diameter * 0.92);
      shaft = new Mesh(shaftGeom, shaftMat);
      this.disposableGeoms.push(shaftGeom);
    } else {
      const shaftGeom = new CylinderGeometry(radius * 0.92, radius * 0.92, height, 24);
      shaft = new Mesh(shaftGeom, shaftMat);
      this.disposableGeoms.push(shaftGeom);

      const lidThick = Math.max(diameter * 0.05, 0.003);
      const lidGeom = new CylinderGeometry(radius * 0.92, radius * 0.92, lidThick, 24);
      capMat = new MeshStandardMaterial({ color: 0x8899aa, roughness: 0.65, metalness: 0.1 });
      const lid = new Mesh(lidGeom, capMat);
      lid.position.y = height + lidThick / 2;
      lid.castShadow = true;
      pierGroup.add(lid);
      this.disposableGeoms.push(lidGeom);
      this.disposableMats.push(capMat);
    }

    shaft.position.y = height / 2;
    shaft.castShadow = true;

    pierGroup.add(shaft);
    this.group.add(pierGroup);
    this.disposableMats.push(shaftMat);

    this.pierStates.push({
      group: pierGroup,
      shaftMat,
      capMat,
      tiltDir: this.pierStates.length % 2 === 0 ? 1 : -1,
      height,
      diameter,
    });
  }

  private setPierColor(state: PierState, color: number): void {
    state.shaftMat.color.setHex(color);
    state.capMat?.color.setHex(color);
  }

  private sampleScourAtPier(timeSeconds: number, pierIndex: number): number {
    const { frames } = this.series;
    if (frames.length === 0) return 0;

    const lastT = frames.at(-1)!.timestampSeconds;
    const clamped = Math.max(0, Math.min(timeSeconds, lastT));
    let frameIdx = 0;
    for (let i = 0; i < frames.length; i++) {
      if ((frames[i]?.timestampSeconds ?? 0) <= clamped) frameIdx = i;
      else break;
    }

    const frame = frames[frameIdx];
    if (!frame) return 0;

    const pier = this.piers[pierIndex];
    if (!pier) return 0;

    const state = this.pierStates[pierIndex];
    if (!state) return 0;

    const { width, height, cellSize } = this.series.baseTerrain;
    const halfW = ((width - 1) * cellSize) / 2;
    const halfH = ((height - 1) * cellSize) / 2;
    const cx = Math.round((pier.x + halfW) / cellSize);
    const cy = Math.round((pier.z + halfH) / cellSize);
    const searchRadius = state.diameter / 2 + cellSize * 2;
    const rCells = Math.ceil(searchRadius / cellSize) + 1;

    let maxErosion = 0;
    for (let gy = Math.max(0, cy - rCells); gy <= Math.min(height - 1, cy + rCells); gy++) {
      for (let gx = Math.max(0, cx - rCells); gx <= Math.min(width - 1, cx + rCells); gx++) {
        const dx = (gx - cx) * cellSize;
        const dz = (gy - cy) * cellSize;
        if (dx * dx + dz * dz > searchRadius * searchRadius) continue;
        const delta = frame.deltaElevations[gy * width + gx] ?? 0;
        const erosion = -delta;
        if (erosion > maxErosion) maxErosion = erosion;
      }
    }
    return maxErosion;
  }

  /** 시각 t 이전(포함)에서 임계 세굴을 처음 넘은 시각. 아직 미만이면 null. */
  private findCollapseOnsetTime(pierIndex: number, t: number): number | null {
    if (this.sampleScourAtPier(t, pierIndex) / this.criticalDepth < 1.0) return null;

    const { frames } = this.series;
    if (frames.length === 0) return null;

    const clamped = Math.max(0, Math.min(t, frames.at(-1)!.timestampSeconds));
    for (let i = 0; i < frames.length; i++) {
      const ft = frames[i]!.timestampSeconds;
      if (ft > clamped) break;
      if (this.sampleScourAtPier(ft, pierIndex) / this.criticalDepth >= 1.0) {
        return ft;
      }
    }
    return null;
  }

  private resetPierPose(state: PierState, ratio: number): void {
    state.group.rotation.set(0, 0, 0);
    state.group.position.y = this.baseElevation;
    const color = ratio > 0.75 ? 0xff3333 : ratio > 0.45 ? 0xff8800 : 0x8899aa;
    this.setPierColor(state, color);
  }

  private applyPierCollapsedPose(state: PierState): void {
    state.group.rotation.z = (Math.PI / 2) * state.tiltDir;
    state.group.rotation.x = 0.15 * state.tiltDir;
    state.group.position.y = this.baseElevation - this.criticalDepth * 0.7;
    this.setPierColor(state, 0xff2222);
  }

  private maybeNotifyCollapse(pierIndex: number, onset: number, t: number, scour: number): void {
    const key = `${pierIndex}@${onset}`;
    if (this.collapseNotified.has(key)) return;
    const elapsed = t - onset;
    if (elapsed < 0 || elapsed > 0.08) return;
    this.collapseNotified.add(key);
    for (const cb of this.collapseListeners) {
      cb({
        pierIndex,
        pierId: this.piers[pierIndex]?.id ?? String(pierIndex),
        timestampSeconds: onset,
        scourDepth: scour,
      });
    }
  }

  public updateAtTime(t: number): void {
    for (let i = 0; i < this.pierStates.length; i++) {
      const state = this.pierStates[i];
      if (!state) continue;

      const scour = this.sampleScourAtPier(t, i);
      const ratio = scour / this.criticalDepth;
      const onset = this.findCollapseOnsetTime(i, t);

      if (onset === null) {
        this.resetPierPose(state, ratio);
        continue;
      }

      this.maybeNotifyCollapse(i, onset, t, scour);

      const elapsed = t - onset;
      if (elapsed < SHAKE_DURATION) {
        const shake = Math.sin(elapsed * 35) * 0.05 * (1 - elapsed / SHAKE_DURATION);
        state.group.rotation.z = shake;
        state.group.rotation.x = shake * 0.4;
        state.group.position.y = this.baseElevation;
        this.setPierColor(state, 0xff2222);
      } else if (elapsed < SHAKE_DURATION + TILT_DURATION) {
        const tiltT = (elapsed - SHAKE_DURATION) / TILT_DURATION;
        const ease = tiltT * tiltT * (3 - 2 * tiltT);
        state.group.rotation.z = ease * (Math.PI / 2) * state.tiltDir;
        state.group.rotation.x = ease * 0.15 * state.tiltDir;
        state.group.position.y = this.baseElevation - ease * this.criticalDepth * 0.7;
        this.setPierColor(state, 0xff2222);
      } else {
        this.applyPierCollapsedPose(state);
      }
    }
  }

  public getScourRatios(t: number): { ratio: number; collapsed: boolean }[] {
    return this.pierStates.map((_state, i) => {
      const ratio = this.sampleScourAtPier(t, i) / this.criticalDepth;
      return {
        ratio: Math.min(1, ratio),
        collapsed: this.findCollapseOnsetTime(i, t) !== null,
      };
    });
  }

  public isAnyPierCollapsedAt(t: number): boolean {
    return this.getScourRatios(t).some((r) => r.collapsed);
  }

  public get criticalScourDepth(): number {
    return this.criticalDepth;
  }

  public onCollapse(cb: (evt: CollapseEvent) => void): () => void {
    this.collapseListeners.add(cb);
    return () => this.collapseListeners.delete(cb);
  }

  public dispose(): void {
    this.collapseListeners.clear();
    this.collapseNotified.clear();
    this.scene.remove(this.group);
    for (const g of this.disposableGeoms) g.dispose();
    for (const m of this.disposableMats) m.dispose();
    this.group.clear();
  }
}
