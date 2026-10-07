/** 2번 → 4번으로 넘기는 CSV (세션 내 1회 소비) */
let pendingFiles: File[] | null = null;

export function stageCsvForConditionSetup(files: File[]): void {
  pendingFiles = files.length > 0 ? [...files] : null;
}

export function takePendingCsvUpload(): File[] | null {
  const out = pendingFiles;
  pendingFiles = null;
  return out;
}

export function peekPendingCsvUpload(): File[] | null {
  return pendingFiles;
}
