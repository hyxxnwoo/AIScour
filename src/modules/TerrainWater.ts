import {
  BufferAttribute,
  BoxGeometry,
  ClampToEdgeWrapping,
  DataTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  type Scene,
  UnsignedByteType,
  Vector2,
  Vector3,
} from 'three';
import { LIGHT_DEFAULTS } from '@/constants/scene';
import type { Disposable } from '@/types/disposable';
import type { FluidFrame, FluidGrid3D, FluidQuantity, FluidSeries } from '@/types/fluid';
import { sampleFluidQuantity } from '@/types/fluid';
import type { ScourFrame, ScourSeries } from '@/types/terrain';
import {
  fluidGridOrigin,
  fluidYiAtWorldY,
  representativeBedElevation,
  terrainDomainRenderSizeXZ,
  terrainDomainXZExtents,
  worldXZToTerrainGrid,
} from '@/utils/fluidWorld';
import {
  colorForFluidQuantity,
  normalizeFluidQuantityRange,
} from '@/utils/fluidQuantityColor';

export interface TerrainWaterOptions {
  scene: Scene;
  scourSeries: ScourSeries;
  fluidSeries: FluidSeries;
  waterLevel: number;
  initialQuantity?: FluidQuantity;
}

const MAX_MESH_SEGMENTS = 96;
const MAX_TEX_SIZE = 96;

const WATER_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uWaveAmp;
  attribute float aWet;
  varying vec2 vUv;
  varying float vWet;
  varying float vWorldX;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  // +X(하류) 방향으로 이동하는 잔물결 — 실험 수조 규모(~1m)에 맞춰 파장을 짧게 잡아야
  // 여러 개의 물결 마루가 보인다(파장이 도메인보다 크면 완만한 굴곡 하나로만 보임).
  float waveHeight(vec2 xz, float t) {
    float downstream = xz.x - t * 0.4;
    float w1 = sin(downstream * 13.0 + xz.y * 9.0) * 0.45;
    float w2 = sin(downstream * 19.0 - xz.y * 7.0 + t * 1.3) * 0.32;
    float w3 = sin(downstream * 27.0 + xz.y * 15.0) * cos(downstream * 8.0 + t * 0.6) * 0.23;
    return w1 + w2 + w3;
  }

  void main() {
    vUv = uv;
    vWet = aWet;
    vec3 pos = position;
    vec3 normal = vec3(0.0, 1.0, 0.0);
    if (aWet > 0.5) {
      float h = waveHeight(vec2(pos.x, pos.z), uTime);
      pos.y += h * uWaveAmp;

      // 유한차분으로 파형 기울기를 구해 근사 법선을 만든다(윤슬·스페큘러 반사에 사용).
      // eps 는 파장(가장 짧은 항 기준 2π/27 ≈ 0.23m)보다 훨씬 작아야 기울기가 상쇄되지 않는다.
      float eps = 0.02;
      float hx = waveHeight(vec2(pos.x + eps, pos.z), uTime);
      float hz = waveHeight(vec2(pos.x, pos.z + eps), uTime);
      float dHdx = (hx - h) / eps * uWaveAmp;
      float dHdz = (hz - h) / eps * uWaveAmp;
      normal = normalize(vec3(-dHdx, 1.0, -dHdz));
    }
    vWorldX = (modelMatrix * vec4(pos, 1.0)).x;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const WATER_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uTime;
  uniform vec3 uCameraPos;
  uniform vec3 uLightDir;
  uniform vec2 uFlowDir;
  uniform float uFlowSpeed;
  uniform float uHasFlow;
  varying vec2 vUv;
  varying float vWet;
  varying float vWorldX;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    if (vWet < 0.5) discard;
    vec4 c = texture2D(uMap, vUv);
    if (c.a < 0.08) discard;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(uCameraPos - vWorldPos);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);

    float ndotl = max(dot(N, L), 0.0);
    float spec = pow(max(dot(N, H), 0.0), 60.0);
    float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);

    // 윤슬: 잔물결 표면 위 촘촘한 반짝임(시간에 따라 흐름 방향으로 흘러가며 깜빡임)
    vec2 sparkleUv = vUv * 220.0 + vec2(uTime * 0.6, uTime * 0.35);
    float sparkleNoise = hash(floor(sparkleUv));
    float sparkle = step(0.975, sparkleNoise) * spec * 4.0;

    // 실측 u/v 유속 방향·크기를 따라 흘러가는 줄무늬 — "물이 흐른다"는 인상과
    // 현재 값의 크기를 동시에 전달한다(유속이 0이면 줄무늬도 멈춘다).
    float along = dot(vWorldPos.xz, uFlowDir);
    float streakPhase = along * 22.0 - uTime * (0.8 + uFlowSpeed * 3.0);
    float streak = pow(max(sin(streakPhase), 0.0), 4.0);
    float streakStrength = uHasFlow * clamp(uFlowSpeed * 3.0, 0.05, 1.0) * 0.28;

    vec3 shaded = c.rgb * (0.62 + 0.38 * ndotl);
    shaded += vec3(1.0) * (spec * 0.6 + sparkle) * (0.35 + 0.65 * ndotl);
    shaded += vec3(0.85, 0.95, 1.0) * fresnel * 0.3;
    shaded += vec3(0.92, 0.98, 1.0) * streak * streakStrength;

    gl_FragColor = vec4(shaded, c.a * uOpacity);
  }
