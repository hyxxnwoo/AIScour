import {
  BufferAttribute,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  type Scene,
} from 'three';
import type { ScourFrame, ScourSeries, TerrainGrid } from '@/types/terrain';
import type { Disposable } from '@/types/disposable';
import { sampleTerrainSandColor } from '@/utils/colorRamp';
import { sampleCfdScourColor } from '@/utils/cfdScourColor';
import { BedIsolines } from '@/modules/BedIsolines';

/** basic: 모래색(기본 화면) · cfd: 세굴 적색/0 흰색/퇴적 청색 발산형 · plain: 색 없이 단색(컨투어 레이어 끔) */
export type TerrainColorMode = 'basic' | 'cfd' | 'plain';

// Terrain: 베이스 지형 + 시간에 따른 세굴 변화를 단일 Mesh 로 렌더링한다.
// 정점 높이는 Δ표고, vertex color 는 초기 지반 대비 세굴/퇴적 변화량(Δ) 컬러맵.
export class Terrain implements Disposable {
  private readonly scene: Scene;
  private readonly grid: TerrainGrid;
  private readonly frames: ScourFrame[];
  private readonly mesh: Mesh;
  private readonly material: MeshStandardMaterial;
  private readonly geometry: PlaneGeometry;
  private readonly baseZ: Float32Array;
  private readonly colors: Float32Array;
  private readonly tmpColor = { r: 0, g: 0, b: 0 };
  /** 세굴 Δ표고만 과장 (물리량·컬러맵 정규화는 원본 Δ 기준). */
  private verticalExaggeration = 1;
  private currentFrameIndex = -1;
  private currentAbsMax = 0;
  private colorMode: TerrainColorMode = 'basic';
  private wireMesh: Mesh | null = null;
  private wireOn = false;
  private isolines: BedIsolines | null = null;
  private isolinesOn = false;
  private isolineStep: number | null = null;
  private visible = true;
  private readonly frameListeners = new Set<(info: { index: number; absMax: number }) => void>();

