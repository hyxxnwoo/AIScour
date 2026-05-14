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
  // 교각 기초 하부까지의 안전 세굴 허용 깊이(미터). 초과 시 붕괴 트리거.
  criticalScourDepth?: number;
  // 교각 하단 표고. 보통 0 또는 베이스 지형 평균값.
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
  capMat: MeshStandardMaterial;
  collapsed: boolean;
  collapseStartTime: number;
  height: number;
  diameter: number;
}

const SHAKE_DURATION = 1.5; // seconds
const TILT_DURATION = 5.0; // seconds

// BridgeCollapse: 교각 + 교량 데크를 렌더링하고, 교각 주변 세굴 깊이가 임계값을 초과하면
// 교각 기울어짐 → 데크 낙하 붕괴 애니메이션을 시뮬레이션한다.
export class BridgeCollapse implements Disposable {
  private readonly scene: Scene;
  private readonly series: ScourSeries;
  private readonly piers: PierDefinition[];
  private readonly criticalDepth: number;
  private readonly baseElevation: number;

  private readonly group = new Group();
  private readonly pierStates: PierState[] = [];
  private deckMesh: Mesh | null = null;
  private deckMat: MeshStandardMaterial | null = null;
  private deckInitialY = 0;
  private deckCollapseStarted = false;
  private deckCollapseStartTime = 0;

