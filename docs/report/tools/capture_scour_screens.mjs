// 화면 10종 캡처(헤드리스 Chrome + DevTools Protocol). 사용: node capture10.mjs <출력 폴더> <CSV 경로> [W H]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve(process.argv[2]);
const CSVFILE = resolve(process.argv[3]);
const W = Number(process.argv[4] || 1920);
const H = Number(process.argv[5] || 1080);
mkdirSync(outDir, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9444;

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${outDir}/profile`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  `--window-size=${W},${H}`, '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i += 1) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    if (targets.some((t) => t.type === 'page')) break;
  } catch {}
  await sleep(500);
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (['error', 'warning'].includes(msg.params.type)) logs.push(`[${msg.params.type}] ${text.slice(0, 500)}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('[exception] ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).slice(0, 500));
  }
};
const send = (method, params = {}) => new Promise((resolve) => { id += 1; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value ?? r.result?.exceptionDetails?.text;
};
const shot = async (name) => {
  await collect(name);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};
const key = (code) => ev(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'${code}',bubbles:true})); true`);
const go = async (n, wait = 2500) => { await ev(`location.hash='#s/${n}'; true`); await sleep(wait); };
const seekFrac = (f) => ev(`(()=>{const r=document.querySelector('.time-controls__slider'); if(!r) return false; r.value=String(Number(r.min||0)+${f}*(Number(r.max)-Number(r.min||0))); r.dispatchEvent(new Event('input',{bubbles:true})); r.dispatchEvent(new Event('change',{bubbles:true})); return r.value;})()`);
const setPlaying = (want) => ev(`(()=>{const b=document.querySelector('.time-controls__play'); if(!b) return false; const p=b.textContent==='⏸'; if(p!==${want}) b.click(); return true;})()`);
const setLayer = (label, want) => ev(`(() => { const l=[...document.querySelectorAll('.cfd-layer-panel__row')].find(r=>r.textContent.includes('${label}')); const b=l?.querySelector('input'); if(!b||b.disabled) return false; if(b.checked!==${want}) b.click(); return true; })()`);


// 화면별 번호 마커 대상(셀렉터). 좌표는 캡처 직후 DOM 에서 읽는다. outline:false 는 번호만 표시(큰 3D 영역용).
const SPECS = {
  s01_login: [['.login-screen__intro'], ['.login-screen__stats'], ['.login-screen__card'], ['.login-screen__submit']],
  s02_cases: [['.global-nav'], ['.case-bi-strip'], ['.case-new-sim__cta'], ['.mgmt-filter-row'], ['.mgmt-table-wrap'], ['.case-sel-summary'], ['.mgmt-pager']],
  s03_data_pipeline: [['.pipeline-stage-strip'], ['.mgmt-panel'], ['.pipeline-kpi'], ['.data-pipeline__upload-note'], ['.data-pipeline__pager']],
  s04_condition: [['.condition-setup-case'], ['.csv-setup-flow'], ['.csv-upload-panel__actions'], ['.fluid-controls'], ['.viewer-main', false], ['.viewer-toast'], ['.time-controls']],
  s05_viewer: [['.case-switcher'], ['.fluid-controls'], ['.dashboard-customize'], ['.viewer-main', false], ['.fluid-field-legend'], ['.view-mode-toggle'], ['.camera-presets'], ['.pier-scour-monitor'], ['.color-legend'], ['.time-controls']],
  s06_plan_section: [['.plan-view-guide'], ['.plan-view-overlay'], ['.section-profile-panel__chart'], ['.section-profile-panel__kpis'], ['.pier-scour-monitor'], ['.time-controls']],
  s07_grade_bed: [['.grade-legend-panel'], ['.viewer-main', false], ['.pier-scour-monitor'], ['.color-legend'], ['.time-controls']],
  s08_timeline: [['.viewer-main', false], ['.pier-timeline-panel__chart-wrap'], ['.pier-timeline-panel__gantt'], ['.pier-timeline-panel__reach'], ['.pier-scour-monitor'], ['.time-controls']],
  s09_risk: [['.risk-judgment-panel__summary'], ['.risk-judgment-panel__cards'], ['.viewer-main', false], ['.color-legend'], ['.time-controls']],
  s10_alert_sop: [['.alert-sop-kpi-strip'], ['.alert-sop-flow'], ['.alert-sop-page__col'], ['.alert-sop-page__focus'], ['.alert-sop-page__sop-list'], ['.alert-sop-page__hist-block'], ['.alert-sop-page__grade-stack']],
  a01_cfd_pathlines: [['.view-mode-toggle'], ['.cfd-layer-panel'], ['.viewer-main', false], ['.cfd-velocity-colorbar'], ['.cfd-frame-readout'], ['.axis-triad']],
  a02_cfd_bed_isolines: [['.cfd-layer-panel'], ['.viewer-main', false], ['.color-legend'], ['.cfd-frame-readout'], ['.axis-triad']],
  a03_cfd_cutplane: [['.cfd-layer-panel'], ['.viewer-main', false], ['.cfd-velocity-colorbar']],
};
const ALL_RECTS = {};
function rectFn(sels) {
  return sels.map(([sel]) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 4 && r.height > 4 && st.display !== 'none' && st.visibility !== 'hidden'; });
    const e = els[0];
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
}
const collect = async (name) => {
  const specs = SPECS[name];
  if (!specs) return;
  const rects = await ev('(' + rectFn.toString() + ')(' + JSON.stringify(specs) + ')');
  ALL_RECTS[name] = specs.map((sp, i) => ({ n: i + 1, sel: sp[0], outline: sp[1] !== false, rect: rects[i] }));
  const miss = ALL_RECTS[name].filter((x) => !x.rect).map((x) => x.sel);
  if (miss.length) console.log('  MISSING', name, miss.join(', '));
};

await send('Page.enable');
await send('Runtime.enable');
await send('DOM.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

const url = 'http://localhost:5199/';
// ── 1. 로그인 (미인증 상태)
await send('Page.navigate', { url });
await sleep(2500);
await ev(`sessionStorage.clear(); localStorage.clear(); true`);
await send('Page.navigate', { url: url + '#s/1' });
await send('Page.reload');
await sleep(4500);
console.log('s1 hash', await ev('location.hash'), 'title', await ev('document.title'));
await shot('s01_login');

// ── 인증 후 조건 설정 → CSV 업로드·파싱
await ev(`sessionStorage.setItem('aiscour.authenticated','1'); true`);
await send('Page.navigate', { url: url + '#s/4' });
await send('Page.reload');
await sleep(6000);
await go(4, 2500);
console.log('picker', await ev(`(()=>{const b=document.querySelector('.csv-upload-panel__pick'); if(!b) return false; b.click(); return true;})()`));
await sleep(1500);
const doc = (await send('DOM.getDocument', { depth: -1 })).result.root.nodeId;
const q = await send('DOM.querySelector', { nodeId: doc, selector: 'input[type=file]' });
await send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [CSVFILE] });
await sleep(2500);
for (let i = 0; i < 10; i += 1) {
  const r = await ev(`(()=>{const vis=(e)=>e&&!e.disabled&&e.offsetParent!==null; const c=document.querySelector('.csv-setup-modal__confirm'); if(vis(c)){c.click();return 'confirm';} const n=document.querySelector('.csv-setup-modal__next'); if(vis(n)){n.click();return 'next';} return 'none';})()`);
  if (r === 'confirm' || r === 'none') break;
  await sleep(800);
}
await sleep(1500);
console.log('parse', await ev(`(()=>{const b=document.querySelector('.csv-upload-panel__load'); if(b&&!b.disabled){b.click();return true;} return 'disabled';})()`));
for (let i = 0; i < 40; i += 1) {
  await sleep(1000);
  if (await ev(`(()=>{const b=document.querySelector('.csv-upload-panel__apply-scene'); return !!b&&!b.disabled;})()`)) break;
}
console.log('status', await ev(`document.querySelector('.csv-upload-panel__status')?.textContent`));
await sleep(1200);
await shot('s04_condition');

// ── 적용 → 3D 세굴 가시화
await ev(`document.querySelector('.csv-upload-panel__apply-scene')?.click(); true`);
await sleep(9000);
console.log('after apply hash', await ev('location.hash'));
await setPlaying(false);
await seekFrac(1);
await sleep(2500);
await key('KeyR');
await sleep(1500);
await shot('s05_viewer');


const clickByText = (sel, txt) => ev(`(()=>{const l=[...document.querySelectorAll('${sel}')].find(e=>e.textContent.includes('${txt}')); const i=l?.querySelector('input')||l; if(!i) return false; i.click(); return true;})()`);
const setExag = (v) => ev(`(()=>{const s=document.getElementById('case-switcher-exaggeration'); if(!s) return false; s.value='${v}'; s.dispatchEvent(new Event('change',{bubbles:true})); return s.value;})()`);
const wheel = async (x, y, n, dy) => { for (let i = 0; i < n; i += 1) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); await sleep(120); } };
await setPlaying(false);
await seekFrac(1);
await sleep(2000);
console.log('water', await ev(`(()=>{const l=[...document.querySelectorAll('.fluid-controls label')].find(e=>e.textContent.includes('지형 위 수면')); const i=l?.querySelector('input'); if(!i) return 'none'; if(i.checked) i.click(); return i.checked;})()`));
await sleep(800);
console.log('exag', await setExag('4'));
await sleep(1500);
await go(5, 3500);
await setPlaying(false);
await seekFrac(1);
await sleep(2000);
console.log('water', await ev(`(()=>{const l=[...document.querySelectorAll('.fluid-controls label')].find(e=>e.textContent.includes('지형 위 수면')); const i=l?.querySelector('input'); if(!i) return 'none'; if(i.checked) i.click(); return i.checked;})()`));
await sleep(800);
console.log('exag', await setExag('4'));
await sleep(1500);
await key('KeyR'); await sleep(700);
await wheel(940, 640, 3, -300); await sleep(1800);
await shot('x_obl_x4');
await setExag('1'); await sleep(1500);
await shot('x_obl_x1');
await setExag('4'); await sleep(800);
await key('KeyT'); await sleep(900);
await wheel(960, 640, 3, -300); await sleep(1800);
await shot('x_top_x4');
console.log('--- console errors/warnings ---');
for (const l of [...new Set(logs)].slice(0, 30)) console.log(l);
ws.close();
chrome.kill();
process.exit(0);