  public constructor(scene: Scene, series: ScourSeries) {
    this.scene = scene;
    this.grid = series.baseTerrain;
    this.frames = series.frames;

    const { width, height, cellSize, elevations } = this.grid;
    // PlaneGeometry 는 X-Y 평면 정점을 가지며, 세그먼트 수 = (width-1) x (height-1) 으로 정점이 width*height 가 된다.
    this.geometry = new PlaneGeometry(
      (width - 1) * cellSize,
      (height - 1) * cellSize,
      width - 1,
      height - 1,
    );
    // 카메라가 위에서 내려다보는 형태가 되도록 X축 기준 -90도 회전 → z 가 위쪽으로 향한다.
    this.geometry.rotateX(-Math.PI / 2);

    // 초기 표고 적용 (Plane 회전 이후 정점의 y 가 위쪽 = 표고)
    const positions = this.geometry.attributes['position'] as BufferAttribute;
    this.baseZ = new Float32Array(elevations);
    for (let i = 0; i < elevations.length; i += 1) {
      positions.setY(i, elevations[i]);
    }
    positions.needsUpdate = true;

    // 정점 컬러 버퍼 초기화
    this.colors = new Float32Array(elevations.length * 3);
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));

    const material = new MeshStandardMaterial({
      vertexColors: true,
      side: DoubleSide,
      roughness: 0.94,
      metalness: 0.0,
      flatShading: false,
    });
    this.material = material;
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);

    // 첫 프레임을 미리 적용하여 초기 화면이 비어 보이지 않게 한다.
    this.applyFrame(0);
  }

  public get frameCount(): number {
    return this.frames.length;
  }

  /** 현재 적용된 프레임의 0 기반 인덱스. 아직 적용 전이면 -1. */
  public get frameIndex(): number {
    return this.currentFrameIndex;
  }

  // Picking 등 외부 모듈이 raycasting 대상으로 사용할 메쉬 목록.
  public get pickables(): Object3D[] {
    return [this.mesh];
  }

  // 격자 한 칸 길이(미터). UI 레이블 등에 활용.
  public get cellSize(): number {
    return this.grid.cellSize;
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.mesh.visible = visible;
    if (this.wireMesh) this.wireMesh.visible = visible && this.wireOn;
    this.isolines?.setVisible(visible && this.isolinesOn);
  }

  /** 하상 색 방식 전환. 기본 화면은 'basic' 이며 CFD 모드에서만 다른 값을 쓴다. */
  public setColorMode(mode: TerrainColorMode): void {
    if (mode === this.colorMode) return;
    this.colorMode = mode;
    this.material.roughness = mode === 'basic' ? 0.94 : 0.55;
    this.material.needsUpdate = true;
    if (this.currentFrameIndex >= 0) this.applyFrame(this.currentFrameIndex);
  }

  /** 해석 격자 와이어프레임(하상 메시와 같은 지오메트리를 공유). */
  public setWireframeVisible(on: boolean): void {
    this.wireOn = on;
    if (on && !this.wireMesh) {
      const mat = new MeshBasicMaterial({
        color: 0x1b2430,
        wireframe: true,
        transparent: true,
        opacity: 0.3,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      this.wireMesh = new Mesh(this.geometry, mat);
      this.wireMesh.renderOrder = 1;
      this.scene.add(this.wireMesh);
    }
    if (this.wireMesh) this.wireMesh.visible = this.visible && on;
  }

  /** 하상 등심선(세굴심 Δ 등치선). 켜는 순간과 이후 프레임이 바뀔 때만 다시 계산한다. */
  public setIsolinesVisible(on: boolean): void {
    if (on === this.isolinesOn && (!on || this.isolines)) return;
    this.isolinesOn = on;
    if (on) {
      if (!this.isolines) {
        this.isolines = new BedIsolines(this.scene);
        this.isolines.setStep(this.isolineStep);
      }
      if (this.currentFrameIndex >= 0) this.applyFrame(this.currentFrameIndex);
    }
    this.isolines?.setVisible(this.visible && on);
  }

  /** null 이면 자동 간격(absMax 기준, 상한 0.5 m). */
  public setIsolineStep(step: number | null): void {
    this.isolineStep = step;
    this.isolines?.setStep(step);
    if (this.isolinesOn && this.currentFrameIndex >= 0) this.applyFrame(this.currentFrameIndex);
  }

  // 월드 좌표(x, z) → 격자 셀 정보. 격자 밖이면 null.
  public queryAtWorld(
    worldX: number,
    worldZ: number,
  ): {
    gridX: number;
    gridY: number;
    baseElevation: number;
    deltaElevation: number;
    elevation: number;
  } | null {
    const halfW = ((this.grid.width - 1) * this.grid.cellSize) / 2;
    const halfH = ((this.grid.height - 1) * this.grid.cellSize) / 2;
    const fx = (worldX + halfW) / this.grid.cellSize;
    const fy = (worldZ + halfH) / this.grid.cellSize;
    const gx = Math.round(fx);
    const gy = Math.round(fy);
    if (gx < 0 || gy < 0 || gx >= this.grid.width || gy >= this.grid.height) {
      return null;
    }
    const idx = gy * this.grid.width + gx;
    const baseElevation = this.baseZ[idx];
    const frame = this.currentFrameIndex >= 0 ? this.frames[this.currentFrameIndex] : undefined;
    const deltaElevation = frame ? frame.deltaElevations[idx] : 0;
    return {
      gridX: gx,
      gridY: gy,
      baseElevation,
      deltaElevation,
      elevation: baseElevation + deltaElevation * this.verticalExaggeration,
    };
  }

  // 시뮬레이션 총 길이(초). 마지막 프레임의 timestamp.
  public get durationSeconds(): number {
    if (this.frames.length === 0) return 0;
    return this.frames[this.frames.length - 1].timestampSeconds;
  }

  /** 세굴 깊이(Δ) 만 스케일 — 메시 형상과 HUD 픽 정보에 동시 반영. */
  public setVerticalExaggeration(factor: number): void {
    const f = Math.min(20, Math.max(0.1, factor));
    if (Math.abs(f - this.verticalExaggeration) < 1e-9) return;
    this.verticalExaggeration = f;
    if (this.currentFrameIndex >= 0) {
      this.applyFrame(this.currentFrameIndex);
    }
  }

  public getVerticalExaggeration(): number {
    return this.verticalExaggeration;
  }

  // 절대 시간(초)을 받아 가장 가까운 프레임을 적용한다. 루프/일시정지 등은 외부 컨트롤러가 담당한다.
  public updateAtTime(timeSeconds: number): void {
    if (this.frames.length === 0) return;
    const clamped = Math.max(0, Math.min(timeSeconds, this.durationSeconds));
    // 단조 증가 가정으로 선형 탐색 (프레임 수 ~수백 수준이면 충분)
    let idx = 0;
    for (let i = 0; i < this.frames.length; i += 1) {
      if (this.frames[i].timestampSeconds <= clamped) {
        idx = i;
      } else {
        break;
      }
    }
    if (idx !== this.currentFrameIndex) {
      this.applyFrame(idx);
    }
  }

  private applyFrame(index: number): void {
    const frame = this.frames[index];
    if (!frame) return;
    this.currentFrameIndex = index;

    const positions = this.geometry.attributes['position'] as BufferAttribute;
    const delta = frame.deltaElevations;

    // Δ표고 절댓값 최댓값 — 컬러맵·범례 정규화 기준 (음수=세굴, 양수=퇴적)
    let absMax = 0;
    for (let i = 0; i < delta.length; i += 1) {
      const a = Math.abs(delta[i]);
      if (a > absMax) absMax = a;
    }
    if (absMax === 0) absMax = 1;

    for (let i = 0; i < delta.length; i += 1) {
      const z = this.baseZ[i] + delta[i] * this.verticalExaggeration;
      positions.setY(i, z);
      const gx = i % this.grid.width;
      const gy = (i / this.grid.width) | 0;
      if (this.colorMode === 'basic') {
        sampleTerrainSandColor(delta[i], absMax, gx, gy, this.tmpColor);
      } else if (this.colorMode === 'cfd') {
        sampleCfdScourColor(delta[i], absMax, this.tmpColor);
      } else {
        this.tmpColor.r = 0.66;
        this.tmpColor.g = 0.66;
        this.tmpColor.b = 0.64;
      }
      const j = i * 3;
      this.colors[j] = this.tmpColor.r;
      this.colors[j + 1] = this.tmpColor.g;
      this.colors[j + 2] = this.tmpColor.b;
    }
    positions.needsUpdate = true;
    (this.geometry.attributes['color'] as BufferAttribute).needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.currentAbsMax = absMax;
    if (this.isolinesOn && this.isolines) {
      this.isolines.update({
        delta,
        width: this.grid.width,
        height: this.grid.height,
        cellSize: this.grid.cellSize,
        positionsY: (idx) => positions.getY(idx),
        absMax,
      });
    }
    for (const cb of this.frameListeners) cb({ index, absMax });
  }

  // 프레임 적용 시점에 호출되는 리스너 등록. 컬러 범례 등이 absMax 를 추적하는 용도.
  public onFrameApplied(listener: (info: { index: number; absMax: number }) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  public get absMax(): number {
    return this.currentAbsMax;
  }

  public dispose(): void {
    this.frameListeners.clear();
    this.scene.remove(this.mesh);
    if (this.wireMesh) {
      this.scene.remove(this.wireMesh);
      (this.wireMesh.material as MeshBasicMaterial).dispose();
    }
    this.isolines?.dispose();
    this.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
  }
}
