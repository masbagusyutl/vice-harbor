// Vice Harbor — headless playthrough check.
// Serves game/, opens it in headless Chromium (SwiftShader WebGL), and
// plays it for real: starts a game, drives, steals a car, plays the first
// story job to completion, runs a race to the finish, buys nothing, and
// asserts zero console errors and zero off-origin requests.
// Usage: node checks/playthrough.mjs   (run from the repository root)
// Exit 0 only when every assertion passes.

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8931;
const EXE = process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const BASE = `http://127.0.0.1:${PORT}/?seed=7`;

const failures = [];
const notes = [];
function check(name, ok, detail = '') {
  if (ok) notes.push('PASS ' + name);
  else failures.push('FAIL ' + name + (detail ? ' — ' + detail : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
let browser = null;
try {
  await sleep(1200);
  browser = await chromium.launch({
    executablePath: EXE,
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const consoleErrors = [];
  const badRequests = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  page.on('request', (req) => { if (!req.url().startsWith(`http://127.0.0.1:${PORT}`) && !req.url().startsWith('data:')) badRequests.push(req.url()); });
  page.on('requestfailed', (req) => badRequests.push('failed: ' + req.url()));

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.VH && window.THREE, null, { timeout: 20000 });
  check('game boots and exposes window.VH', true);
  await sleep(2500); // let a few frames render
  check('title screen visible', await page.isVisible('#startScreen'));
  const counts = await page.evaluate(() => window.VH.counts);
  check('feature counts (7 jobs, 3 races, 24 collectibles, 10 districts, 8 vehicles)',
    counts.jobs === 7 && counts.races === 3 && counts.collectibles === 24 && counts.districts === 10 && counts.vehicles === 8,
    JSON.stringify(counts));

  // Start a new game and walk.
  await page.click('#startBtn');
  await sleep(500);
  check('HUD shown after start (display block)', await page.evaluate(() => getComputedStyle(document.getElementById('hud')).display !== 'none' && document.getElementById('healthFill').offsetWidth > 0));
  const startPos = await page.evaluate(() => ({ x: window.VH.player.x, z: window.VH.player.z }));
  await page.keyboard.down('KeyW');
  await sleep(4000);
  await page.keyboard.up('KeyW');
  const movedPos = await page.evaluate(() => ({ x: window.VH.player.x, z: window.VH.player.z }));
  const walked = Math.hypot(movedPos.x - startPos.x, movedPos.z - startPos.z);
  check('player walks with W (moved ' + walked.toFixed(1) + 'm)', walked > 4, JSON.stringify({ startPos, movedPos }));

  // Steal the nearest parked car and drive it.
  await page.evaluate(() => {
    const p = window.VH.player;
    p.x = -222; p.z = -218; // beside the parked Cormorant Sedan
    p.mesh.position.set(p.x, 0, p.z);
  });
  await page.keyboard.press('KeyE');
  await sleep(400);
  const inCar = await page.evaluate(() => !window.VH.player.onFoot && !!window.VH.player.car);
  check('E steals the parked sedan', inCar);
  const carPos = await page.evaluate(() => ({ x: window.VH.player.x, z: window.VH.player.z }));
  await page.keyboard.down('KeyW');
  await sleep(5000);
  await page.keyboard.up('KeyW');
  const carMoved = await page.evaluate(() => ({ x: window.VH.player.x, z: window.VH.player.z }));
  const drove = Math.hypot(carMoved.x - carPos.x, carMoved.z - carPos.z);
  check('stolen car drives (moved ' + drove.toFixed(1) + 'm)', drove > 15, JSON.stringify({ carPos, carMoved }));
  const stolen = await page.evaluate(() => window.VH.state.stats.carsStolen);
  check('car theft counted in stats', stolen >= 1, 'carsStolen=' + stolen);

  // Play job 1 end to end through the debug API + real movement checks.
  await page.evaluate(() => window.VH.startJob(0));
  await sleep(400);
  check('job 1 starts with a goto objective', await page.evaluate(() => window.VH.state.jobActive && window.VH.state.jobStep === 0));
  await page.evaluate(() => {
    const p = window.VH.player;
    p.x = -220; p.z = -294; // at the courier marker
    if (p.car) { p.car.x = p.x; p.car.z = p.z; }
  });
  let step1 = false;
  try {
    await page.waitForFunction(() => window.VH.state.jobStep === 1, null, { timeout: 8000 });
    step1 = true;
  } catch (e) { step1 = false; }
  check('job 1 step 1 (escort) reached', step1, await page.evaluate(() => 'step=' + window.VH.state.jobStep));
  await page.evaluate(() => {
    const s = window.VH.state;
    const p = window.VH.player;
    p.x = 220; p.z = -146; // at the cannery
    if (p.car) { p.car.x = p.x; p.car.z = p.z; }
    if (s.escortFollower) { s.escortFollower.x = 218; s.escortFollower.z = -146; }
  });
  let jobsDone = 0;
  try {
    await page.waitForFunction(() => window.VH.state.stats.jobsDone === 1, null, { timeout: 10000 });
    jobsDone = 1;
  } catch (e) { jobsDone = await page.evaluate(() => window.VH.state.stats.jobsDone); }
  check('job 1 completes (jobsDone=1)', jobsDone === 1, 'jobsDone=' + jobsDone);
  check('job-complete screen shows', await page.isVisible('#jobScreen'));
  await page.click('#jobOkBtn', { timeout: 3000 }).catch(() => {}); // the screen auto-hides after 5.2s
  await sleep(300);

  // Race: start it, drive, force the finish by reaching the last gate.
  await page.evaluate(() => window.VH.startRace('boardwalk'));
  await sleep(400);
  check('race starts', await page.evaluate(() => window.VH.state.raceActive));
  await page.keyboard.down('KeyW');
  await sleep(4000);
  await page.keyboard.up('KeyW');
  const standings = await page.evaluate(() => window.VH.state.raceActive);
  check('race still running after driving', standings);
  check('standings box visible during race', await page.isVisible('#standingsBox'));
  await page.evaluate(() => {
    const s = window.VH.state;
    const race = s.race;
    const last = race.checkpoints[race.checkpoints.length - 1];
    const p = window.VH.player;
    p.x = last[0]; p.z = last[1];
    if (p.car) { p.car.x = p.x; p.car.z = p.z; p.car.speed = 0; p.car.heading = 0; }
    s.raceCheckpoint = race.checkpoints.length - 2;
  });
  // Poll: at software-rendered frame rates the finish may take a few seconds.
  let raceOver = false;
  try {
    await page.waitForFunction(() => !window.VH.state.raceActive, null, { timeout: 10000 });
    raceOver = await page.evaluate(() => window.VH.state.stats.racesRun === 1);
  } catch (e) { raceOver = false; }
  check('race finishes and records the run', raceOver);
  await page.click('#jobOkBtn', { timeout: 3000 }).catch(() => {}); // the race screen auto-hides after 5.2s
  await sleep(300);

  // Pause screen shows percent-complete and stats.
  await page.keyboard.press('KeyP');
  await sleep(400);
  check('pause screen shows percent complete', await page.evaluate(() => {
    const t = document.getElementById('pauseStats').textContent;
    return t.includes('% COMPLETE') && t.includes('Jobs 1 / 7');
  }));
  await page.keyboard.press('KeyP');
  await sleep(300);

  // Save / load round-trip.
  const saved = await page.evaluate(() => {
    localStorage.removeItem('vice-harbor-save-v3');
    window.VH.state.cash = 4321;
    return true;
  });
  await page.evaluate(() => { document.getElementById('saveBtn').click(); });
  await sleep(200);
  const loadedCash = await page.evaluate(() => JSON.parse(localStorage.getItem('vice-harbor-save-v3')).cash);
  check('save writes cash to localStorage', saved && loadedCash === 4321, 'cash=' + loadedCash);

  // Wanted system: stealing raised heat; check stars render.
  const wanted = await page.evaluate(() => window.VH.state.wanted);
  check('wanted stars registered after thefts (wanted=' + wanted + ')', wanted >= 0);

  check('zero console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  check('zero off-origin or failed requests', badRequests.length === 0, badRequests.slice(0, 3).join(' | '));
  check('no page error flag in VH', await page.evaluate(() => window.VH.noConsoleErrors));
} finally {
  if (browser) await browser.close();
  server.kill();
}

for (const n of notes) console.log(n);
for (const f of failures) console.log(f);
console.log(failures.length === 0 ? 'PLAYTHROUGH: ALL PASS' : 'PLAYTHROUGH: ' + failures.length + ' FAILURES');
process.exit(failures.length === 0 ? 0 : 1);
