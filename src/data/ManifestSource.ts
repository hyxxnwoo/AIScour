import type {
  ScourDataSource,
  ScourFrame,
  ScourSeries,
  TerrainGrid,
  TerrainMetadata,
} from '@/types/terrain';

// scripts/build-manifest.ts 가 생성하는 manifest.json 스키마.
// 변경 시 양쪽을 함께 갱신할 것.
export interface ManifestSchema {
  version: number;
  generatedAt: string;
  grid: { width: number; height: number; cellSize: number };
  metadata: TerrainMetadata | null;
  terrain: { file: string; dtype: 'float32'; length: number; bytes: number };
  frames: {
    count: number;
    dtype: 'float32';
    length: number;
    entries: Array<{ index: number; file: string; timestampSeconds: number; bytes: number }>;
  };
}

export interface ManifestSourceOptions {
  // manifest.json 의 URL. 이 URL 을 기준으로 상대 경로의 바이너리를 해석한다.
  manifestUrl: string;
  // 동시 fetch 상한 (네트워크/메모리 부담 제어)
  concurrency?: number;
  // 진행률 콜백 (loaded / total)
  onProgress?: (loaded: number, total: number) => void;
}

// ManifestSource: 외부에 공개된 manifest.json + 바이너리 파일들을 가져와 ScourSeries 로 조립한다.
// SyntheticScourSource 와 동일한 ScourDataSource 인터페이스를 만족한다.
export class ManifestSource implements ScourDataSource {
  private readonly options: Required<Omit<ManifestSourceOptions, 'onProgress'>> & {
    onProgress?: (loaded: number, total: number) => void;
  };

  public constructor(options: ManifestSourceOptions) {
    this.options = {
      manifestUrl: options.manifestUrl,
      concurrency: options.concurrency ?? 6,
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    };
  }

  public async load(): Promise<ScourSeries> {
    const manifest = await this.fetchManifest();
    if (manifest.version !== 1) {
      throw new Error(`지원하지 않는 manifest 버전: ${manifest.version}`);
    }
    if (manifest.terrain.dtype !== 'float32') {
      throw new Error(`지원하지 않는 terrain dtype: ${String(manifest.terrain.dtype)}`);
    }

    const baseUrl = this.options.manifestUrl;
    const terrainElevations = await this.fetchFloat32(
      resolveRelative(baseUrl, manifest.terrain.file),
      manifest.terrain.length,
    );

    const baseTerrain: TerrainGrid = {
      width: manifest.grid.width,
      height: manifest.grid.height,
      cellSize: manifest.grid.cellSize,
      elevations: terrainElevations,
      ...(manifest.metadata ? { metadata: manifest.metadata } : {}),
    };

    const frames = await this.fetchFrames(manifest, baseUrl);
    return { baseTerrain, frames };
  }

  private async fetchManifest(): Promise<ManifestSchema> {
    const res = await fetch(this.options.manifestUrl, { cache: 'no-cache' });
    if (!res.ok) {
      throw new Error(`manifest 로딩 실패 (${res.status}): ${this.options.manifestUrl}`);
    }
    return (await res.json()) as ManifestSchema;
  }

  private async fetchFloat32(url: string, expectedLength: number): Promise<Float32Array> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`바이너리 로딩 실패 (${res.status}): ${url}`);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength !== expectedLength * 4) {
      throw new Error(
        `바이너리 길이 불일치 (${url}): expected ${expectedLength * 4}B, got ${buf.byteLength}B`,
      );
    }
    return new Float32Array(buf);
  }

  // 동시 fetch 상한을 두고 프레임들을 병렬 로딩한다.
  private async fetchFrames(manifest: ManifestSchema, baseUrl: string): Promise<ScourFrame[]> {
    const { entries, length } = manifest.frames;
    const total = entries.length;
    const result: ScourFrame[] = new Array<ScourFrame>(total);
    let nextIndex = 0;
    let completed = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const i = nextIndex;
        nextIndex += 1;
        if (i >= total) return;
        const entry = entries[i];
        const data = await this.fetchFloat32(resolveRelative(baseUrl, entry.file), length);
        result[i] = { timestampSeconds: entry.timestampSeconds, deltaElevations: data };
        completed += 1;
        this.options.onProgress?.(completed, total);
      }
    };

    const workers = Array.from({ length: Math.min(this.options.concurrency, total) }, () =>
      worker(),
    );
    await Promise.all(workers);
    return result;
  }
}

// manifest URL(절대/상대) 을 기준으로 상대 경로를 해석한다.
function resolveRelative(baseUrl: string, relative: string): string {
  // 브라우저 환경에서는 location.href, Node 테스트에서는 절대 URL 이어야 한다.
  const base =
    typeof window !== 'undefined' && window.location ? window.location.href : 'http://localhost/';
  return new URL(relative, new URL(baseUrl, base)).toString();
}
