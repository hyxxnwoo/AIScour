import type { Disposable } from '@/types/disposable';

export interface LoginScreenOptions {
  onSuccess: () => void;
}

/** 임시 로그인 화면: 별도 백엔드 없이 고정된 ID/PW로만 통과시키는 게이트. */
const DEMO_ID = 'admin';
const DEMO_PW = 'scour2026';

const LOGO_SVG = `
<svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 18.5C4 16 6 20 8 17.5C10 15 12 20 14 17.5C16 15 18 20 20 17.5C22 15 23 16.5 24 17.5"
    stroke="url(#lg-wave)" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M4 9L13 3.5L22 9" stroke="url(#lg-bridge)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M6.5 9V13.5M13 9V13.5M19.5 9V13.5" stroke="url(#lg-bridge)" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M3 13.5H23" stroke="url(#lg-bridge)" stroke-width="1.6" stroke-linecap="round"/>
  <defs>
    <linearGradient id="lg-bridge" x1="4" y1="3.5" x2="22" y2="13.5" gradientUnits="userSpaceOnUse">
      <stop stop-color="#bfe4f2"/>
      <stop offset="1" stop-color="#7ec8e3"/>
    </linearGradient>
    <linearGradient id="lg-wave" x1="2" y1="17.5" x2="24" y2="17.5" gradientUnits="userSpaceOnUse">
      <stop stop-color="#7ec8e3"/>
      <stop offset="1" stop-color="#c9a4e0"/>
    </linearGradient>
  </defs>
</svg>`;

const USER_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.6" stroke="currentColor" stroke-width="1.7"/><path d="M4.5 19.2C5.6 15.6 8.4 13.6 12 13.6C15.6 13.6 18.4 15.6 19.5 19.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;

const LOCK_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="5" y="10.5" width="14" height="9.5" rx="2.2" stroke="currentColor" stroke-width="1.7"/><path d="M8 10.5V7.8C8 5.7 9.8 4 12 4C14.2 4 16 5.7 16 7.8V10.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="15" r="1.4" fill="currentColor"/></svg>`;

const EYE_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M2.5 12C4.5 7.5 8 5 12 5C16 5 19.5 7.5 21.5 12C19.5 16.5 16 19 12 19C8 19 4.5 16.5 2.5 12Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/></svg>`;

const EYE_OFF_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 3L21 21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9.9 5.3C10.6 5.1 11.3 5 12 5C16 5 19.5 7.5 21.5 12C20.9 13.3 20.1 14.4 19.2 15.4M6.5 6.9C4.8 8 3.5 9.7 2.5 12C4.5 16.5 8 19 12 19C13.2 19 14.4 18.8 15.5 18.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9.7 9.9C9.3 10.4 9 11.2 9 12C9 13.7 10.3 15 12 15C12.8 15 13.5 14.7 14 14.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

const ARROW_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const PULSE_ICON_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M2 12H7L10 4L14 20L17 12H22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const GAUGE_ICON_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 15A8 8 0 1 1 20 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 15L16 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const PIER_ICON_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 8L12 3L21 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 8V19M12 8V19M18 8V19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3 19H21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

/** 데이터 대시보드 느낌의 3D 지형(세굴 지형) 격자 바닥. */
function buildTerrainMesh(): string {
  const rows = 13;
  const cols = 17;
  const w = 1200;
  const h = 620;
  const horizonY = 40;
  const baseY = h;
  const pierCz = 0.62; // 0(수평선)~1(전면) 사이, 세굴 구덩이 중심 깊이 비율

  // 세굴 구덩이(가우시안 함몰)를 표현하는 높이 필드
  const bowl = (u: number, v: number): number => {
    const dx = (u - 0.5) * 2;
    const dz = v - pierCz;
    const r2 = dx * dx * 1.4 + dz * dz * 5.2;
    return Math.exp(-r2 * 3.2);
  };

  const project = (u: number, v: number): { x: number; y: number } => {
    // v: 0(수평선, 좁게 모임) → 1(화면 하단, 넓게 퍼짐) 원근 격자
    const depth = v * v;
    const spread = 0.06 + depth * 0.94;
    const x = w / 2 + (u - 0.5) * w * spread;
    const y = horizonY + depth * (baseY - horizonY) - bowl(u, v) * 46 * (0.3 + depth);
    return { x, y };
  };

  const points: { x: number; y: number }[][] = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const row: { x: number; y: number }[] = [];
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      row.push(project(u, v));
    }
    points.push(row);
  }

  const lines: string[] = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const d = points[r].map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const opacity = (0.06 + v * 0.4).toFixed(2);
    lines.push(`<path d="${d}" stroke="url(#mesh-line)" stroke-width="1.1" fill="none" opacity="${opacity}"/>`);
  }
  for (let c = 0; c <= cols; c++) {
    const d = points.map((row, i) => `${i === 0 ? 'M' : 'L'}${row[c].x.toFixed(1)} ${row[c].y.toFixed(1)}`).join(' ');
    lines.push(`<path d="${d}" stroke="url(#mesh-line)" stroke-width="1" fill="none" opacity="0.22"/>`);
  }

  return `
