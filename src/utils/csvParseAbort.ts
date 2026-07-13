export class CsvParseAbortError extends Error {
  public constructor(message = 'CSV 파싱이 중지되었습니다.') {
    super(message);
    this.name = 'CsvParseAbortError';
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CsvParseAbortError();
  }
}

export function isCsvParseAbortError(err: unknown): err is CsvParseAbortError {
  return err instanceof CsvParseAbortError;
}
