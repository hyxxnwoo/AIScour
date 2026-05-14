import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManifestSource, type ManifestSchema } from '@/data/ManifestSource';

// Float32Array → ArrayBuffer (정확한 byteLength 보장)
function f32ToBuffer(arr: number[]): ArrayBuffer {
  const f = new Float32Array(arr);
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength);
}

describe('ManifestSource', () => {
  const manifest: ManifestSchema = {
    version: 1,
    generatedAt: '2026-05-14T00:00:00Z',
    grid: { width: 2, height: 2, cellSize: 1 },
    metadata: { elevationUnit: 'm', simulationId: 'test' },
    terrain: { file: 'terrain.bin', dtype: 'float32', length: 4, bytes: 16 },
    frames: {
      count: 2,
      dtype: 'float32',
      length: 4,
      entries: [
        { index: 0, file: 'frames/0.bin', timestampSeconds: 0, bytes: 16 },
        { index: 1, file: 'frames/1.bin', timestampSeconds: 1, bytes: 16 },
      ],
    },
  };

  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('manifest.json')) {
        return Promise.resolve(
          new Response(JSON.stringify(manifest), {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      if (url.endsWith('terrain.bin')) {
        return Promise.resolve(new Response(f32ToBuffer([1, 2, 3, 4])));
      }
      if (url.endsWith('frames/0.bin')) {
        return Promise.resolve(new Response(f32ToBuffer([0, 0, 0, 0])));
      }
      if (url.endsWith('frames/1.bin')) {
        return Promise.resolve(new Response(f32ToBuffer([-1, -2, -3, -4])));
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('manifest + terrain + frames 를 ScourSeries 로 조립한다', async () => {
    const source = new ManifestSource({ manifestUrl: 'http://example.com/data/manifest.json' });
    const series = await source.load();
    expect(series.baseTerrain.width).toBe(2);
    expect(series.baseTerrain.elevations).toEqual(new Float32Array([1, 2, 3, 4]));
    expect(series.frames).toHaveLength(2);
    expect(series.frames[0]?.timestampSeconds).toBe(0);
    expect(series.frames[1]?.deltaElevations).toEqual(new Float32Array([-1, -2, -3, -4]));
  });

  it('지원하지 않는 manifest 버전은 거부한다', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(Response.json({ ...manifest, version: 99 } satisfies ManifestSchema)),
    );
    const source = new ManifestSource({ manifestUrl: 'http://example.com/data/manifest.json' });
    await expect(source.load()).rejects.toThrow(/manifest 버전/);
  });
});
