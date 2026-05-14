import { AmbientLight, DirectionalLight, type Scene } from 'three';
import { LIGHT_DEFAULTS } from '@/constants/scene';
import type { Disposable } from '@/types/disposable';

// LightManager: 기본 조명(주변광 + 방향광) 세팅을 담당한다.
// 그림자, HDRI 환경광 등 추가 조명은 별도 메서드로 확장한다.
export class LightManager implements Disposable {
  private readonly scene: Scene;
  private readonly ambient: AmbientLight;
  private readonly directional: DirectionalLight;

  public constructor(scene: Scene) {
    this.scene = scene;

    this.ambient = new AmbientLight(LIGHT_DEFAULTS.ambientColor, LIGHT_DEFAULTS.ambientIntensity);

    this.directional = new DirectionalLight(
      LIGHT_DEFAULTS.directionalColor,
      LIGHT_DEFAULTS.directionalIntensity,
    );
    const { x, y, z } = LIGHT_DEFAULTS.directionalPosition;
    this.directional.position.set(x, y, z);

    this.scene.add(this.ambient);
    this.scene.add(this.directional);
  }

  public dispose(): void {
    this.scene.remove(this.ambient);
    this.scene.remove(this.directional);
    this.ambient.dispose();
    this.directional.dispose();
  }
}
