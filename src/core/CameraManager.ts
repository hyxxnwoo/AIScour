import type { Vector3 } from 'three';
import { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CAMERA_DEFAULTS } from '@/constants/scene';
import type { Disposable } from '@/types/disposable';

export interface CameraManagerOptions {
  domElement: HTMLElement;
  aspect: number;
}

// CameraManager: PerspectiveCamera 와 OrbitControls 를 캡슐화한다.
// 향후 자유 회전 외 카메라 모드(탑뷰, 단면뷰 등)가 필요할 때 이 모듈만 확장하면 된다.
export class CameraManager implements Disposable {
  public readonly camera: PerspectiveCamera;
  public readonly controls: OrbitControls;

  public constructor(options: CameraManagerOptions) {
    const { fov, near, far, initialPosition, target } = CAMERA_DEFAULTS;
    this.camera = new PerspectiveCamera(fov, options.aspect, near, far);
    this.camera.position.set(initialPosition.x, initialPosition.y, initialPosition.z);

    this.controls = new OrbitControls(this.camera, options.domElement);
    this.controls.target.set(target.x, target.y, target.z);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 1000;
    this.controls.update();
  }

  // 종횡비 갱신: RendererManager 의 리사이즈 콜백에서 호출한다.
  public updateAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  // 매 프레임 업데이트: damping 적용을 위해 호출이 필요하다.
  public update(): void {
    this.controls.update();
  }

  public lookAt(target: Vector3): void {
    this.controls.target.copy(target);
    this.controls.update();
  }

  public dispose(): void {
    this.controls.dispose();
  }
}
