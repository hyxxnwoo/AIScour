import { BASELINE_SCENARIO, FOOTING_SPECS, type FlowScenario } from '@/constants/scenarios';
import type { Disposable } from '@/types/disposable';

export interface CaseSwitcherItem {
  /** 파일명에서 뽑은 케이스 이름(예: s01). */
  name: string;
  /** FLOW-3D 시나리오. 이름이 규칙에 맞지 않으면 null. */
  scenario: FlowScenario | null;
}

/** 지형 높이(세굴·퇴적) 과장 배율 선택지. 1 = 실제 비율. */
export const HEIGHT_EXAGGERATION_CHOICES = [1, 2, 4] as const;
/** 기본 배율. 1 = 실제 비율(왜곡 없음). */
export const DEFAULT_HEIGHT_EXAGGERATION = 1;

interface ScenarioField {
  key: keyof FlowScenario;
  label: string;
  format: (s: FlowScenario) => string;
}

const SCENARIO_FIELDS: ScenarioField[] = [
  { key: 'd50Mm', label: 'd50', format: (s) => `${s.d50Mm} mm` },
  { key: 'waterDepthM', label: '수심', format: (s) => `${s.waterDepthM} m` },
  { key: 'velocityMS', label: '유속', format: (s) => `${s.velocityMS} m/s` },
  { key: 'pierSpacingM', label: '기둥 간격', format: (s) => `${s.pierSpacingM} m` },
  { key: 'footingShape', label: '하단부', format: (s) => FOOTING_SPECS[s.footingShape].label },
];

function optionLabel(item: CaseSwitcherItem): string {
  return item.scenario ? `${item.scenario.id} · ${item.scenario.variable}` : item.name;
}

/**
 * 뷰어에서 보고 있는 케이스(CSV)를 바꾸고, 그 케이스의 FLOW-3D 시나리오 조건을 보여 준다.
 * 케이스가 없으면 숨기고, 1개면 선택 상자 없이 조건만 보여 준다. 기준(S01)과 다른 조건은 강조한다.
 */
export class CaseSwitcher implements Disposable {
  public readonly element: HTMLElement;
  private readonly selectRow: HTMLElement;
  private readonly select: HTMLSelectElement;
  private readonly infoEl: HTMLElement;
  private readonly regionToggle: HTMLInputElement;
  private readonly exaggerationSelect: HTMLSelectElement;
  private items: CaseSwitcherItem[] = [];
  private listener: ((index: number) => void) | null = null;
  private regionListener: ((regionOnly: boolean) => void) | null = null;
  private exaggerationListener: ((factor: number) => void) | null = null;
  private readonly cleanups: Array<() => void> = [];

