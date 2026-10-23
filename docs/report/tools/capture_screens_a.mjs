// 헤드리스 Chrome(CDP)으로 앱을 띄워 CFD 화면을 캡처한다. 사용: node shot.mjs <outDir>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

import { resolve } from 'node:path';
const outDir = resolve(process.argv[2]);
mkdirSync(outDir, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const profile = outDir + '/profile';

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--window-size=1600,900',
  '--hide-scrollbars',
  'about:blank',
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
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (['error', 'warning'].includes(msg.params.type)) logs.push(`[${msg.params.type}] ${text.slice(0, 600)}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('[exception] ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).slice(0, 600));
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value ?? r.result?.exceptionDetails?.text;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });


const CSVFILE = resolve('./csv/s01.csv');
const url = 'http://localhost:5199/';
await send('Page.navigate', { url });
await sleep(2500);
await evalJs(`sessionStorage.setItem('aiscour.authenticated','1'); localStorage.removeItem('aiscour.viewMode'); true`);
await send('Page.navigate', { url: url + '#s/4' });
await send('Page.reload');
await sleep(6000);
await evalJs(`location.hash = '#s/4'; true`);
await sleep(2500);
console.log('open picker:', await evalJs(`(()=>{const b=document.querySelector('.csv-upload-panel__pick'); if(!b) return false; b.click(); return true;})()`));
await sleep(1500);
const doc = (await send('DOM.getDocument', { depth: -1 })).result.root.nodeId;
const q = await send('DOM.querySelector', { nodeId: doc, selector: 'input[type=file]' });
console.log('file input node', q.result.nodeId);
await send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [CSVFILE] });
await sleep(2500);
for (let i = 0; i < 10; i += 1) {
  const r = await evalJs(`(()=>{
    const vis = (el)=> el && !el.disabled && el.offsetParent !== null;
    const confirm=document.querySelector('.csv-setup-modal__confirm');
    if (vis(confirm)) { confirm.click(); return 'confirm'; }
    const next=document.querySelector('.csv-setup-modal__next');
    if (vis(next)) { next.click(); return 'next'; }
    return 'none';
  })()`);
  console.log('wizard', i, r);
  if (r === 'confirm' || r === 'none') break;
  await sleep(800);
}
await sleep(1500);
console.log('parse:', await evalJs(`(()=>{const b=document.querySelector('.csv-upload-panel__load'); if(b&&!b.disabled){b.click();return true;} return 'disabled/none';})()`));
for (let i = 0; i < 40; i += 1) {
  await sleep(1000);
  const ready = await evalJs(`(()=>{const b=document.querySelector('.csv-upload-panel__apply-scene'); return !!b && !b.disabled;})()`);
  if (ready) break;
}
console.log('status:', await evalJs(`document.querySelector('.csv-upload-panel__status')?.textContent`));
console.log('apply:', await evalJs(`(()=>{const b=document.querySelector('.csv-upload-panel__apply-scene'); if(b&&!b.disabled){b.click();return true;} return 'disabled/none';})()`));
await sleep(9000);

console.log('hash:', await evalJs('location.hash'));
const key = (code) => evalJs(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'${code}',bubbles:true})); true`);
const clickLayer = (label) => evalJs(`(() => { const l=[...document.querySelectorAll('.cfd-layer-panel__row')].find(r=>r.textContent.includes('${label}')); const b=l?.querySelector('input'); if(b && !b.disabled){ b.click(); return true;} return false; })()`);
const layerChecked = (label) => evalJs(`(() => { const l=[...document.querySelectorAll('.cfd-layer-panel__row')].find(r=>r.textContent.includes('${label}')); return l?.querySelector('input')?.checked; })()`);
const setLayer = async (label, want) => { if ((await layerChecked(label)) !== want) await clickLayer(label); };
const seekFrac = (f) => evalJs(`(()=>{const r=document.querySelector('.time-controls__slider'); if(!r) return false; r.value=String(Number(r.min||0)+${f}*(Number(r.max)-Number(r.min||0))); r.dispatchEvent(new Event('input',{bubbles:true})); r.dispatchEvent(new Event('change',{bubbles:true})); return r.value;})()`);
const setPlaying = (want) => evalJs(`(()=>{const b=document.querySelector('.time-controls__play'); const playing=b.textContent==='⏸'; if(playing!==${want}) b.click(); return true;})()`);
const mouse = async (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 }); };
const zoom = async (x, y, steps, dy) => { for (let i = 0; i < steps; i += 1) { await mouse('mouseWheel', x, y, { deltaX: 0, deltaY: dy }); await sleep(120); } };

// ── 기본 모드, 마지막 시점
await setPlaying(false);
await seekFrac(1);
await sleep(2000);
await key('KeyR');
await sleep(1500);
await shot('20_basic_end');

// ── CFD 모드: 하상 표현
await evalJs(`document.querySelector('.view-mode-toggle [data-mode="cfd"]')?.click(); true`);
await sleep(2500);
await setLayer('유선', false);
await setLayer('수면', false);
await sleep(1500);
await shot('21_cfd_bed_persp');
await key('KeyT');
await sleep(2000);
await shot('22_cfd_bed_top');
await setLayer('등심선', true);
await sleep(2000);
await shot('23_cfd_isolines_top');
await setLayer('메시', true);
await sleep(2000);
await shot('24_cfd_mesh_top');
await setLayer('메시', false);
await seekFrac(0.17);
await sleep(2000);
await shot('25_cfd_isolines_t300');
await seekFrac(0.5);
await sleep(2000);
await shot('26_cfd_isolines_t900');
await seekFrac(1);
await sleep(2000);

// ── 하상 클릭 프로브
await click(840, 560);
await sleep(1200);
await shot('27_cfd_probe');
await evalJs(`document.querySelector('.cfd-probe-panel__close')?.click(); true`);

// ── 유동장: 교량을 끄고 유선 + 후류 근접
await setLayer('등심선', false);
await setLayer('교량', false);
await setLayer('수면', true);
await setLayer('유선', true);
await seekFrac(0.9);
await setPlaying(true);
await key('KeyT');
await sleep(500);
await zoom(800, 470, 6, -300);
await sleep(6000);
await shot('28_cfd_pathlines_wake_top');
await sleep(2500);
await shot('28b_cfd_pathlines_wake_top');
await key('KeyR');
await sleep(500);
await zoom(790, 470, 3, -300);
await sleep(5000);
await shot('29_cfd_pathlines_persp');

// ── 벡터
await setLayer('유선', false);
await setLayer('벡터', true);
await key('KeyT');
await sleep(500);
await zoom(800, 470, 3, -300);
await sleep(3500);
await shot('30_cfd_vectors_top');
await setLayer('벡터', false);

// ── 단면
await setLayer('단면', true);
await key('KeyR');
await sleep(500);
await zoom(790, 470, 2, -300);
await sleep(3500);
await shot('31_cfd_cutplane');
await setPlaying(false);
console.log('--- console errors/warnings ---');
for (const l of [...new Set(logs)].slice(0, 30)) console.log(l);
ws.close();
chrome.kill();
process.exit(0);
