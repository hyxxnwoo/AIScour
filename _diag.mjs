import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5173/';
const SAMPLE = resolve('public/data/sampledata.csv');

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
});

const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

// find the CSV upload panel + buttons
const found = await page.evaluate(() => {
  const panel = document.querySelector('.csv-upload-panel');
  const loadBtn = [...document.querySelectorAll('.csv-upload-panel__load')].map((b) => ({
    text: b.textContent,
    disabled: b.disabled,
    hidden: b.hidden,
  }));
  const fileInputs = document.querySelectorAll('.csv-upload-panel input[type=file]').length;
  return {
    panelExists: !!panel,
    loadBtn,
    fileInputs,
    status: document.querySelector('.csv-upload-panel__status')?.textContent,
  };
});
logs.push('[state before] ' + JSON.stringify(found));

// simulate picking the file into the first file input
const fileInput = await page.$('.csv-upload-panel input[type=file]');
if (fileInput) {
  await fileInput.uploadFile(SAMPLE);
  await new Promise((r) => setTimeout(r, 800));
}

const afterSelect = await page.evaluate(() => ({
  status: document.querySelector('.csv-upload-panel__status')?.textContent,
  loadDisabled: document.querySelector('.csv-upload-panel__load')?.disabled,
}));
logs.push('[after select] ' + JSON.stringify(afterSelect));

// click the parse button
await page.evaluate(() => {
  const btn = document.querySelector('.csv-upload-panel__load');
  btn?.click();
});

// poll status for up to 15s
for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await page.evaluate(() => ({
    status: document.querySelector('.csv-upload-panel__status')?.textContent,
    fluidRange: document.querySelector('.fluid-controls__range')?.textContent,
    uInput: document.querySelector('#fluid-q-velocityX')?.closest('.fluid-controls__field-row')?.querySelector('.fluid-controls__value-input')?.value,
    scrdifInput: [...document.querySelectorAll('.fluid-controls__value-input')].at(-1)?.value,
  }));
  logs.push(`[t+${i + 1}s] ` + JSON.stringify(s));
}

console.log(logs.join('\n'));
await browser.close();
