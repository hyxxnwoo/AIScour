import { throwIfAborted } from '@/utils/csvParseAbort';
import { readUploadFilePrefix, uploadFileByteStream } from '@/utils/readUploadFile';
import {
  FLOW3D_VARIABLE_DEFS,
  isFlow3dMetaLabel,
  normalizeFlow3dVariableId,
} from '@/data/flow3dVariableDefs';
import {
  firstColumnToken,
  isColumnarDataRow,
  isMatrixDataRow,
  tokenizeGridLine,
} from '@/utils/gridCsvTokens';
import { isSkippableCsvLine } from '@/utils/streamGridCsv';
import { yieldToMain } from '@/utils/yieldToMain';

const YIELD_EVERY_LINES = 64;

export interface ParsedFlow3dVariable {
  id: string;
  label: string;
  unit: string;
  values: Float32Array;
}

export interface Flow3dVariableCsvProgress {
  bytesRead: number;
  fileSize: number;
  valuesParsed: number;
  currentVariable: string;
}

export interface ParseFlow3dVariableCsvOptions {
  signal?: AbortSignal;
  onProgress?: (p: Flow3dVariableCsvProgress) => void;
  expectedCellCount?: number;
}

type MetaKind = 'varname' | 'quantity' | 'unit' | null;

interface VariableBuilder {
  id: string;
  label: string;
  unit: string;
  values: number[];
}

function detectMetaKind(firstToken: string): MetaKind {
  const t = firstToken.toLowerCase().replace(/\s+/g, '');
  if (t.includes('변수명')) return 'varname';
  if (t.includes('물리량단위') || t === '단위') return 'unit';
  if (t.includes('물리량')) return 'quantity';
  return null;
}

function flushBuilder(
  builders: Map<string, VariableBuilder>,
  builder: VariableBuilder | null,
): VariableBuilder | null {
  if (!builder) return null;
  builders.set(builder.id, builder);
  return null;
}

function startBuilder(id: string, label?: string, unit?: string): VariableBuilder {
  const def = FLOW3D_VARIABLE_DEFS[id];
  return {
    id,
    label: label ?? def?.label ?? id,
    unit: unit ?? def?.defaultUnit ?? '',
    values: [],
  };
}

/** 첫 수 KB 를 읽어 FLOW-3D 다변수 CSV 인지 판별한다. */
export async function isFlow3dVariableCsv(file: File): Promise<boolean> {
  const sample = await readUploadFilePrefix(file, 64 * 1024);
  const lines = sample.split(/\r?\n/).slice(0, 80);
  let metaHits = 0;
  let knownVars = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const tokens = tokenizeGridLine(line);
    if (tokens.length === 0) continue;

    if (isFlow3dMetaLabel(tokens[0])) {
      metaHits += 1;
    }
    for (const token of tokens) {
      if (normalizeFlow3dVariableId(token)) knownVars += 1;
    }
  }

  return metaHits >= 1 && knownVars >= 1;
}

/**
 * FLOW-3D 다변수 CSV 파서.
 * - 섹션형: 변수명/물리량/단위 메타 후 A열 값 블록
 * - 와이드형: 변수명 헤더 행 + 각 데이터 행에 다열 값
 */
