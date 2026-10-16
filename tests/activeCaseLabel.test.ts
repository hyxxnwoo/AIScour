import { describe, expect, it } from 'vitest';
import { ConditionSetupCaseBar } from '@/components/ConditionSetupCaseBar';
import { GlobalNav } from '@/components/GlobalNav';

describe('현재 케이스 표시', () => {
  it('시뮬레이션을 적용하기 전에는 A-032를 현재 케이스로 보여 주지 않는다', () => {
    const nav = new GlobalNav({
      onNavigate: () => undefined,
      onReportUnavailable: () => undefined,
    });
    expect(nav.element.textContent).toContain('케이스 미생성');
    expect(nav.element.textContent).not.toContain('A-032');

    const bar = new ConditionSetupCaseBar({
      onOpenPipeline: () => undefined,
      onCaseChange: () => undefined,
    });
    const select = bar.element.querySelector('select');
    expect(select?.value).toBe('');
    expect(select?.selectedOptions[0]?.textContent).toContain('시뮬레이션 적용 전');

    bar.pinIssuedCase('A-131', 'A-131 · 해석중 · 원기둥');
    expect(select?.value).toBe('A-131');
  });
});
