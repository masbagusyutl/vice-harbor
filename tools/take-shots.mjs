// Vice Harbor — staged screenshot renderer.
// Serves game/ over local HTTP, opens each scene from shots.json in headless
// Chromium (SwiftShader WebGL) at 1280x720, and saves a real render of the
// running game as a JPEG under screenshots/. Fails if any shot is missing,
// over 256 KiB, or a page error appeared.
// Run:  NODE_PATH=/tmp/vh-tools/node_modules node tools/take-shots.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// playwright-core lives outside the repo (installed once under /tmp);
// override with PW_CORE_REQUIRE=/path/to/package.json if it moves.
const { chromium } = createRequire(
  process.env.PW_CORE_REQUIRE || '/tmp/vh-tools/package.json')('playwright-core');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const gameDir = path.join(repo, 'game');
const shotsDir = path.join(repo, 'screenshots');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'shots.json'), 'utf8'));
const CHROME = path.join(process.env.HOME, '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(gameDir, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(gameDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

let browser = null;
let failed = false;
try {
  browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
      '--disable-dev-shm-usage', '--window-size=1280,720']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  for (const shot of manifest.shots) {
    const url = `http://127.0.0.1:${port}/index.html${shot.query}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__VH_READY === true, null, { timeout: 30000 });
    // Let the scene settle: police arrive, the helicopter rises, the
    // dialogue and HUD draw, and the camera finds its framing.
    await page.waitForTimeout(shot.scene === 'night' ? 6500 : shot.scene === 'golden' ? 5000 : 4500);
    const out = path.join(shotsDir, shot.file);
    await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
    const size = fs.statSync(out).size;
    const ok = size <= 262144 && size > 10000;
    console.log((ok ? 'PASS' : 'FAIL') + `  ${shot.file}  ${size} bytes  (${shot.scene})`);
    if (!ok) failed = true;
  }
  if (errors.length > 0) {
    console.log('PAGE ERRORS during shots: ' + errors.join(' | ').slice(0, 500));
    failed = true;
  }
} finally {
  if (browser) await browser.close();
  server.close();
}
if (failed) process.exit(1);
console.log('All 4 screenshots rendered.');
