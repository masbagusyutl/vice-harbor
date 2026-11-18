// Vice Harbor — boot, the one game loop, player control, camera, crime, save/load.
// A 3D open-world game: walk and drive a neon coastal city, steal cars, outrun
// the VHPD, run three chained story missions. All original — no Rockstar material.
//
// ?seed=N fixes the city layout. ?shot=start|chase|drive|mission (with &seed=N)
// stages that scene from the real game and sets window.__shotReady for a screenshot.
import * as THREE from 'three';
import { CITY, PLAYER, SAVE_KEY, PALETTE } from './config.js';
import { makeRng } from './random.js';
import { buildCity, collideCircle } from './city.js';
import { makeCar, updatePlayerCar, spawnParkedCars, nearestCar } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { shootFromCamera, meleeAttack } from './combat.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const $ = (id) => document.getElementById(id);

// Surface errors in the DOM so a headless play-test can see them.
window.addEventListener('error', (e) => {
  statusEl.textContent = `ERROR: ${e.message}`;
  document.title = 'ERROR';
});
window.addEventListener('unhandledrejection', (e) => {
  statusEl.textContent = `ERROR: ${e.reason}`;
  document.title = 'ERROR';
});

function announce(msg) { statusEl.textContent = msg; }

// --- renderer / scene ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 90, 430);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 26, 120);

const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(PALETTE.sun, 1.35);
sun.position.set(-120, 90, -60);
scene.add(sun);
// --- world ---
const rng = makeRng(seed);
const city = buildCity(scene, rng);
const traffic = createTraffic(scene, city, rng, 14);
const parkedCars = spawnParkedCars(scene, city, rng, 12);
const peds = createPedestrians(scene, city, rng, 26);
const police = createPolice(scene, city, rng);
const missions = createMissions(scene, city);
const hud = createHud();
const input = createInput(canvas);
const audio = createAudio();

// --- player figure ---
function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2c4a6e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.8, 0.26), jeans);
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.32), jacket);
  torso.position.y = 1.13;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.63;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), new THREE.MeshLambertMaterial({ color: 0xff2e88 }));
  cap.position.y = 1.84;
  g.add(cap);
  g.userData.legs = legs;
  return g;
}
const playerMesh = makePlayerMesh();
scene.add(playerMesh);

// --- the one shared game object every module works through ---
const game = {
  scene, camera, renderer, city, traffic, parkedCars, peds, police, missions, hud, input, audio,
  time: 0,
  mode: 'title', // title | play | paused | wasted | busted
  wanted: 0,
  heatStarted: false,
  cameraLocked: false,
  lastDanger: null,
  tracerTo: null,
  tracerTimer: 0,
  player: {
    x: city.spawn.x, z: city.spawn.z, heading: 0,
    health: PLAYER.maxHealth, cash: 0,
    car: null, onFoot: true,
    walkPhase: 0,
  },
  allCars() { return [...traffic.cars, ...parkedCars, ...police.policeCars]; },
  addWanted(n, msg) {
    if (n > 0) {
      game.wanted = Math.min(5, game.wanted + n);
      if (msg) hud.showFlash(msg, 3);
    }
  },
  step,
  enterCar,
  hideMenus,
  showTitle,
  setCamYaw(y) { camYaw = y; },
};

// Camera orbit state.
let camYaw = 0;
let camPitch = 0.32;
let carCamOffset = 0;

// Shooting tracer line.
const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe14d }));
tracer.visible = false;
scene.add(tracer);

// --- save / load ---
function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: game.player.cash,
      missionIndex: missions.index,
      x: game.player.x,
      z: game.player.z,
      health: game.player.health,
    }));
  } catch { /* storage unavailable: the save lasts this visit only */ }
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

// --- menus ---
function hideMenus() {
  $('title-screen').style.display = 'none';
  $('pause-screen').style.display = 'none';
  $('end-screen').style.display = 'none';
  $('hud').style.display = 'block';
}
function showTitle() {
  $('title-screen').style.display = 'flex';
  $('pause-screen').style.display = 'none';
  $('end-screen').style.display = 'none';
  $('hud').style.display = 'none';
  $('btn-continue').style.display = loadSave() ? 'inline-block' : 'none';
}
function showPause() {
  $('pause-screen').style.display = 'flex';
}
function showEnd(kind) {
  const title = $('end-title');
  title.textContent = kind === 'wasted' ? 'WASTED' : 'BUSTED';
  title.className = kind;
  $('end-text').textContent = kind === 'wasted'
    ? 'The streets of Vice Harbor claimed you. The hospital patched you up — minus a fee.'
    : 'The VHPD caught you. Bail was not cheap.';
  $('end-screen').style.display = 'flex';
}

$('btn-start').addEventListener('click', () => { audio.ensure(); startFresh(); });
$('btn-continue').addEventListener('click', () => { audio.ensure(); continueSave(); });
$('btn-resume').addEventListener('click', () => { game.mode = 'play'; $('pause-screen').style.display = 'none'; });
$('btn-save-quit').addEventListener('click', () => { saveGame(); game.mode = 'title'; showTitle(); });
$('btn-retry').addEventListener('click', () => { respawn(); });
$('btn-title').addEventListener('click', () => { saveGame(); game.mode = 'title'; showTitle(); });

