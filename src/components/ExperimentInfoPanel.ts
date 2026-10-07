import type { Disposable } from '@/types/disposable';
import type { SimParams } from '@/types/simParams';

/** 기둥·교량 등 실험 조건 값 보관(CSV 설정·적용 시 merge). UI 없음. */
export class ExperimentInfoPanel implements Disposable {
  /** DOM 미부착 — dispose 호환용 */
  public readonly element: HTMLElement;
  private values: SimParams;

  public constructor(initialParams: SimParams) {
    this.values = { ...initialParams };
    this.element = document.createElement('div');
    this.element.hidden = true;
    this.element.setAttribute('aria-hidden', 'true');
  }

  public setParams(params: SimParams): void {
    this.values = { ...this.values, ...params };
  }

  public getParams(): SimParams {
    return { ...this.values };
  }

  public setLoading(_loading: boolean): void {
    /* 적용 버튼 로딩은 CsvUploadPanel.setApplyLoading */
  }

  public dispose(): void {
    this.element.remove();
  }
}
