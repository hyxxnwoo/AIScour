import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  type Scene,
} from 'three';
import type { Disposable } from '@/types/disposable';
import type { FluidSeries } from '@/types/fluid';
import type { ScourSeries } from '@/types/terrain';
import {
  fluidDomainXZExtents,
  isInsideFluidDomainXZ,
  sampleFluidVelocityAtWorld,
  sampleTerrainBedAtWorld,
} from '@/utils/fluidWorld';

export interface FluidTracersOptions {
  scene: Scene;
  fluidSeries: FluidSeries;
  scourSeries: ScourSeries;
  waterLevel: number;
  /** 입자 수. */
  particleCount?: number;
}

interface Tracer {
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
  stuck: number;
}

const DEFAULT_COUNT = 1400;
const ADVECTION_BOOST = 3.5;
const MIN_SPEED = 0.012;
const STUCK_RESPAWN = 0.6;
const MIN_DEPTH = 0.008;

export function fluidSeriesHasFlow(series: FluidSeries, threshold = MIN_SPEED): boolean {
  for (const frame of series.frames) {
    const n = frame.velocityX.length;
    for (let i = 0; i < n; i += 1) {
      const speed = Math.hypot(
        frame.velocityX[i]!,
        frame.velocityY[i]!,
        frame.velocityZ[i]!,
      );
      if (speed >= threshold) return true;
    }
  }
  return false;
}

/** FluidTracers: 유속장에 따라 이동하는 추적 입자(스트릭)로 유체 흐름을 표현한다. */
export class FluidTracers implements Disposable {
  private readonly scene: Scene;
  private readonly fluidSeries: FluidSeries;
  private readonly scourSeries: ScourSeries;
  private domain: ReturnType<typeof fluidDomainXZExtents>;
  private readonly tracers: Tracer[];
  private readonly mesh: LineSegments;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private waterLevel: number;
  private fluidFrameIndex = -1;
  private scourFrameIndex = -1;
  private lastTimeSeconds = -1;
  private userVisible = true;
  private forceHidden = false;
  private readonly hasFlow: boolean;

  public constructor(options: FluidTracersOptions) {
    this.scene = options.scene;
    this.fluidSeries = options.fluidSeries;
    this.scourSeries = options.scourSeries;
    this.waterLevel = options.waterLevel;
    this.domain = fluidDomainXZExtents(this.fluidSeries.grid);
    this.hasFlow = fluidSeriesHasFlow(this.fluidSeries);

    const count = options.particleCount ?? DEFAULT_COUNT;
    this.tracers = Array.from({ length: count }, () => this.createTracer());
    this.positions = new Float32Array(count * 2 * 3);
    this.colors = new Float32Array(count * 2 * 3);

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new BufferAttribute(this.colors, 3));

