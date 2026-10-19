import { countUpText } from '@/viz/tween';

/** width % 트랜지션용 — data-bar-pct */
export function animateVizBars(root: Element): void {
  root.querySelectorAll<HTMLElement>('[data-bar-pct]').forEach((el) => {
    const pct = el.getAttribute('data-bar-pct') ?? '0';
    el.style.width = '0%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.width = `${pct}%`;
        el.classList.add('is-drawn');
      });
    });
  });
}

/** 재렌더 시 깜빡임 없이 막대·숫자를 즉시 반영 */
export function settleVizBars(root: Element): void {
  root.querySelectorAll<HTMLElement>('[data-bar-pct]').forEach((el) => {
    const pct = el.getAttribute('data-bar-pct') ?? '0';
    el.style.width = `${pct}%`;
    el.classList.add('is-drawn');
  });
}

function formatBiCount(el: HTMLElement, v: number): string {
  const suffix = el.getAttribute('data-bi-suffix') ?? '';
  const dec = Number.parseInt(el.getAttribute('data-bi-decimals') ?? '-1', 10);
  if (dec >= 0) return `${v.toFixed(dec)}${suffix}`;
  return `${Math.round(v)}${suffix}`;
}

export function settleVizCountUps(root: Element): void {
  root.querySelectorAll<HTMLElement>('[data-bi-count]').forEach((el) => {
    const to = Number.parseFloat(el.getAttribute('data-bi-count') ?? '0');
    el.textContent = formatBiCount(el, to);
  });
}

export function bindVizCountUps(root: Element, keyPrefix = 'viz'): (() => void)[] {
  const stops: (() => void)[] = [];
  root.querySelectorAll<HTMLElement>('[data-bi-count]').forEach((el) => {
    const to = Number.parseFloat(el.getAttribute('data-bi-count') ?? '0');
    const suffix = el.getAttribute('data-bi-suffix') ?? '';
    const dec = Number.parseInt(el.getAttribute('data-bi-decimals') ?? '-1', 10);
    stops.push(
      countUpText(
        el,
        to,
        (v) => {
          if (dec >= 0) return `${v.toFixed(dec)}${suffix}`;
          return `${Math.round(v)}${suffix}`;
        },
        { durationMs: 620, key: `${keyPrefix}-${el.dataset.biKey ?? el.className}-${to}` },
      ),
    );
  });
  return stops;
}

export function pulseElement(el: HTMLElement, cls = 'viz-pulse-once'): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
