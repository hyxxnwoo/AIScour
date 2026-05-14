/**
 * build-manifest: ScourSeries → 프레임 단위 바이너리 + manifest.json 생성기
 *
 * 사용 예:
 *   npm run data:build-manifest -- --out storage/flow3d/processed/demo --frames 90
 *
 * 산출물 구조:
 *   <outDir>/terrain.bin                Float32 (width*height) — 베이스 표고
 *   <outDir>/frames/<NNNN>.bin          Float32 (width*height) — 각 프레임 deltaElevations
 *   <outDir>/manifest.json              메타데이터 + 프레임 인덱스
 *
 * 추후 실제 FLOW-3D 어댑터가 준비되면 SyntheticScourSource 만 교체하면 된다.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv } from 'node:process';
import { SyntheticScourSource } from '../src/data/SyntheticScourSource.ts';
import type { ScourFrame, ScourSeries } from '../src/types/terrain.ts';

interface CliArgs {
  outDir: string;
  width: number;
  height: number;
  frames: number;
  cellSize: number;
  intervalSeconds: number;
}

function parseArgs(args: string[]): CliArgs {
  const defaults: CliArgs = {
    outDir: 'storage/flow3d/processed/demo',
    width: 96,
    height: 96,
    frames: 90,
    cellSize: 0.5,
    intervalSeconds: 1,
  };
  const opts: CliArgs = { ...defaults };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case '--out':
        if (next) {
          opts.outDir = next;
          i += 1;
        }
        break;
      case '--width':
        if (next) {
          opts.width = Number(next);
          i += 1;
        }
        break;
      case '--height':
        if (next) {
          opts.height = Number(next);
          i += 1;
        }
        break;
      case '--frames':
        if (next) {
          opts.frames = Number(next);
          i += 1;
        }
        break;
      case '--cell':
        if (next) {
          opts.cellSize = Number(next);
          i += 1;
        }
        break;
      case '--interval':
        if (next) {
          opts.intervalSeconds = Number(next);
          i += 1;
        }
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          console.warn(`알 수 없는 옵션: ${arg}`);
        }
    }
  }
  return opts;
}

function printUsage(): void {
  console.info(`
사용법: build-manifest [options]
  --out <dir>           산출물 디렉토리 (기본: storage/flow3d/processed/demo)
  --width <n>           격자 가로 정점 수 (기본: 96)
  --height <n>          격자 세로 정점 수 (기본: 96)
  --frames <n>          프레임 수 (기본: 90)
  --cell <m>            격자 한 칸 길이(m) (기본: 0.5)
  --interval <s>        프레임 간 시간 간격(s) (기본: 1)
`);
}

async function loadSeries(opts: CliArgs): Promise<ScourSeries> {
  const source = new SyntheticScourSource({
    width: opts.width,
    height: opts.height,
    cellSize: opts.cellSize,
    frameCount: opts.frames,
    frameIntervalSeconds: opts.intervalSeconds,
  });
  return source.load();
}

function pad(n: number, width: number): string {
  const s = String(n);
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

async function writeFrames(
  outDir: string,
  frames: ScourFrame[],
): Promise<Array<{ index: number; file: string; timestampSeconds: number; bytes: number }>> {
  const framesDir = join(outDir, 'frames');
  await mkdir(framesDir, { recursive: true });
  const padWidth = String(frames.length).length;
  const entries: Array<{ index: number; file: string; timestampSeconds: number; bytes: number }> =
    [];
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    const file = `frames/${pad(i, padWidth)}.bin`;
    const buf = Buffer.from(
      frame.deltaElevations.buffer,
      frame.deltaElevations.byteOffset,
      frame.deltaElevations.byteLength,
    );
    await writeFile(join(outDir, file), buf);
    entries.push({
      index: i,
      file,
      timestampSeconds: frame.timestampSeconds,
      bytes: buf.byteLength,
    });
  }
  return entries;
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(here, '..');
  const opts = parseArgs(argv.slice(2));
  const outDir = resolve(projectRoot, opts.outDir);

  console.info(`[build-manifest] 출력 디렉토리: ${outDir}`);
  await mkdir(outDir, { recursive: true });

  const series = await loadSeries(opts);
  const { baseTerrain, frames } = series;

  // 베이스 표고 바이너리
  const terrainBuf = Buffer.from(
    baseTerrain.elevations.buffer,
    baseTerrain.elevations.byteOffset,
    baseTerrain.elevations.byteLength,
  );
  await writeFile(join(outDir, 'terrain.bin'), terrainBuf);

  const frameEntries = await writeFrames(outDir, frames);

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    grid: {
      width: baseTerrain.width,
      height: baseTerrain.height,
      cellSize: baseTerrain.cellSize,
    },
    metadata: baseTerrain.metadata ?? null,
    terrain: {
      file: 'terrain.bin',
      dtype: 'float32',
      length: baseTerrain.elevations.length,
      bytes: terrainBuf.byteLength,
    },
    frames: {
      count: frames.length,
      dtype: 'float32',
      length: baseTerrain.width * baseTerrain.height,
      entries: frameEntries,
    },
  };
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.info(
    `[build-manifest] 완료: terrain.bin (${terrainBuf.byteLength}B) + ${frames.length} frames + manifest.json`,
  );
}

main().catch((err: unknown) => {
  console.error('[build-manifest] 실패:', err);
  process.exit(1);
});
