import type { CsvLoadProgress } from '@/data/loadScourFromCsvFiles';

/** 파일/행 기준으로 0–100 진행률을 계산한다. */
export function computeCsvProgressPct(progress: CsvLoadProgress): number {
  if (progress.fileSize > 0) {
    const withinFile = progress.bytesRead / progress.fileSize;
    if (progress.fileCount > 1) {
      const slice = 1 / progress.fileCount;
      const base = progress.fileIndex * slice;
      return Math.min(100, (base + withinFile * slice) * 100);
    }
    return Math.min(100, withinFile * 100);
  }

  if (
    progress.totalRows !== undefined &&
    progress.totalRows > 0 &&
    progress.rowsParsed !== undefined
  ) {
    return Math.min(100, (progress.rowsParsed / progress.totalRows) * 100);
  }

  return 0;
}