  private readonly collapseListeners = new Set<(evt: CollapseEvent) => void>();
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
    if (this.piers.length > 0) {
      this.buildDeck();
    }
    this.scene.add(this.group);
  }

  private addPier(pier: PierDefinition): void {
    const diameter = pier.diameter ?? 1.0;
    const height = pier.height ?? 6.0;
    const radius = diameter / 2;

    const pierGroup = new Group();
    // 회전 피벗이 하단이 되도록 y=0 에서 시작
    pierGroup.position.set(pier.x, this.baseElevation, pier.z);

    const shaftGeom = new CylinderGeometry(radius * 0.92, radius * 0.92, height, 24);
    const shaftMat = new MeshStandardMaterial({ color: 0x8899aa, roughness: 0.75, metalness: 0.1 });
    const shaft = new Mesh(shaftGeom, shaftMat);
    shaft.position.y = height / 2;
    shaft.castShadow = true;

    const capGeom = new CylinderGeometry(radius * 1.45, radius * 1.45, 0.55, 24);
    const capMat = new MeshStandardMaterial({ color: 0x5577aa, roughness: 0.6, metalness: 0.15 });
    const cap = new Mesh(capGeom, capMat);
    cap.position.y = height + 0.275;
    cap.castShadow = true;

    pierGroup.add(shaft, cap);
    this.group.add(pierGroup);
    this.disposableGeoms.push(shaftGeom, capGeom);
    this.disposableMats.push(shaftMat, capMat);

    this.pierStates.push({
      group: pierGroup,
      shaftMat,
      capMat,
      collapsed: false,
      collapseStartTime: 0,
      height,
      diameter,
    });
  }

  private buildDeck(): void {
    const { width, cellSize } = this.series.baseTerrain;
    let maxPierHeight = 0;
    for (const pier of this.piers) {
      maxPierHeight = Math.max(maxPierHeight, pier.height ?? 6.0);
    }

    // 교량 데크: 지형 너비의 70% 를 span 한다.
    const deckLength = (width - 1) * cellSize * 0.7;
    const deckWidth = Math.max(...this.piers.map((p) => (p.diameter ?? 1.0) * 2.5), 3.5);
    const deckThick = 0.8;
    const deckY = this.baseElevation + maxPierHeight + 0.55 + deckThick / 2;

    const centerX = this.piers.reduce((s, p) => s + p.x, 0) / this.piers.length;
    const centerZ = this.piers.reduce((s, p) => s + p.z, 0) / this.piers.length;

    const geom = new BoxGeometry(deckLength, deckThick, deckWidth);
    const mat = new MeshStandardMaterial({ color: 0x778899, roughness: 0.82, metalness: 0.05 });
    this.deckMesh = new Mesh(geom, mat);
    this.deckMesh.position.set(centerX, deckY, centerZ);
    this.deckMesh.castShadow = true;
    this.deckInitialY = deckY;
    this.deckMat = mat;

    this.group.add(this.deckMesh);
    this.disposableGeoms.push(geom);
    this.disposableMats.push(mat);
  }

  // 현재 시각의 교각 주변 세굴 깊이(미터)를 반환한다. 0 이상.
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
    // 탐색 반경 = 교각 반지름 + 여유 1셀
    const searchRadius = state.diameter / 2 + cellSize * 2;
    const rCells = Math.ceil(searchRadius / cellSize) + 1;

    let maxErosion = 0;
    for (let gy = Math.max(0, cy - rCells); gy <= Math.min(height - 1, cy + rCells); gy++) {
      for (let gx = Math.max(0, cx - rCells); gx <= Math.min(width - 1, cx + rCells); gx++) {
        const dx = (gx - cx) * cellSize;
        const dz = (gy - cy) * cellSize;
        if (dx * dx + dz * dz > searchRadius * searchRadius) continue;
        const delta = frame.deltaElevations[gy * width + gx] ?? 0;
        // 음수 = 세굴, erosion depth = -delta (양수)
        const erosion = -delta;
        if (erosion > maxErosion) maxErosion = erosion;
      }
    }
    return maxErosion;
  }

  public updateAtTime(t: number): void {
    for (let i = 0; i < this.pierStates.length; i++) {
      const state = this.pierStates[i];
      if (!state) continue;
      const scour = this.sampleScourAtPier(t, i);
      const ratio = scour / this.criticalDepth;

      if (!state.collapsed) {
        // 세굴 비율에 따라 교각 색상을 경고 색으로 변경
        const color = ratio > 0.75 ? 0xff3333 : ratio > 0.45 ? 0xff8800 : 0x8899aa;
        state.shaftMat.color.setHex(color);

        if (ratio >= 1.0) {
          state.collapsed = true;
          state.collapseStartTime = t;
          for (const cb of this.collapseListeners) {
            cb({
              pierIndex: i,
              pierId: this.piers[i]?.id ?? String(i),
              timestampSeconds: t,
              scourDepth: scour,
            });
          }
        }
        continue;
      }

      // ── 붕괴 애니메이션
      const elapsed = t - state.collapseStartTime;

      if (elapsed < SHAKE_DURATION) {
        // 진동
        const shake = Math.sin(elapsed * 35) * 0.05 * (1 - elapsed / SHAKE_DURATION);
        state.group.rotation.z = shake;
        state.group.rotation.x = shake * 0.4;
        state.shaftMat.color.setHex(0xff2222);
        state.capMat.color.setHex(0xff4444);
      } else {
        // 기울어짐 + 침강
        const tiltT = Math.min(1, (elapsed - SHAKE_DURATION) / TILT_DURATION);
        // smoothstep easing
        const ease = tiltT * tiltT * (3 - 2 * tiltT);
        const dir = i % 2 === 0 ? 1 : -1;
        state.group.rotation.z = ease * (Math.PI / 2) * dir;
        state.group.rotation.x = ease * 0.15 * dir;
        const sink = ease * this.criticalDepth * 0.7;
        state.group.position.y = this.baseElevation - sink;
      }

      // 데크 낙하 — 첫 번째 교각이 흔들리기 시작하면 트리거
      if (!this.deckCollapseStarted && elapsed > SHAKE_DURATION * 0.6 && this.deckMesh) {
        this.deckCollapseStarted = true;
        this.deckCollapseStartTime = t;
      }

      if (this.deckCollapseStarted && this.deckMesh) {
        const dElapsed = t - this.deckCollapseStartTime;
        const dT = Math.min(1, dElapsed / (TILT_DURATION + 1.5));
        // 중력 가속 (quadratic ease-in)
        const dEase = dT * dT;
        const drop = dEase * (state.height + this.criticalDepth + 2);
        const tiltDir = i % 2 === 0 ? -1 : 1;
        this.deckMesh.position.y = this.deckInitialY - drop;
        this.deckMesh.rotation.z = dEase * (Math.PI / 5) * tiltDir;
        this.deckMesh.rotation.x = dEase * 0.18;
        if (this.deckMat) this.deckMat.color.setHex(0x445566);
      }
    }
  }

  // 현재 각 교각의 세굴 비율(0~1+) 목록 반환. UI 게이지용.
  public getScourRatios(t: number): { ratio: number; collapsed: boolean }[] {
    return this.pierStates.map((state, i) => ({
      ratio: state.collapsed ? 1.0 : this.sampleScourAtPier(t, i) / this.criticalDepth,
      collapsed: state.collapsed,
    }));
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
    this.scene.remove(this.group);
    for (const g of this.disposableGeoms) g.dispose();
    for (const m of this.disposableMats) m.dispose();
    this.group.clear();
  }
}
