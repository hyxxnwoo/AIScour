import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataSource } from '@/data/createDataSource';
import { ManifestSource } from '@/data/ManifestSource';
import { SyntheticScourSource } from '@/data/SyntheticScourSource';

describe('createDataSource', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('manifest HEAD 가 200 이면 ManifestSource 를 반환한다', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const result = await createDataSource({
      manifestUrl: 'http://example.com/manifest.json',
    });
    expect(result.origin).toBe('manifest');
    expect(result.source).toBeInstanceOf(ManifestSource);
  });

  it('manifest HEAD 가 404 이면 SyntheticScourSource 로 폴백한다', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const result = await createDataSource({
      manifestUrl: 'http://example.com/manifest.json',
      syntheticOptions: { width: 8, height: 8, frameCount: 2 },
    });
    expect(result.origin).toBe('synthetic');
    expect(result.source).toBeInstanceOf(SyntheticScourSource);
  });

  it('네트워크 오류 시에도 SyntheticScourSource 로 안전하게 폴백한다', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    const result = await createDataSource({
      manifestUrl: 'http://example.com/manifest.json',
    });
    expect(result.origin).toBe('synthetic');
  });

  it('manifestUrl 이 없으면 즉시 합성 데이터를 사용한다', async () => {
    const result = await createDataSource();
    expect(result.origin).toBe('synthetic');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