  public constructor() {
    this.element = document.createElement('section');
    this.element.className = 'case-switcher';
    this.element.hidden = true;

    this.selectRow = document.createElement('div');
    this.selectRow.className = 'case-switcher__row';

    const title = document.createElement('label');
    title.className = 'case-switcher__title';
    title.htmlFor = 'case-switcher-select';
    title.textContent = '케이스';

    this.select = document.createElement('select');
    this.select.id = 'case-switcher-select';
    this.select.className = 'case-switcher__select';
    const onChange = (): void => {
      this.renderInfo();
      this.listener?.(this.selectedIndex);
    };
    this.select.addEventListener('change', onChange);
    this.cleanups.push(() => this.select.removeEventListener('change', onChange));

    this.selectRow.append(title, this.select);

    this.infoEl = document.createElement('div');
    this.infoEl.className = 'case-switcher__info';

    const regionLabel = document.createElement('label');
    regionLabel.className = 'case-switcher__region';
    regionLabel.title =
      '유입 경계의 배고픈 물 세굴, 유출 경계, 측벽 영향은 교각 국부 세굴과 섞여 보여서 가립니다. ' +
      '끄면 CSV 전체를 그대로 보여 줍니다.';
    this.regionToggle = document.createElement('input');
    this.regionToggle.type = 'checkbox';
    this.regionToggle.checked = true;
    const regionText = document.createElement('span');
    regionText.textContent = '교각 주변만 표시';
    regionLabel.append(this.regionToggle, regionText);
    const onRegion = (): void => this.regionListener?.(this.regionToggle.checked);
    this.regionToggle.addEventListener('change', onRegion);
    this.cleanups.push(() => this.regionToggle.removeEventListener('change', onRegion));

    const exaggerationRow = document.createElement('div');
    exaggerationRow.className = 'case-switcher__row';
    const exaggerationTitle = document.createElement('label');
    exaggerationTitle.className = 'case-switcher__title';
    exaggerationTitle.htmlFor = 'case-switcher-exaggeration';
    exaggerationTitle.textContent = '퇴적 스케일';
    exaggerationTitle.title =
      '지형 표고(Z)에만 곱하는 배율입니다. ×1 이 실제 비율이며, 세굴·퇴적은 최대 2 cm 안팎이라 ×1 에서는 완만하게 보입니다. ' +
      '교각·하단부(노출 5 cm)에는 적용하지 않으므로 배율이 크면 퇴적 둔덕이 하단부보다 높아 보일 수 있습니다.';
    this.exaggerationSelect = document.createElement('select');
    this.exaggerationSelect.id = 'case-switcher-exaggeration';
    this.exaggerationSelect.className = 'case-switcher__select';
    for (const factor of HEIGHT_EXAGGERATION_CHOICES) {
      const opt = document.createElement('option');
      opt.value = String(factor);
      opt.textContent = factor === 1 ? '×1 (실제 비율)' : `×${factor}`;
      this.exaggerationSelect.appendChild(opt);
    }
    this.exaggerationSelect.value = String(DEFAULT_HEIGHT_EXAGGERATION);
    const onExaggeration = (): void => this.exaggerationListener?.(this.exaggeration);
    this.exaggerationSelect.addEventListener('change', onExaggeration);
    this.cleanups.push(() => this.exaggerationSelect.removeEventListener('change', onExaggeration));
    exaggerationRow.append(exaggerationTitle, this.exaggerationSelect);

    this.element.append(this.selectRow, this.infoEl, exaggerationRow, regionLabel);
  }

  /** 지형 높이 과장 배율. */
  public get exaggeration(): number {
    return Number(this.exaggerationSelect.value);
  }

  public onExaggerationChange(listener: (factor: number) => void): void {
    this.exaggerationListener = listener;
  }

  /** 「교각 주변만 표시」 상태. */
  public get regionOnly(): boolean {
    return this.regionToggle.checked;
  }

  public onRegionChange(listener: (regionOnly: boolean) => void): void {
    this.regionListener = listener;
  }

  public get selectedIndex(): number {
    return Math.max(0, this.select.selectedIndex);
  }

  /** 케이스 목록을 채운다. 비어 있으면 숨기고, 2개 미만이면 선택 상자를 숨긴다. */
  public setCases(items: CaseSwitcherItem[], selectedIndex = 0): void {
    this.items = [...items];
    this.select.replaceChildren(
      ...this.items.map((item, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = optionLabel(item);
        return opt;
      }),
    );
    this.select.selectedIndex = Math.min(
      Math.max(0, selectedIndex),
      Math.max(0, this.items.length - 1),
    );
    this.selectRow.hidden = this.items.length < 2;
    this.element.hidden = this.items.length === 0;
    this.renderInfo();
  }

  private renderInfo(): void {
    const scenario = this.items[this.selectedIndex]?.scenario ?? null;
    this.infoEl.replaceChildren();
    this.infoEl.hidden = scenario === null;
    if (!scenario) return;

    const head = document.createElement('div');
    head.className = 'case-switcher__scenario';
    head.textContent = `${scenario.id} · ${scenario.variable}`;

    const list = document.createElement('dl');
    list.className = 'case-switcher__fields';
    for (const field of SCENARIO_FIELDS) {
      const changed = scenario[field.key] !== BASELINE_SCENARIO[field.key];
      const dt = document.createElement('dt');
      dt.textContent = field.label;
      const dd = document.createElement('dd');
      dd.textContent = field.format(scenario);
      if (changed) {
        dt.classList.add('is-changed');
        dd.classList.add('is-changed');
        dd.title = `기준(S01): ${field.format(BASELINE_SCENARIO)}`;
      }
      list.append(dt, dd);
    }
    this.infoEl.append(head, list);
  }

  /** 뷰어 화면(5~9)이 아니면 가린다. */
  public setScreenVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
  }

  public onChange(listener: (index: number) => void): void {
    this.listener = listener;
  }

  public dispose(): void {
    for (const fn of this.cleanups) fn();
    this.listener = null;
    this.regionListener = null;
    this.exaggerationListener = null;
    this.element.remove();
  }
}
