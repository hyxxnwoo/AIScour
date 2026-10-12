import type { CsvSetupSelection } from '@/components/CsvSetupModal';
import type { BridgeType } from '@/types/simParams';

export function filterCsvUploadFiles(files: File[]): File[] {
  return files.filter((f) => f.name.toLowerCase().endsWith('.csv') || f.type.includes('csv'));
}

/** 파일명 P1/P2/P3 힌트 → 슬롯 인덱스 (0-based) */
export function pierSlotIndexFromFileName(fileName: string): number | null {
  const base = fileName.replace(/\\/g, '/').split('/').pop() ?? fileName;
  const tagged = base.match(/(?:^|[_\-.])p([123])(?:[_\-.]|$)/i) ?? base.match(/\bP([123])\b/);
  if (!tagged) return null;
  const idx = Number(tagged[1]) - 1;
  return idx >= 0 && idx <= 2 ? idx : null;
}

export interface CsvSetupPrefillDefaults {
  pierCount?: 1 | 2 | 3;
  bridgeEnabled?: boolean;
  bridgeType?: BridgeType;
}

/** 2번 허브 등에서 넘긴 CSV → 4번 「CSV 선택」 모달 초기값 */
export function buildCsvSetupPrefill(
  files: File[],
  defaults: CsvSetupPrefillDefaults = {},
): CsvSetupSelection {
  const csv = filterCsvUploadFiles(files);
  const slots: Array<File | null> = [null, null, null];

  for (const file of csv) {
    const idx = pierSlotIndexFromFileName(file.name);
    if (idx !== null && slots[idx] === null) {
      slots[idx] = file;
    }
  }
  for (const file of csv) {
    if (slots.includes(file)) continue;
    const empty = slots.findIndex((s) => s === null);
    if (empty === -1) break;
    slots[empty] = file;
  }

  const filledCount = slots.filter(Boolean).length;
  const highestUsed = slots.reduce((max, s, i) => (s ? Math.max(max, i + 1) : max), 0);
  const inferredCount = Math.min(3, Math.max(1, filledCount || csv.length, highestUsed)) as
    | 1
    | 2
    | 3;

  const pierCount = defaults.pierCount ?? inferredCount;

  return {
    pierCount,
    bridgeEnabled: defaults.bridgeEnabled ?? true,
    bridgeType: defaults.bridgeType ?? 'girder',
    files: slots,
  };
}
