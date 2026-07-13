const STREAM_CHUNK_BYTES = 256 * 1024;

/** 이 크기 초과 File 은 통째로 ArrayBuffer 로 복사하지 않는다 (스트리밍 파싱). */
export const UPLOAD_SNAPSHOT_MAX_BYTES = 512 * 1024;

/** 이 크기 초과 File 은 readUploadFileText 로 통째로 읽지 않는다. */
export const UPLOAD_TEXT_READ_MAX_BYTES = 512 * 1024;

function inferUploadMimeType(name: string): string {
  if (/\.json$/i.test(name)) return 'application/json';
  if (/\.csv$/i.test(name)) return 'text/csv';
  return 'application/octet-stream';
}

function isNotReadableError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'NotReadableError') return true;
  if (err instanceof Error) {
    return /could not be read|permission problems|NotReadableError|Failed to fetch/i.test(
      err.message,
    );
  }
  return false;
}

function preserveReadError(current: unknown, candidate: unknown): unknown {
  if (current instanceof DOMException) return current;
  if (candidate instanceof DOMException) return candidate;
  if (isNotReadableError(current)) return current;
  if (isNotReadableError(candidate)) return candidate;
  return candidate ?? current;
}

function normalizeFileReadError(err: unknown): Error {
  if (!(err instanceof DOMException) && !(err instanceof Error)) {
    return new Error('파일을 읽을 수 없습니다.');
  }
  const name = err instanceof DOMException ? err.name : (err as Error).name;
  const message = err instanceof Error ? err.message : String(err);
  if (isNotReadableError(err)) {
    return new Error(
      '파일을 읽을 수 없습니다. Excel 등 다른 프로그램에서 파일이 열려 있으면 닫고, PC 로컬 폴더(예: 바탕화면·다운로드)에 복사한 뒤 다시 선택해 주세요. OneDrive는 「항상 이 디바이스에 유지」가 필요합니다.',
    );
  }
  if (
    name === 'QuotaExceededError' ||
    /out of memory|allocation failed|Array buffer allocation/i.test(message)
  ) {
    return new Error(
      '파일이 너무 커서 브라우저 메모리 한도를 초과했습니다. 더 작은 CSV로 나누거나 flscon/격자 형식을 사용해 주세요.',
    );
  }
  return err instanceof Error ? err : new Error(message);
}

function fileReaderAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) {
        resolve(result);
        return;
      }
      reject(new Error('FileReader did not return ArrayBuffer'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsArrayBuffer(blob);
  });
}

function fileReaderAsText(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsText(blob);
  });
}

async function readViaFetchBlob(blob: Blob): Promise<ArrayBuffer> {
  const url = URL.createObjectURL(blob);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`fetch(blob:) failed: ${res.status}`);
    }
    return await res.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readViaBlobStream(blob: Blob): Promise<ArrayBuffer> {
  const withStream = blob as Blob & { stream?: () => ReadableStream<Uint8Array> };
  if (typeof withStream.stream !== 'function') {
    throw new Error('Blob.stream is not supported');
  }
  return new Response(withStream.stream()).arrayBuffer();
}

/** Blob/File 읽기 — arrayBuffer() → stream → FileReader → fetch(blob:) 순으로 시도. */
async function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  const attempts: Blob[] = [blob];
  if (typeof blob.slice === 'function' && blob.size > 0) {
    attempts.push(blob.slice(0, blob.size, blob.type));
  }

  let lastErr: unknown;
  for (const target of attempts) {
    const withArrayBuffer = target as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
    if (typeof withArrayBuffer.arrayBuffer === 'function') {
      try {
        return await withArrayBuffer.arrayBuffer();
      } catch (err: unknown) {
        lastErr = preserveReadError(lastErr, err);
      }
    }

    try {
      return await readViaBlobStream(target);
    } catch (err: unknown) {
      lastErr = preserveReadError(lastErr, err);
    }

    try {
      return await fileReaderAsArrayBuffer(target);
    } catch (err: unknown) {
      lastErr = preserveReadError(lastErr, err);
    }

    try {
      return await readViaFetchBlob(target);
    } catch (err: unknown) {
      lastErr = preserveReadError(lastErr, err);
    }
  }

  throw normalizeFileReadError(lastErr);
}