export async function parseFlow3dVariableCsv(
  file: File,
  options: ParseFlow3dVariableCsvOptions = {},
): Promise<ParsedFlow3dVariable[]> {
  throwIfAborted(options.signal);

  const builders = new Map<string, VariableBuilder>();
  let current: VariableBuilder | null = null;
  let wideColumns: string[] | null = null;
  let pendingVarName = false;
  let pendingUnit = false;
  let pendingQuantity = false;
  let bytesRead = 0;
  let linesSinceYield = 0;
  let valuesParsed = 0;

  const reader = uploadFileByteStream(file).pipeThrough(new TextDecoderStream()).getReader();
  const signal = options.signal;
  let buffer = '';

  const onAbort = (): void => {
    void reader.cancel();
  };
  signal?.addEventListener('abort', onAbort);

  const report = (): void => {
    options.onProgress?.({
      bytesRead,
      fileSize: file.size,
      valuesParsed,
      currentVariable: current?.id ?? wideColumns?.[0] ?? '',
    });
  };

  const appendValue = (varId: string, value: number): void => {
    if (!builders.has(varId) && current?.id !== varId) {
      current = flushBuilder(builders, current);
      current = startBuilder(varId);
    }
    const target = current?.id === varId ? current : builders.get(varId);
    if (!target) return;
    target.values.push(value);
    valuesParsed += 1;
  };

  const processLine = (rawLine: string): void => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (isSkippableCsvLine(line)) return;

    const tokens = tokenizeGridLine(line);
    if (tokens.length === 0) return;

    const metaKind = detectMetaKind(tokens[0]);

    if (pendingVarName) {
      const id = normalizeFlow3dVariableId(tokens[0]);
      if (id) {
        current = flushBuilder(builders, current);
        current = startBuilder(id);
        pendingVarName = false;
        return;
      }
      pendingVarName = false;
    }

    if (pendingUnit && current) {
      const unitToken = tokens.find((t) => t !== '') ?? '';
      if (unitToken && !isFlow3dMetaLabel(unitToken)) {
        current.unit = unitToken;
      }
      pendingUnit = false;
      return;
    }

    if (pendingQuantity && current) {
      const labelToken = tokens.find((t) => t !== '') ?? '';
      if (labelToken && !isFlow3dMetaLabel(labelToken)) {
        current.label = labelToken;
      }
      pendingQuantity = false;
      return;
    }

    if (metaKind === 'varname') {
      const ids = tokens
        .slice(1)
        .map((t) => normalizeFlow3dVariableId(t))
        .filter((id): id is string => id !== null);

      if (ids.length > 1) {
        wideColumns = ids;
        current = flushBuilder(builders, current);
        return;
      }

      if (ids.length === 1) {
        current = flushBuilder(builders, current);
        current = startBuilder(ids[0]);
        return;
      }

      pendingVarName = true;
      return;
    }

    if (metaKind === 'unit') {
      const units = tokens.slice(1).filter((t) => t !== '');
      if (wideColumns && units.length > 0) {
        wideColumns.forEach((id, i) => {
          if (!builders.has(id)) builders.set(id, startBuilder(id, undefined, units[i]));
          else if (units[i]) builders.get(id)!.unit = units[i];
        });
        return;
      }
      if (units.length === 1 && current) {
        current.unit = units[0];
        return;
      }
      pendingUnit = true;
      return;
    }

    if (metaKind === 'quantity') {
      const labels = tokens.slice(1).filter((t) => t !== '');
      if (labels.length === 1 && current) {
        current.label = labels[0];
        return;
      }
      pendingQuantity = true;
      return;
    }

    if (wideColumns && isMatrixDataRow(tokens)) {
      wideColumns.forEach((id, i) => {
        const v = Number(tokens[i]);
        if (!Number.isNaN(v)) appendValue(id, v);
      });
      if (!current) {
        current = builders.get(wideColumns[0]) ?? null;
      }
      return;
    }

    if (isColumnarDataRow(tokens)) {
      const token = firstColumnToken(tokens);
      if (token === null) return;
      const v = Number(token);
      if (Number.isNaN(v)) return;

      if (!current) {
        throw new Error(
          `parseFlow3dVariableCsv: 값(${v}) 앞에 변수명(변수명추정) 행이 없습니다.`,
        );
      }
      current.values.push(v);
      valuesParsed += 1;
      return;
    }

    const loneId = normalizeFlow3dVariableId(tokens[0]);
    if (loneId && tokens.length === 1) {
      current = flushBuilder(builders, current);
      current = startBuilder(loneId);
    }
  };

  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      throwIfAborted(signal);
      if (done) break;
      bytesRead += value.length;
      buffer += value;

      let newlineIdx = buffer.indexOf('\n');
      while (newlineIdx !== -1) {
        throwIfAborted(signal);
        processLine(buffer.slice(0, newlineIdx));
        buffer = buffer.slice(newlineIdx + 1);
        newlineIdx = buffer.indexOf('\n');

        linesSinceYield += 1;
        if (linesSinceYield >= YIELD_EVERY_LINES) {
          linesSinceYield = 0;
          report();
          await yieldToMain();
        }
      }
      report();
      await yieldToMain();
    }

    if (buffer.length > 0) {
      processLine(buffer);
    }

    flushBuilder(builders, current);

    const result: ParsedFlow3dVariable[] = [];
    for (const builder of builders.values()) {
      if (builder.values.length === 0) continue;
      if (
        options.expectedCellCount !== undefined &&
        builder.values.length !== options.expectedCellCount
      ) {
        throw new Error(
          `parseFlow3dVariableCsv: ${builder.id} 값 개수(${builder.values.length})가 격자 셀 수(${options.expectedCellCount})와 일치하지 않습니다.`,
        );
      }
      result.push({
        id: builder.id,
        label: builder.label,
        unit: builder.unit,
        values: Float32Array.from(builder.values),
      });
    }

    if (result.length === 0) {
      throw new Error('parseFlow3dVariableCsv: 인식된 FLOW-3D 변수가 없습니다.');
    }

    result.sort((a, b) => a.id.localeCompare(b.id));
    return result;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}
