const activeByKey = new Map<string, number>();

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export interface TweenOptions {
  durationMs?: number;
  key?: string;
  easing?: (t: number) => number;
}

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/** Animate number; returns cancel fn */
export function tweenNumber(
  from: number,
  to: number,
  onUpdate: (v: number) => void,
  onDone?: () => void,
  options: TweenOptions = {},
): () => void {
  if (prefersReducedMotion() || from === to) {
    onUpdate(to);
    onDone?.();
    return () => {};
  }
  const duration = options.durationMs ?? 420;
  const key = options.key ?? 'default';
  const prev = activeByKey.get(key);
  if (prev != null) cancelAnimationFrame(prev);

  const start = performance.now();
  const ease = options.easing ?? easeOutCubic;
  let cancelled = false;

  const tick = (now: number): void => {
    if (cancelled) return;
    const t = Math.min(1, (now - start) / duration);
    onUpdate(from + (to - from) * ease(t));
    if (t < 1) {
      activeByKey.set(key, requestAnimationFrame(tick));
    } else {
      activeByKey.delete(key);
      onDone?.();
    }
  };
  activeByKey.set(key, requestAnimationFrame(tick));

  return () => {
    cancelled = true;
    const id = activeByKey.get(key);
    if (id != null) cancelAnimationFrame(id);
    activeByKey.delete(key);
  };
}

export function countUpText(
  el: HTMLElement,
  to: number,
  format: (v: number) => string,
  options?: TweenOptions,
): () => void {
  const from = Number.parseFloat(el.dataset.vizValue ?? '0') || 0;
  return tweenNumber(
    from,
    to,
    (v) => {
      el.dataset.vizValue = String(v);
      el.textContent = format(v);
    },
    undefined,
    options,
  );
}
