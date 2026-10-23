import { Quaternion, Vector3 } from 'three';
import type { Disposable } from '@/types/disposable';

const SIZE = 72;
const C = SIZE / 2;
const LEN = 26;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 월드(Three) 축 → 표기 축. 흐름=X, 횡단=Y(월드 z), 연직=Z(월드 y).
const AXES = [
  { label: 'X', hint: '흐름', dir: new Vector3(1, 0, 0), color: '#ff6b6b' },
  { label: 'Y', hint: '횡단', dir: new Vector3(0, 0, 1), color: '#6bdc8b' },
  { label: 'Z', hint: '연직', dir: new Vector3(0, 1, 0), color: '#6bb6ff' },
] as const;

/** 카메라 방향에 맞춰 회전하는 좌표축 트라이어드 (X 흐름, Y 횡단, Z 연직) */
export class AxisTriad implements Disposable {
  public readonly element: HTMLElement;
  private readonly lines: SVGLineElement[] = [];
  private readonly texts: SVGTextElement[] = [];
  private readonly tmp = new Vector3();
  private readonly inv = new Quaternion();

  public constructor() {
    this.element = document.createElement('div');
    this.element.className = 'axis-triad is-hidden';
    this.element.dataset.widgetId = 'axis-triad';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute('width', String(SIZE));
    svg.setAttribute('height', String(SIZE));
    for (const axis of AXES) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('stroke', axis.color);
      line.setAttribute('stroke-width', '2.5');
      line.setAttribute('stroke-linecap', 'round');
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('fill', axis.color);
      text.setAttribute('font-size', '11');
      text.setAttribute('font-weight', '700');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.textContent = axis.label;
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `${axis.label} ${axis.hint}`;
      text.appendChild(title);
      svg.append(line, text);
      this.lines.push(line);
      this.texts.push(text);
    }
    this.element.appendChild(svg);
    this.update(new Quaternion());
  }

  /** 카메라 회전(quaternion)을 받아 각 축의 화면상 방향을 갱신한다. */
  public update(cameraQuaternion: Quaternion): void {
    this.inv.copy(cameraQuaternion).invert();
    AXES.forEach((axis, i) => {
      this.tmp.copy(axis.dir).applyQuaternion(this.inv);
      this.lines[i].setAttribute('x1', String(C));
      this.lines[i].setAttribute('y1', String(C));
      this.lines[i].setAttribute('x2', (C + this.tmp.x * LEN).toFixed(1));
      this.lines[i].setAttribute('y2', (C - this.tmp.y * LEN).toFixed(1));
      this.texts[i].setAttribute('x', (C + this.tmp.x * (LEN + 9)).toFixed(1));
      this.texts[i].setAttribute('y', (C - this.tmp.y * (LEN + 9)).toFixed(1));
      // 카메라 뒤쪽을 향하는 축은 흐리게 표시한다.
      const opacity = this.tmp.z < -0.05 ? '0.45' : '1';
      this.lines[i].setAttribute('opacity', opacity);
      this.texts[i].setAttribute('opacity', opacity);
    });
  }

  public setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
  }

  public dispose(): void {
    this.element.remove();
  }
}
