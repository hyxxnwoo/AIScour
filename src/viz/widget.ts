import { displayTierForWidth, type DisplayTier } from '@/constants/layout';
import type { Disposable } from '@/types/disposable';

export type { DisplayTier };

export interface WidgetTierOptions {
  /** data-widget-id (디버그·연동) */
  id?: string;
  /** true: 좁은 영역에서도 껍데기 유지 */
  essential?: boolean;
  onTierChange?: (tier: DisplayTier, size: { width: number; height: number }) => void;
}

const tierDisposers = new WeakMap<HTMLElement, () => void>();

/** tier 슬롯: core는 항상, basic/detail은 data-tier에 따라 숨김 (CSS) */
export function tierSlot(level: 'basic' | 'detail', content: string | HTMLElement): HTMLElement {
  const el = document.createElement('div');
  el.className = `viz-tier viz-tier--${level}`;
  if (typeof content === 'string') el.innerHTML = content;
  else el.appendChild(content);
  return el;
}

export function createWidgetShell(options: WidgetTierOptions = {}): HTMLElement {
  const root = document.createElement('div');
  root.className = 'viz-widget';
  if (options.id) root.dataset.widgetId = options.id;
  if (options.essential) root.dataset.essential = 'true';
  observeWidgetTier(root, options.onTierChange);
  return root;
}

/** 컨테이너 크기에 따라 data-tier 갱신 + FLIP 보조 클래스 */
export function observeWidgetTier(
  element: HTMLElement,
  onTierChange?: (tier: DisplayTier, size: { width: number; height: number }) => void,
): () => void {
  const prev = tierDisposers.get(element);
  prev?.();

  const apply = (): void => {
    const rect = element.getBoundingClientRect();
    const fontSize = Number.parseFloat(getComputedStyle(element).fontSize) || 14;
    const tier = displayTierForWidth(rect.width, fontSize);
    const prevTier = element.dataset.tier;
    if (prevTier !== tier) {
      element.dataset.tier = tier;
      element.classList.add('viz-widget--tier-change');
      window.requestAnimationFrame(() => element.classList.remove('viz-widget--tier-change'));
    }
    onTierChange?.(tier, { width: rect.width, height: rect.height });
  };

  apply();
  const ro = new ResizeObserver(() => apply());
  ro.observe(element);
  const dispose = (): void => {
    ro.disconnect();
    tierDisposers.delete(element);
  };
  tierDisposers.set(element, dispose);
  return dispose;
}

/** render 후 위젯·그리드에 tier 관찰을 일괄 연결 */
export function bindWidgetTiers(root: ParentNode): () => void {
  const cleanups: Array<() => void> = [];
  root.querySelectorAll<HTMLElement>('.viz-widget').forEach((el) => {
    if (tierDisposers.has(el)) return;
    cleanups.push(observeWidgetTier(el));
  });
  root.querySelectorAll<HTMLElement>('.viz-widget-grid').forEach((grid) => {
    cleanups.push(observeWidgetTier(grid));
  });
  return () => {
    for (const fn of cleanups) fn();
  };
}

export class WidgetGrid implements Disposable {
  public readonly element: HTMLElement;
  private unbind: (() => void) | null = null;

  public constructor(className = 'viz-widget-grid') {
    this.element = document.createElement('div');
    this.element.className = className;
    observeWidgetTier(this.element);
  }

  public mount(child: HTMLElement): void {
    this.element.appendChild(child);
  }

  public afterMount(): void {
    this.unbind?.();
    this.unbind = bindWidgetTiers(this.element);
  }

  public dispose(): void {
    this.unbind?.();
    this.element.remove();
  }
}

/** 수치 변화량 배지 (▲/▼) */
export function formatDeltaBadge(delta: number, unit: string, decimals = 2): string {
  if (Math.abs(delta) < 1e-9) return '';
  const sign = delta > 0 ? '▲' : '▼';
  const cls = delta > 0 ? 'viz-delta viz-delta--up' : 'viz-delta viz-delta--down';
  return `<span class="${cls}">${sign}${Math.abs(delta).toFixed(decimals)}${unit}</span>`;
}
