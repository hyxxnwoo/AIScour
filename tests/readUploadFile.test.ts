import { describe, expect, it } from 'vitest';
import {
  createInMemoryUploadFile,
  readUploadFileText,
  snapshotUploadFile,
  UPLOAD_SNAPSHOT_MAX_BYTES,
  uploadFileByteStream,
} from '@/utils/readUploadFile';

describe('readUploadFile', () => {
  it('File 스냅샷 후에도 텍스트를 읽을 수 있다', async () => {
    const original = new File(['x,y,z\n1,2,3'], 'grid.csv', { type: 'text/csv' });
    const snapshotted = await snapshotUploadFile(original);
    const text = await readUploadFileText(snapshotted);
    expect(text).toContain('x,y,z');
    expect(text).toContain('1,2,3');
  });

  it('createInMemoryUploadFile 로 만든 File 은 즉시 읽을 수 있다', async () => {
    const file = createInMemoryUploadFile('a,b,c\n1,2,3', 'demo.csv');
    const text = await readUploadFileText(file);
    expect(text).toContain('a,b,c');
  });

  it('대용량 File 은 스냅샷 시 디스크 참조를 그대로 반환한다', async () => {
    const large = new File([new Uint8Array(UPLOAD_SNAPSHOT_MAX_BYTES + 1)], 'big.csv', {
      type: 'text/csv',
    });
    const snapshotted = await snapshotUploadFile(large);
    expect(snapshotted).toBe(large);
  });

  it('stream() 없는 File 도 청크 스트림으로 읽을 수 있다', async () => {
    const payload = 'x y z u v w scrdif\n1 2 3 4 5 6 7\n';
    const file = new File([payload], 'grid.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'stream', { value: undefined });

    const reader = uploadFileByteStream(file).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const text = new TextDecoder().decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.length + chunk.length);
        merged.set(acc);
        merged.set(chunk, acc.length);
        return merged;
      }, new Uint8Array()),
    );
    expect(text).toContain('x y z u v w scrdif');
    expect(text).toContain('1 2 3 4 5 6 7');
  });
});
