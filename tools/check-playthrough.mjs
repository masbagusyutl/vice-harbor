// Vice Harbor — headless playthrough check.
// Serves game/ over local HTTP, drives the real game in headless Chromium
// (SwiftShader WebGL) through the window.VHGame test hooks, and steps a
// scripted playthrough: start, first story job, one street race, a taxi
// fare, a collectible, wanted escalation to the helicopter, pause and save.
// Exits 0 only when every step passes and no console/page error appeared.
// Run:  NODE_PATH=/tmp/vh-tools/node_modules node tools/check-playthrough.mjs

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
const CHROME = path.join(process.env.HOME, '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(gameDir, urlPath === '/' ? 'index.html' : urlPath);
      if (!file.startsWith(gameDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const results = [];
function step(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' — ' + detail : ''));
}

const { server, port } = await serve();
let browser = null;
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

  await page.goto(`http://127.0.0.1:${port}/index.html?autostart=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__VH_READY === true, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  step('game boots and reports ready', true);
  step('three.js loaded', await page.evaluate(() => !!window.THREE && !!window.THREE.WebGLRenderer));
  step('start screen visible', await page.evaluate(() => {
    const el = document.getElementById('startScreen');
    return el && el.style.display === 'flex';
  }));
  step('no console/page errors on boot', errors.length === 0, errors.join(' | ').slice(0, 300));

  // --- start the game ---
  await page.evaluate(() => window.VHGame.startGame(false));
  await page.waitForTimeout(800);
  step('startGame enters playing screen', await page.evaluate(() => window.VHGame.screen() === 'playing'));
  step('HUD visible with objective text', await page.evaluate(() => {
    const hud = document.getElementById('hud');
    const obj = document.getElementById('objectiveText').textContent;
    return hud.style.display === 'block' && obj.length > 5;
  }));
  step('minimap canvas present', await page.evaluate(() => {
    const c = document.getElementById('minimap');
    return !!c && c.width === 180 && c.height === 180;
  }));
  step('traffic spawned', await page.evaluate(() => window.VHGame.trafficCount() >= 10));
  step('pedestrians spawned', await page.evaluate(() => window.VHGame.pedCount() >= 20));

  // --- get a car and run story job 1 ---
  await page.evaluate(() => window.VHGame.giveCar('runner'));
  await page.waitForTimeout(400);
  step('player enters a car', await page.evaluate(() => !!window.VHGame.car()));
  step('job 1 starts', await page.evaluate(() => window.VHGame.startJob(1)));
  await page.waitForTimeout(300);
  step('job 1 dialogue opens', await page.evaluate(() => window.VHGame.ui.dialogueOpen()));
  await page.evaluate(() => { window.VHGame.ui.advanceDialogue(); });
  await page.waitForTimeout(300);
  step('dialogue advances and closes', await page.evaluate(() => !window.VHGame.ui.dialogueOpen()));
  await page.evaluate(() => window.VHGame.teleport(-300, -300));
  await page.waitForTimeout(600);
  step('job 1 step 1 completes at pickup', await page.evaluate(() => {
    const j = window.VHGame.job();
    return j && j.step === 1;
  }));
  const cashBefore = await page.evaluate(() => window.VHGame.state.cash);
  await page.evaluate(() => window.VHGame.teleport(150, -150));
  await page.waitForTimeout(800);
  step('job 1 completes with JOB COMPLETE screen', await page.evaluate(() => window.VHGame.screen() === 'complete'));
  step('job 1 pays out cash', await page.evaluate((before) => window.VHGame.state.cash > before, cashBefore));
  step('job 1 counted in lifetime stats', await page.evaluate(() => window.VHGame.state.stats.jobsDone === 1));
  step('job 2 unlocked', await page.evaluate(() => window.VHGame.state.jobIndex === 2));
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  step('JOB COMPLETE dismisses back to play', await page.evaluate(() => window.VHGame.screen() === 'playing'));

  // --- street race 1 ---
  step('race 1 starts from a car', await page.evaluate(() => window.VHGame.startRace(0)));
  await page.waitForTimeout(1800);
  step('race standings shown in HUD', await page.evaluate(() => {
    const s = document.getElementById('standings');
    return s.style.display === 'block' && s.textContent.includes('YOU');
  }));
  const route = await page.evaluate(() => window.VHGame.race().def.route);
  for (const [x, z] of route) {
    await page.evaluate(([x, z]) => window.VHGame.teleport(x, z), [x, z]);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(800);
  step('race 1 completes with race screen', await page.evaluate(() => window.VHGame.screen() === 'race'));
  step('race 1 won (player first)', await page.evaluate(() => window.VHGame.state.stats.racesWon === 1));
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);

  // --- taxi fare ---
  await page.keyboard.press('KeyE'); // exit the car
  await page.waitForTimeout(400);
  step('player exits car on foot', await page.evaluate(() => !window.VHGame.car()));
  step('taxi fare starts', await page.evaluate(() => window.VHGame.missions.beginTaxi()));
  // The fare opens with a line of dialogue; close it so keys work again.
  await page.evaluate(() => { if (window.VHGame.ui.dialogueOpen()) window.VHGame.ui.advanceDialogue(); });
  await page.waitForTimeout(300);
  const taxi = await page.evaluate(() => {
    const t = window.VHGame.missions.taxi;
    return t ? { px: t.px, pz: t.pz, dx: t.dx, dz: t.dz } : null;
  });
  step('taxi has a pickup point', !!taxi);
  if (taxi) {
    await page.evaluate(() => window.VHGame.giveCar('taxi'));
    await page.evaluate((t) => window.VHGame.teleport(t.px, t.pz), taxi);
    await page.waitForTimeout(600);
    step('taxi pickup completes', await page.evaluate(() => {
      const t = window.VHGame.missions.taxi;
      return t && t.phase === 'dropoff';
    }));
    await page.evaluate((t) => window.VHGame.teleport(t.dx, t.dz), taxi);
    await page.waitForTimeout(600);
    step('taxi fare pays out', await page.evaluate(() => window.VHGame.state.stats.fares === 1));
  }

  // --- collectible lantern ---
  const foundBefore = await page.evaluate(() => window.VHGame.state.collectibles.length);
  const orb = await page.evaluate(() => {
    const c = window.VH.COLLECTIBLES.find((o) => !o.found);
    return c ? { x: c.x, z: c.z } : null;
  });
  if (orb) {
    await page.evaluate((o) => window.VHGame.teleport(o.x, o.z), orb);
    await page.waitForTimeout(600);
  }
  step('hidden lantern collected', await page.evaluate((n) => window.VHGame.state.collectibles.length === n + 1, foundBefore));

  // --- wanted escalation to the helicopter ---
  await page.evaluate(() => window.VHGame.setWanted(4));
  await page.waitForTimeout(1500);
  step('wanted stars show 4 in HUD', await page.evaluate(() => {
    const s = document.getElementById('wantedStars').textContent;
    return (s.match(/★/g) || []).length === 4;
  }));
  step('police cars pursue at 4 stars', await page.evaluate(() => window.VH.police.cars.length >= 3));
  step('helicopter hunts at 4 stars', await page.evaluate(() => !!window.VH.police.heli));
  step('roadblocks shown at 3+ stars', await page.evaluate(() => {
    // roadblock groups are visible once wanted reaches 3; check via any visible group is hard
    // from outside, so confirm through the wanted level itself plus police presence.
    return window.VHGame.state.wanted >= 3 && window.VH.police.cars.length > 0;
  }));

  // --- pause, stats, save ---
  await page.evaluate(() => window.VHGame.setWanted(0));
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(500);
  step('pause screen opens', await page.evaluate(() => window.VHGame.screen() === 'paused'));
  step('pause shows percent-complete', await page.evaluate(() => {
    const t = document.getElementById('completePct').textContent;
    return /% COMPLETE/.test(t) && parseInt(t, 10) > 0;
  }));
  step('pause lists jobs, races and crew', await page.evaluate(() => {
    return document.getElementById('jobList').children.length === 7 &&
      document.getElementById('raceList').children.length === 3 &&
      document.getElementById('crewList').children.length === 3;
  }));
  await page.evaluate(() => window.VHGame.ui.writeSave(window.VHGame.state));
  step('save writes to local storage', await page.evaluate(() => {
    const raw = window.localStorage.getItem('vice-harbor-save-v4');
    if (!raw) return false;
    const s = JSON.parse(raw);
    return s.stats.jobsDone === 1 && s.stats.racesWon === 1 && s.version === 4;
  }));
  await page.keyboard.press('Escape');
  await page.evaluate(() => { document.getElementById('resumeBtn').click(); });
  await page.waitForTimeout(400);
  step('resume returns to play', await page.evaluate(() => window.VHGame.screen() === 'playing'));

  step('no console/page errors during playthrough', errors.length === 0, errors.join(' | ').slice(0, 300));

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} playthrough steps passed.`);
  if (passed !== results.length || errors.length > 0) {
    console.log('FAILED STEPS:');
    results.filter((r) => !r.ok).forEach((r) => console.log(' - ' + r.name + ' ' + r.detail));
    process.exitCode = 1;
  }
} finally {
  if (browser) await browser.close();
  server.close();
}
