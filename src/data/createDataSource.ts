import type { ScourDataSource } from '@/types/terrain';
import { ManifestSource } from '@/data/ManifestSource';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';

export interface DataSourceFactoryOptions {
  // 우선 시도할 manifest URL. HEAD 요청이 200 이면 ManifestSource 사용, 아니면 fallback.
  manifestUrl?: string;
  // fallback 시 SyntheticScourSource 옵션
  syntheticOptions?: ConstructorParameters<typeof SyntheticScourSource>[0];
}

export interface DataSourceResult {
  source: ScourDataSource;
  // 어떤 경로로 결정되었는지: 'manifest' | 'synthetic'. UI 노출에 사용.
  origin: 'manifest' | 'synthetic';
}

// HEAD 요청으로 manifest 존재 여부를 빠르게 확인. 네트워크 오류는 false 로 간주한다.
async function hasManifest(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

// createDataSource: 운영 환경에서는 manifest 가 있으면 자동 사용, 없으면 합성 데이터로 폴백.
// main.ts 가 한 줄로 사용할 수 있게 한다.
export async function createDataSource(
  options: DataSourceFactoryOptions = {},
): Promise<DataSourceResult> {
  const url = options.manifestUrl;
  if (url && (await hasManifest(url))) {
    return { source: new ManifestSource({ manifestUrl: url }), origin: 'manifest' };
  }
  return {
    source: new SyntheticScourSource(options.syntheticOptions ?? {}),
    origin: 'synthetic',
  };
}
