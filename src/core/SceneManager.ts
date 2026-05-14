import { Color, Scene } from 'three';
import { SCENE_BACKGROUND_COLOR } from '@/constants/scene';
import type { Disposable } from '@/types/disposable';

// SceneManager: Three.js Scene 생성 및 객체 추가/제거를 단일 책임으로 담당한다.
// Renderer/Camera 와 분리하여 씬 그래프 변경이 다른 컴포넌트에 영향을 주지 않도록 한다.
export class SceneManager implements Disposable {
  public readonly scene: Scene;

  public constructor(backgroundColor: number = SCENE_BACKGROUND_COLOR) {
    this.scene = new Scene();
    this.scene.background = new Color(backgroundColor);
  }

  public add(...objects: Parameters<Scene['add']>): void {
    this.scene.add(...objects);
  }

  public remove(...objects: Parameters<Scene['remove']>): void {
    this.scene.remove(...objects);
  }

  // 씬에 포함된 모든 자식 객체의 지오메트리/머티리얼을 재귀적으로 정리한다.
  public dispose(): void {
    this.scene.traverse((child) => {
      const mesh = child as { geometry?: { dispose: () => void }; material?: unknown };
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        const disposable = mat as { dispose?: () => void } | undefined;
        disposable?.dispose?.();
      }
    });
    this.scene.clear();
  }
}
