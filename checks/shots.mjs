// Vice Harbor — screenshot renderer.
// Opens the real game in headless Chromium at 1280x720 and captures the
// four required scenes (title, story job, race with standings, pause with
// stats) as JPEGs into screenshots/, plus a manifest with each shot's scene
// query and seed so the renders are reproducible.
// Usage: node checks/shots.mjs   (run from the repository root)
// Exit 0 only when all four shots exist and each is at most 256 KiB.

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8932;
const EXE = process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const SEED = 7;
const SHOTS = [
  { file: '1-title.jpg', scene: 'title', wait: 4500 },
  { file: '2-job.jpg', scene: 'job', wait: 4000 },
  { file: '3-race.jpg', scene: 'race', wait: 4500 },
  { file: '4-pause.jpg', scene: 'pause', wait: 4000 },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(path.join(ROOT, 'screenshots'), { recursive: true });
const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
const failures = [];
let browser = null;
try {
  await sleep(1200);
  browser = await chromium.launch({
    executablePath: EXE,
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const manifest = [];
  for (const shot of SHOTS) {
    const url = `http://127.0.0.1:${PORT}/?scene=${shot.scene}&seed=${SEED}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.VH && window.THREE, null, { timeout: 20000 });
    await sleep(shot.wait);
    const out = path.join(ROOT, 'screenshots', shot.file);
    await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
    const size = statSync(out).size;
    const ok = size <= 262144 && size > 10000;
    if (!ok) failures.push(`FAIL ${shot.file} size ${size} bytes`);
    else console.log(`PASS ${shot.file} ${size} bytes`);
    manifest.push({ file: shot.file, scene: shot.scene, query: `?scene=${shot.scene}&seed=${SEED}`, seed: SEED, bytes: size });
  }
  writeFileSync(path.join(ROOT, 'checks', 'shots.json'),
    JSON.stringify({ seed: SEED, viewport: '1280x720', shots: manifest }, null, 2) + '\n');
  if (errors.length) failures.push('FAIL console errors during shots: ' + errors.slice(0, 3).join(' | '));
  else console.log('PASS no console errors during shots');
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(failures.length === 0 ? 'SHOTS: ALL PASS' : 'SHOTS: ' + failures.length + ' FAILURES');
process.exit(failures.length === 0 ? 0 : 1);
