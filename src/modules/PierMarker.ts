import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
  type Scene,
} from 'three';
import type { Disposable } from '@/types/disposable';
import type { StructureShape } from '@/types/simParams';

export interface PierDefinition {
  id: string;
  // 월드 좌표(미터). 격자 중심 기준.
  x: number;
  z: number;
  // 교각 외경(미터). 기본 1.0
  diameter?: number;
  // 교각 높이(미터). 기본 6.0 — 지형 위로 솟는다.
  height?: number;
  // 단면 형상. 기본 원형.
  shape?: StructureShape;
  // (선택) 표시 라벨/색상
  color?: number;
}

export interface PierMarkerOptions {
  scene: Scene;
  // 교각이 솟아오를 기준 표고. 보통 베이스 평균값 또는 0.
  baseElevation?: number;
}

// PierMarker: 교각 위치를 원기둥/사각기둥(샤프트)으로 표시한다. 원형은 상단에 얇은 뚜껑을 덮는다.
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
    const shape = pier.shape ?? 'circle';
    const color = pier.color ?? 0xb0bcc9;

    const shaftMat = new MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 });

    let shaft: Mesh;

    if (shape === 'square') {
      const shaftGeom = new BoxGeometry(diameter, height, diameter);
      shaft = new Mesh(shaftGeom, shaftMat);
      this.disposables.push({ geom: shaftGeom, mat: shaftMat });
      shaft.position.set(pier.x, this.baseElevation + height / 2, pier.z);
      shaft.name = `pier-${pier.id}`;
      this.group.add(shaft);
    } else {
      const shaftGeom = new CylinderGeometry(radius, radius, height, 24);
      shaft = new Mesh(shaftGeom, shaftMat);
      this.disposables.push({ geom: shaftGeom, mat: shaftMat });
      shaft.position.set(pier.x, this.baseElevation + height / 2, pier.z);
      shaft.name = `pier-${pier.id}`;

      const lidThick = Math.max(diameter * 0.05, 0.003);
      const lidGeom = new CylinderGeometry(radius, radius, lidThick, 24);
      const lidMat = new MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
      const lid = new Mesh(lidGeom, lidMat);
      this.disposables.push({ geom: lidGeom, mat: lidMat });
      lid.position.set(pier.x, this.baseElevation + height + lidThick / 2, pier.z);
      lid.name = `pier-${pier.id}-lid`;

      this.group.add(shaft, lid);
    }
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
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