    const material = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });

    this.mesh = new LineSegments(geometry, material);
    this.mesh.renderOrder = 4;
    this.applyMeshVisibility();
    this.scene.add(this.mesh);

    if (this.fluidSeries.frames.length > 0) {
      this.fluidFrameIndex = 0;
      this.scourFrameIndex = 0;
      this.writeGeometry();
    }
  }

  /** CSV u·v·w=0 등 외부에서 유속 없음이 확정될 때 mesh 를 강제로 숨긴다. */
  public setForceHidden(hidden: boolean): void {
    this.forceHidden = hidden;
    this.applyMeshVisibility();
  }

  public setVisible(visible: boolean): void {
    this.userVisible = visible;
    this.applyMeshVisibility();
  }

  private applyMeshVisibility(): void {
    this.mesh.visible = this.userVisible && this.hasFlow && !this.forceHidden;
  }

  public get isVisible(): boolean {
    return this.userVisible;
  }

  public setWaterLevel(yMeters: number): void {
    if (Math.abs(yMeters - this.waterLevel) < 1e-9) return;
    this.waterLevel = yMeters;
    this.respawnAll();
  }

  public updateAtTime(timeSeconds: number): void {
    if (this.fluidSeries.frames.length === 0) return;

    if (this.lastTimeSeconds >= 0 && timeSeconds + 0.02 < this.lastTimeSeconds) {
      this.respawnAll();
    }
    this.lastTimeSeconds = timeSeconds;

    let fluidIdx = 0;
    for (let i = 0; i < this.fluidSeries.frames.length; i += 1) {
      if (this.fluidSeries.frames[i].timestampSeconds <= timeSeconds) fluidIdx = i;
      else break;
    }

    let scourIdx = 0;
    for (let i = 0; i < this.scourSeries.frames.length; i += 1) {
      if (this.scourSeries.frames[i].timestampSeconds <= timeSeconds) scourIdx = i;
      else break;
    }

    if (fluidIdx !== this.fluidFrameIndex || scourIdx !== this.scourFrameIndex) {
      this.fluidFrameIndex = fluidIdx;
      this.scourFrameIndex = scourIdx;
    }
  }

  public tick(deltaSeconds: number): void {
    if (this.forceHidden || !this.hasFlow || !this.userVisible || this.fluidFrameIndex < 0) return;

    const frame = this.fluidSeries.frames[this.fluidFrameIndex];
    const delta = this.currentScourDelta();
    if (!frame) return;

    const dt = Math.min(0.05, Math.max(0, deltaSeconds)) * ADVECTION_BOOST;
    const grid = this.fluidSeries.grid;
    const terrain = this.scourSeries.baseTerrain;

    for (let i = 0; i < this.tracers.length; i += 1) {
      const t = this.tracers[i]!;
      t.px = t.x;
      t.py = t.y;
      t.pz = t.z;

      const vel = sampleFluidVelocityAtWorld(grid, frame, t.x, t.y, t.z);
      if (!vel) {
        this.respawnTracer(t);
        continue;
      }

      const speed = Math.hypot(vel.vx, vel.vy, vel.vz);
      if (speed < MIN_SPEED) {
        t.stuck += deltaSeconds;
        if (t.stuck >= STUCK_RESPAWN) {
          this.respawnTracer(t);
        }
        continue;
      }
      t.stuck = 0;

      t.x += vel.vx * dt;
      t.y += vel.vy * dt;
      t.z += vel.vz * dt;

      const bed = sampleTerrainBedAtWorld(terrain, delta, t.x, t.z);
      const outOfWater =
        bed === null ||
        t.y > this.waterLevel + 0.01 ||
        t.y < bed + MIN_DEPTH ||
        this.waterLevel - t.y < MIN_DEPTH;
      const outOfDomain =
        !isInsideFluidDomainXZ(grid, t.x, t.z, 0.5) || t.x > this.domain.maxX - grid.cellSize * 0.4;

      if (outOfWater || outOfDomain) {
        this.respawnTracer(t);
      }
    }

    this.writeGeometry();
  }

  private currentScourDelta(): Float32Array | undefined {
    return this.scourSeries.frames[this.scourFrameIndex]?.deltaElevations;
  }

  private createTracer(): Tracer {
    const t: Tracer = { x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, stuck: 0 };
    this.respawnTracer(t);
    return t;
  }

  private respawnAll(): void {
    for (const t of this.tracers) {
      this.respawnTracer(t);
    }
    this.writeGeometry();
  }

  private respawnTracer(t: Tracer): void {
    const grid = this.fluidSeries.grid;
    const terrain = this.scourSeries.baseTerrain;
    const delta = this.currentScourDelta();
    const cs = grid.cellSize;

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const x =
        this.domain.minX +
        cs * 0.6 +
        Math.random() * Math.max(cs, this.domain.sizeX * 0.22);
      const z = this.domain.minZ + cs + Math.random() * Math.max(cs, this.domain.sizeZ - cs * 2);
      const bed = sampleTerrainBedAtWorld(terrain, delta, x, z);
      if (bed === null) continue;

      const depth = this.waterLevel - bed;
      if (depth < MIN_DEPTH * 2) continue;

      const y = bed + depth * (0.35 + Math.random() * 0.55);
      t.x = x;
      t.y = y;
      t.z = z;
      t.px = x;
      t.py = y;
      t.pz = z;
      t.stuck = 0;
      return;
    }

    t.x = this.domain.minX + cs;
    t.y = this.waterLevel - cs;
    t.z = 0;
    t.px = t.x;
    t.py = t.y;
    t.pz = t.z;
    t.stuck = 0;
  }

  private writeGeometry(): void {
    for (let i = 0; i < this.tracers.length; i += 1) {
      const t = this.tracers[i]!;
      const base = i * 6;
      this.positions[base] = t.px;
      this.positions[base + 1] = t.py;
      this.positions[base + 2] = t.pz;
      this.positions[base + 3] = t.x;
      this.positions[base + 4] = t.y;
      this.positions[base + 5] = t.z;

      const dx = t.x - t.px;
      const dy = t.y - t.py;
      const dz = t.z - t.pz;
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-5) {
        this.colors[base] = 0;
        this.colors[base + 1] = 0;
        this.colors[base + 2] = 0;
        this.colors[base + 3] = 0;
        this.colors[base + 4] = 0;
        this.colors[base + 5] = 0;
        continue;
      }
      const head = Math.min(1, len * 18);
      const tail = head * 0.35;

      this.colors[base] = tail * 0.55;
      this.colors[base + 1] = tail * 0.82;
      this.colors[base + 2] = tail;
      this.colors[base + 3] = head * 0.35;
      this.colors[base + 4] = head * 0.95;
      this.colors[base + 5] = head;
    }

    const posAttr = this.mesh.geometry.attributes['position'] as BufferAttribute;
    const colAttr = this.mesh.geometry.attributes['color'] as BufferAttribute;
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as LineBasicMaterial).dispose();
  }
}
