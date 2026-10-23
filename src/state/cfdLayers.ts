import { CFD_SETTINGS } from '@/constants/cfdSettings';

// CFD 모드 레이어 토글 상태. 렌더 레이어는 단계별로 붙이므로 `ready` 가 false 인 항목은 UI 에서 잠근다.

export type CfdLayerId =
  | 'bedContour'
  | 'isolines'
  | 'mesh'
  | 'pathlines'
  | 'vectors'
  | 'cutPlane'
  | 'freeSurface'
  | 'bridge';

export interface CfdLayerDef {
  id: CfdLayerId;
  label: string;
  defaultOn: boolean;
  /** 렌더 구현이 연결되어 토글이 실제 화면에 반영되는지 */
  ready: boolean;
  /** 유속 데이터(실데이터 또는 합성 유동장)에 의존하는 레이어 — 합성이면 '목업' 표시 */
  usesFlow: boolean;
  /** 해석 데이터가 있어도 합성 모델이라 항상 '목업' 표시(자유수면 등 데이터에 해당 필드가 없는 레이어) */
  mockAlways?: boolean;
}

export const CFD_LAYERS: readonly CfdLayerDef[] = [
  { id: 'bedContour', label: '하상 컨투어', defaultOn: true, ready: true, usesFlow: false },
  { id: 'isolines', label: '등심선', defaultOn: false, ready: true, usesFlow: false },
  { id: 'mesh', label: '메시', defaultOn: false, ready: true, usesFlow: false },
  { id: 'pathlines', label: '유선', defaultOn: true, ready: true, usesFlow: true },
  { id: 'vectors', label: '벡터', defaultOn: false, ready: true, usesFlow: true },
  { id: 'cutPlane', label: '단면', defaultOn: false, ready: true, usesFlow: true },
  {
    id: 'freeSurface',
    label: '수면',
    defaultOn: true,
    ready: true,
    usesFlow: true,
    mockAlways: true,
  },
  { id: 'bridge', label: '교량', defaultOn: true, ready: true, usesFlow: false },
];

export type CfdLayerListener = () => void;

export class CfdLayerStore {
  private readonly on = new Map<CfdLayerId, boolean>(
    CFD_LAYERS.map((l) => [l.id, l.defaultOn] as const),
  );
  private readonly listeners = new Set<CfdLayerListener>();
  private density: number = CFD_SETTINGS.vectorDensityDefault;
  private opacity: number = CFD_SETTINGS.surfaceOpacityDefault;
  private cutFrac: number | null = null;

  /** 단면 위치(0~1, 영역 안 비율). null 이면 평면·단면 화면의 단면선(선택 교각)에 연동한다. */
  public get cutPosition(): number | null {
    return this.cutFrac;
  }

  public setCutPosition(value: number | null): void {
    const f = value === null ? null : Math.min(1, Math.max(0, value));
    if (f === this.cutFrac) return;
    this.cutFrac = f;
    for (const fn of this.listeners) fn();
  }

  /** 자유수면 투명도(불투명도 0.05~1) */
  public get surfaceOpacity(): number {
    return this.opacity;
  }

  public setSurfaceOpacity(value: number): void {
    const o = Math.min(1, Math.max(0.05, value));
    if (Math.abs(o - this.opacity) < 1e-6) return;
    this.opacity = o;
    for (const fn of this.listeners) fn();
  }

  /** 벡터 글리프 밀도(1~5, 클수록 촘촘) */
  public get vectorDensity(): number {
    return this.density;
  }

  public setVectorDensity(value: number): void {
    const d = Math.round(
      Math.min(CFD_SETTINGS.vectorDensityMax, Math.max(CFD_SETTINGS.vectorDensityMin, value)),
    );
    if (d === this.density) return;
    this.density = d;
    for (const fn of this.listeners) fn();
  }

  public isOn(id: CfdLayerId): boolean {
    return this.on.get(id) ?? false;
  }

  public set(id: CfdLayerId, value: boolean): void {
    if (this.isOn(id) === value) return;
    this.on.set(id, value);
    for (const fn of this.listeners) fn();
  }

  public subscribe(listener: CfdLayerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const cfdLayers = new CfdLayerStore();
