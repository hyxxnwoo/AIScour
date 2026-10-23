import type { Disposable } from '@/types/disposable';
import { CFD_LAYERS, type CfdLayerStore } from '@/state/cfdLayers';
import { CFD_SETTINGS } from '@/constants/cfdSettings';
import type { SectionId } from '@/utils/sectionProfile';

/** 단면 종류(A–A′ 종단 / B–B′ 횡단)를 평면·단면 화면과 공유하기 위한 연결 */
export interface CfdSectionBinding {
  get(): SectionId;
  set(section: SectionId): void;
  subscribe(listener: () => void): () => void;
}
import { FLOW_ORIGIN_LABEL, type FlowOrigin } from '@/data/cfdFlowField';

/** CFD 모드 후처리 레이어 토글 패널 (캔버스 위, 보기 모드 토글 아래) */
export class CfdLayerPanel implements Disposable {
  public readonly element: HTMLElement;
  private readonly flowTags: Array<{ tag: HTMLElement; always: boolean }> = [];
  private readonly footer: HTMLElement;

  public constructor(store: CfdLayerStore, section?: CfdSectionBinding) {
    this.element = document.createElement('div');
    this.element.className = 'cfd-layer-panel is-hidden';
    this.element.dataset.widgetId = 'cfd-layer-panel';
    const title = document.createElement('p');
    title.className = 'cfd-layer-panel__title';
    title.textContent = '레이어';
    this.element.appendChild(title);
    for (const def of CFD_LAYERS) {
      const label = document.createElement('label');
      label.className = 'cfd-layer-panel__row';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = store.isOn(def.id);
      box.disabled = !def.ready;
      box.addEventListener('change', () => store.set(def.id, box.checked));
      const text = document.createElement('span');
      text.textContent = def.label;
      label.append(box, text);
      if (def.usesFlow) {
        const tag = document.createElement('span');
        tag.className = 'cfd-layer-panel__tag';
        tag.textContent = '목업';
        tag.title = FLOW_ORIGIN_LABEL.synthetic;
        tag.hidden = true;
        label.appendChild(tag);
        this.flowTags.push({ tag, always: def.mockAlways === true });
      }
      if (!def.ready) {
        label.title = '준비 중';
        label.classList.add('is-pending');
      }
      this.element.appendChild(label);
      if (def.id === 'cutPlane') {
        const row = document.createElement('div');
        row.className = 'cfd-layer-panel__slider cfd-layer-panel__cut';
        const seg = document.createElement('div');
        seg.className = 'cfd-layer-panel__seg';
        const buttons: Array<{ id: SectionId; el: HTMLButtonElement }> = (
          [
            ['A', 'XZ (A–A′)'],
            ['B', 'YZ (B–B′)'],
          ] as const
        ).map(([id, text]) => {
          const el = document.createElement('button');
          el.type = 'button';
          el.textContent = text;
          el.addEventListener('click', () => section?.set(id));
          seg.appendChild(el);
          return { id, el };
        });
        const range = document.createElement('input');
        range.type = 'range';
        range.min = '0';
        range.max = '100';
        range.step = '1';
        range.title = '단면 위치(영역 안 %)';
        range.value = '50';
        range.addEventListener('input', () => store.setCutPosition(Number(range.value) / 100));
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'cfd-layer-panel__link';
        link.textContent = '연동';
        link.title = '평면·단면 화면의 단면선(선택 교각)에 위치를 맞춥니다';
        link.addEventListener('click', () => store.setCutPosition(null));
        row.append(seg, range, link);
        const syncCut = (): void => {
          row.hidden = !store.isOn('cutPlane');
          const f = store.cutPosition;
          if (f !== null) range.value = String(Math.round(f * 100));
          link.classList.toggle('is-on', f === null);
          for (const b of buttons) b.el.classList.toggle('is-on', section?.get() === b.id);
        };
        store.subscribe(syncCut);
        section?.subscribe(syncCut);
        syncCut();
        this.element.appendChild(row);
      }
      if (def.id === 'freeSurface') {
        const row = document.createElement('label');
        row.className = 'cfd-layer-panel__slider';
        const cap = document.createElement('span');
        cap.textContent = '투명도';
        const range = document.createElement('input');
        range.type = 'range';
        range.min = '5';
        range.max = '100';
        range.step = '1';
        // 슬라이더는 불투명도의 반대(투명도)가 아니라 불투명도 그대로 표시한다.
        range.title = '수면 불투명도(%)';
        range.value = String(Math.round(store.surfaceOpacity * 100));
        range.addEventListener('input', () => store.setSurfaceOpacity(Number(range.value) / 100));
        row.append(cap, range);
        row.hidden = !store.isOn('freeSurface');
        store.subscribe(() => {
          row.hidden = !store.isOn('freeSurface');
        });
        this.element.appendChild(row);
      }
      if (def.id === 'vectors') {
        const row = document.createElement('label');
        row.className = 'cfd-layer-panel__slider';
        const cap = document.createElement('span');
        cap.textContent = '밀도';
        const range = document.createElement('input');
        range.type = 'range';
        range.min = String(CFD_SETTINGS.vectorDensityMin);
        range.max = String(CFD_SETTINGS.vectorDensityMax);
        range.step = '1';
        range.value = String(store.vectorDensity);
        range.addEventListener('input', () => store.setVectorDensity(Number(range.value)));
        row.append(cap, range);
        row.hidden = !store.isOn('vectors');
        store.subscribe(() => {
          row.hidden = !store.isOn('vectors');
          range.value = String(store.vectorDensity);
        });
        this.element.appendChild(row);
      }
    }
    this.footer = document.createElement('p');
    this.footer.className = 'cfd-layer-panel__footer';
    this.element.appendChild(this.footer);
    this.setFlowOrigin('synthetic');
  }

  /** 유동장 출처를 반영한다. 합성(목업)일 때만 유속 의존 레이어에 '목업' 태그를 보인다. */
  public setFlowOrigin(origin: FlowOrigin): void {
    for (const { tag, always } of this.flowTags) tag.hidden = !always && origin !== 'synthetic';
    this.footer.textContent = `유동장: ${FLOW_ORIGIN_LABEL[origin]}`;
  }

  public setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
  }

  public dispose(): void {
    this.element.remove();
  }
}
