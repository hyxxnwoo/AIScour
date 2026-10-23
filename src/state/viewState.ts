import type { SectionId } from '@/utils/sectionProfile';

export interface StoredCameraView {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

export type ViewStateListener = () => void;

/** 3D 뷰어 보기 모드 — basic: 시설 관리자용(현행), cfd: 연구자용 후처리 표현 */
export type ViewMode = 'basic' | 'cfd';

export const VIEW_MODE_STORAGE_KEY = 'aiscour.viewMode';

export const VIEW_MODE_LABELS: Record<ViewMode, string> = { basic: '기본', cfd: 'CFD' };

function loadStoredViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return v === 'cfd' ? 'cfd' : 'basic';
  } catch {
    return 'basic';
  }
}

function saveViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 세션 내 상태만 유지한다.
  }
}

/** 화면·패널 간 공유 — 선택·단면·카메라 시점 */
export class ViewStateStore {
  public selectedPierId: string | null = null;
  public hoveredPierId: string | null = null;
  public sectionId: SectionId = 'A';
  /** 화면(5~9번)을 오가도 유지되고, 마지막 선택은 브라우저에 기억한다. */
  public viewMode: ViewMode = loadStoredViewMode();
  /** 4~9번 뷰어(6번 제외 진입 시) 복원용 */
  public viewerCamera: StoredCameraView | null = null;
  /** 6번 평면뷰 진입 직전 카메라 */
  public cameraBeforePlanView: StoredCameraView | null = null;

  private readonly listeners = new Set<ViewStateListener>();

  public setSelectedPier(pierId: string | null): void {
    if (this.selectedPierId === pierId) return;
    this.selectedPierId = pierId;
    this.emit();
  }

  public setHoveredPier(pierId: string | null): void {
    if (this.hoveredPierId === pierId) return;
    this.hoveredPierId = pierId;
    this.emit();
  }

  public setSectionId(section: SectionId): void {
    if (this.sectionId === section) return;
    this.sectionId = section;
    this.emit();
  }

  public setViewMode(mode: ViewMode): void {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    saveViewMode(mode);
    this.emit();
  }

  public subscribe(listener: ViewStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

export const viewState = new ViewStateStore();
