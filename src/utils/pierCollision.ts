import type { PierDefinition } from '@/modules/PierMarker';
import type { StructureShape } from '@/types/simParams';

export interface PierCollisionOptions {
  permeable: boolean;
  baseElevation: number;
}

const PIER_SURFACE_EPS = 0.002;

function pierRadius(pier: PierDefinition): number {
  return (pier.diameter ?? 1) / 2;
}

function pierHeight(pier: PierDefinition): number {
  return pier.height ?? 6;
}

function pierShape(pier: PierDefinition): StructureShape {
  return pier.shape ?? 'circle';
}

function isWithinPierHeight(y: number, pier: PierDefinition, baseElevation: number): boolean {
  return y >= baseElevation - 0.01 && y <= baseElevation + pierHeight(pier) + 0.01;
}

function isInsidePierXZ(
  x: number,
  z: number,
  pier: PierDefinition,
  permeable: boolean,
): boolean {
  const radius = pierRadius(pier);
  const dx = x - pier.x;
  const dz = z - pier.z;
  const shape = pierShape(pier);

  if (shape === 'square') {
    const inside = Math.abs(dx) < radius && Math.abs(dz) < radius;
    if (!inside) return false;
    if (!permeable) return true;
    const core = radius * 0.5;
    return Math.abs(dx) >= core || Math.abs(dz) >= core;
  }

  const r = Math.hypot(dx, dz);
  if (r >= radius) return false;
  if (!permeable) return true;
  return r >= radius * 0.5;
}

/** 입자가 기둥 솔리드 내부에 있는지 판별한다. */
export function isInsidePierSolid(
  x: number,
  y: number,
  z: number,
  pier: PierDefinition,
  options: PierCollisionOptions,
): boolean {
  if (!isWithinPierHeight(y, pier, options.baseElevation)) return false;
  return isInsidePierXZ(x, z, pier, options.permeable);
}

function projectCircle(
  x: number,
  z: number,
  pier: PierDefinition,
  permeable: boolean,
): { x: number; z: number } {
  const radius = pierRadius(pier);
  const dx = x - pier.x;
  const dz = z - pier.z;
  const r = Math.hypot(dx, dz);
  const minR = permeable ? radius * 0.5 : 0;
  if (r >= radius) {
    return { x, z };
  }
  if (permeable && r <= minR) {
    return { x, z };
  }
  if (r < 1e-9) {
    return { x: pier.x + radius + PIER_SURFACE_EPS, z: pier.z };
  }
  const scale = (radius + PIER_SURFACE_EPS) / r;
  return {
    x: pier.x + dx * scale,
    z: pier.z + dz * scale,
  };
}

function projectSquare(
  x: number,
  z: number,
  pier: PierDefinition,
  permeable: boolean,
): { x: number; z: number } {
  const radius = pierRadius(pier);
  const dx = x - pier.x;
  const dz = z - pier.z;
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  if (ax >= radius || az >= radius) {
    return { x, z };
  }

  if (permeable) {
    const core = radius * 0.5;
    if (ax < core && az < core) return { x, z };
  }

  const pushX = radius + PIER_SURFACE_EPS - ax;
  const pushZ = radius + PIER_SURFACE_EPS - az;
  if (pushX < pushZ) {
    return { x: pier.x + Math.sign(dx || 1) * (radius + PIER_SURFACE_EPS), z };
  }
  return { x, z: pier.z + Math.sign(dz || 1) * (radius + PIER_SURFACE_EPS) };
}

/** 기둥 솔리드와 겹치면 XZ 를 표면 밖으로 밀어낸다. */
export function resolvePierCollision(
  x: number,
  y: number,
  z: number,
  piers: PierDefinition[],
  options: PierCollisionOptions,
): { x: number; z: number } {
  let ox = x;
  let oz = z;

  for (const pier of piers) {
    if (!isWithinPierHeight(y, pier, options.baseElevation)) continue;
    if (!isInsidePierXZ(ox, oz, pier, options.permeable)) continue;

    const projected =
      pierShape(pier) === 'square'
        ? projectSquare(ox, oz, pier, options.permeable)
        : projectCircle(ox, oz, pier, options.permeable);
    ox = projected.x;
    oz = projected.z;
  }

  return { x: ox, z: oz };
}

/** respawn 후보가 기둥 솔리드 내부인지 판별한다. */
export function isBlockedByPiers(
  x: number,
  y: number,
  z: number,
  piers: PierDefinition[],
  options: PierCollisionOptions,
): boolean {
  for (const pier of piers) {
    if (isInsidePierSolid(x, y, z, pier, options)) return true;
  }
  return false;
}
