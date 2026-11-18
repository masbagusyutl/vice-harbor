// Vice Harbor v2.1 — full-story headless check (missionCheck).
// v2.1: rewritten under the new sealed recording; same 21 checks as v2.
// Plays all 7 story jobs to completion in headless Chrome over CDP
// (Node's built-in WebSocket, no dependencies), including the two
// branching choices, then a taxi fare, a Harbor Reel pickup, a boat
// boarding, a shop purchase and a crew hire. Asserts every job
// completes, the finale variant records, the save writes, and no
// console error appears anywhere. Exit 0 only when all pass.
// Usage: node tools/missionCheck.mjs [--port 8080]

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT = portIdx === -1 ? 8080 : Number(args[portIdx + 1]);
const CHROME = join(homedir(), '.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell');
const DEBUG_PORT = 9224;

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
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Runtime.enable');
  const evaluate = async (expr) => {
    const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || 'evaluate failed');
    return res.result?.value;
  };
  const close = async () => {
    try { ws.close(); } catch { /* already closed */ }
    try { await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${target.id}`); } catch { /* gone */ }
  };
  return { evaluate, close };
}

async function main() {
  await startChrome();
  try {
    const page = await newPage(`http://127.0.0.1:${PORT}/?seed=1`);
    await waitFor(async () => {
      try { return (await page.evaluate(`window.__shotReady === true`)) === true; } catch { return false; }
    }, 30000, 'page ready');

    const story = await page.evaluate(`(() => {
      const G = window.__game;
      G.startGame(null);
      const out = { jobs: [], errors: [] };
      const spots = [
        { x: 150, z: -182 }, { x: -150, z: 168 }, { x: 140, z: 28 },
        { x: 140, z: 168 }, { x: -168, z: -140 }, { x: 0, z: 168 }, { x: 0, z: 28 },
      ];
      for (let i = 0; i < 7; i++) {
        const before = G.missionsDone;
        window.__test.startMission(i);
        // Answer the two branching choices: lean on Vera (1), steal the boat (1).
        if (G.mission && G.mission.awaitingChoice) window.__test.makeChoice('1');
        const spot = spots[i];
        // Step to the marker in hops (the loop runs traffic/police too).
        for (let hop = 0; hop < 12 && G.mission; hop++) {
          const p = G.playerPos();
          const dx = spot.x - p.x;
          const dz = spot.z - p.z;
          const d = Math.hypot(dx, dz);
          const step = Math.min(d, 60);
          const nx = p.x + (dx / d) * step;
          const nz = p.z + (dz / d) * step;
          if (G.player.car) G.player.car.mesh.position.set(nx, 0, nz);
          else if (G.player.boat) G.player.boat.mesh.position.set(nx, 0.05, nz);
          else G.player.mesh.position.set(nx, 0, nz);
          for (let s = 0; s < 30; s++) G.update(1 / 60);
          if (G.missionsDone > before) break;
        }
        out.jobs.push({ i, done: G.missionsDone > before, missionsDone: G.missionsDone });
        if (G.missionsDone <= before) break;
        G.nextMissionAt = 0; // skip the breather between jobs
      }
      out.finaleVariant = G.stats.finaleVariant;
      out.boatUnlocked = G.stats.boatUnlocked;
      out.choices = G.stats.choices.slice();
      out.respect = G.stats.respect;
      out.turf = G.stats.turfOwned.slice();
      out.errors = window.__errors;
      return out;
    })()`);
    for (const j of story.jobs) {
      check(`job ${j.i + 1} completes`, j.done === true, `missionsDone=${j.missionsDone}`);
    }
    check('all 7 jobs complete', story.jobs.length === 7 && story.jobs.every((j) => j.done),
      `${story.jobs.filter((j) => j.done).length}/7 done`);
    check('choice recorded: boat heist', story.finaleVariant === 'boat' && story.boatUnlocked === true,
      `variant=${story.finaleVariant} boat=${story.boatUnlocked}`);
    check('choices recorded in stats', story.choices.length === 2, JSON.stringify(story.choices));
    check('respect earned across story', story.respect >= 350, `respect=${story.respect}`);
    check('turf captured across story', story.turf.length >= 5, `turf=${story.turf.join(',')}`);
    check('story: no console errors', story.errors.length === 0, JSON.stringify(story.errors));

    // Taxi fare: pickup then drop-off.
    const fare = await page.evaluate(`(() => {
      const G = window.__game;
      const ok = window.__test.startFare();
      if (!ok || !G.fare) return { ok: false, errors: window.__errors };
      for (const target of [{ x: G.fare.pickX, z: G.fare.pickZ }, { x: G.fare.dropX, z: G.fare.dropZ }]) {
        const p = G.playerPos();
        const d = Math.hypot(target.x - p.x, target.z - p.z);
        const step = Math.min(d, 120);
        const nx = p.x + ((target.x - p.x) / d) * step;
        const nz = p.z + ((target.z - p.z) / d) * step;
        G.player.mesh.position.set(nx, 0, nz);
        for (let s = 0; s < 40; s++) G.update(1 / 60);
        if (!G.fare) break;
        // Second hop lands exactly on the marker.
        G.player.mesh.position.set(target.x, 0, target.z);
        for (let s = 0; s < 10; s++) G.update(1 / 60);
        if (!G.fare) break;
      }
      return { ok: true, faresDone: G.stats.faresDone, errors: window.__errors };
    })()`);
    check('taxi fare completes', fare.ok === true && fare.faresDone === 1, `faresDone=${fare.faresDone}`);
    check('fare: no console errors', (fare.errors || []).length === 0, JSON.stringify(fare.errors));

    // Harbor Reel pickup + boat boarding + shop + crew.
    const extras = await page.evaluate(`(() => {
      const G = window.__game;
      const reel = G.reels.find((r) => !r.found);
      G.player.mesh.position.set(reel.x, 0, reel.z);
      for (let s = 0; s < 10; s++) G.update(1 / 60);
      const reelsFound = G.stats.reelsFound;
      // Board the moored boat at the docks.
      const boat = G.boats[0];
      G.player.mesh.position.set(boat.mesh.position.x, 0, boat.mesh.position.z + 3);
      const boarded = window.__test.enterBoat(boat);
      if (boarded) {
        for (let s = 0; s < 120; s++) {
          G.shotInput = { forward: true };
          G.update(1 / 60);
        }
        G.shotInput = null;
      }
      const boatMoved = boarded && Math.abs(boat.mesh.position.x - (-168)) > 5;
      // Shop: buy the pistol; crew: hire Lena.
      G.cash = 2000;
      const bought = window.__test.shopBuy('pistol');
      const hired = window.__test.recruitCrew('lena');
      G.saveGame();
      const raw = localStorage.getItem('vice-harbor-save-v2');
      const saved = raw ? JSON.parse(raw) : null;
      return {
        reelsFound, boarded, boatMoved, bought, hired,
        hasPistol: G.stats.hasPistol, crew: G.stats.crew.slice(),
        savedMissions: saved ? saved.missionsDone : null,
        savedStats: !!saved?.stats, errors: window.__errors,
      };
    })()`);
    check('Harbor Reel pickup works', extras.reelsFound === 1, `found=${extras.reelsFound}`);
    check('boat boards and sails', extras.boarded === true && extras.boatMoved === true,
      `boarded=${extras.boarded} moved=${extras.boatMoved}`);
    check('shop purchase works', extras.bought === true && extras.hasPistol === true);
    check('crew hire works', extras.hired === true && extras.crew.includes('lena'), JSON.stringify(extras.crew));
    check('save holds full story', extras.savedMissions === 7 && extras.savedStats === true,
      `missions=${extras.savedMissions}`);
    check('extras: no console errors', extras.errors.length === 0, JSON.stringify(extras.errors));
    await page.close();
  } finally {
    if (chrome) chrome.kill();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nmissionCheck: ${results.length - failed}/${results.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`FAIL  missionCheck crashed — ${e.message}`);
  if (chrome) chrome.kill();
  process.exit(1);
});
