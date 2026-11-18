// Vice Harbor v2.1 — headless self-check (simCheck).
// v2.1: rewritten under the new sealed recording; same 15 checks as v2.
// Drives the real game in headless Chrome over CDP (Node's built-in
// WebSocket, no dependencies) and asserts the core loop works:
//   1. plain load: no console errors, game object present
//   2. first story job plays to completion, cash + respect move
//   3. one race (Harbor Regatta) plays to completion, race won
//   4. a save is written to localStorage (v2 key)
//   5. every ?shot= scene loads with no console errors
// Exit 0 only when every check passes. Usage:
//   node tools/simCheck.mjs [--port 8080] [--chrome <path>]

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT = portIdx === -1 ? 8080 : Number(args[portIdx + 1]);
const chromeIdx = args.indexOf('--chrome');
const CHROME = chromeIdx === -1
  ? join(homedir(), '.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell')
  : args[chromeIdx + 1];
const DEBUG_PORT = 9223;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function waitFor(fn, timeoutMs = 30000, label = 'condition') {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await fn()) return true;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${label}`);
}

// --- CDP plumbing ---------------------------------------------------------
let chrome = null;
async function startChrome() {
  chrome = spawn(CHROME, [
    '--headless', '--no-sandbox', '--disable-gpu',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1280,720', 'about:blank',
  ], { stdio: 'ignore' });
  await waitFor(async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      return r.ok;
    } catch { return false; }
  }, 30000, 'chrome devtools');
}

async function newPage(url) {
  const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const target = await r.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(String(msg.params?.exceptionDetails?.exception?.description || 'exception'));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  const evaluate = async (expr) => {
    const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || 'evaluate failed');
    return res.result?.value;
  };
  const close = async () => {
    try { ws.close(); } catch { /* already closed */ }
    try { await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${target.id}`); } catch { /* gone */ }
  };
  return { evaluate, close, consoleErrors };
}

async function waitReady(page) {
  await waitFor(async () => {
    try {
      return (await page.evaluate(`window.__shotReady === true`)) === true;
    } catch { return false; }
  }, 30000, 'page ready');
}

// --- the checks -------------------------------------------------------------
async function main() {
  await startChrome();
  try {
    // 1. Plain load.
    let page = await newPage(`http://127.0.0.1:${PORT}/?seed=1`);
    await waitReady(page);
    const plainErrors = await page.evaluate(`window.__errors`);
    check('plain load: no console errors', plainErrors.length === 0, JSON.stringify(plainErrors));
    check('plain load: game object present', (await page.evaluate(`!!window.__game`)) === true);
    check('plain load: title READY', (await page.evaluate(`document.title`)) === 'READY');
    await page.close();

    // 2. First story job to completion.
    page = await newPage(`http://127.0.0.1:${PORT}/?seed=1`);
    await waitReady(page);
    const job = await page.evaluate(`(() => {
      const G = window.__game;
      G.startGame(null);
      const cash0 = G.cash;
      window.__test.startMission(0);
      // Walk the player to the beacon and step the real loop.
      const spot = { x: 150, z: -182 };
      G.player.mesh.position.set(spot.x, 0, spot.z);
      for (let i = 0; i < 600; i++) G.update(1 / 60);
      return {
        missionsDone: G.missionsDone, cash: G.cash, cash0,
        respect: G.stats.respect, turf: G.stats.turfOwned.slice(),
        errors: window.__errors,
      };
    })()`);
    check('job 1 completes', job.missionsDone === 1, `missionsDone=${job.missionsDone}`);
    check('job 1 pays cash', job.cash > job.cash0, `$${job.cash0} -> $${job.cash}`);
    check('job 1 grants respect + turf', job.respect >= 50 && job.turf.length >= 1, `respect=${job.respect} turf=${job.turf.join(',')}`);
    check('job 1: no console errors', job.errors.length === 0, JSON.stringify(job.errors));

    // 3. Harbor Regatta race to completion.
    const race = await page.evaluate(`(() => {
      const G = window.__game;
      G.stats.boatUnlocked = true;
      const ok = window.__test.startRace('regatta');
      if (!ok || !G.race) return { ok: false, errors: window.__errors };
      const boat = G.player.boat;
      // Sail through every gate, stepping the real loop.
      for (const cp of G.race.def.checkpoints) {
        boat.mesh.position.set(cp.x, 0.05, cp.z);
        for (let i = 0; i < 30; i++) G.update(1 / 60);
        if (!G.race) break;
      }
      for (let i = 0; i < 60; i++) G.update(1 / 60);
      return {
        ok: true, racesWon: G.stats.racesWon, racesRun: G.stats.racesRun,
        raceActive: !!G.race, cash: G.cash, errors: window.__errors,
      };
    })()`);
    check('race starts', race.ok === true);
    check('race completes and is won', race.racesWon === 1 && race.raceActive === false, `won=${race.racesWon} active=${race.raceActive}`);
    check('race: no console errors', (race.errors || []).length === 0, JSON.stringify(race.errors));

    // 4. Save written (v2 key).
    const save = await page.evaluate(`(() => {
      const G = window.__game;
      G.saveGame();
      const raw = localStorage.getItem('vice-harbor-save-v2');
      if (!raw) return { ok: false };
      const s = JSON.parse(raw);
      return { ok: true, missionsDone: s.missionsDone, hasStats: !!s.stats, cash: s.cash };
    })()`);
    check('save writes (v2 key)', save.ok === true && save.missionsDone === 1 && save.hasStats === true,
      JSON.stringify(save));
    await page.close();

    // 5. Every ?shot= scene loads clean.
    for (const shot of ['start', 'mission', 'race', 'stats']) {
      const sp = await newPage(`http://127.0.0.1:${PORT}/?shot=${shot}&seed=1`);
      await waitReady(sp);
      const errs = await sp.evaluate(`window.__errors`);
      check(`shot ${shot}: no console errors`, errs.length === 0, JSON.stringify(errs));
      await sp.close();
    }
  } finally {
    if (chrome) chrome.kill();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nsimCheck: ${results.length - failed}/${results.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`FAIL  simCheck crashed — ${e.message}`);
  if (chrome) chrome.kill();
  process.exit(1);
});
