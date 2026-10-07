export type ScreenId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type ScreenChangeListener = (screen: ScreenId, prev: ScreenId) => void;

const HASH_PREFIX = 's/';

export function isViewerScreen(id: ScreenId): id is 4 | 5 | 6 | 7 | 8 | 9 {
  return id >= 4 && id <= 9;
}

export const SCREEN_TITLES: Record<ScreenId, string> = {
  1: '로그인',
  2: '케이스관리',
  3: '데이터연동',
  4: '조건설정',
  5: '3D세굴가시화',
  6: '평면뷰단면',
  7: '등급하상',
  8: '타임라인시계열',
  9: '위험판정',
  10: '경보SOP',
};

function parseScreenId(raw: string | null): ScreenId | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (n >= 1 && n <= 10) return n as ScreenId;
  return null;
}

function readHashScreen(): ScreenId | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash.startsWith(HASH_PREFIX)) return null;
  return parseScreenId(hash.slice(HASH_PREFIX.length));
}

/** 화면 번호 1~10 라우팅. location.hash `#s/5` 와 동기화 */
export class ScreenRouter {
  private current: ScreenId;
  private readonly listeners = new Set<ScreenChangeListener>();

  public constructor(initial: ScreenId = 5) {
    this.current = readHashScreen() ?? initial;
    window.addEventListener('hashchange', this.onHashChange);
    this.syncHash(false);
  }

  public get screen(): ScreenId {
    return this.current;
  }

  public goto(next: ScreenId): void {
    if (next === this.current) return;
    const prev = this.current;
    this.current = next;
    this.syncHash(true);
    this.emit(prev);
  }

  public subscribe(listener: ScreenChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.current, this.current);
    return () => this.listeners.delete(listener);
  }

  public dispose(): void {
    window.removeEventListener('hashchange', this.onHashChange);
    this.listeners.clear();
  }

  private onHashChange = (): void => {
    const fromHash = readHashScreen();
    if (fromHash === null || fromHash === this.current) return;
    const prev = this.current;
    this.current = fromHash;
    this.emit(prev);
  };

  private syncHash(replace: boolean): void {
    const target = `#${HASH_PREFIX}${this.current}`;
    if (window.location.hash === target) return;
    if (replace) {
      window.history.replaceState(null, '', target);
    } else {
      window.location.hash = target;
    }
  }

  private emit(prev: ScreenId): void {
    for (const cb of this.listeners) cb(this.current, prev);
  }
}
