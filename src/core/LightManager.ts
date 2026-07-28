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

    // 실험 수조 규모(~1.5m)에 맞춘 그림자 프러스텀 — 그림자가 있어야 교각·지형에 입체감이 생긴다.
    this.directional.castShadow = true;
    this.directional.shadow.mapSize.set(2048, 2048);
    this.directional.shadow.camera.near = 0.1;
    this.directional.shadow.camera.far = 120;
    this.directional.shadow.camera.left = -2;
    this.directional.shadow.camera.right = 2;
    this.directional.shadow.camera.top = 2;
    this.directional.shadow.camera.bottom = -2;
    this.directional.shadow.bias = -0.0015;
    this.directional.shadow.normalBias = 0.001;

    this.scene.add(this.ambient);
    this.scene.add(this.directional);
  }

  public setAmbientIntensity(intensity: number): void {
    this.ambient.intensity = Math.min(3, Math.max(0, intensity));
  }

  public setDirectionalIntensity(intensity: number): void {
    this.directional.intensity = Math.min(3, Math.max(0, intensity));
  }

  public dispose(): void {
    this.scene.remove(this.ambient);
    this.scene.remove(this.directional);
    this.ambient.dispose();
    this.directional.dispose();
  }
}