<svg class="login-screen__mesh" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="mesh-line" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7ec8e3"/>
      <stop offset="1" stop-color="#c9a4e0"/>
    </linearGradient>
    <radialGradient id="mesh-glow" cx="50%" cy="${((pierCz * pierCz) * 100).toFixed(0)}%" r="26%">
      <stop offset="0" stop-color="#7ec8e3" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#7ec8e3" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="${w / 2}" cy="${horizonY + (baseY - horizonY) * pierCz * pierCz}" rx="230" ry="90" fill="url(#mesh-glow)"/>
  <g class="login-screen__mesh-lines">${lines.join('')}</g>
</svg>`;
}

interface StatDef {
  icon: string;
  label: string;
  value: string;
  meterPct: number;
}

const STATS: readonly StatDef[] = [
  { icon: PULSE_ICON_SVG, label: '시뮬레이션 유속', value: '0.42 m/s', meterPct: 42 },
  { icon: GAUGE_ICON_SVG, label: '시뮬레이션 세굴심', value: '1.8 / 3.0 m', meterPct: 60 },
  { icon: PIER_ICON_SVG, label: '지원 교각 구성', value: '최대 3개 동시 배치', meterPct: 100 },
];

export class LoginScreen implements Disposable {
  public readonly element: HTMLElement;
  private readonly idInput: HTMLInputElement;
  private readonly pwInput: HTMLInputElement;
  private readonly pwToggle: HTMLButtonElement;
  private readonly errorEl: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly onSubmit: (e: Event) => void;
  private readonly onToggle: () => void;

  public constructor(options: LoginScreenOptions) {
    this.element = document.createElement('div');
    this.element.className = 'login-screen';

    const backdrop = document.createElement('div');
    backdrop.className = 'login-screen__backdrop';
    backdrop.innerHTML =
      '<span class="login-screen__orb login-screen__orb--a"></span>' +
      '<span class="login-screen__orb login-screen__orb--b"></span>' +
      buildTerrainMesh() +
      '<span class="login-screen__particles">' +
      Array.from({ length: 14 }, (_, i) => `<span class="login-screen__particle" style="--i:${i}"></span>`).join('') +
      '</span>';
    this.element.appendChild(backdrop);

    const stage = document.createElement('div');
    stage.className = 'login-screen__stage';

    // ── 좌측 브랜드/실황 패널 (넓은 화면에서만 노출)
    const intro = document.createElement('div');
    intro.className = 'login-screen__intro';

    const introBadge = document.createElement('div');
    introBadge.className = 'login-screen__intro-badge';
    introBadge.innerHTML = '<span class="login-screen__intro-dot"></span>FLOW-3D 시뮬레이션 대시보드';
    intro.appendChild(introBadge);

    const introTitle = document.createElement('h1');
    introTitle.className = 'login-screen__intro-title';
    introTitle.innerHTML = 'FLOW-3D 시뮬레이션'
    intro.appendChild(introTitle);

    const introDesc = document.createElement('p');
    introDesc.className = 'login-screen__intro-desc';
    introDesc.textContent =
      'FLOW-3D 시뮬레이션 결과를 불러와 유속·세굴심·유동장 데이터를 3D로 시각화하고 교각 안전성을 검토합니다.';
    intro.appendChild(introDesc);

    const stats = document.createElement('div');
    stats.className = 'login-screen__stats';
    for (const s of STATS) {
      const tile = document.createElement('div');
      tile.className = 'login-screen__stat';
      tile.innerHTML =
        `<span class="login-screen__stat-icon">${s.icon}</span>` +
        `<span class="login-screen__stat-body">` +
        `<span class="login-screen__stat-label">${s.label}</span>` +
        `<span class="login-screen__stat-value">${s.value}</span>` +
        `<span class="login-screen__stat-meter"><span class="login-screen__stat-meter-fill" style="--pct:${s.meterPct}%"></span></span>` +
        `</span>`;
      stats.appendChild(tile);
    }
    intro.appendChild(stats);
    stage.appendChild(intro);

    // ── 우측 로그인 카드
    const card = document.createElement('div');
    card.className = 'login-screen__card';

    const brand = document.createElement('div');
    brand.className = 'login-screen__brand';
    const logo = document.createElement('span');
    logo.className = 'login-screen__logo';
    logo.innerHTML = LOGO_SVG;
    const brandName = document.createElement('span');
    brandName.className = 'login-screen__brand-name';
    brandName.textContent = 'AI Scour';
    brand.appendChild(logo);
    brand.appendChild(brandName);
    card.appendChild(brand);

    const title = document.createElement('h2');
    title.className = 'login-screen__title';
    title.textContent = '교량 세굴 3D 대시보드';
    card.appendChild(title);

    this.form = document.createElement('form');
    this.form.className = 'login-screen__form';
    this.form.noValidate = true;

    const idField = document.createElement('div');
    idField.className = 'login-screen__field';
    const idIcon = document.createElement('span');
    idIcon.className = 'login-screen__field-icon';
    idIcon.innerHTML = USER_ICON_SVG;
    this.idInput = document.createElement('input');
    this.idInput.className = 'login-screen__input';
    this.idInput.type = 'text';
    this.idInput.autocomplete = 'username';
    this.idInput.placeholder = '아이디';
    this.idInput.setAttribute('aria-label', '아이디');
    idField.appendChild(idIcon);
    idField.appendChild(this.idInput);
    this.form.appendChild(idField);

    const pwField = document.createElement('div');
    pwField.className = 'login-screen__field';
    const pwIcon = document.createElement('span');
    pwIcon.className = 'login-screen__field-icon';
    pwIcon.innerHTML = LOCK_ICON_SVG;
    this.pwInput = document.createElement('input');
    this.pwInput.className = 'login-screen__input';
    this.pwInput.type = 'password';
    this.pwInput.autocomplete = 'current-password';
    this.pwInput.placeholder = '비밀번호';
    this.pwInput.setAttribute('aria-label', '비밀번호');
    this.pwToggle = document.createElement('button');
    this.pwToggle.type = 'button';
    this.pwToggle.className = 'login-screen__field-toggle';
    this.pwToggle.innerHTML = EYE_ICON_SVG;
    this.pwToggle.setAttribute('aria-label', '비밀번호 표시');
    pwField.appendChild(pwIcon);
    pwField.appendChild(this.pwInput);
    pwField.appendChild(this.pwToggle);
    this.form.appendChild(pwField);

    this.errorEl = document.createElement('div');
    this.errorEl.className = 'login-screen__error';
    this.form.appendChild(this.errorEl);

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'login-screen__submit';
    const submitLabel = document.createElement('span');
    submitLabel.textContent = '로그인';
    const submitIcon = document.createElement('span');
    submitIcon.className = 'login-screen__submit-icon';
    submitIcon.innerHTML = ARROW_ICON_SVG;
    submit.appendChild(submitLabel);
    submit.appendChild(submitIcon);
    this.form.appendChild(submit);

    card.appendChild(this.form);
    stage.appendChild(card);

    this.element.appendChild(stage);

    this.onToggle = () => {
      const show = this.pwInput.type === 'password';
      this.pwInput.type = show ? 'text' : 'password';
      this.pwToggle.innerHTML = show ? EYE_OFF_ICON_SVG : EYE_ICON_SVG;
      this.pwToggle.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 표시');
    };
    this.pwToggle.addEventListener('click', this.onToggle);

    this.onSubmit = (e: Event) => {
      e.preventDefault();
      const ok = this.idInput.value.trim() === DEMO_ID && this.pwInput.value === DEMO_PW;
      if (ok) {
        this.errorEl.classList.remove('is-visible');
        card.classList.add('is-success');
        submit.disabled = true;
        window.setTimeout(() => options.onSuccess(), 260);
        return;
      }
      this.errorEl.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
      this.errorEl.classList.add('is-visible');
      card.classList.remove('is-shaking');
      // 리플로우를 강제해 동일 클래스 재적용 시에도 애니메이션이 다시 재생되게 한다.
      void card.offsetWidth;
      card.classList.add('is-shaking');
      this.pwInput.value = '';
      this.pwInput.focus();
    };
    this.form.addEventListener('submit', this.onSubmit);

    requestAnimationFrame(() => this.idInput.focus());
  }

  public dispose(): void {
    this.form.removeEventListener('submit', this.onSubmit);
    this.pwToggle.removeEventListener('click', this.onToggle);
    this.element.remove();
  }
}
