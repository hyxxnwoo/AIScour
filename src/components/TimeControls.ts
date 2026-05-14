import type { Disposable } from '@/types/disposable';

export interface TimeControlsOptions {
  // 시뮬레이션 총 길이(초)
  durationSeconds: number;
  // 재생 배속 기본값 (1.0 = 실시간)
  initialSpeed?: number;
  // 자동 시작 여부
  autoPlay?: boolean;
  // 끝에 도달했을 때 처음으로 되돌릴지
  loop?: boolean;
}

export type TimeChangeListener = (timeSeconds: number, isPlaying: boolean) => void;

// TimeControls: 재생 상태(시간/일시정지/배속/루프)를 보유하고,
// 매 프레임 tick(delta) 으로 시간을 진행시킨다. UI 는 이 모듈이 직접 DOM 으로 만든다.
// 외부에서는 onChange 로 시간 변경을 구독한다.
export class TimeControls implements Disposable {
  public readonly element: HTMLElement;
  private duration: number;
  private currentTime = 0;
  private speed: number;
  private playing: boolean;
  private readonly looping: boolean;
  private readonly listeners = new Set<TimeChangeListener>();

  // DOM refs
  private readonly playBtn: HTMLButtonElement;
  private readonly slider: HTMLInputElement;
  private readonly timeLabel: HTMLSpanElement;
  private readonly speedSelect: HTMLSelectElement;

  // 슬라이더 단위는 ms (정수)로 두어 매끄러운 스크럽을 보장
  private readonly sliderResolution = 1000;
  private isUserScrubbing = false;

  public constructor(options: TimeControlsOptions) {
    this.duration = Math.max(0, options.durationSeconds);
    this.speed = options.initialSpeed ?? 1;
    this.looping = options.loop ?? true;
    this.playing = options.autoPlay ?? true;

    this.element = document.createElement('div');
    this.element.className = 'time-controls';

    this.playBtn = document.createElement('button');
    this.playBtn.type = 'button';
    this.playBtn.className = 'time-controls__play';
    this.playBtn.setAttribute('aria-label', '재생/일시정지');
    this.updatePlayButton();

    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.className = 'time-controls__slider';
    this.slider.min = '0';
    this.slider.max = String(Math.round(this.duration * this.sliderResolution));
    this.slider.step = '1';
    this.slider.value = '0';

    this.timeLabel = document.createElement('span');
    this.timeLabel.className = 'time-controls__label';
    this.timeLabel.textContent = this.formatTime(0);

    this.speedSelect = document.createElement('select');
    this.speedSelect.className = 'time-controls__speed';
    for (const v of [0.25, 0.5, 1, 2, 4]) {
      const opt = document.createElement('option');
      opt.value = String(v);
      opt.textContent = `${v}x`;
      if (v === this.speed) opt.selected = true;
      this.speedSelect.appendChild(opt);
    }

    this.element.append(this.playBtn, this.slider, this.timeLabel, this.speedSelect);

    this.bindEvents();
  }

  private bindEvents(): void {
    this.playBtn.addEventListener('click', this.togglePlay);
    this.slider.addEventListener('input', this.onSliderInput);
    this.slider.addEventListener('pointerdown', this.onScrubStart);
    this.slider.addEventListener('pointerup', this.onScrubEnd);
    this.slider.addEventListener('pointercancel', this.onScrubEnd);
    this.speedSelect.addEventListener('change', this.onSpeedChange);
  }

  // AnimationLoop 가 매 프레임 호출. 재생 중일 때만 시간을 진행시킨다.
  public tick(deltaSeconds: number): void {
    if (!this.playing || this.duration === 0 || this.isUserScrubbing) return;
    let next = this.currentTime + deltaSeconds * this.speed;
    if (next >= this.duration) {
      if (this.looping) {
        next = next % this.duration;
      } else {
        next = this.duration;
        this.setPlaying(false);
      }
    }
    this.setTime(next);
  }

  public onChange(listener: TimeChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public get isPlaying(): boolean {
    return this.playing;
  }

  public get time(): number {
    return this.currentTime;
  }

  public setDuration(durationSeconds: number): void {
    this.duration = Math.max(0, durationSeconds);
    this.slider.max = String(Math.round(this.duration * this.sliderResolution));
    this.setTime(Math.min(this.currentTime, this.duration), { silent: true });
  }

  public setTime(timeSeconds: number, options?: { silent?: boolean }): void {
    const clamped = Math.max(0, Math.min(timeSeconds, this.duration));
    if (clamped === this.currentTime) return;
    this.currentTime = clamped;
    this.slider.value = String(Math.round(clamped * this.sliderResolution));
    this.timeLabel.textContent = this.formatTime(clamped);
    if (!options?.silent) this.emit();
  }

  public setPlaying(value: boolean): void {
    if (value === this.playing) return;
    this.playing = value;
    this.updatePlayButton();
    this.emit();
  }

  private togglePlay = (): void => {
    this.setPlaying(!this.playing);
  };

  private onSliderInput = (): void => {
    const next = Number(this.slider.value) / this.sliderResolution;
    this.currentTime = next;
    this.timeLabel.textContent = this.formatTime(next);
    this.emit();
  };

  private onScrubStart = (): void => {
    this.isUserScrubbing = true;
  };

  private onScrubEnd = (): void => {
    this.isUserScrubbing = false;
  };

  private onSpeedChange = (): void => {
    this.speed = Number(this.speedSelect.value);
  };

  private updatePlayButton(): void {
    this.playBtn.textContent = this.playing ? '⏸' : '▶';
  }

  private formatTime(t: number): string {
    return `${t.toFixed(1)}s / ${this.duration.toFixed(1)}s`;
  }

  private emit(): void {
    for (const cb of this.listeners) cb(this.currentTime, this.playing);
  }

  public dispose(): void {
    this.playBtn.removeEventListener('click', this.togglePlay);
    this.slider.removeEventListener('input', this.onSliderInput);
    this.slider.removeEventListener('pointerdown', this.onScrubStart);
    this.slider.removeEventListener('pointerup', this.onScrubEnd);
    this.slider.removeEventListener('pointercancel', this.onScrubEnd);
    this.speedSelect.removeEventListener('change', this.onSpeedChange);
    this.element.remove();
    this.listeners.clear();
  }
}
