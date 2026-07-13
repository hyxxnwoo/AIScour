import { normalizeFlow3dVariableId, isFlow3dMetaLabel } from '@/data/flow3dVariableDefs';
import { isNumericGridToken, tokenizeGridLine } from '@/utils/gridCsvTokens';
import { isSkippableCsvLine } from '@/utils/streamGridCsv';

export type CoordAxis = 'x' | 'y' | 'z';

export interface XyzVariableColumn {
  id: string;
  col: number;
  label: string;
}

export interface XyzCsvColumnLayout {
  xCol: number;
  yCol: number;
  zCol: number;
  variableCols: XyzVariableColumn[];
  /** true 이면 헤더 없이 첫 데이터 행에서 열을 추정했다. */
  headerless?: boolean;
}
  
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function normalizeHeaderToken(token: string): string {
  return stripBom(token)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/[()[\]{}]/g, '')
    .replace(/\[.*?\]/g, '');
}

function axisFromHeader(token: string): CoordAxis | null {
  const compact = normalizeHeaderToken(token);
  if (!compact) return null;

  const xPatterns = [
    'x',
    'xcoord',
    'xcoordinate',
    'coordx',
    'positionx',
    'nodex',
    'gridx',
    'xpos',
    'xgrid',
    'i',
  ];
  const yPatterns = [
    'y',
    'ycoord',
    'ycoordinate',
    'coordy',
    'positiony',
    'nodey',
    'gridy',
    'ypos',
    'ygrid',
    'j',
  ];
  const zPatterns = [
    'z',
    'zcoord',
    'zcoordinate',
    'coordz',
    'positionz',
    'nodez',
    'gridz',
    'zpos',
    'zgrid',
    'k',
  ];

  if (
    xPatterns.includes(compact) ||
    compact.startsWith('x좌표') ||
    compact.startsWith('x위치') ||
    compact.startsWith('좌표x') ||
    compact.endsWith('x좌표')
  ) {
    return 'x';
  }
  if (
    yPatterns.includes(compact) ||
    compact.startsWith('y좌표') ||
    compact.startsWith('y위치') ||
    compact.startsWith('좌표y') ||
    compact.endsWith('y좌표')
  ) {
    return 'y';
  }
  if (
    zPatterns.includes(compact) ||
    compact.startsWith('z좌표') ||
    compact.startsWith('z위치') ||
    compact.startsWith('좌표z') ||
    compact.endsWith('z좌표')
  ) {
    return 'z';
  }

  const raw = stripBom(token).trim();
  if (/^x(\s|\(|$|_|-)/i.test(raw)) return 'x';
  if (/^y(\s|\(|$|_|-)/i.test(raw)) return 'y';
  if (/^z(\s|\(|$|_|-)/i.test(raw)) return 'z';

  return null;
}

/** 알 수 없는 열 이름 → 안전한 id (col3 등). */
export function slugifyXyzColumnId(raw: string, col: number): string {
  const known = normalizeFlow3dVariableId(raw);
  if (known) return known;

  const compact = normalizeHeaderToken(raw);
  if (compact === 'u') return 'ux';
  if (compact === 'v') return 'vy';
  if (compact === 'w') return 'vz';

  const slug = stripBom(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_]+/gu, '')
    .slice(0, 48);
  if (slug.length > 0) return slug;
  return `col${col}`;
}

function isLikelyXyzMetaLine(tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const first = stripBom(tokens[0]);
  if (isFlow3dMetaLabel(first)) return true;
  const lower = first.toLowerCase();
  if (lower.includes('변수명') || lower.includes('물리량')) return true;
  return false;
}

/** 숫자만 있는 행에서 x=0,y=1,z=2, 나머지=유체량 으로 추정한다. */
export function inferXyzLayoutFromDataRow(tokens: string[]): XyzCsvColumnLayout | null {
  if (tokens.length < 4) return null;
  if (!tokens.slice(0, 3).every((t) => isNumericGridToken(t))) return null;
  if (!tokens.slice(3).every((t) => isNumericGridToken(t))) return null;

  return {
    xCol: 0,
    yCol: 1,
    zCol: 2,
    variableCols: tokens.slice(3).map((_, i) => {
      const col = i + 3;
      return { id: `col${col}`, col, label: `열${col}` };
    }),
    headerless: true,
  };
}

/** 헤더 행에서 x·y·z 열과 유체량 열을 찾는다. */
export function parseXyzCsvHeader(tokens: string[]): XyzCsvColumnLayout | null {
  const cleaned = tokens.map((t) => stripBom(t));
  if (cleaned.length < 4) return null;

  let xCol = -1;
  let yCol = -1;
  let zCol = -1;
  const variableCols: XyzVariableColumn[] = [];

  cleaned.forEach((token, col) => {
    const axis = axisFromHeader(token);
    if (axis === 'x') xCol = col;
    else if (axis === 'y') yCol = col;
    else if (axis === 'z') zCol = col;
    else if (!isNumericGridToken(token)) {
      const id = slugifyXyzColumnId(token, col);
      if (!['x', 'y', 'z'].includes(id)) {
        variableCols.push({ id, col, label: token.trim() });
      }
    }
  });

  if (xCol < 0 || yCol < 0 || zCol < 0 || variableCols.length === 0) {
    return null;
  }

  return { xCol, yCol, zCol, variableCols };
}

/**
 * 여러 줄에서 x·y·z CSV 레이아웃을 찾는다.
 * FLOW-3D 메타 행·숫자 행이 섞여 있어도 끝까지 스캔한다.
 */
export function discoverXyzCsvLayout(lines: Iterable<string>): XyzCsvColumnLayout | null {
  let fallback: XyzCsvColumnLayout | null = null;

  for (const raw of lines) {
    if (isSkippableCsvLine(raw)) continue;
    const tokens = tokenizeGridLine(stripBom(raw.trim()));
    if (tokens.length === 0) continue;

    if (isLikelyXyzMetaLine(tokens)) continue;

    const header = parseXyzCsvHeader(tokens);
    if (header) return header;

    if (!fallback) {
      const inferred = inferXyzLayoutFromDataRow(tokens);
      if (inferred) fallback = inferred;
    }
  }

  return fallback;
}

export function isIntegerCoord(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value - Math.round(value)) < 1e-6 && value >= 0;
}
