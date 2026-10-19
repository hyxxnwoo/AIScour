let root: HTMLElement | null = null;
let bound = false;

function ensureRoot(): HTMLElement {
  if (!root) {
    root = document.createElement('div');
    root.className = 'viz-tooltip';
    root.setAttribute('role', 'tooltip');
    document.body.appendChild(root);
  }
  return root;
}

function showTip(text: string, x: number, y: number): void {
  const el = ensureRoot();
  el.textContent = text;
  el.classList.add('is-visible');
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function hideTip(): void {
  root?.classList.remove('is-visible');
}

/** Delegated tooltip on container for [data-tip] elements */
export function bindVizTooltips(container: HTMLElement): () => void {
  const onOver = (e: Event): void => {
    const t = (e.target as HTMLElement).closest('[data-tip]');
    if (!t) return;
    const tip = t.getAttribute('data-tip');
    if (!tip) return;
    const r = t.getBoundingClientRect();
    showTip(tip, r.left + r.width / 2, r.top - 8);
  };
  const onMove = (e: MouseEvent): void => {
    const t = (e.target as HTMLElement).closest('[data-tip]');
    if (!t) {
      hideTip();
      return;
    }
    const tip = t.getAttribute('data-tip');
    if (tip) showTip(tip, e.clientX, e.clientY);
  };
  const onOut = (e: Event): void => {
    const related = (e as MouseEvent).relatedTarget;
    if (related instanceof Node && container.contains(related)) {
      const still = (related as HTMLElement).closest?.('[data-tip]');
      if (still) return;
    }
    hideTip();
  };
  container.addEventListener('mouseover', onOver);
  container.addEventListener('mousemove', onMove);
  container.addEventListener('mouseout', onOut);
  return () => {
    container.removeEventListener('mouseover', onOver);
    container.removeEventListener('mousemove', onMove);
    container.removeEventListener('mouseout', onOut);
  };
}

export function initGlobalVizTooltips(): void {
  if (bound || typeof document === 'undefined') return;
  bound = true;
  document.body.addEventListener(
    'mouseover',
    (e) => {
      const t = (e.target as HTMLElement).closest('[data-tip]');
      if (!t) return;
      const tip = t.getAttribute('data-tip');
      if (!tip) return;
      const r = t.getBoundingClientRect();
      showTip(tip, r.left + r.width / 2, r.top - 6);
    },
    true,
  );
  document.body.addEventListener(
    'mouseout',
    (e) => {
      const t = (e.target as HTMLElement).closest('[data-tip]');
      const rel = e.relatedTarget;
      if (t && rel instanceof Node && t.contains(rel)) return;
      hideTip();
    },
    true,
  );
}
