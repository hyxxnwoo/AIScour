import type { CameraManager } from '@/core/CameraManager';
import type { StoredCameraView } from '@/state/viewState';

export function captureCameraView(cameraManager: CameraManager): StoredCameraView {
  const p = cameraManager.camera.position;
  const t = cameraManager.controls.target;
  return {
    position: { x: p.x, y: p.y, z: p.z },
    target: { x: t.x, y: t.y, z: t.z },
  };
}

export function restoreCameraView(cameraManager: CameraManager, view: StoredCameraView): void {
  cameraManager.camera.position.set(view.position.x, view.position.y, view.position.z);
  cameraManager.controls.target.set(view.target.x, view.target.y, view.target.z);
  cameraManager.controls.update();
}
