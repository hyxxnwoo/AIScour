import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
  type Scene,
} from 'three';
import type { Disposable } from '@/types/disposable';

export interface PierDefinition {
  id: string;
  // 월드 좌표(미터). 격자 중심 기준.
  x: number;
  z: number;
  // 교각 외경(미터). 기본 1.0
  diameter?: number;
  // 교각 높이(미터). 기본 6.0 — 지형 위로 솟는다.
  height?: number;
  // (선택) 표시 라벨/색상
  color?: number;
}

export interface PierMarkerOptions {
  scene: Scene;
  // 교각이 솟아오를 기준 표고. 보통 베이스 평균값 또는 0.
  baseElevation?: number;
}

// PierMarker: 교각 위치를 단순한 원기둥(샤프트) + 상부 캡(beam) 으로 표시한다.
// 향후 GLB 모델 로딩 등 더 정교한 표시는 별도 모듈로 분리.
export class PierMarker implements Disposable {
  private readonly scene: Scene;
  private readonly group = new Group();
  private readonly disposables: Array<{ geom?: { dispose: () => void }; mat?: Material }> = [];
  private readonly baseElevation: number;

  public constructor(options: PierMarkerOptions, piers: PierDefinition[]) {
    this.scene = options.scene;
    this.baseElevation = options.baseElevation ?? 0;

    for (const pier of piers) {
      this.addPier(pier);
    }
    this.scene.add(this.group);
  }

  private addPier(pier: PierDefinition): void {
    const diameter = pier.diameter ?? 1.0;
    const height = pier.height ?? 6.0;
    const radius = diameter / 2;
    const color = pier.color ?? 0xb0bcc9;

    const shaftGeom = new CylinderGeometry(radius, radius, height, 24);
    const shaftMat = new MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 });
    const shaft = new Mesh(shaftGeom, shaftMat);
    shaft.position.set(pier.x, this.baseElevation + height / 2, pier.z);
    shaft.name = `pier-${pier.id}`;

    const capGeom = new CylinderGeometry(radius * 1.4, radius * 1.4, 0.5, 24);
    const capMat = new MeshStandardMaterial({ color: 0x3aa6c9, roughness: 0.5, metalness: 0.1 });
    const cap = new Mesh(capGeom, capMat);
    cap.position.set(pier.x, this.baseElevation + height + 0.25, pier.z);
    cap.name = `pier-${pier.id}-cap`;

    this.group.add(shaft);
    this.group.add(cap);
    this.disposables.push({ geom: shaftGeom, mat: shaftMat });
    this.disposables.push({ geom: capGeom, mat: capMat });
  }

  public dispose(): void {
    this.scene.remove(this.group);
    for (const d of this.disposables) {
      d.geom?.dispose();
      d.mat?.dispose();
    }
    this.disposables.length = 0;
    this.group.clear();
  }
}
