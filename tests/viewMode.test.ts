import { beforeEach, describe, expect, it } from 'vitest';
import { VIEW_MODE_STORAGE_KEY, ViewStateStore } from '@/state/viewState';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import { scdtScreenshotName } from '@/utils/screenshot';

describe('보기 모드', () => {
  beforeEach(() => localStorage.clear());

  it('기본값은 basic 이고 변경은 저장·복원된다', () => {
    const a = new ViewStateStore();
    expect(a.viewMode).toBe('basic');
    a.setViewMode('cfd');
    expect(localStorage.getItem(VIEW_MODE_STORAGE_KEY)).toBe('cfd');
    expect(new ViewStateStore().viewMode).toBe('cfd');
  });

  it('토글 클릭이 핸들러를 부르고, setMode 는 부르지 않는다', () => {
    const seen: string[] = [];
    const t = new ViewModeToggle('basic', { onChange: (m) => seen.push(m) });
    t.element.querySelector<HTMLButtonElement>('[data-mode="cfd"]')!.click();
    t.setMode('basic');
    expect(seen).toEqual(['cfd']);
    expect(t.element.querySelector('[data-mode="basic"]')!.classList.contains('is-on')).toBe(true);
  });

  it('캡처 파일명은 CFD 일 때만 모드를 포함한다', () => {
    const d = new Date(2026, 9, 22, 8, 5);
    expect(scdtScreenshotName(5, '3D 세굴 가시화', d)).toBe('SCDT_05_3D세굴가시화_20261022_0805.png');
    expect(scdtScreenshotName(5, '3D 세굴 가시화', d, 'cfd')).toBe(
      'SCDT_05_3D세굴가시화_CFD_20261022_0805.png',
    );
  });
});