function startFresh() {
  resetWorld();
  game.mode = 'play';
  hideMenus();
  announce('Vice Harbor. Meet Rico at the marina — follow the yellow marker.');
}
function continueSave() {
  const s = loadSave();
  resetWorld();
  if (s) {
    game.player.cash = s.cash || 0;
    game.player.health = s.health || PLAYER.maxHealth;
    game.player.x = s.x ?? city.spawn.x;
    game.player.z = s.z ?? city.spawn.z;
    missions.reset(Math.min(s.missionIndex || 0, 2));
  }
  game.mode = 'play';
  hideMenus();
  announce('Welcome back to Vice Harbor.');
}
function respawn() {
  game.player.health = PLAYER.maxHealth;
  game.wanted = 0;
  police.clearAll();
  game.player.cash = Math.max(0, Math.floor(game.player.cash * 0.9));
  exitCar(true);
  game.player.x = city.spawn.x;
  game.player.z = city.spawn.z;
  game.player.heading = 0;
  game.mode = 'play';
  hideMenus();
  saveGame();
}
function resetWorld() {
  game.player.health = PLAYER.maxHealth;
  game.player.cash = 0;
  game.wanted = 0;
  game.heatStarted = false;
  game.player.x = city.spawn.x;
  game.player.z = city.spawn.z;
  game.player.heading = 0;
  camYaw = 0;
  exitCar(true);
  police.clearAll();
  missions.reset(0);
}

// --- cars: enter / exit / steal ---
function enterCar(car, silent) {
  if (car.driver === 'police') return false;
  if (car.driver === 'traffic') {
    // Stealing a moving car: the driver flees on foot, and it is a crime.
    car.driver = null;
    car.speed = Math.max(0, car.speed * 0.4);
    const i = traffic.cars.indexOf(car);
    if (i >= 0) traffic.cars.splice(i, 1);
    if (!parkedCars.includes(car)) parkedCars.push(car);
    if (!silent) game.addWanted(1, 'You stole a car!');
  }
  game.player.car = car;
  game.player.onFoot = false;
  car.driver = 'player';
  playerMesh.visible = false;
  if (!silent) audio.ensure();
  return true;
}

function exitCar(force) {
  const car = game.player.car;
  if (!car) return;
  car.driver = null;
  game.player.car = null;
  game.player.onFoot = true;
  // Step out on the driver's side.
  const sideX = car.x + Math.cos(car.heading) * 2.2;
  const sideZ = car.z - Math.sin(car.heading) * 2.2;
  game.player.x = sideX;
  game.player.z = sideZ;
  game.player.heading = car.heading;
  playerMesh.visible = true;
  camYaw = car.heading;
  void force;
}

// --- damage / busted / wasted ---
function damagePlayer(amount) {
  if (game.mode !== 'play') return;
  game.player.health -= amount;
  if (game.player.health <= 0) {
    game.player.health = 0;
    game.mode = 'wasted';
    exitCar(true);
    saveGame();
    showEnd('wasted');
    announce('Wasted.');
  }
}
function bustPlayer() {
  if (game.mode !== 'play') return;
  game.mode = 'busted';
  exitCar(true);
  saveGame();
  showEnd('busted');
  announce('Busted by the VHPD.');
}

