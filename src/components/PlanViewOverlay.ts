import type { Camera } from 'three';
import { Vector3 } from 'three';
import type { PierDefinition } from '@/modules/PierMarker';
import type { ScourSeries } from '@/types/terrain';
import type { Disposable } from '@/types/disposable';
import {
  longitudinalLineWorldZ,
  terrainWorldBounds,
  type SectionId,
  type SectionWorldPoint,
} from '@/utils/sectionProfile';

/** Top 뷰 위 단면선 A–A′ / B–B′ 오버레이 */
export class PlanViewOverlay implements Disposable {
  public readonly element: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private section: SectionId = 'A';
  private series: ScourSeries | null = null;
  private piers: PierDefinition[] = [];
  private camera: Camera | null = null;
  private hover: SectionWorldPoint | null = null;
  private activeTransversePierId: string | null = null;
  private onPierPick: ((pierId: string) => void) | null = null;
  private readonly tmp = new Vector3();

  public constructor() {
    this.element = document.createElement('canvas');
    this.element.className = 'plan-view-overlay';
    const ctx = this.element.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.element.addEventListener('click', this.onCanvasClick);
  }

  public setActiveTransversePierId(pierId: string | null): void {
    this.activeTransversePierId = pierId;
  }

  public setOnPierPick(handler: ((pierId: string) => void) | null): void {
    this.onPierPick = handler;
  }

  public setSection(section: SectionId): void {
    this.section = section;
  }

  public setHover(point: SectionWorldPoint | null): void {
    this.hover = point;
  }

  public setContext(series: ScourSeries, piers: PierDefinition[], camera: Camera): void {
    this.series = series;
    this.piers = piers;
    this.camera = camera;
  }

