import type { TerrainMetadata } from '@/types/terrain';
import type { Disposable } from '@/types/disposable';

export interface MetadataPanelOptions {
  metadata: TerrainMetadata | null | undefined;
  // 부가 정보 (예: grid 크기, 프레임 수). key/value 로 표시된다.
  extra?: Record<string, string>;
}

// MetadataPanel: 시뮬레이션 메타데이터(시뮬레이션 ID, 좌표계, 단위, 캡처 시각) 와 보조 정보를
// 좌측 하단에 카드 형태로 표시한다. UI 만 담당, 데이터 변형 없음.
export class MetadataPanel implements Disposable {
  public readonly element: HTMLElement;

  public constructor(options: MetadataPanelOptions) {
    this.element = document.createElement('aside');
    this.element.className = 'metadata-panel';

    const title = document.createElement('div');
    title.className = 'metadata-panel__title';
    title.textContent = '시뮬레이션 정보';
    this.element.appendChild(title);

    const list = document.createElement('dl');
    list.className = 'metadata-panel__list';

    const md = options.metadata ?? {};
    const rows: Array<[string, string | undefined]> = [
      ['ID', md.simulationId],
      ['CRS', md.crs],
      ['Unit', md.elevationUnit],
      ['Captured', md.capturedAt],
      ...Object.entries(options.extra ?? {}),
    ];

    for (const [key, value] of rows) {
      if (value === undefined || value === null || value === '') continue;
      const dt = document.createElement('dt');
      dt.textContent = key;
      const dd = document.createElement('dd');
      dd.textContent = value;
      list.append(dt, dd);
    }

    this.element.appendChild(list);
  }

  public dispose(): void {
    this.element.remove();
  }
}
