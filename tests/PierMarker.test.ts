import { Mesh, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { PierMarker } from '@/modules/PierMarker';

function meshNames(scene: Scene): string[] {
  const names: string[] = [];
  scene.traverse((o) => {
    if (o instanceof Mesh && o.name) names.push(o.name);
  });
  return names;
}

describe('PierMarker footing', () => {
  it('하단부가 있으면 교각마다 정사각 상자를 지표 위에 얹는다', () => {
    const scene = new Scene();
    const marker = new PierMarker({ scene }, [
      {
        id: 'P1',
        x: 0,
        z: -0.27,
        diameter: 0.0625,
        height: 0.3,
        footing: { shape: 'square', lengthX: 0.13, widthZ: 0.13, height: 0.05 },
      },
      { id: 'P2', x: 0, z: 0, diameter: 0.0625, height: 0.3 },
    ]);

    expect(meshNames(scene)).toContain('pier-P1-footing');
    expect(meshNames(scene)).not.toContain('pier-P2-footing');

    let footing: Mesh | undefined;
    scene.traverse((o) => {
      if (o instanceof Mesh && o.name === 'pier-P1-footing') footing = o;
    });
    expect(footing?.position.y).toBeCloseTo(0.025, 6); // 지표(0) 위로 높이의 절반
    expect(footing?.position.z).toBeCloseTo(-0.27, 6);
    marker.dispose();
  });
});
