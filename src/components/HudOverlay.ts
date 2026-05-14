import type { Disposable } from '@/types/disposable';

export interface HudFields {
  // 표시할 필드명 -> 초기값. 키 순서대로 렌더링된다.
  initial: Record<string, string>;
}

// HudOverlay: #hud 엘리먼트 안에 key/value 행을 렌더링하고 외부에서 set() 으로 갱신한다.
// pointer-events: none 이므로 마우스 인터랙션을 가로채지 않는다.
export class HudOverlay implements Disposable {
  private readonly container: HTMLElement;
  private readonly rows = new Map<string, { row: HTMLSpanElement; value: HTMLSpanElement }>();

  public constructor(container: HTMLElement, fields: HudFields) {
    this.container = container;
    container.replaceChildren();
    for (const [key, val] of Object.entries(fields.initial)) {
      this.addRow(key, val);
    }
  }

  public set(key: string, value: string): void {
    const existing = this.rows.get(key);
    if (existing) {
      existing.value.textContent = value;
    } else {
      this.addRow(key, value);
    }
  }

  public remove(key: string): void {
    const existing = this.rows.get(key);
    if (existing) {
      existing.row.remove();
      this.rows.delete(key);
    }
  }

  private addRow(key: string, value: string): void {
    const row = document.createElement('span');
    row.className = 'hud-row';
    const k = document.createElement('span');
    k.className = 'hud-key';
    k.textContent = `${key}:`;
    const v = document.createElement('span');
    v.className = 'hud-value';
    v.textContent = value;
    row.append(k, v);
    this.container.appendChild(row);
    this.rows.set(key, { row, value: v });
  }

  public dispose(): void {
    this.container.replaceChildren();
    this.rows.clear();
  }
}
