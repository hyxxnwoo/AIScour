import { Mesh, MeshBasicMaterial, RingGeometry, type Scene, DoubleSide } from 'three';
import type { Disposable } from '@/types/disposable';

/** 클릭 프로브 위치 표시 링(하상 위 수평). 항상 보이도록 깊이 테스트를 끈다. */
export class CfdProbeMarker implements Disposable {
  private readonly scene: Scene;
  private readonly mesh: Mesh;

  public constructor(scene: Scene, radius: number) {
    this.scene = scene;
    const geom = new RingGeometry(radius * 0.7, radius, 24);
    geom.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(
      geom,
      new MeshBasicMaterial({
        color: 0xffffff,
        side: DoubleSide,
        depthTest: false,
        transparent: true,
      }),
    );
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
    this.scene.add(this.mesh);
  }

  public setPosition(x: number, y: number, z: number): void {
    this.mesh.position.set(x, y + 1e-3, z);
    this.mesh.visible = true;
  }

  public hide(): void {
    this.mesh.visible = false;
  }

  public get visible(): boolean {
    return this.mesh.visible;
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
