import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  LineBasicMaterial,
  LineSegments,
  type Scene,
  Sprite,
  SpriteMaterial,
} from 'three';
import type { Disposable } from '@/types/disposable';
import { computeIsolines, niceIsolineStep } from '@/utils/isolines';

const LIFT_CELLS = 0.15; // z-fighting 방지용 띄움(셀 크기 배수)
const LABEL_WIDTH_CELLS = 16;

interface SegBuffer {
  mesh: LineSegments;
  capacity: number; // 선분 수
  count: number;
}

export interface BedIsolineInput {
  /** 등치선을 구할 Δ표고(m), 격자 인덱스 y*width+x */
  delta: ArrayLike<number>;
  width: number;
  height: number;
  cellSize: number;
  /** 하상 메시의 정점 y(표고) — 선을 표면 위에 얹는 데 쓴다 */
  positionsY: (index: number) => number;
  absMax: number;
}

/**
 * CFD 모드 하상 등심선(세굴심 Δ 등치선). 프레임이 바뀔 때만 update() 로 다시 계산한다.
 * 간격은 자동(absMax 의 약 1/4, 상한 0.5 m)이며 setStep 으로 고정할 수 있다. 짝수 번째 선(주요선)에만 라벨을 단다.
 */
export class BedIsolines implements Disposable {
  private readonly scene: Scene;
  private readonly group = new Group();
  private readonly minor: SegBuffer;
  private readonly major: SegBuffer;
  private readonly minorMat = new LineBasicMaterial({
    color: 0x2b2f36,
    transparent: true,
    opacity: 0.45,
  });
  private readonly majorMat = new LineBasicMaterial({ color: 0x111418 });
  private readonly sprites: Sprite[] = [];
  private readonly textures = new Map<string, CanvasTexture | null>();
  private fixedStep: number | null = null;
  private lastStep = 0;

  public constructor(scene: Scene) {
    this.scene = scene;
    this.minor = this.createBuffer(this.minorMat, 4096);
    this.major = this.createBuffer(this.majorMat, 4096);
    this.group.add(this.minor.mesh, this.major.mesh);
    this.group.renderOrder = 2;
    this.scene.add(this.group);
  }

  /** null 이면 자동 간격. */
  public setStep(step: number | null): void {
    this.fixedStep = step !== null && step > 0 ? step : null;
  }

  public get currentStep(): number {
    return this.lastStep;
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public update(input: BedIsolineInput): void {
    const { delta, width, height, cellSize, positionsY, absMax } = input;
    const step = this.fixedStep ?? niceIsolineStep(absMax);
    this.lastStep = step;
    const halfW = ((width - 1) * cellSize) / 2;
    const halfH = ((height - 1) * cellSize) / 2;
    const lift = cellSize * LIFT_CELLS;

    const surfaceY = (gx: number, gy: number): number => {
      const x0 = Math.min(width - 2, Math.max(0, Math.floor(gx)));
      const y0 = Math.min(height - 2, Math.max(0, Math.floor(gy)));
      const fx = gx - x0;
      const fy = gy - y0;
      const i = y0 * width + x0;
      const a = positionsY(i) * (1 - fx) + positionsY(i + 1) * fx;
      const b = positionsY(i + width) * (1 - fx) + positionsY(i + width + 1) * fx;
      return a * (1 - fy) + b * fy + lift;
    };

    const minorPts: number[] = [];
    const majorPts: number[] = [];
    const labelAt = new Map<number, [number, number, number]>();
    computeIsolines(delta, width, height, step, (k, ax, ay, bx, by) => {
      const isMajor = k % 2 === 0;
      const pts = isMajor ? majorPts : minorPts;
      const p1x = ax * cellSize - halfW;
      const p1z = ay * cellSize - halfH;
      const p2x = bx * cellSize - halfW;
      const p2z = by * cellSize - halfH;
      pts.push(p1x, surfaceY(ax, ay), p1z, p2x, surfaceY(bx, by), p2z);
      if (isMajor && !labelAt.has(k)) {
        labelAt.set(k, [
          (p1x + p2x) / 2,
          (surfaceY(ax, ay) + surfaceY(bx, by)) / 2,
          (p1z + p2z) / 2,
        ]);
      }
    });

    this.fill(this.minor, this.minorMat, minorPts);
    this.fill(this.major, this.majorMat, majorPts);
    this.updateLabels(labelAt, step, cellSize);
  }

  private createBuffer(material: LineBasicMaterial, capacity: number): SegBuffer {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(capacity * 6), 3));
    geometry.setDrawRange(0, 0);
    const mesh = new LineSegments(geometry, material);
    mesh.frustumCulled = false;
    return { mesh, capacity, count: 0 };
  }

  private fill(buf: SegBuffer, material: LineBasicMaterial, pts: number[]): void {
    const segs = pts.length / 6;
    if (segs > buf.capacity) {
      const parent = buf.mesh.parent;
      buf.mesh.geometry.dispose();
      const next = this.createBuffer(material, Math.ceil(segs * 1.5));
      parent?.remove(buf.mesh);
      parent?.add(next.mesh);
      buf.mesh = next.mesh;
      buf.capacity = next.capacity;
    }
    const attr = buf.mesh.geometry.getAttribute('position') as BufferAttribute;
    (attr.array as Float32Array).set(pts);
    attr.needsUpdate = true;
    buf.mesh.geometry.setDrawRange(0, segs * 2);
    buf.count = segs;
  }

  private updateLabels(
    labelAt: Map<number, [number, number, number]>,
    step: number,
    cellSize: number,
  ): void {
    const decimals = Math.min(4, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));
    let n = 0;
    for (const [k, pos] of labelAt) {
      const tex = this.labelTexture(`${(k * step).toFixed(decimals)} m`);
      if (!tex) break;
      let sprite = this.sprites[n];
      if (!sprite) {
        sprite = new Sprite(new SpriteMaterial({ depthTest: false, transparent: true }));
        sprite.renderOrder = 3;
        this.sprites.push(sprite);
        this.group.add(sprite);
      }
      sprite.material.map = tex;
      sprite.material.needsUpdate = true;
      const w = cellSize * LABEL_WIDTH_CELLS;
      sprite.scale.set(w, w * 0.32, 1);
      sprite.position.set(pos[0], pos[1] + cellSize * 0.6, pos[2]);
      sprite.visible = true;
      n += 1;
    }
    for (let i = n; i < this.sprites.length; i += 1) this.sprites[i].visible = false;
  }

  private labelTexture(text: string): CanvasTexture | null {
    if (this.textures.has(text)) return this.textures.get(text) ?? null;
    let tex: CanvasTexture | null = null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 40;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(0, 0, 128, 40);
        ctx.fillStyle = '#111418';
        ctx.font = '700 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 21);
        tex = new CanvasTexture(canvas);
      }
    } catch {
      tex = null;
    }
    this.textures.set(text, tex);
    return tex;
  }

  public dispose(): void {
    this.scene.remove(this.group);
    this.minor.mesh.geometry.dispose();
    this.major.mesh.geometry.dispose();
    this.minorMat.dispose();
    this.majorMat.dispose();
    for (const s of this.sprites) s.material.dispose();
    for (const t of this.textures.values()) t?.dispose();
    this.textures.clear();
  }
}
