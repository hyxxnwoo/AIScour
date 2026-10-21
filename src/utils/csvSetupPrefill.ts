import type { CsvSetupSelection } from '@/components/CsvSetupModal';
import { MAX_CSV_CASES } from '@/data/loadCsvDashboard';
import type { BridgeType } from '@/types/simParams';

export function filterCsvUploadFiles(files: File[]): File[] {
  return files.filter((f) => f.name.toLowerCase().endsWith('.csv') || f.type.includes('csv'));
}

export interface CsvSetupPrefillDefaults {
  pierCount?: 1 | 2 | 3;
  bridgeEnabled?: boolean;
  bridgeType?: BridgeType;
}

/** 2번 허브 등에서 넘긴 CSV → 4번 「CSV 선택」 모달 초기값. 파일명 순(s01, s02, …)으로 정렬한다. */
export function buildCsvSetupPrefill(
  files: File[],
  defaults: CsvSetupPrefillDefaults = {},
): CsvSetupSelection {
  const csv = filterCsvUploadFiles(files)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .slice(0, MAX_CSV_CASES);

  return {
    pierCount: defaults.pierCount ?? 3,
    bridgeEnabled: defaults.bridgeEnabled ?? true,
    bridgeType: defaults.bridgeType ?? 'girder',
    files: csv,
  };
}
