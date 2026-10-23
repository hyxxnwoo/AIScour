import type { Disposable } from '@/types/disposable';
import { FLOW_ORIGIN_LABEL, type FlowOrigin } from '@/data/cfdFlowField';
import type { CfdProbeSample } from '@/utils/cfdProbe';

const fmt = (v: number, d: number): string => (Object.is(v, -0) ? 0 : v).toFixed(d);

/** CFD 모드 클릭 프로브 카드 — 좌표, 표고 변화, 유속, 전단응력 */
export class CfdProbePanel implements Disposable {
  public readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly onClose: () => void;
  private origin: FlowOrigin = 'synthetic';

  public constructor(onClose: () => void) {
    this.onClose = onClose;
    this.element = document.createElement('div');
    this.element.className = 'cfd-probe-panel is-hidden';
    this.element.dataset.widgetId = 'cfd-probe-panel';

    const head = document.createElement('div');
    head.className = 'cfd-probe-panel__head';
    const title = document.createElement('span');
    title.textContent = '프로브';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'cfd-probe-panel__close';
    close.setAttribute('aria-label', '프로브 닫기');
    close.textContent = '✕';
    close.addEventListener('click', () => this.onClose());
    head.append(title, close);

    this.body = document.createElement('div');
    this.body.className = 'cfd-probe-panel__body';
    this.element.append(head, this.body);
  }

  public setFlowOrigin(origin: FlowOrigin): void {
    this.origin = origin;
  }

  /** null 이면 숨긴다. 시각이 바뀌면 같은 지점을 다시 계산해 넘겨 값만 갱신한다. */
  public setSample(sample: CfdProbeSample | null): void {
    this.element.classList.toggle('is-hidden', sample === null);
    if (!sample) return;
    const mock =
      this.origin === 'synthetic' ? ` <i title="${FLOW_ORIGIN_LABEL.synthetic}">목업</i>` : '';
    const rows: Array<[string, string]> = [
      ['X (흐름)', `${fmt(sample.x, 3)} m`],
      ['Y (횡단)', `${fmt(sample.z, 3)} m`],
      ['Z (연직)', `${fmt(sample.y, 3)} m`],
      ['표고 변화', `${fmt(sample.deltaElevation, 4)} m`],
      [
        '유속',
        sample.noFlow
          ? '— (고체/영역 밖)'
          : `${fmt(sample.speed, 3)} m/s${mock}<small>u ${fmt(sample.vx, 3)} · v ${fmt(sample.vz, 3)} · w ${fmt(sample.vy, 3)}</small>`,
      ],
      ['전단응력', `${fmt(sample.shearStress, 3)} Pa <i class="is-prov">잠정</i>${mock}`],
    ];
    this.body.innerHTML = rows
      .map(([k, v]) => `<div class="cfd-probe-panel__row"><span>${k}</span><b>${v}</b></div>`)
      .join('');
  }

  public dispose(): void {
    this.element.remove();
  }
}
