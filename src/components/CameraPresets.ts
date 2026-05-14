import type { CameraPreset } from '@/core/CameraManager';
import type { Disposable } from '@/types/disposable';

export interface CameraPresetsOptions {
  // 클릭 시 호출되는 콜백. 호출자는 CameraManager.applyPreset() 으로 위임한다.
  onSelect: (preset: CameraPreset) => void;
}

interface PresetButton {
  preset: CameraPreset;
  label: string;
  ariaLabel: string;
}

const BUTTONS: readonly PresetButton[] = [
  { preset: 'reset', label: 'Reset', ariaLabel: '카메라 초기 위치로' },
  { preset: 'top', label: 'Top', ariaLabel: '탑뷰' },
  { preset: 'side', label: 'Side', ariaLabel: '사이드뷰' },
  { preset: 'front', label: 'Front', ariaLabel: '프론트뷰' },
];

// CameraPresets: 카메라 프리셋 버튼 그룹. 클릭 시 onSelect 콜백 호출.
export class CameraPresets implements Disposable {
  public readonly element: HTMLElement;
  private readonly listeners: Array<{ btn: HTMLButtonElement; handler: () => void }> = [];

  public constructor(options: CameraPresetsOptions) {
    this.element = document.createElement('div');
    this.element.className = 'camera-presets';

    for (const { preset, label, ariaLabel } of BUTTONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.setAttribute('aria-label', ariaLabel);
      const handler = (): void => options.onSelect(preset);
      btn.addEventListener('click', handler);
      this.element.appendChild(btn);
      this.listeners.push({ btn, handler });
    }
  }

  public dispose(): void {
    for (const { btn, handler } of this.listeners) {
      btn.removeEventListener('click', handler);
    }
    this.element.remove();
    this.listeners.length = 0;
  }
}