async function readBlobAsText(blob: Blob): Promise<string> {
  const attempts: Blob[] = [blob];
  if (typeof blob.slice === 'function' && blob.size > 0) {
    attempts.push(blob.slice(0, blob.size, blob.type));
  }

  let lastErr: unknown;
  for (const target of attempts) {
    const withText = target as Blob & { text?: () => Promise<string> };
    if (typeof withText.text === 'function') {
      try {
        return await withText.text();
      } catch (err: unknown) {
        lastErr = preserveReadError(lastErr, err);
      }
    }

    try {
      return await fileReaderAsText(target);
    } catch (err: unknown) {
      lastErr = preserveReadError(lastErr, err);
    }
  }

  try {
    const buf = await readBlobAsArrayBuffer(blob);
    return new TextDecoder().decode(buf);
  } catch (err: unknown) {
    if (blob.size > UPLOAD_TEXT_READ_MAX_BYTES) {
      throw normalizeFileReadError(lastErr ?? err);
    }
    throw normalizeFileReadError(preserveReadError(lastErr, err));
  }
}

/** 업로드 File/Blob 텍스트 읽기. 대용량 File 은 스트리밍 파서를 사용할 것. */
export async function readUploadFileText(file: File | Blob): Promise<string> {
  if (file.size > UPLOAD_TEXT_READ_MAX_BYTES) {
    throw normalizeFileReadError(
      new Error('Array buffer allocation failed: file too large for readUploadFileText'),
    );
  }
  try {
    return await readBlobAsText(file);
  } catch (err: unknown) {
    throw normalizeFileReadError(err);
  }
}

/** fetch 로 받은 텍스트를 메모리 File 로 만든다 (디스크 읽기 우회). */
export function createInMemoryUploadFile(
  text: string,
  name: string,
  type = 'text/csv',
): File {
  return new File([text], name, { type });
}

/**
 * input[type=file] 에서 받은 File 을 메모리로 복사한다.
 * UPLOAD_SNAPSHOT_MAX_BYTES 초과 File 은 디스크 참조를 그대로 반환한다.
 */
export async function snapshotUploadFile(file: File): Promise<File> {
  if (file.size > UPLOAD_SNAPSHOT_MAX_BYTES) {
    return file;
  }
  const data = await readBlobAsArrayBuffer(file);
  return new File([data], file.name, {
    type: file.type || inferUploadMimeType(file.name),
    lastModified: file.lastModified,
  });
}

/** 여러 업로드 File 을 메모리 스냅샷으로 복사한다. */
export async function snapshotUploadFiles(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) {
    out.push(await snapshotUploadFile(file));
  }
  return out;
}

/** File 앞부분만 텍스트로 읽는다. */
export async function readUploadFilePrefix(file: File, maxBytes: number): Promise<string> {
  const limit = Math.min(file.size, maxBytes);
  if (typeof file.slice === 'function' && file.size > limit) {
    return readUploadFileText(file.slice(0, limit, file.type));
  }
  if (file.size > UPLOAD_TEXT_READ_MAX_BYTES) {
    return readUploadFileText(file.slice(0, limit, file.type));
  }
  return readUploadFileText(file);
}

async function readChunkArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  const withArrayBuffer = blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof withArrayBuffer.arrayBuffer === 'function') {
    return withArrayBuffer.arrayBuffer();
  }
  return fileReaderAsArrayBuffer(blob);
}

/** Blob/File 을 고정 크기 청크로 순차 읽는다 (전체 ArrayBuffer 할당 없음). */
function uploadFileChunkedStream(file: File | Blob): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= file.size) {
        controller.close();
        return;
      }
      const end = Math.min(offset + STREAM_CHUNK_BYTES, file.size);
      const slice = file.slice(offset, end, file.type);
      offset = end;
      try {
        const buf = await readChunkArrayBuffer(slice);
        controller.enqueue(new Uint8Array(buf));
      } catch (err: unknown) {
        controller.error(normalizeFileReadError(err));
      }
    },
  });
}

/**
 * 업로드 File 바이트 스트림.
 * native stream() 우선, 없거나 실패 시 slice 청크 읽기(대용량 안전).
 */
export function uploadFileByteStream(file: File | Blob): ReadableStream<Uint8Array> {
  const withStream = file as Blob & { stream?: () => ReadableStream<Uint8Array> };
  if (typeof withStream.stream === 'function') {
    try {
      return withStream.stream();
    } catch {
      return uploadFileChunkedStream(file);
    }
  }
  return uploadFileChunkedStream(file);
}
