import type { CameraPreset } from '@/core/CameraManager';
import type { Disposable } from '@/types/disposable';

export interface KeyboardShortcutHandlers {
  togglePlay: () => void;
  seekRelative: (deltaSeconds: number) => void;
  seekAbsolute: (timeSeconds: number) => void;
  duration: () => number;
  applyPreset: (preset: CameraPreset) => void;
  screenshot: () => void;
}

// KeyboardShortcuts: 전역 키보드 입력을 단순한 동작 콜백으로 매핑한다.
// 입력 필드(input/textarea/contenteditable)에서는 무시한다.
//
// 키맵
//   Space        재생/일시정지 토글
//   ArrowLeft    -1초
//   ArrowRight   +1초
//   Shift+Arrow  -5초 / +5초
//   Home         처음(0s)
//   End          끝(duration)
//   R            카메라 reset
//   T            카메라 top
//   F            카메라 front
//   X            카메라 side (S 는 운영체제 단축키와 충돌 가능성 있음)
//   P            스크린샷 다운로드
export class KeyboardShortcuts implements Disposable {
  private readonly handlers: KeyboardShortcutHandlers;

  public constructor(handlers: KeyboardShortcutHandlers) {
    this.handlers = handlers;
    window.addEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.isEditableTarget(event.target)) return;
    if (event.altKey || event.metaKey || event.ctrlKey) return;

    switch (event.code) {
      case 'Space':
        event.preventDefault();
        this.handlers.togglePlay();
        return;
      case 'ArrowLeft':
        event.preventDefault();
        this.handlers.seekRelative(event.shiftKey ? -5 : -1);
        return;
      case 'ArrowRight':
        event.preventDefault();
        this.handlers.seekRelative(event.shiftKey ? 5 : 1);
        return;
      case 'Home':
        event.preventDefault();
        this.handlers.seekAbsolute(0);
        return;
      case 'End':
        event.preventDefault();
        this.handlers.seekAbsolute(this.handlers.duration());
        return;
      case 'KeyR':
        this.handlers.applyPreset('reset');
        return;
      case 'KeyT':
        this.handlers.applyPreset('top');
        return;
      case 'KeyF':
        this.handlers.applyPreset('front');
        return;
      case 'KeyX':
        this.handlers.applyPreset('side');
        return;
      case 'KeyP':
        this.handlers.screenshot();
        return;
      default:
        return;
    }
  };

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return target.isContentEditable;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
  }
}
