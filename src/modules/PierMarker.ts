import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  TubeGeometry,
  Vector3,
  type Material,
  type Scene,
} from 'three';
import type { Disposable } from '@/types/disposable';
import type { BridgeType, StructureShape } from '@/types/simParams';

export interface PierDefinition {
  id: string;
  x: number;
  z: number;
  diameter?: number;
  height?: number;
  shape?: StructureShape;
  color?: number;
}

export interface PierMarkerOptions {
  scene: Scene;
  baseElevation?: number;
  bridgeEnabled?: boolean;
  bridgeType?: BridgeType;
}

interface BridgeLayout {
  diameter: number;
  topY: number;
  pierShaftTopY: number;
  deckY: number;
  deckSurfaceY: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
  spanAxis: 'x' | 'z';
  spanLen: number;
  deckWidth: number;
  towerH: number;
  towerLegW: number;
  cableR: number;
  suspenderR: number;
  deckThick: number;
  parapetH: number;
  parapetT: number;
  sagFactor: number;
}

interface BridgeMaterials {
  concrete: MeshStandardMaterial;
  tower: MeshStandardMaterial;
  towerAccent: MeshStandardMaterial;
  cable: MeshStandardMaterial;
  suspender: MeshStandardMaterial;
  parapet: MeshStandardMaterial;
  wear: MeshStandardMaterial;
  arch: MeshStandardMaterial;
  accent: MeshStandardMaterial;
  paint: MeshStandardMaterial;
  lane: MeshStandardMaterial;
  steel: MeshStandardMaterial;
  lamp: MeshStandardMaterial;
}

const UP = new Vector3(0, 1, 0);

// PierMarker: 교각 + (선택) 교량 시각화(현수·사장·아치·거더).
export class PierMarker implements Disposable {
  private readonly scene: Scene;
  private readonly group = new Group();
  private readonly disposables: Array<{ geom: { dispose: () => void } }> = [];
  private readonly materials = new Set<Material>();
  private readonly baseElevation: number;

  public constructor(options: PierMarkerOptions, piers: PierDefinition[]) {
    this.scene = options.scene;
    this.baseElevation = options.baseElevation ?? 0;

    const bridgeOn = options.bridgeEnabled && piers.length > 0;
    const layout = bridgeOn ? this.computeBridgeLayout(piers) : null;

    for (const pier of piers) {
      this.addPier(pier, layout?.pierShaftTopY);
    }
    if (bridgeOn && layout) {
      this.addBridgeStructure(piers, options.bridgeType ?? 'suspension', layout);
    }
    this.scene.add(this.group);
  }

