import type { SectionId } from '@/utils/sectionProfile';

export interface StoredCameraView {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

export type ViewStateListener = () => void;

/** 화면·패널 간 공유 — 선택·단면·카메라 시점 */
export class ViewStateStore {
  public selectedPierId: string | null = null;
  public hoveredPierId: string | null = null;
  public sectionId: SectionId = 'A';
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

  public subscribe(listener: ViewStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

export const viewState = new ViewStateStore();