`;

function sampleTerrainBed(
  baseZ: Float32Array,
  delta: Float32Array | undefined,
  width: number,
  height: number,
  gx: number,
  gy: number,
  exaggeration: number,
): number {
  const ix = Math.max(0, Math.min(width - 1, Math.round(gx)));
  const iy = Math.max(0, Math.min(height - 1, Math.round(gy)));
  const idx = iy * width + ix;
  const d = delta ? delta[idx] : 0;
  return baseZ[idx] + d * exaggeration;
}

function meshSegments(domainCells: number): number {
  return Math.max(4, Math.min(domainCells, MAX_MESH_SEGMENTS));
}

function texSize(domainCells: number): number {
  return Math.max(8, Math.min(domainCells + 1, MAX_TEX_SIZE));
}

function minWaterDepth(cellSize: number, nominalDepthM: number): number {
  // 셀 크기·설정 수심 중 작은 쪽을 기준으로 최소 표시 수심을 잡는다.
  return Math.max(0.005, Math.min(cellSize * 0.75, nominalDepthM * 0.5));
}

/** 지형 하상 위 수면 — 고정 수심 기준으로 지형 전체에 표시, 색상만 CSV 유체 필드 사용. */
export class TerrainWater implements Disposable {
  private readonly scene: Scene;
  private readonly terrainGrid: ScourSeries['baseTerrain'];
  private readonly fluidGrid: FluidGrid3D;
  private readonly fluidFrames: FluidFrame[];
  private readonly scourFrames: ScourFrame[];
  private readonly baseZ: Float32Array;
  /** 초기 하상 표고 — 물 체적 바닥 기준(세굴로 내려가도 물이 깊어지지 않음). */
  private readonly referenceBedY: number;
  private readonly domain: ReturnType<typeof terrainDomainXZExtents>;
  private readonly minDepth: number;
  private readonly meshSegW: number;
  private readonly meshSegH: number;
  private readonly texW: number;
  private readonly texH: number;
  private readonly surfaceMesh: Mesh;
  private readonly surfaceGeometry: PlaneGeometry;
  private readonly surfaceMaterial: ShaderMaterial;
  /** 하상 표고부터 수면까지 채우는 반투명 물체(공간 채움). */
  private readonly fillMesh: Mesh;
  private readonly fillGeometry: BoxGeometry;
  private readonly fillMaterial: MeshStandardMaterial;
  private readonly texture: DataTexture;
  private readonly pixels: Uint8Array;
  private readonly wetAttr: Float32Array;
  private readonly waveAmp: number;
  private readonly tmpColor = { r: 0, g: 0, b: 0 };
  private currentFrameIndex = -1;
  private currentFluidFrameIndex = -1;
  private currentQuantity: FluidQuantity;
  private waterLevel: number;
  private verticalExaggeration = 1;
  private userVisible = true;
  private wetCount = 0;
  private currentRange: { min: number; max: number } = { min: 0, max: 1 };
  /** CSV 프로브 실측값(단일 시점 스칼라)으로 수면 전체를 균일하게 칠할 때 사용. null 이면 격자 샘플링. */
  private probeValue: number | null = null;
  private probeRange: { min: number; max: number } = { min: 0, max: 1 };
  /** 고정 색 범위. null 이면 프레임마다 자동 측정. */
  private fixedRange: { min: number; max: number } | null = null;

  public constructor(options: TerrainWaterOptions) {
    this.scene = options.scene;
    this.terrainGrid = options.scourSeries.baseTerrain;
    this.scourFrames = options.scourSeries.frames;
    this.fluidGrid = options.fluidSeries.grid;
    this.fluidFrames = options.fluidSeries.frames;
    this.baseZ = this.terrainGrid.elevations;
    this.referenceBedY = representativeBedElevation(this.terrainGrid);
    this.waterLevel = options.waterLevel;
    this.currentQuantity = options.initialQuantity ?? 'speed';

    const cs = this.terrainGrid.cellSize;
    this.domain = terrainDomainXZExtents(this.terrainGrid);
    const renderSize = terrainDomainRenderSizeXZ(this.terrainGrid);
    const nominalDepth = Math.max(0.001, this.waterLevel - this.referenceBedY);
    this.minDepth = minWaterDepth(cs, nominalDepth);
    this.meshSegW = meshSegments(Math.max(1, this.terrainGrid.width - 1));
    this.meshSegH = meshSegments(Math.max(1, this.terrainGrid.height - 1));
    this.texW = texSize(this.terrainGrid.width - 1);
    this.texH = texSize(this.terrainGrid.height - 1);
    // 실험실 규모(셀 1cm 안팎)에서는 물리적 파고가 그대로면 안 보이므로 시각 효과 목적으로 과장한다.
    this.waveAmp = Math.max(0.01, cs * 1.8);

    this.pixels = new Uint8Array(this.texW * this.texH * 4);
    this.texture = new DataTexture(this.pixels, this.texW, this.texH, RGBAFormat, UnsignedByteType);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.wrapS = ClampToEdgeWrapping;
    this.texture.wrapT = ClampToEdgeWrapping;

    this.surfaceGeometry = new PlaneGeometry(
      renderSize.sizeX,
      renderSize.sizeZ,
      this.meshSegW,
      this.meshSegH,
    );
    this.surfaceGeometry.rotateX(-Math.PI / 2);

    const vertCount = (this.meshSegW + 1) * (this.meshSegH + 1);
    this.wetAttr = new Float32Array(vertCount);
    this.surfaceGeometry.setAttribute('aWet', new BufferAttribute(this.wetAttr, 1));

    const lightDir = new Vector3(
      LIGHT_DEFAULTS.directionalPosition.x,
      LIGHT_DEFAULTS.directionalPosition.y,
      LIGHT_DEFAULTS.directionalPosition.z,
    ).normalize();

    this.surfaceMaterial = new ShaderMaterial({
      uniforms: {
        uMap: { value: this.texture },
        uTime: { value: 0 },
        uWaveAmp: { value: this.waveAmp },
        uOpacity: { value: 0.88 },
        uCameraPos: { value: new Vector3() },
        uLightDir: { value: lightDir },
        uFlowDir: { value: new Vector2(1, 0) },
        uFlowSpeed: { value: 0 },
        uHasFlow: { value: 0 },
      },
      vertexShader: WATER_VERTEX_SHADER,
      fragmentShader: WATER_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });

    this.surfaceMesh = new Mesh(this.surfaceGeometry, this.surfaceMaterial);
    this.surfaceMesh.position.set(this.domain.centerX, 0, this.domain.centerZ);
    this.surfaceMesh.renderOrder = 3;
    this.scene.add(this.surfaceMesh);

    // 바닥(하상)부터 수면까지 물이 채워진 것처럼 보이도록 반투명 체적 메쉬.
    this.fillGeometry = new BoxGeometry(renderSize.sizeX, 1, renderSize.sizeZ);
    this.fillMaterial = new MeshStandardMaterial({
      color: 0x1d6fa8,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      roughness: 0.35,
      metalness: 0.05,
    });
    this.fillMesh = new Mesh(this.fillGeometry, this.fillMaterial);
    this.fillMesh.renderOrder = 2;
    this.scene.add(this.fillMesh);

    if (this.scourFrames.length > 0) {
      this.applyScourFrame(0);
    }
    if (this.fluidFrames.length > 0) {
      this.applyFluidFrame(0);
    }
  }

  public setVisible(visible: boolean): void {
    this.userVisible = visible;
    const show = visible && this.wetCount > 0;
    this.surfaceMesh.visible = show;
    this.fillMesh.visible = show;
  }

  public setOpacity(opacity: number): void {
    const o = Math.min(1, Math.max(0.05, opacity));
    this.surfaceMaterial.uniforms['uOpacity']!.value = o;
    this.surfaceMaterial.transparent = o < 1 - 1e-6;
    this.surfaceMaterial.needsUpdate = true;
    this.fillMaterial.opacity = Math.min(0.92, 0.35 + o * 0.6);
    this.fillMaterial.needsUpdate = true;
  }

  public setWaterLevel(yMeters: number): void {
    if (Math.abs(yMeters - this.waterLevel) < 1e-9) return;
    this.waterLevel = yMeters;
    if (this.currentFrameIndex >= 0) {
      this.rebuildSurface(this.currentFrameIndex);
    }
    if (this.currentFluidFrameIndex >= 0) {
      this.applyFluidFrame(this.currentFluidFrameIndex);
    }
  }

  public setQuantity(q: FluidQuantity): void {
    if (q === this.currentQuantity) return;
    this.currentQuantity = q;
    this.probeValue = null;
    if (this.currentFluidFrameIndex >= 0) {
      this.applyFluidFrame(this.currentFluidFrameIndex);
    }
  }

  /**
   * CSV 프로브 실측값(u/v/w/scrdif 중 현재 선택 항목)으로 수면 색을 갱신한다.
   * 프로브는 공간상 단일 지점 값이므로, 젖은 영역 전체를 이 값의 단일 색으로 균일하게 칠한다
   * (합성 격자 대신 실측 데이터를 그대로 반영 — 물리적으로 정직한 표현).
   * range 는 재생 구간 전체의 min/max(시간에 따라 안정적)를 넘겨야 한다.
   */
  public setProbeQuantity(
    q: FluidQuantity,
    value: number,
    range: { min: number; max: number },
  ): void {
    this.currentQuantity = q;
    this.probeValue = value;
    this.probeRange = range;
    this.currentRange = range;
    if (this.currentFluidFrameIndex < 0 && this.fluidFrames.length > 0) {
      this.currentFluidFrameIndex = 0;
    }
    this.recolorSurface();
  }

  /**
   * 색 범위를 재생 구간 전체 기준으로 고정한다. 프레임마다 다시 측정하면
   * 같은 색이 시각마다 다른 값을 뜻하게 되므로, CSV 실측 필드처럼 전체 범위를
   * 미리 알 수 있는 경우에는 고정하는 편이 읽기 정확하다. null 이면 자동 측정.
   */
  public setColorRange(range: { min: number; max: number } | null): void {
    this.fixedRange = range;
    if (this.currentFluidFrameIndex >= 0) {
      this.applyFluidFrame(this.currentFluidFrameIndex);
    }
  }

  /** 프로브 연동을 해제하고 합성 격자 기반 색으로 복귀한다. */
  public clearProbeQuantity(): void {
    if (this.probeValue === null) return;
    this.probeValue = null;
    if (this.currentFluidFrameIndex >= 0) {
      this.applyFluidFrame(this.currentFluidFrameIndex);
    }
  }

  public setVerticalExaggeration(factor: number): void {
    const f = Math.min(20, Math.max(0.1, factor));
    if (Math.abs(f - this.verticalExaggeration) < 1e-9) return;
    this.verticalExaggeration = f;
    if (this.currentFrameIndex >= 0) {
      this.rebuildSurface(this.currentFrameIndex);
    }
  }

  public get currentRangeForLegend(): { min: number; max: number } {
    return this.currentRange;
  }

  public get currentQuantityName(): FluidQuantity {
    return this.currentQuantity;
  }

  public computeRangeForQuantity(q: FluidQuantity): { min: number; max: number } {
    if (this.probeValue !== null && q === this.currentQuantity && q !== 'scrdif') {
      return this.probeRange;
    }
    if (this.fixedRange && q === this.currentQuantity) return this.fixedRange;
    if (this.currentFluidFrameIndex < 0) return { min: 0, max: 1 };
    const frame = this.fluidFrames[this.currentFluidFrameIndex];
    if (!frame) return { min: 0, max: 1 };
    return this.measureQuantityRange(frame, q);
  }

  public tickRipple(elapsedSeconds: number): void {
    if (!this.surfaceMesh.visible) return;
    this.surfaceMaterial.uniforms['uTime']!.value = elapsedSeconds;
  }

  /** 카메라 위치를 매 프레임 전달해 스페큘러 하이라이트(윤슬)가 시점에 반응하게 한다. */
  public setCameraPosition(position: Vector3): void {
    (this.surfaceMaterial.uniforms['uCameraPos']!.value as Vector3).copy(position);
  }

  /**
   * 실측(또는 합성) u·v 유속으로 수면 위 흐름 줄무늬 방향·속도를 갱신한다.
   * FLOW-3D 좌표 u→월드 X, v→월드 Z (probeVelocityToWorld 와 동일한 매핑).
   * 유속이 0이면 줄무늬도 멈춰서 "흐름 없음"이 시각적으로도 정직하게 드러난다.
   */
  public setFlowVector(u: number, v: number): void {
    const speed = Math.hypot(u, v);
    this.surfaceMaterial.uniforms['uFlowSpeed']!.value = speed;
    this.surfaceMaterial.uniforms['uHasFlow']!.value = speed > 1e-4 ? 1 : 0;
    if (speed > 1e-4) {
      (this.surfaceMaterial.uniforms['uFlowDir']!.value as Vector2).set(u / speed, v / speed);
    }
  }

  public updateAtTime(timeSeconds: number): void {
    if (this.scourFrames.length > 0) {
      let idx = 0;
      for (let i = 0; i < this.scourFrames.length; i += 1) {
        if (this.scourFrames[i].timestampSeconds <= timeSeconds) idx = i;
        else break;
      }
      if (idx !== this.currentFrameIndex) {
        this.applyScourFrame(idx);
      }
    }

    if (this.fluidFrames.length > 0) {
      let fIdx = 0;
      for (let i = 0; i < this.fluidFrames.length; i += 1) {
        if (this.fluidFrames[i].timestampSeconds <= timeSeconds) fIdx = i;
        else break;
      }
      if (fIdx !== this.currentFluidFrameIndex) {
        this.applyFluidFrame(fIdx);
      }
    }
  }

  private vertexWorldXZ(vi: number): { x: number; z: number } {
    const posAttr = this.surfaceGeometry.attributes['position'] as BufferAttribute;
    const arr = posAttr.array as Float32Array;
    return {
      x: arr[vi * 3] + this.domain.centerX,
      z: arr[vi * 3 + 2] + this.domain.centerZ,
    };
  }

  private isWetAt(
    worldX: number,
    worldZ: number,
    delta: Float32Array | undefined,
  ): { wet: boolean; bed: number; depth: number } {
    const { width, height } = this.terrainGrid;

    const { gx, gy } = worldXZToTerrainGrid(worldX, worldZ, this.terrainGrid);
    if (gx < 0 || gy < 0 || gx > width - 1 || gy > height - 1) {
      return { wet: false, bed: 0, depth: 0 };
    }

    const bed = sampleTerrainBed(this.baseZ, delta, width, height, gx, gy, this.verticalExaggeration);
    const depth = this.waterLevel - bed;
    if (depth < this.minDepth) {
      return { wet: false, bed, depth };
    }

    return { wet: true, bed, depth };
  }

  /** 월드 XZ → 유체 격자 인덱스. 격자 밖이면 inside=false. */
  private fluidCellAtWorld(
    worldX: number,
    worldZ: number,
  ): { xi: number; zi: number; inside: boolean } {
    const o = fluidGridOrigin(this.fluidGrid);
    const cs = this.fluidGrid.cellSize;
    const xi = Math.round((worldX - o.x) / cs);
    const zi = Math.round((worldZ - o.z) / cs);
    const inside =
      xi >= 0 &&
      zi >= 0 &&
      xi < this.fluidGrid.width &&
      zi < this.fluidGrid.depth;
    return {
      xi: Math.max(0, Math.min(this.fluidGrid.width - 1, xi)),
      zi: Math.max(0, Math.min(this.fluidGrid.depth - 1, zi)),
      inside,
    };
  }

  private applyScourFrame(index: number): void {
    this.currentFrameIndex = index;
    this.rebuildSurface(index);
  }

  private rebuildSurface(scourFrameIndex: number): void {
    const frame = this.scourFrames[scourFrameIndex];
    if (!frame) return;

    const delta = frame.deltaElevations;
    const posAttr = this.surfaceGeometry.attributes['position'] as BufferAttribute;
    const arr = posAttr.array as Float32Array;

    let wet = 0;
    for (let vi = 0; vi < posAttr.count; vi += 1) {
      const { x, z } = this.vertexWorldXZ(vi);
      const sample = this.isWetAt(x, z, delta);
      this.wetAttr[vi] = sample.wet ? 1 : 0;
      if (sample.wet) wet += 1;
      // 수면은 고정 높이, 육지/건조 구간만 하상 표고를 따른다.
      arr[vi * 3 + 1] = sample.wet ? this.waterLevel : sample.bed;
    }

    this.wetCount = wet;
    posAttr.needsUpdate = true;
    (this.surfaceGeometry.attributes['aWet'] as BufferAttribute).needsUpdate = true;
    const show = this.userVisible && wet > 0;
    this.surfaceMesh.visible = show;
    this.fillMesh.visible = show;
    if (show) {
      // 물 체적 바닥 = 초기 하상(고정). 세굴로 하상이 내려가도 물 블록이 같이 내려가지 않는다.
      const fillBottom = this.referenceBedY;
      const fillHeight = Math.max(0.001, this.waterLevel - fillBottom);
      this.fillMesh.scale.y = fillHeight;
      this.fillMesh.position.set(
        this.domain.centerX,
        fillBottom + fillHeight / 2,
        this.domain.centerZ,
      );
    }
  }

  private applyFluidFrame(index: number): void {
    const frame = this.fluidFrames[index];
    if (!frame) return;
    this.currentFluidFrameIndex = index;
    this.recolorSurface();
  }

  /** 현재 프레임/양/프로브 상태에 맞춰 수면 텍스처를 다시 칠한다. */
  private recolorSurface(): void {
    const frame = this.fluidFrames[this.currentFluidFrameIndex];
    if (!frame) return;

    // 프로브 실측값이 있고(scrdif 제외) 현재 선택 양이면, 공간 전체를 단일 색으로 균일하게 칠한다.
    const useProbeColor = this.probeValue !== null && this.currentQuantity !== 'scrdif';
    const range = useProbeColor
      ? this.probeRange
      : (this.fixedRange ?? this.measureQuantityRange(frame, this.currentQuantity));
    this.currentRange = range;
    const { min: vMin, max: vMax } = range;

    if (useProbeColor) {
      colorForFluidQuantity(this.currentQuantity, this.probeValue!, vMin, vMax, this.tmpColor);
    }

    const yi = fluidYiAtWorldY(this.fluidGrid, this.waterLevel);
    const frameDelta =
      this.currentFrameIndex >= 0 ? this.scourFrames[this.currentFrameIndex]?.deltaElevations : undefined;

    for (let ty = 0; ty < this.texH; ty += 1) {
      const tz = ty / Math.max(1, this.texH - 1);
      const worldZ = this.domain.minZ + tz * this.domain.sizeZ;
      for (let tx = 0; tx < this.texW; tx += 1) {
        const txx = tx / Math.max(1, this.texW - 1);
        const worldX = this.domain.minX + txx * this.domain.sizeX;
        const px = (ty * this.texW + tx) * 4;
        const sample = this.isWetAt(worldX, worldZ, frameDelta);
        if (!sample.wet) {
          this.pixels[px] = 0;
          this.pixels[px + 1] = 0;
          this.pixels[px + 2] = 0;
          this.pixels[px + 3] = 0;
          continue;
        }

        if (!useProbeColor) {
          const { xi, zi, inside } = this.fluidCellAtWorld(worldX, worldZ);
          const v = inside
            ? sampleFluidQuantity(this.fluidGrid, frame, this.currentQuantity, xi, yi, zi)
            : 0;
          colorForFluidQuantity(this.currentQuantity, v, vMin, vMax, this.tmpColor);
        }
        this.pixels[px] = Math.round(this.tmpColor.r * 255);
        this.pixels[px + 1] = Math.round(this.tmpColor.g * 255);
        this.pixels[px + 2] = Math.round(this.tmpColor.b * 255);
        const shore = Math.min(1, (sample.depth - this.minDepth) / Math.max(0.02, this.minDepth * 6));
        this.pixels[px + 3] = Math.round(250 + shore * 5);
      }
    }
    this.texture.needsUpdate = true;

    if (this.currentFrameIndex >= 0) {
      this.rebuildSurface(this.currentFrameIndex);
    }
  }

  private measureQuantityRange(
    frame: FluidFrame,
    quantity: FluidQuantity,
  ): { min: number; max: number } {
    const yi = fluidYiAtWorldY(this.fluidGrid, this.waterLevel);
    const frameDelta =
      this.currentFrameIndex >= 0 ? this.scourFrames[this.currentFrameIndex]?.deltaElevations : undefined;

    let vMin = Infinity;
    let vMax = -Infinity;

    for (let ty = 0; ty < this.texH; ty += 1) {
      const tz = ty / Math.max(1, this.texH - 1);
      const worldZ = this.domain.minZ + tz * this.domain.sizeZ;
      for (let tx = 0; tx < this.texW; tx += 1) {
        const txx = tx / Math.max(1, this.texW - 1);
        const worldX = this.domain.minX + txx * this.domain.sizeX;
        const sample = this.isWetAt(worldX, worldZ, frameDelta);
        if (!sample.wet) continue;

        const { xi, zi, inside } = this.fluidCellAtWorld(worldX, worldZ);
        const v = inside
          ? sampleFluidQuantity(this.fluidGrid, frame, quantity, xi, yi, zi)
          : 0;
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
    }

    if (!isFinite(vMin) || !isFinite(vMax) || vMin === vMax) {
      return { min: 0, max: 1 };
    }
    return normalizeFluidQuantityRange(quantity, vMin, vMax);
  }

  public dispose(): void {
    this.scene.remove(this.surfaceMesh);
    this.scene.remove(this.fillMesh);
    this.surfaceGeometry.dispose();
    this.fillGeometry.dispose();
    this.surfaceMaterial.dispose();
    this.fillMaterial.dispose();
    this.texture.dispose();
  }
}