  private addPier(pier: PierDefinition, shaftTopY?: number): void {
    const diameter = pier.diameter ?? 1.0;
    const fullHeight = pier.height ?? 6.0;
    const height =
      shaftTopY !== undefined
        ? Math.max(diameter * 0.35, shaftTopY - this.baseElevation)
        : fullHeight;
    const radius = diameter / 2;
    const shape = pier.shape ?? 'circle';
    const color = pier.color ?? 0xffffff;
    const bridgeMode = shaftTopY !== undefined;

    const shaftMat = new MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 });
    this.materials.add(shaftMat);

    if (shape === 'square') {
      const shaftGeom = new BoxGeometry(diameter, height, diameter);
      const shaft = new Mesh(shaftGeom, shaftMat);
      this.disposables.push({ geom: shaftGeom });
      shaft.position.set(pier.x, this.baseElevation + height / 2, pier.z);
      shaft.name = `pier-${pier.id}`;
      this.group.add(shaft);
    } else {
      const shaftGeom = new CylinderGeometry(radius, radius, height, 24);
      const shaft = new Mesh(shaftGeom, shaftMat);
      this.disposables.push({ geom: shaftGeom });
      shaft.position.set(pier.x, this.baseElevation + height / 2, pier.z);
      shaft.name = `pier-${pier.id}`;

      if (!bridgeMode) {
        const lidThick = Math.max(diameter * 0.05, 0.003);
        const lidGeom = new CylinderGeometry(radius, radius, lidThick, 24);
        const lidMat = new MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
        this.materials.add(lidMat);
        const lid = new Mesh(lidGeom, lidMat);
        this.disposables.push({ geom: lidGeom });
        lid.position.set(pier.x, this.baseElevation + height + lidThick / 2, pier.z);
        lid.name = `pier-${pier.id}-lid`;
        this.group.add(shaft, lid);
      } else {
        this.group.add(shaft);
      }
    }
  }

  private computeBridgeLayout(piers: PierDefinition[]): BridgeLayout {
    const diameter = piers[0]?.diameter ?? 1.0;
    const height = piers[0]?.height ?? 6.0;
    const xValues = piers.map((p) => p.x);
    const zValues = piers.map((p) => p.z);
    const pierSpanX = Math.max(...xValues) - Math.min(...xValues);
    const pierSpanZ = Math.max(...zValues) - Math.min(...zValues);
    const spanAxis: 'x' | 'z' = pierSpanX > pierSpanZ ? 'x' : 'z';
    const overhang = diameter * 0.55;

    const minX = Math.min(...xValues) - overhang;
    const maxX = Math.max(...xValues) + overhang;
    const minZ = Math.min(...zValues) - overhang;
    const maxZ = Math.max(...zValues) + overhang;

    const spanLen = Math.max(diameter * 1.8, spanAxis === 'x' ? maxX - minX : maxZ - minZ);
    const deckWidth = Math.max(
      diameter * 2.0,
      spanAxis === 'x' ? maxZ - minZ + diameter * 0.55 : maxX - minX + diameter * 0.55,
    );
    const topY = this.baseElevation + height;
    const deckThick = Math.max(diameter * 0.04, 0.007);
    const deckY = topY - deckThick - Math.max(diameter * 0.12, 0.015);
    const pierShaftTopY = deckY;

    return {
      diameter,
      topY,
      pierShaftTopY,
      deckY,
      deckSurfaceY: deckY + deckThick,
      minX,
      maxX,
      minZ,
      maxZ,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
      spanAxis,
      spanLen,
      deckWidth,
      towerH: Math.max(diameter * 1.15, 0.1),
      towerLegW: Math.max(diameter * 0.09, 0.01),
      cableR: Math.max(diameter * 0.018, 0.0025),
      suspenderR: Math.max(diameter * 0.006, 0.0012),
      deckThick,
      parapetH: Math.max(diameter * 0.14, 0.012),
      parapetT: Math.max(diameter * 0.022, 0.004),
      sagFactor: 0.12,
    };
  }

  private createBridgeMaterials(bridgeType: BridgeType): BridgeMaterials {
    const mk = (
      color: number,
      roughness: number,
      metalness: number,
      emissive = 0x000000,
      emissiveIntensity = 0,
    ) =>
      new MeshStandardMaterial({
        color,
        roughness,
        metalness,
        emissive,
        emissiveIntensity,
      });

    const palettes = {
      suspension: {
        concrete: mk(0x434a52, 0.86, 0.04),
        tower: mk(0xc9562a, 0.62, 0.1),
        towerAccent: mk(0xf2ece3, 0.55, 0.06),
        cable: mk(0xb8c6d4, 0.32, 0.62),
        suspender: mk(0xdce4ec, 0.28, 0.58),
        parapet: mk(0x8a939c, 0.74, 0.08),
        wear: mk(0x353b42, 0.92, 0.02),
        arch: mk(0x7a848e, 0.68, 0.12),
        accent: mk(0xc9562a, 0.62, 0.1),
        paint: mk(0xf0f2f4, 0.48, 0.05),
        lane: mk(0xe8b830, 0.55, 0.04),
        steel: mk(0x6e7882, 0.52, 0.38),
        lamp: mk(0xfff0c8, 0.4, 0.05, 0xffb84d, 0.45),
      },
      'cable-stayed': {
        concrete: mk(0x3f464e, 0.84, 0.05),
        tower: mk(0xe8ecf0, 0.58, 0.06),
        towerAccent: mk(0x2f6faa, 0.48, 0.18),
        cable: mk(0x3a7ab8, 0.35, 0.42),
        suspender: mk(0x5a9fd4, 0.38, 0.4),
        parapet: mk(0x7a858f, 0.76, 0.07),
        wear: mk(0x323840, 0.9, 0.03),
        arch: mk(0x7a848e, 0.68, 0.12),
        accent: mk(0x2f6faa, 0.48, 0.18),
        paint: mk(0xf5f7fa, 0.45, 0.04),
        lane: mk(0xf0c838, 0.52, 0.04),
        steel: mk(0x88929c, 0.5, 0.35),
        lamp: mk(0xfff4d6, 0.42, 0.04, 0xffaa55, 0.4),
      },
      arch: {
        concrete: mk(0x454c54, 0.83, 0.05),
        tower: mk(0x9aa4ae, 0.7, 0.08),
        towerAccent: mk(0xb85c38, 0.58, 0.14),
        cable: mk(0x4a9090, 0.42, 0.35),
        suspender: mk(0x6aaaa8, 0.45, 0.32),
        parapet: mk(0x889199, 0.78, 0.06),
        wear: mk(0x383e44, 0.9, 0.03),
        arch: mk(0xb85c38, 0.55, 0.18),
        accent: mk(0xd47840, 0.52, 0.16),
        paint: mk(0xeee8e0, 0.5, 0.04),
        lane: mk(0xecc840, 0.54, 0.04),
        steel: mk(0x707880, 0.52, 0.36),
        lamp: mk(0xfff0cc, 0.42, 0.04, 0xff9944, 0.38),
      },
      girder: {
        concrete: mk(0x424850, 0.85, 0.04),
        tower: mk(0x8a949e, 0.72, 0.1),
        towerAccent: mk(0xd4a820, 0.48, 0.12),
        cable: mk(0x4a6278, 0.45, 0.48),
        suspender: mk(0x5a7288, 0.46, 0.44),
        parapet: mk(0x78848f, 0.8, 0.07),
        wear: mk(0x343a40, 0.91, 0.02),
        arch: mk(0x7a848e, 0.68, 0.12),
        accent: mk(0xd4a820, 0.48, 0.12),
        paint: mk(0xf2f4f6, 0.46, 0.05),
        lane: mk(0xecc838, 0.54, 0.04),
        steel: mk(0x3d5568, 0.48, 0.52),
        lamp: mk(0xfff2cc, 0.4, 0.05, 0xffaa44, 0.36),
      },
    } satisfies Record<BridgeType, BridgeMaterials>;

    const mats = palettes[bridgeType];
    for (const mat of Object.values(mats)) this.materials.add(mat);
    return mats;
  }

  private addBridgeStructure(piers: PierDefinition[], bridgeType: BridgeType, layout: BridgeLayout): void {
    const mats = this.createBridgeMaterials(bridgeType);

    switch (bridgeType) {
      case 'cable-stayed':
        this.addCableStayedBridge(piers, layout, mats);
        break;
      case 'arch':
        this.addArchBridge(piers, layout, mats);
        break;
      case 'girder':
        this.addGirderBridge(piers, layout, mats);
        break;
      default:
        this.addSuspensionBridge(piers, layout, mats);
        break;
    }
  }

  private addPierCap(
    pier: PierDefinition,
    layout: BridgeLayout,
    mat: MeshStandardMaterial,
    accentMat?: MeshStandardMaterial,
  ): void {
    const capThick = Math.max(layout.diameter * 0.035, 0.006);
    const capSize = layout.diameter * 1.45;
    const y = layout.pierShaftTopY + capThick / 2;
    this.addBox(capSize, capThick, capSize, pier.x, y, pier.z, mat, `pier-cap-${pier.id}`);
    if (accentMat) {
      const ring = capSize * 0.82;
      const ringThick = capThick * 0.35;
      this.addBox(ring, ringThick, ring, pier.x, y + capThick * 0.28, pier.z, accentMat, `pier-cap-ring-${pier.id}`);
    }
  }

  private sortPiersAlongSpan(piers: PierDefinition[], layout: BridgeLayout): PierDefinition[] {
    const key = layout.spanAxis === 'x' ? 'x' : 'z';
    return [...piers].sort((a, b) => a[key] - b[key]);
  }

  private spanValue(layout: BridgeLayout, x: number, z: number): number {
    return layout.spanAxis === 'z' ? z : x;
  }

  private deckPoint(
    layout: BridgeLayout,
    spanPos: number,
    lateralOffset: number,
    y = layout.deckY + layout.deckThick / 2,
  ): Vector3 {
    if (layout.spanAxis === 'z') {
      return new Vector3(layout.centerX + lateralOffset, y, spanPos);
    }
    return new Vector3(spanPos, y, layout.centerZ + lateralOffset);
  }

  // ── 현수교 ──────────────────────────────────────────────

  private addSuspensionBridge(piers: PierDefinition[], layout: BridgeLayout, mats: BridgeMaterials): void {
    const sorted = this.sortPiersAlongSpan(piers, layout);
    for (const pier of sorted) {
      this.addHTower(pier, layout, mats.tower, mats.towerAccent, layout.towerH);
    }

    const cableOffset = layout.deckWidth * 0.38;
    for (const side of [-1, 1] as const) {
      const path = this.buildMainCablePath(layout, sorted, side * cableOffset);
      this.addCableTube(path, layout.cableR, mats.cable, `main-cable-${side > 0 ? 'pos' : 'neg'}`);
      this.addVerticalSuspenders(path, layout, side * cableOffset, mats.suspender);
    }

    this.addDeck(layout, mats);
    this.addParapets(layout, mats);
    this.addAnchorBlocks(layout, mats.steel, mats.accent);
  }

  private addHTower(
    pier: PierDefinition,
    layout: BridgeLayout,
    legMat: MeshStandardMaterial,
    accentMat: MeshStandardMaterial,
    legH: number,
  ): void {
    const legW = layout.towerLegW;
    const spread = layout.deckWidth * 0.34;
    const baseY = layout.deckSurfaceY;
    const crossY = baseY + legH - legW * 0.6;
    const bandH = legH * 0.22;

    if (layout.spanAxis === 'z') {
      for (const side of [-1, 1] as const) {
        const x = pier.x + side * spread;
        this.addBox(legW, legH, legW, x, baseY + legH / 2, pier.z, legMat, `tower-leg-${pier.id}-${side}`);
        this.addBox(legW * 1.08, bandH, legW * 1.08, x, baseY + bandH / 2, pier.z, accentMat, `tower-band-${pier.id}-${side}`);
      }
      this.addBox(spread * 2 + legW, legW * 0.85, legW * 1.4, pier.x, crossY, pier.z, accentMat, `tower-cross-${pier.id}`);
    } else {
      for (const side of [-1, 1] as const) {
        const z = pier.z + side * spread;
        this.addBox(legW, legH, legW, pier.x, baseY + legH / 2, z, legMat, `tower-leg-${pier.id}-${side}`);
        this.addBox(legW * 1.08, bandH, legW * 1.08, pier.x, baseY + bandH / 2, z, accentMat, `tower-band-${pier.id}-${side}`);
      }
      this.addBox(legW * 1.4, legW * 0.85, spread * 2 + legW, pier.x, crossY, pier.z, accentMat, `tower-cross-${pier.id}`);
    }
  }

  private towerTop(pier: PierDefinition, layout: BridgeLayout, legH: number, lateralOffset = 0): Vector3 {
    const y = layout.deckSurfaceY + legH - layout.towerLegW * 0.3;
    if (layout.spanAxis === 'z') {
      return new Vector3(pier.x + lateralOffset, y, pier.z);
    }
    return new Vector3(pier.x, y, pier.z + lateralOffset);
  }

  private spanAnchor(layout: BridgeLayout, atStart: boolean, lateralOffset: number): Vector3 {
    const y = layout.deckY + layout.deckThick * 0.5;
    if (layout.spanAxis === 'z') {
      const z = atStart ? layout.minZ : layout.maxZ;
      return new Vector3(layout.centerX + lateralOffset, y, z);
    }
    const x = atStart ? layout.minX : layout.maxX;
    return new Vector3(x, y, layout.centerZ + lateralOffset);
  }

  private spanCoord(v: Vector3, layout: BridgeLayout): number {
    return layout.spanAxis === 'z' ? v.z : v.x;
  }

  private buildMainCablePath(
    layout: BridgeLayout,
    piers: PierDefinition[],
    lateralOffset: number,
  ): Vector3[] {
    const legH = layout.towerH;
    const knots = [
      this.spanAnchor(layout, true, lateralOffset),
      ...piers.map((p) => this.towerTop(p, layout, legH, lateralOffset)),
      this.spanAnchor(layout, false, lateralOffset),
    ].sort((a, b) => this.spanCoord(a, layout) - this.spanCoord(b, layout));

    const points: Vector3[] = [];
    const segs = 10;
    for (let i = 0; i < knots.length - 1; i += 1) {
      const a = knots[i]!;
      const b = knots[i + 1]!;
      const span = a.distanceTo(b);
      const sag = span * layout.sagFactor;
      for (let j = 0; j <= segs; j += 1) {
        if (j === 0 && i > 0) continue;
        const t = j / segs;
        const p = new Vector3().lerpVectors(a, b, t);
        p.y -= sag * 4 * t * (1 - t);
        points.push(p);
      }
    }
    return points;
  }

  private cableHeightAt(path: Vector3[], spanPos: number, layout: BridgeLayout): number {
    const coord = layout.spanAxis === 'z' ? 'z' : 'x';
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const ca = coord === 'z' ? a.z : a.x;
      const cb = coord === 'z' ? b.z : b.x;
      if (spanPos >= ca && spanPos <= cb) {
        const t = (spanPos - ca) / Math.max(1e-9, cb - ca);
        return a.y + (b.y - a.y) * t;
      }
    }
    return path[0]?.y ?? layout.deckY;
  }

  private addVerticalSuspenders(
    cablePath: Vector3[],
    layout: BridgeLayout,
    lateralOffset: number,
    mat: MeshStandardMaterial,
  ): void {
    const count = Math.max(4, Math.round(layout.spanLen / (layout.diameter * 0.55)));
    const deckTop = layout.deckY + layout.deckThick / 2;

    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      const spanPos = layout.spanAxis === 'z' ? layout.minZ + t * layout.spanLen : layout.minX + t * layout.spanLen;
      const pt = this.deckPoint(layout, spanPos, lateralOffset, deckTop);
      const cableY = this.cableHeightAt(cablePath, spanPos, layout);
      const len = Math.max(0.002, cableY - deckTop);
      if (len < layout.diameter * 0.04) continue;
      this.addCableSegment(
        new Vector3(pt.x, deckTop, pt.z),
        new Vector3(pt.x, cableY, pt.z),
        layout.suspenderR,
        mat,
        `suspender-${i}`,
      );
    }
  }

  // ── 사장교 ──────────────────────────────────────────────

  private addCableStayedBridge(piers: PierDefinition[], layout: BridgeLayout, mats: BridgeMaterials): void {
    const sorted = this.sortPiersAlongSpan(piers, layout);
    const mastH = layout.towerH * 1.55;

    for (const pier of sorted) {
      this.addCableStayedMast(pier, layout, mats.tower, mats.towerAccent, mastH);
      const top = this.towerTop(pier, layout, mastH);
      const pierSpan = this.spanValue(layout, pier.x, pier.z);
      const fanSteps = [-2, -1, 0, 1, 2];

      for (const step of fanSteps) {
        const spanPos = pierSpan + step * layout.spanLen * 0.11;
        const spanMin = layout.spanAxis === 'z' ? layout.minZ : layout.minX;
        const spanMax = layout.spanAxis === 'z' ? layout.maxZ : layout.maxX;
        if (spanPos < spanMin - 0.001 || spanPos > spanMax + 0.001) continue;

        for (const side of [-1, 1] as const) {
          const deckPt = this.deckPoint(layout, spanPos, side * layout.deckWidth * 0.32);
          this.addCableSegment(top, deckPt, layout.cableR * 0.85, mats.cable, `stay-${pier.id}-${step}-${side}`);
        }
      }
    }

    this.addDeck(layout, mats);
    this.addParapets(layout, mats);
  }

  private addCableStayedMast(
    pier: PierDefinition,
    layout: BridgeLayout,
    legMat: MeshStandardMaterial,
    accentMat: MeshStandardMaterial,
    mastH: number,
  ): void {
    const w = layout.towerLegW * 1.15;
    const baseY = layout.deckSurfaceY;
    this.addBox(w, mastH, w, pier.x, baseY + mastH / 2, pier.z, legMat, `mast-${pier.id}`);
    const bandH = mastH * 0.14;
    this.addBox(w * 1.05, bandH, w * 1.05, pier.x, baseY + mastH * 0.35, pier.z, accentMat, `mast-band-${pier.id}`);
    const capY = baseY + mastH + w * 0.2;
    this.addBox(w * 2.2, w * 0.5, w * 2.2, pier.x, capY, pier.z, accentMat, `mast-cap-${pier.id}`);
  }

  // ── 거더교 ──────────────────────────────────────────────

  private addGirderBridge(piers: PierDefinition[], layout: BridgeLayout, mats: BridgeMaterials): void {
    const sorted = this.sortPiersAlongSpan(piers, layout);
    const girderH = Math.max(layout.diameter * 0.11, 0.012);
    const girderW = Math.max(layout.diameter * 0.1, 0.011);
    const capThick = Math.max(layout.diameter * 0.035, 0.006);
    const girderY = layout.pierShaftTopY + capThick + girderH / 2;

    for (const pier of sorted) {
      this.addPierCap(pier, layout, mats.steel, mats.accent);
    }

    const halfRail = layout.deckWidth / 2 - girderW * 0.65;
    if (layout.spanAxis === 'z') {
      for (const side of [-1, 1] as const) {
        const x = layout.centerX + side * halfRail;
        this.addBox(
          girderW,
          girderH,
          layout.spanLen,
          x,
          girderY,
          layout.centerZ,
          mats.steel,
          side < 0 ? 'girder-z-left' : 'girder-z-right',
        );
        this.addBox(
          girderW * 0.35,
          girderH * 0.28,
          layout.spanLen * 0.94,
          x,
          girderY + girderH * 0.38,
          layout.centerZ,
          mats.accent,
          side < 0 ? 'girder-stiff-z-left' : 'girder-stiff-z-right',
        );
      }
      for (const pier of sorted) {
        this.addBox(
          layout.deckWidth * 0.9,
          girderH * 0.72,
          girderW * 1.15,
          pier.x,
          girderY,
          pier.z,
          mats.cable,
          `girder-diaphragm-${pier.id}`,
        );
      }
    } else {
      for (const side of [-1, 1] as const) {
        const z = layout.centerZ + side * halfRail;
        this.addBox(
          layout.spanLen,
          girderH,
          girderW,
          layout.centerX,
          girderY,
          z,
          mats.steel,
          side < 0 ? 'girder-x-near' : 'girder-x-far',
        );
        this.addBox(
          layout.spanLen * 0.94,
          girderH * 0.28,
          girderW * 0.35,
          layout.centerX,
          girderY + girderH * 0.38,
          z,
          mats.accent,
          side < 0 ? 'girder-stiff-x-near' : 'girder-stiff-x-far',
        );
      }
      for (const pier of sorted) {
        this.addBox(
          girderW * 1.15,
          girderH * 0.72,
          layout.deckWidth * 0.9,
          pier.x,
          girderY,
          pier.z,
          mats.cable,
          `girder-diaphragm-${pier.id}`,
        );
      }
    }

    this.addDeck(layout, mats);
    this.addParapets(layout, mats);
  }

  // ── 아치교 ──────────────────────────────────────────────

  private addArchBridge(piers: PierDefinition[], layout: BridgeLayout, mats: BridgeMaterials): void {
    const rise = Math.max(layout.diameter * 0.45, layout.spanLen * 0.18);
    const springY = layout.deckY - rise;
    const lateral = layout.deckWidth * 0.34;
    const ribR = layout.cableR * 1.6;
    const hangerR = Math.max(layout.suspenderR * 2.8, layout.cableR * 0.75);

    for (const side of [-1, 1] as const) {
      const path = this.buildArchPath(layout, side * lateral, springY, rise);
      this.addCableTube(path, ribR, mats.arch, `arch-rib-${side > 0 ? 'pos' : 'neg'}`);
    }

    this.addArchHangers(layout, springY, rise, lateral, hangerR, mats.cable);
    this.addArchSpandrels(layout, springY, rise, lateral, hangerR, mats.suspender);
    this.addDeck(layout, mats);
    this.addParapets(layout, mats);

    for (const pier of piers) {
      const capSize = layout.diameter * 1.35;
      this.addBox(
        capSize,
        layout.deckThick * 0.9,
        capSize,
        pier.x,
        layout.pierShaftTopY - layout.deckThick * 0.35,
        pier.z,
        mats.tower,
        `arch-pier-cap-${pier.id}`,
      );
      const ring = capSize * 0.72;
      this.addBox(
        ring,
        layout.deckThick * 0.35,
        ring,
        pier.x,
        layout.pierShaftTopY - layout.deckThick * 0.12,
        pier.z,
        mats.accent,
        `arch-pier-ring-${pier.id}`,
      );
    }
  }

  /** 아치 리브 사이 연결 와이어(교량 횡연). */
  private addArchHangers(
    layout: BridgeLayout,
    springY: number,
    rise: number,
    lateral: number,
    radius: number,
    mat: MeshStandardMaterial,
  ): void {
    const count = Math.max(6, Math.round(layout.spanLen / (layout.diameter * 0.38)));
    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      const spanPos =
        (layout.spanAxis === 'z' ? layout.minZ : layout.minX) + t * layout.spanLen;
      const archY = this.archHeightAt(layout, spanPos, springY, rise);
      const left = this.deckPoint(layout, spanPos, -lateral, archY);
      const right = this.deckPoint(layout, spanPos, lateral, archY);
      this.addCableSegment(left, right, radius, mat, `arch-tie-${i}`);
    }
  }

  private buildArchPath(
    layout: BridgeLayout,
    lateralOffset: number,
    springY: number,
    rise: number,
  ): Vector3[] {
    const points: Vector3[] = [];
    const steps = 20;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const spanPos = (layout.spanAxis === 'z' ? layout.minZ : layout.minX) + t * layout.spanLen;
      const y = springY + rise * 4 * t * (1 - t);
      points.push(this.deckPoint(layout, spanPos, lateralOffset, y));
    }
    return points;
  }

  private archHeightAt(layout: BridgeLayout, spanPos: number, springY: number, rise: number): number {
    const start = layout.spanAxis === 'z' ? layout.minZ : layout.minX;
    const t = (spanPos - start) / Math.max(1e-9, layout.spanLen);
    if (t < 0 || t > 1) return springY;
    return springY + rise * 4 * t * (1 - t);
  }

  private addArchSpandrels(
    layout: BridgeLayout,
    springY: number,
    rise: number,
    lateral: number,
    radius: number,
    mat: MeshStandardMaterial,
  ): void {
    const count = Math.max(7, Math.round(layout.spanLen / (layout.diameter * 0.38)));
    const deckTop = layout.deckY + layout.deckThick / 2;
    const minLen = layout.diameter * 0.015;

    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      const spanPos =
        (layout.spanAxis === 'z' ? layout.minZ : layout.minX) + t * layout.spanLen;
      const archY = this.archHeightAt(layout, spanPos, springY, rise);
      const hangLen = deckTop - archY;
      if (hangLen < minLen) continue;

      for (const side of [-1, 1] as const) {
        const base = this.deckPoint(layout, spanPos, side * lateral, archY);
        const top = this.deckPoint(layout, spanPos, side * lateral * 0.88, deckTop);
        this.addCableSegment(base, top, radius, mat, `spandrel-${i}-${side}`);
      }

      const centerBase = this.deckPoint(layout, spanPos, 0, archY);
      const centerTop = this.deckPoint(layout, spanPos, 0, deckTop);
      if (centerTop.y - centerBase.y >= minLen) {
        this.addCableSegment(centerBase, centerTop, radius * 0.9, mat, `spandrel-${i}-c`);
      }
    }
  }

  // ── 공통 ────────────────────────────────────────────────

  private addCableTube(
    points: Vector3[],
    radius: number,
    mat: MeshStandardMaterial,
    name: string,
  ): void {
    if (points.length < 2) return;
    const curve = new CatmullRomCurve3(points);
    const geom = new TubeGeometry(curve, Math.max(16, points.length * 3), radius, 8, false);
    const mesh = new Mesh(geom, mat);
    this.disposables.push({ geom });
    mesh.name = name;
    this.group.add(mesh);
  }

  private addCableSegment(
    a: Vector3,
    b: Vector3,
    radius: number,
    mat: MeshStandardMaterial,
    name: string,
  ): void {
    const dir = new Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-5) return;

    const geom = new CylinderGeometry(radius, radius, len, 6);
    const mesh = new Mesh(geom, mat);
    this.disposables.push({ geom });
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    mesh.name = name;
    this.group.add(mesh);
  }

  private addDeck(layout: BridgeLayout, mats: BridgeMaterials): void {
    const y = layout.deckY;
    if (layout.spanAxis === 'z') {
      this.addBox(layout.deckWidth, layout.deckThick, layout.spanLen, layout.centerX, y, layout.centerZ, mats.concrete, 'deck-slab');
      this.addBox(
        layout.deckWidth * 0.92,
        layout.deckThick * 0.14,
        layout.spanLen * 0.96,
        layout.centerX,
        y + layout.deckThick * 0.55,
        layout.centerZ,
        mats.wear,
        'deck-wear',
      );
    } else {
      this.addBox(layout.spanLen, layout.deckThick, layout.deckWidth, layout.centerX, y, layout.centerZ, mats.concrete, 'deck-slab');
      this.addBox(
        layout.spanLen * 0.96,
        layout.deckThick * 0.14,
        layout.deckWidth * 0.92,
        layout.centerX,
        y + layout.deckThick * 0.55,
        layout.centerZ,
        mats.wear,
        'deck-wear',
      );
    }
    this.addDeckMarkings(layout, mats);
  }

  private addDeckMarkings(layout: BridgeLayout, mats: BridgeMaterials): void {
    const y = layout.deckY + layout.deckThick * 0.92;
    const lineH = Math.max(layout.deckThick * 0.08, 0.0012);
    const edgeW = Math.max(layout.deckWidth * 0.018, 0.0025);
    const dashLen = Math.max(layout.diameter * 0.14, 0.012);
    const gapLen = dashLen * 0.85;
    const dashCount = Math.max(6, Math.round(layout.spanLen / (dashLen + gapLen)));

    for (let i = 0; i < dashCount; i += 1) {
      const t = (i + 0.5) / dashCount;
      const spanPos = (layout.spanAxis === 'z' ? layout.minZ : layout.minX) + t * layout.spanLen;
      if (layout.spanAxis === 'z') {
        this.addBox(dashLen, lineH, edgeW * 0.55, layout.centerX, y, spanPos, mats.lane, `lane-dash-${i}`);
      } else {
        this.addBox(edgeW * 0.55, lineH, dashLen, spanPos, y, layout.centerZ, mats.lane, `lane-dash-${i}`);
      }
    }

    const edgeInset = layout.deckWidth * 0.42;
    for (const side of [-1, 1] as const) {
      if (layout.spanAxis === 'z') {
        this.addBox(
          edgeW,
          lineH,
          layout.spanLen * 0.94,
          layout.centerX + side * edgeInset,
          y,
          layout.centerZ,
          mats.paint,
          `edge-line-${side}`,
        );
      } else {
        this.addBox(
          layout.spanLen * 0.94,
          lineH,
          edgeW,
          layout.centerX,
          y,
          layout.centerZ + side * edgeInset,
          mats.paint,
          `edge-line-${side}`,
        );
      }
    }
  }

  private addParapets(layout: BridgeLayout, mats: BridgeMaterials): void {
    const railY = layout.deckY + layout.deckThick + layout.parapetH * 0.55;
    const topY = layout.deckY + layout.deckThick + layout.parapetH * 0.92;
    const inset = layout.deckWidth / 2 - layout.parapetT / 2;
    const postSpacing = Math.max(layout.diameter * 0.42, 0.035);
    const postCount = Math.max(4, Math.round((layout.spanLen * 0.94) / postSpacing));
    const postW = layout.parapetT * 0.55;
    const postH = layout.parapetH * 0.88;

    if (layout.spanAxis === 'z') {
      for (const side of [-1, 1] as const) {
        const x = layout.centerX + side * inset;
        this.addBox(
          layout.parapetT,
          layout.parapetH * 0.35,
          layout.spanLen * 0.97,
          x,
          railY,
          layout.centerZ,
          mats.parapet,
          `parapet-rail-${side}`,
        );
        this.addBox(
          layout.parapetT * 1.15,
          layout.parapetH * 0.08,
          layout.spanLen * 0.97,
          x,
          topY,
          layout.centerZ,
          mats.steel,
          `parapet-cap-${side}`,
        );
        for (let i = 0; i <= postCount; i += 1) {
          const t = i / postCount;
          const z = layout.minZ + t * layout.spanLen * 0.97 + layout.spanLen * 0.015;
          this.addBox(postW, postH, postW, x, layout.deckY + layout.deckThick + postH / 2, z, mats.steel, `parapet-post-${side}-${i}`);
          if (i % 3 === 1) {
            this.addBox(postW * 1.6, postH * 0.22, postW * 1.6, x, topY + layout.parapetH * 0.06, z, mats.lamp, `parapet-lamp-${side}-${i}`);
          }
        }
      }
    } else {
      for (const side of [-1, 1] as const) {
        const z = layout.centerZ + side * inset;
        this.addBox(
          layout.spanLen * 0.97,
          layout.parapetH * 0.35,
          layout.parapetT,
          layout.centerX,
          railY,
          z,
          mats.parapet,
          `parapet-rail-${side}`,
        );
        this.addBox(
          layout.spanLen * 0.97,
          layout.parapetH * 0.08,
          layout.parapetT * 1.15,
          layout.centerX,
          topY,
          z,
          mats.steel,
          `parapet-cap-${side}`,
        );
        for (let i = 0; i <= postCount; i += 1) {
          const t = i / postCount;
          const x = layout.minX + t * layout.spanLen * 0.97 + layout.spanLen * 0.015;
          this.addBox(postW, postH, postW, x, layout.deckY + layout.deckThick + postH / 2, z, mats.steel, `parapet-post-${side}-${i}`);
          if (i % 3 === 1) {
            this.addBox(postW * 1.6, postH * 0.22, postW * 1.6, x, topY + layout.parapetH * 0.06, z, mats.lamp, `parapet-lamp-${side}-${i}`);
          }
        }
      }
    }
  }

  private addAnchorBlocks(
    layout: BridgeLayout,
    bodyMat: MeshStandardMaterial,
    accentMat: MeshStandardMaterial,
  ): void {
    const w = layout.diameter * 0.35;
    const h = layout.diameter * 0.25;
    const d = layout.deckWidth * 0.5;
    const y = layout.deckY - h * 0.15;

    const ends =
      layout.spanAxis === 'z'
        ? [
            { x: layout.centerX, z: layout.minZ },
            { x: layout.centerX, z: layout.maxZ },
          ]
        : [
            { x: layout.minX, z: layout.centerZ },
            { x: layout.maxX, z: layout.centerZ },
          ];

    for (const [i, end] of ends.entries()) {
      if (layout.spanAxis === 'z') {
        this.addBox(w, h, d, end.x, y, end.z, bodyMat, `anchor-${i}`);
        this.addBox(w * 0.75, h * 0.35, d * 0.82, end.x, y + h * 0.38, end.z, accentMat, `anchor-cap-${i}`);
      } else {
        this.addBox(d, h, w, end.x, y, end.z, bodyMat, `anchor-${i}`);
        this.addBox(d * 0.82, h * 0.35, w * 0.75, end.x, y + h * 0.38, end.z, accentMat, `anchor-cap-${i}`);
      }
    }
  }

  private addBox(
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    mat: MeshStandardMaterial,
    name: string,
  ): void {
    const geom = new BoxGeometry(width, height, depth);
    const mesh = new Mesh(geom, mat);
    this.disposables.push({ geom });
    mesh.position.set(x, y, z);
    mesh.name = name;
    this.group.add(mesh);
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public dispose(): void {
    this.scene.remove(this.group);
    for (const d of this.disposables) {
      d.geom.dispose();
    }
    for (const mat of this.materials) {
      mat.dispose();
    }
    this.disposables.length = 0;
    this.materials.clear();
    this.group.clear();
  }
}
