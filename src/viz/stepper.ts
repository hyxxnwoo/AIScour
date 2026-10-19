export type StepState = 'ok' | 'err' | 'run' | 'wait' | 'warn';

export interface StepperItem {
  label: string;
  state: StepState;
}

const STATE_COLOR: Record<StepState, string> = {
  ok: '#2EA36B',
  err: '#E8796B',
  run: '#6FB6DE',
  wait: '#1E3A57',
  warn: '#E8B21A',
};

export function renderHorizontalStepper(
  steps: StepperItem[],
  progressIndex: number,
  options?: { flow?: boolean },
): string {
  const flowCls = options?.flow ? ' viz-stepper--flow' : '';
  return `<span class="viz-stepper viz-stepper--h${flowCls}">${steps
    .map((s, i) => {
      const c = STATE_COLOR[s.state];
      const pulse = s.state === 'run' ? ' viz-stepper__seg--pulse' : '';
      const done = i < progressIndex ? ' viz-stepper__seg--done' : '';
      return `<span class="viz-stepper__seg${pulse}${done}" style="background:${c}" title="${s.label}"></span>`;
    })
    .join('')}</span>`;
}

export function renderVerticalStepper(steps: StepperItem[], currentIndex: number): string {
  return `<div class="viz-stepper viz-stepper--v">${steps
    .map((s, i) => {
      const c = STATE_COLOR[s.state];
      const active = i === currentIndex ? ' is-active' : '';
      return `<div class="viz-stepper__row${active}">
        <span class="viz-stepper__dot" style="background:${c}"></span>
        <span class="viz-stepper__label">${s.label}</span>
      </div>`;
    })
    .join('')}</div>`;
}
