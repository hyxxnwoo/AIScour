/**
 * grid CSV 한 줄을 토큰으로 분리한다.
 * 쉼표/세미콜론 구분 시 끝에 오는 빈 셀(후행 구분자)을 보존한다.
 */
export function tokenizeGridLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  if (trimmed.includes('"')) {
    return tokenizeQuotedCsvLine(trimmed);
  }

  const commaCount = (trimmed.match(/,/g) ?? []).length;
  const semiCount = (trimmed.match(/;/g) ?? []).length;

  if (commaCount > 0 && commaCount >= semiCount) {
    return trimmed.split(',').map((t) => t.trim());
  }
  if (semiCount > 0) {
    return trimmed.split(';').map((t) => t.trim());
  }

  return trimmed.split(/[\s\t]+/).filter((t) => t.length > 0);
}

function tokenizeQuotedCsvLine(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (ch === ',' || ch === ';')) {
      tokens.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }

  tokens.push(current.trim());
  return tokens;
}

export function isNumericGridToken(token: string): boolean {
  if (token === '') return true;
  return Number.isFinite(Number(token));
}

/** 숫자 데이터 행이 아니면 헤더/메타로 간주하고 건너뛴다. */
export function isNumericDataRow(tokens: string[]): boolean {
  return tokens.length > 0 && tokens.every(isNumericGridToken);
}

/** A열(첫 번째 유효 값)만 숫자인 단일 컬럼 행인지 확인한다. */
export function isColumnarDataRow(tokens: string[]): boolean {
  const significant = tokens.filter((t) => t !== '');
  return significant.length === 1 && isNumericGridToken(significant[0]);
}

/** 2열 이상 숫자가 있는 2D 격자 행인지 확인한다. */
export function isMatrixDataRow(tokens: string[]): boolean {
  const significant = tokens.filter((t) => t !== '');
  return significant.length >= 2 && significant.every(isNumericGridToken);
}

export function firstColumnToken(tokens: string[]): string | null {
  const significant = tokens.filter((t) => t !== '');
  return significant[0] ?? null;
}

/**
 * 행 인덱스 열 제거 + 부족한 trailing 열을 0 으로 패딩한다.
 */
export function normalizeRowTokens(tokens: string[], row: number, width: number): string[] {
  let normalized = [...tokens];

  if (normalized.length === width + 1) {
    const lead = Number(normalized[0]);
    if (Number.isInteger(lead) && lead === row) {
      normalized = normalized.slice(1);
    }
  }

  while (normalized.length < width) {
    normalized.push('0');
  }

  return normalized;
}