  public resize(width: number, height: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.element.width = Math.max(1, Math.floor(width * dpr));
    this.element.height = Math.max(1, Math.floor(height * dpr));
    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public draw(): void {
    const w = this.element.clientWidth;
    const h = this.element.clientHeight;
    this.ctx.clearRect(0, 0, w, h);
    if (!this.series || !this.camera || w <= 0 || h <= 0) return;

    const b = terrainWorldBounds(this.series);
    const zLine = longitudinalLineWorldZ(this.piers, this.activeTransversePierId ?? undefined);
    const g = this.ctx;

    if (this.section === 'A') {
      const a = this.project(b.xMin, zLine, w, h);
      const bpt = this.project(b.xMax, zLine, w, h);
      if (a && bpt) this.drawSectionLine(g, a, bpt, 'A', 'A′', true);
    } else {
      const ordered = [...this.piers].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
      const active =
        this.activeTransversePierId ??
        ordered.find((p) => p.id === 'P2')?.id ??
        ordered[Math.floor(ordered.length / 2)]?.id ??
        ordered[0]?.id;
      for (const pier of ordered) {
        const a = this.project(pier.x, b.zMin, w, h);
        const bpt = this.project(pier.x, b.zMax, w, h);
        if (!a || !bpt) continue;
        const isActive = pier.id === active;
        this.drawSectionLine(
          g,
          a,
          bpt,
          pier.id,
          'B′',
          isActive,
          isActive ? undefined : 'rgba(78, 205, 196, 0.35)',
        );
      }
    }

    this.drawPierMarkers(w, h);
    this.drawHover(w, h);
  }

  private drawSectionLine(
    g: CanvasRenderingContext2D,
    a: [number, number],
    bpt: [number, number],
    la: string,
    lb: string,
    emphasize: boolean,
    strokeOverride?: string,
  ): void {
    const dx = bpt[0] - a[0];
    const dy = bpt[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    g.save();
    if (emphasize) {
      g.shadowColor = 'rgba(78, 205, 196, 0.45)';
      g.shadowBlur = 10;
    }
    g.lineWidth = emphasize ? 3 : 2;
    g.setLineDash(emphasize ? [10, 7] : [6, 8]);
    g.strokeStyle = strokeOverride ?? 'rgba(78, 205, 196, 0.95)';
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(bpt[0], bpt[1]);
    g.stroke();
    g.restore();

    g.setLineDash([]);
    const drawCap = (x: number, y: number): void => {
      g.beginPath();
      g.arc(x, y, emphasize ? 4.5 : 3.5, 0, Math.PI * 2);
      g.fillStyle = emphasize ? 'rgba(78, 205, 196, 0.35)' : 'rgba(78, 205, 196, 0.18)';
      g.fill();
      g.lineWidth = emphasize ? 2 : 1.5;
      g.strokeStyle = emphasize ? '#4ecdc4' : 'rgba(78, 205, 196, 0.55)';
      g.stroke();
    };
    drawCap(a[0], a[1]);
    drawCap(bpt[0], bpt[1]);

    const labelPad = emphasize ? 18 : 14;
    g.font = emphasize ? '600 11px system-ui, sans-serif' : '500 10px system-ui, sans-serif';
    g.fillStyle = emphasize ? '#e8f0fa' : 'rgba(232, 240, 250, 0.72)';
    g.strokeStyle = 'rgba(12, 32, 52, 0.85)';
    g.lineWidth = 3;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const drawLabel = (text: string, x: number, y: number): void => {
      g.strokeText(text, x, y);
      g.fillText(text, x, y);
    };
    drawLabel(la, a[0] - ux * labelPad + nx * 10, a[1] - uy * labelPad + ny * 10);
    if (emphasize) {
      drawLabel(lb, bpt[0] + ux * labelPad + nx * 10, bpt[1] + uy * labelPad + ny * 10);
    }
  }

  private onCanvasClick = (event: MouseEvent): void => {
    if (this.piers.length === 0) return;
    const w = this.element.clientWidth;
    const h = this.element.clientHeight;
    const rect = this.element.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    let bestId: string | null = null;
    let bestD = 24;
    for (const pier of this.piers) {
      const p = this.project(pier.x, pier.z, w, h);
      if (!p) continue;
      const d = Math.hypot(p[0] - cx, p[1] - cy);
      if (d < bestD) {
        bestD = d;
        bestId = pier.id;
      }
    }
    if (bestId) this.onPierPick?.(bestId);
  };

  private drawHover(w: number, h: number): void {
    if (!this.hover) return;
    const p = this.project(this.hover.worldX, this.hover.worldZ, w, h);
    if (!p) return;
    const g = this.ctx;
    const [x, y] = p;
    g.save();
    g.shadowColor = 'rgba(240, 113, 103, 0.65)';
    g.shadowBlur = 12;
    g.beginPath();
    g.arc(x, y, 9, 0, Math.PI * 2);
    g.fillStyle = 'rgba(240, 113, 103, 0.28)';
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = '#f07167';
    g.stroke();
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.restore();

    const label = `${this.hover.s.toFixed(2)} m`;
    const labelY = y - 16 < 16 ? y + 18 : y - 16;
    g.font = '600 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(12, 32, 52, 0.9)';
    g.fillStyle = '#ffe8e4';
    g.strokeText(label, x, labelY);
    g.fillText(label, x, labelY);
  }

  private drawPierMarkers(w: number, h: number): void {
    if (this.piers.length === 0) return;
    const g = this.ctx;
    const ordered = [...this.piers].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
    for (const pier of ordered) {
      const center = this.project(pier.x, pier.z, w, h);
      if (!center) continue;
      const radiusM = (pier.diameter ?? 0.1) * 0.5;
      const rPx = this.worldRadiusToPixels(pier.x, pier.z, radiusM, w, h);
      g.beginPath();
      g.arc(center[0], center[1], rPx, 0, Math.PI * 2);
      g.fillStyle = 'rgba(143, 164, 184, 0.32)';
      g.fill();
      g.lineWidth = 1.75;
      g.strokeStyle = 'rgba(207, 224, 236, 0.75)';
      g.stroke();
      g.font = '600 10px system-ui, sans-serif';
      g.fillStyle = '#e8f0fa';
      g.strokeStyle = 'rgba(12, 32, 52, 0.75)';
      g.lineWidth = 2.5;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.strokeText(pier.id, center[0], center[1]);
      g.fillText(pier.id, center[0], center[1]);
    }
  }

  private worldRadiusToPixels(
    worldX: number,
    worldZ: number,
    radiusM: number,
    w: number,
    h: number,
  ): number {
    const c0 = this.project(worldX, worldZ, w, h);
    const c1 = this.project(worldX + radiusM, worldZ, w, h);
    if (!c0 || !c1) return 10;
    return Math.max(6, Math.hypot(c1[0] - c0[0], c1[1] - c0[1]));
  }

  private project(worldX: number, worldZ: number, w: number, h: number): [number, number] | null {
    const cam = this.camera;
    if (!cam) return null;
    this.tmp.set(worldX, 0, worldZ);
    this.tmp.project(cam);
    if (this.tmp.z > 1) return null;
    const sx = (this.tmp.x * 0.5 + 0.5) * w;
    const sy = (-this.tmp.y * 0.5 + 0.5) * h;
    return [sx, sy];
  }

  public dispose(): void {
    this.element.removeEventListener('click', this.onCanvasClick);
    this.element.remove();
  }
}
