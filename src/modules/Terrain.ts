import {
  BufferAttribute,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  type Scene,
} from 'three';
import type { ScourFrame, ScourSeries, TerrainGrid } from '@/types/terrain';
import type { Disposable } from '@/types/disposable';
import { sampleColorRamp } from '@/utils/colorRamp';

// Terrain: 베이스 지형 + 시간에 따른 세굴 변화를 단일 Mesh 로 렌더링한다.
// PlaneGeometry 의 정점 z 와 vertex color 를 매 프레임 갱신하여 깊이/색을 함께 표현한다.
export class Terrain implements Disposable {
  private readonly scene: Scene;
  private readonly grid: TerrainGrid;
  private readonly frames: ScourFrame[];
  private readonly mesh: Mesh;
  private readonly geometry: PlaneGeometry;
  private readonly baseZ: Float32Array;
  private readonly colors: Float32Array;
  private readonly tmpColor = { r: 0, g: 0, b: 0 };
  private currentFrameIndex = -1;
  private currentAbsMax = 0;
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
      roughness: 0.85,
      metalness: 0.0,
      flatShading: false,
    });
    this.mesh = new Mesh(this.geometry, material);
    this.scene.add(this.mesh);

    // 첫 프레임을 미리 적용하여 초기 화면이 비어 보이지 않게 한다.
    this.applyFrame(0);
  }

  public get frameCount(): number {
    return this.frames.length;
  }

  // Picking 등 외부 모듈이 raycasting 대상으로 사용할 메쉬 목록.
  public get pickables(): Object3D[] {
    return [this.mesh];
  }

  // 격자 한 칸 길이(미터). UI 레이블 등에 활용.
  public get cellSize(): number {
    return this.grid.cellSize;
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
      elevation: baseElevation + deltaElevation,
    };
  }

  // 시뮬레이션 총 길이(초). 마지막 프레임의 timestamp.
  public get durationSeconds(): number {
    if (this.frames.length === 0) return 0;
    return this.frames[this.frames.length - 1].timestampSeconds;
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

    // 깊이 변화의 절댓값 최댓값을 컬러 정규화 기준으로 사용 (프레임마다 가시성 확보)
    let absMax = 0;
    for (let i = 0; i < delta.length; i += 1) {
      const a = Math.abs(delta[i]);
      if (a > absMax) absMax = a;
    }
    if (absMax === 0) absMax = 1;

    for (let i = 0; i < delta.length; i += 1) {
      const z = this.baseZ[i] + delta[i];
      positions.setY(i, z);
      sampleColorRamp(delta[i], -absMax, absMax, this.tmpColor);
      const j = i * 3;
      this.colors[j] = this.tmpColor.r;
      this.colors[j + 1] = this.tmpColor.g;
      this.colors[j + 2] = this.tmpColor.b;
    }
    positions.needsUpdate = true;
    (this.geometry.attributes['color'] as BufferAttribute).needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.currentAbsMax = absMax;
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
    this.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
  }
}
