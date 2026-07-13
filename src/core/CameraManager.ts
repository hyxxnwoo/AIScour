import type { Vector3 } from 'three';
import { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CAMERA_DEFAULTS } from '@/constants/scene';
import type { Disposable } from '@/types/disposable';

export interface CameraManagerOptions {
  domElement: HTMLElement;
  aspect: number;
}

export type CameraPreset = 'reset' | 'top' | 'side' | 'front';

export interface CameraPresetView {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

// 프리셋 카메라 위치. reset 은 CAMERA_DEFAULTS 와 동기화된다.
const PRESETS: Record<CameraPreset, (radius: number) => CameraPresetView> = {
  // reset 도 씬 반경에 비례하여 배치한다(스케일 무관 프레이밍).
  reset: (r) => ({
    position: { x: r * 0.85, y: r * 0.65, z: r * 0.85 },
    target: CAMERA_DEFAULTS.target,
  }),
  // 위에서 거의 수직으로 내려다본다 (Y 축 양의 방향). y=0 정확히는 OrbitControls 가 싫어하므로 살짝 기울인다.
  top: (r) => ({ position: { x: 0.001, y: r * 1.5, z: 0.001 }, target: { x: 0, y: 0, z: 0 } }),
  side: (r) => ({ position: { x: r * 1.6, y: r * 0.4, z: 0 }, target: { x: 0, y: 0, z: 0 } }),
  front: (r) => ({ position: { x: 0, y: r * 0.4, z: r * 1.6 }, target: { x: 0, y: 0, z: 0 } }),
};

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
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = 50;
    this.controls.update();
  }

  // 종횡비 갱신: RendererManager 의 리사이즈 콜백에서 호출한다.
  public updateAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** 시야각(도). 즉시 투영 행렬 갱신. */
  public setFovDegrees(degrees: number): void {
    const d = Math.min(100, Math.max(15, degrees));
    this.camera.fov = d;
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

  /** 유체/세굴 도메인 중심으로 카메라를 맞춘다. */
  public focusOnDomain(center: Vector3, radius: number): void {
    const r = Math.max(1, radius);
    this.controls.target.copy(center);
    this.camera.position.set(center.x + r * 0.85, center.y + r * 0.65, center.z + r * 0.85);
    this.controls.update();
  }

  // 프리셋 적용. radius 는 씬 크기에 비례한 카메라 거리(미터). 호출자가 지형 크기를 안다.
  public applyPreset(preset: CameraPreset, radius: number): void {
    const view = PRESETS[preset](Math.max(1, radius));
    this.camera.position.set(view.position.x, view.position.y, view.position.z);
    this.controls.target.set(view.target.x, view.target.y, view.target.z);
    this.controls.update();
  }

  public dispose(): void {
    this.controls.dispose();
  }
}