// --- the fixed simulation step ---
function step(dt, staging) {
  game.time += dt;
  const p = game.player;

  if (game.mode === 'play' || staging) {
    // Mouse look.
    const m = input.takeMouse();
    camYaw -= m.dx * 0.0032;
    camPitch = Math.max(-0.1, Math.min(0.9, camPitch + m.dy * 0.0024));

    if (p.car) {
      const speed01 = updatePlayerCar(p.car, input, dt, city.colliders, city.extent + 40);
      p.x = p.car.x;
      p.z = p.car.z;
      p.heading = p.car.heading;
      audio.setEngine(speed01);
      // Running over a pedestrian in your car is a crime.
      for (const ped of peds.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - p.x, ped.z - p.z) < 2.0 && Math.abs(p.car.speed) > 4) {
          ped.state = 'down';
          ped.downTimer = 8;
          game.addWanted(1, 'You hit a pedestrian!');
        }
      }
      if (input.pressed('KeyE')) exitCar();
    } else {
      audio.setEngine(0);
      // On foot: WASD relative to the camera.
      const fwd = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0)
        - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
      const strafe = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0)
        - (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
      const run = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
      const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      let mx = 0;
      let mz = 0;
      if (fwd || strafe) {
        const len = Math.hypot(fwd, strafe) || 1;
        const fx = -Math.sin(camYaw);
        const fz = -Math.cos(camYaw);
        const rx = -Math.cos(camYaw);
        const rz = Math.sin(camYaw);
        mx = (fx * fwd + rx * strafe) / len;
        mz = (fz * fwd + rz * strafe) / len;
        p.heading = Math.atan2(mx, mz);
      }
      const pos = { x: p.x + mx * speed * dt, z: p.z + mz * speed * dt };
      collideCircle(pos, PLAYER.radius, city.colliders);
      // Do not walk through cars.
      for (const car of game.allCars()) {
        const dx = pos.x - car.x;
        const dz = pos.z - car.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.9 && d > 0.001) {
          pos.x = car.x + (dx / d) * 1.9;
          pos.z = car.z + (dz / d) * 1.9;
        }
      }
      p.x = Math.max(-city.extent - 20, Math.min(CITY.waterX + 8, pos.x));
      p.z = Math.max(-city.extent - 20, Math.min(city.extent + 20, pos.z));
      p.walkPhase += dt * (fwd || strafe ? (run ? 13 : 8) : 0);
      playerMesh.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * 0.05, p.z);
      playerMesh.rotation.y = p.heading;
      playerMesh.userData.legs.rotation.x = Math.sin(p.walkPhase) * 0.5;

      // Enter / steal a car.
      if (input.pressed('KeyE')) {
        const car = nearestCar(game.allCars(), p.x, p.z, 3.6);
        if (car) enterCar(car);
        else hud.showFlash('No car close enough — walk up to one and press E.', 2);
      }
      // Combat on foot.
      if (input.takeClick()) shootFromCamera(game, camera);
      if (input.pressed('KeyF')) meleeAttack(game);
    }

    // Traffic, pedestrians, police, missions, city life.
    traffic.update(dt, game.allCars());
    const danger = game.lastDanger && game.time < game.lastDanger.until ? game.lastDanger : null;
    peds.update(dt, game.time, danger);
    police.update(dt, {
      get wanted() { return game.wanted; },
      set wanted(v) { game.wanted = v; },
      player: { x: p.x, z: p.z, onFoot: p.onFoot },
      playerCar: p.car,
      onBusted: bustPlayer,
      onDamage: (n) => damagePlayer(n),
    });
    // police.update writes back through the setter above; keep the plain value in sync.
    missions.update(dt, game.time, {
      player: { x: p.x, z: p.z },
      wanted: game.wanted,
      heatStarted: game.heatStarted,
      onHeat: () => { game.wanted = Math.max(game.wanted, 3); game.heatStarted = true; },
      onReward: (amount, text) => {
        p.cash += amount;
        audio.cash();
        hud.showFlash(text, 4);
        saveGame();
      },
    });
    city.update(game.time);
    audio.setSiren(game.wanted > 0);

    // Tracer fade.
    if (game.tracerTimer > 0) {
      game.tracerTimer -= dt;
      tracer.visible = true;
      const from = camera.position.clone();
      const pts = [from, game.tracerTo];
      tracerGeo.setFromPoints(pts);
      if (game.tracerTimer <= 0) tracer.visible = false;
    }
  }

  // Camera: over-the-shoulder on foot, chase cam in a car, locked for staged shots.
  if (!game.cameraLocked) {
    if (p.car) {
      const back = 9.5;
      const up = 3.6;
      const h = p.car.heading + carCamOffset;
      const tx = p.car.x - Math.sin(h) * back;
      const tz = p.car.z - Math.cos(h) * back;
      camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 5);
      camera.position.y += (up - camera.position.y) * Math.min(1, dt * 5);
      camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 5);
      camera.lookAt(p.car.x + Math.sin(p.car.heading) * 8, 1.6, p.car.z + Math.cos(p.car.heading) * 8);
      carCamOffset += (0 - carCamOffset) * Math.min(1, dt * 0.8);
      carCamOffset = Math.max(-0.9, Math.min(0.9, carCamOffset - (input.takeMouse().dx * 0.002)));
    } else {
      const dist = 6.5;
      const cx = p.x + Math.sin(camYaw) * dist;
      const cz = p.z + Math.cos(camYaw) * dist;
      const cy = 2.6 + camPitch * 4;
      camera.position.set(cx, cy, cz);
      camera.lookAt(p.x, 1.5, p.z);
    }
  }

  if (game.mode === 'play' || staging) hud.update(game, dt);
  $('crosshair').style.display = game.mode === 'play' && p.onFoot ? 'block' : 'none';
  input.endFrame();
}

// --- pause / mute / resize ---
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (game.mode === 'play') { game.mode = 'paused'; showPause(); saveGame(); }
    else if (game.mode === 'paused') { game.mode = 'play'; $('pause-screen').style.display = 'none'; }
  }
  if (e.code === 'KeyM') {
    const muted = audio.toggleMute();
    hud.showFlash(muted ? 'Sound muted' : 'Sound on', 1.5);
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'play') { game.mode = 'paused'; showPause(); saveGame(); }
});

// --- main loop ---
let last = performance.now();
let accumulator = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  if (game.mode === 'play') {
    accumulator += elapsed;
    while (accumulator >= STEP) {
      step(STEP, false);
      accumulator -= STEP;
    }
  }
  renderer.render(scene, camera);
}

// --- boot ---
showTitle();
if (shot) {
  stageShot(shot, game);
  let painted = 0;
  (function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      window.__gameStatus = 'READY';
      document.title = 'READY';
      announce('Ready.');
    }
  }());
} else {
  announce('Vice Harbor. Press Start.');
  requestAnimationFrame(frame);
}
