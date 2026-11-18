// Vice Harbor v2.1 — entry point and game loop.
// v2.1: rewritten under the new sealed recording; same systems as v2,
// plus the Escape-closes-shop-first fix in the update loop.
// Wires every system together: the city, cars, boats, traffic,
// pedestrians, police (roadblocks + heli), missions (7 jobs),
// races, taxi fares, collectibles, turf, crew, shop, HUD and sound.
// Owns the player, the third-person camera, entering and stealing
// cars and boats, saving (v2 format), and the start / pause /
// wasted / busted / job-complete screens. Also runs the day-night
// cycle that shifts the sky, fog and lights over time.

import * as THREE from 'three';
import { WORLD, CAR_TYPES, MISSIONS, RACES, SAVE_KEY, SHOP, CREW, clamp, lerp, mulberry32, pick, districtAt } from './config.js';
import { buildCity, resolveCollision } from './city.js';
import { createCar, driveCar, nearestCar, separateCars, forwardOf } from './vehicles.js';
import { createBoat, driveBoat, nearestBoat } from './boats.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createPedestrians, createTourists, updatePedestrians, knockPedDown } from './pedestrians.js';
import { addWanted, updateWanted, updatePolice, damagePlayer } from './police.js';
import { startMission, makeChoice, updateMissions, clearBeacon } from './missions.js';
import { shoot, melee, updateTracers, policeTracer } from './combat.js';
import { initHUD, updateHUD, fillPauseStats } from './hud.js';
import { createInput } from './input.js';
import { AudioEngine } from './audio.js';
import { setupShot } from './shots.js';
import {
  freshStats, completionPercent, updateTurfIncome, buildReels, updateReels,
  startRace, updateRace, abandonRace, startFare, updateFare,
  shopBuy, respray, recruitCrew, updateCrewCompanion,
} from './progression.js';

// Surface page errors into the DOM so headless play-tests can see them.
window.__errors = [];
window.addEventListener('error', (e) => {
  window.__errors.push(String(e.message));
  const el = document.getElementById('err');
  if (el) el.textContent = `ERROR: ${e.message}`;
});
window.addEventListener('unhandledrejection', (e) => {
  window.__errors.push(String(e.reason));
});

function makePlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x0fa3a3 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x22304a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.9, 0.36), jacket);
  body.position.y = 1.08;
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skin);
  head.position.y = 1.74;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.24), pants);
  legL.position.set(0, 0.33, 0.14);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.24), pants);
  legR.position.set(0, 0.33, -0.14);
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), jacket);
  armL.position.set(0, 1.1, 0.42);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), jacket);
  armR.position.set(0, 1.1, -0.42);
  group.add(armR);
  group.userData.armL = armL;
  group.userData.armR = armR;
  return group;
}

function init() {
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed') || 1);
  const shotName = params.get('shot');

  const G = {
    renderer, scene, camera,
    rng: mulberry32(seed),
    time: 0,
    state: 'menu',
    cash: 100,
    wanted: 0,
    lastCrimeAt: -100,
    lastSeenAt: -100,
    wantedDecay: 0,
    missionsDone: 0,
    missionIndex: -1,
    mission: null,
    nextMissionAt: 0,
    cars: [],
    boats: [],
    traffic: [],
    peds: [],
    policeCars: [],
    footCops: [],
    tracers: [],
    shake: 0,
    camYaw: Math.PI * 0.15,
    camPitch: 0.34,
    shotMode: null,
    shotInput: null,
    saveTimer: 0,
    lastShotAt: 0,
    lastMeleeAt: 0,
    lastShotCrimeAt: -100,
    lastPedCrimeAt: -100,
    stats: freshStats(),
    race: null,
    fare: null,
    reels: [],
    turfTimer: 0,
    heli: null,
    roadblock: null,
    crewCompanion: null,
    shopOpen: false,
    dayTime: 0.25, // 0 = dawn, 0.25 = dusk, 0.5 = night, 0.75 = dawn
    lastPlayerPos: null,
  };
  window.__game = G;
  G.city = buildCity(scene, G.rng);
  G.input = createInput();
  G.audio = new AudioEngine();
  G.hud = initHUD();
  G.combat = { policeTracer };
  buildReels(G);

  // Player.
  const playerMesh = makePlayerMesh();
  playerMesh.position.set(28, 0, 28);
  scene.add(playerMesh);
  G.player = {
    mesh: playerMesh,
    heading: Math.PI,
    health: 100,
    car: null,
    boat: null,
    godTimer: 0,
    lastDamageAt: -100,
  };
  // Where the player actually is: the boat, then the car, then on foot.
  G.playerPos = () => (G.player.boat ? G.player.boat.mesh.position : G.player.car ? G.player.car.mesh.position : G.player.mesh.position);

  // Parked cars around the city, free for the taking.
  const parkedTypes = ['compact', 'sedan', 'sports', 'muscle', 'van', 'taxi', 'sedan', 'compact', 'sports', 'taxi', 'sedan', 'van', 'compact', 'muscle'];
  for (let i = 0; i < parkedTypes.length; i++) {
    const line = pick(G.rng, G.city.roadXs);
    const along = -G.city.bounds + 20 + G.rng() * (G.city.bounds * 2 - 40);
    const side = G.rng() < 0.5 ? 1 : -1;
    const horizontal = G.rng() < 0.5;
    const x = horizontal ? along : line + side * 5.2;
    const z = horizontal ? line + side * 5.2 : along;
    const heading = horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
    const car = createCar(scene, parkedTypes[i], x, z, heading, { parked: true, driver: false });
    G.cars.push(car);
  }
  // Moored boats at the docks and marina — board one with E.
  for (const [bx, bz] of [[-168, -230], [-112, -235], [112, -232], [168, -228]]) {
    const boat = createBoat(scene, 'speedboat', bx, bz, Math.PI / 2, { parked: true });
    G.boats.push(boat);
  }
  G.traffic = createTraffic(G, 10);
  G.peds = createPedestrians(G, 26);
  G.peds.push(...createTourists(G, 6));

  // --- screens ---------------------------------------------------------
  const screens = {
    menu: document.getElementById('screen-menu'),
    pause: document.getElementById('screen-pause'),
    wasted: document.getElementById('screen-wasted'),
    busted: document.getElementById('screen-busted'),
  };
  function showScreen(name) {
    for (const key of Object.keys(screens)) {
      if (screens[key]) screens[key].style.display = key === name ? 'flex' : 'none';
    }
    if (name === null) G.hud.root.style.display = 'block';
    else G.hud.root.style.display = 'none';
  }

  G.saveGame = () => {
    try {
      const p = G.player.mesh.position;
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: G.cash,
        missionsDone: G.missionsDone,
        missionIndex: G.missionIndex,
        px: p.x, pz: p.z, heading: G.player.heading,
        stats: G.stats,
      }));
    } catch { /* storage unavailable: the game still plays */ }
  };
  function loadSave() {
    try {
      // v2 save key only — a v1 save is ignored cleanly (fresh start).
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  G.startGame = (save) => {
    if (save) {
      G.cash = save.cash ?? 100;
      G.missionsDone = save.missionsDone ?? 0;
      G.missionIndex = save.missionIndex ?? -1;
      if (save.stats) G.stats = { ...freshStats(), ...save.stats };
      G.player.mesh.position.set(save.px ?? 28, 0, save.pz ?? 28);
      G.player.heading = save.heading ?? Math.PI;
      if (G.missionsDone >= MISSIONS.length) {
        G.hud.setObjective('All jobs done — free roam!');
      } else if (G.missionIndex >= 0 && G.missionsDone < MISSIONS.length) {
        G.hud.setObjective('Press T to continue the story.');
      }
    } else {
      G.cash = 100;
      G.missionsDone = 0;
      G.missionIndex = -1;
      G.stats = freshStats();
    }
    G.player.health = G.stats.maxHealth;
    G.wanted = 0;
    G.state = 'playing';
    showScreen(null);
    G.audio.init();
    G.audio.click();
  };

  function respawn(penalty, label) {
    G.cash = Math.max(0, G.cash - penalty);
    G.player.health = G.stats.maxHealth;
    G.player.godTimer = 3;
    G.wanted = 0;
    if (G.player.car) {
      G.player.car = null;
      G.player.mesh.visible = true;
    }
    if (G.player.boat) {
      G.player.boat = null;
      G.player.mesh.visible = true;
    }
    G.player.mesh.position.set(G.city.hospital.x, 0, G.city.hospital.z);
    G.player.heading = 0;
    G.state = 'playing';
    showScreen(null);
    G.hud.toast(`${label} You woke up at Harbor General. -$${penalty}.`);
    G.saveGame();
  }
  G.wasted = () => {
    if (G.state !== 'playing') return;
    G.state = 'wasted';
    if (G.audio) G.audio.siren(false);
    showScreen('wasted');
  };
  G.busted = () => {
    if (G.state !== 'playing') return;
    G.state = 'busted';
    if (G.audio) G.audio.siren(false);
    showScreen('busted');
  };

  // Buttons.
  const save = loadSave();
  const btnContinue = document.getElementById('btn-continue');
  if (btnContinue) {
    btnContinue.style.display = save ? 'inline-block' : 'none';
    btnContinue.addEventListener('click', () => G.startGame(save));
  }
  document.getElementById('btn-play')?.addEventListener('click', () => G.startGame(null));
  document.getElementById('btn-resume')?.addEventListener('click', () => {
    G.state = 'playing';
    showScreen(null);
  });
  document.getElementById('btn-respawn-wasted')?.addEventListener('click', () => respawn(100, 'WASTED.'));
  document.getElementById('btn-respawn-busted')?.addEventListener('click', () => respawn(150, 'BUSTED.'));
  document.getElementById('btn-restart-menu')?.addEventListener('click', () => {
    G.state = 'menu';
    showScreen('menu');
  });
  // Shop buttons on the pause screen.
  document.querySelectorAll('[data-shop]')?.forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.getAttribute('data-shop');
      if (item === 'respray') respray(G);
      else shopBuy(G, item);
      fillPauseStats(G);
    });
  });
  // Crew hire buttons on the pause screen.
  document.querySelectorAll('[data-crew]')?.forEach((btn) => {
    btn.addEventListener('click', () => {
      recruitCrew(G, btn.getAttribute('data-crew'));
      fillPauseStats(G);
    });
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- entering, exiting and stealing cars and boats ------------------
  function enterCar(car) {
    const p = G.player.mesh.position;
    const d = Math.hypot(car.mesh.position.x - p.x, car.mesh.position.z - p.z);
    if (d > 3.4) return false;
    if (car.traffic && car.driver && Math.abs(car.speed) > 1) {
      // Carjacking: pull the driver out.
      const pedMesh = makePlayerMesh();
      pedMesh.position.copy(car.mesh.position);
      scene.add(pedMesh);
      const ped = {
        mesh: pedMesh, heading: car.heading, speed: 1.5,
        target: { x: p.x + 30, z: p.z + 30 },
        fleeing: true, fleeTimer: 4, fleeFrom: { x: p.x, z: p.z }, alive: true, fallTimer: 0,
      };
      pedMesh.traverse((o) => { o.userData.pedRef = ped; });
      G.peds.push(ped);
      car.traffic = false;
      car.driver = true;
      addWanted(G, 1, 'carjacking');
      G.hud.toast(`You jacked a ${car.type.label}!`);
      if (G.audio) G.audio.thud();
    } else if (car.police) {
      G.hud.toast('That one belongs to the Harbor PD.');
      return false;
    }
    G.player.car = car;
    car.parked = false;
    G.player.mesh.visible = false;
    G.camYaw = car.heading;
    if (G.audio) G.audio.click();
    G.hud.toast(`${car.type.label} — W drive, S brake, Space handbrake.`);
    return true;
  }

  function exitCar() {
    const car = G.player.car;
    if (!car) return;
    car.speed = 0;
    car.parked = true;
    const f = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
    const p = G.player.mesh.position;
    p.set(car.mesh.position.x - f.z * 2.4, 0, car.mesh.position.z + f.x * 2.4);
    G.player.mesh.visible = true;
    G.player.heading = car.heading;
    G.player.car = null;
    G.camYaw = car.heading;
  }

  function enterBoat(boat) {
    const p = G.player.mesh.position;
    const d = Math.hypot(boat.mesh.position.x - p.x, boat.mesh.position.z - p.z);
    if (d > 5) return false;
    G.player.boat = boat;
    boat.parked = false;
    G.player.mesh.visible = false;
    G.camYaw = boat.heading;
    if (G.audio) { G.audio.splash(); G.audio.click(); }
    G.hud.toast(`${boat.type.label} — W throttle, S slow, steer with A/D. The sea is yours.`);
    return true;
  }

  function exitBoat() {
    const boat = G.player.boat;
    if (!boat) return;
    boat.speed = 0;
    boat.parked = true;
    // Step onto the nearest shore: the boardwalk side of the sea.
    const p = G.player.mesh.position;
    p.set(boat.mesh.position.x, 0, Math.max(boat.mesh.position.z, -196));
    if (p.z < -196) p.z = -196;
    G.player.mesh.visible = true;
    G.player.heading = boat.heading;
    G.player.boat = null;
    G.camYaw = boat.heading;
    if (G.audio) G.audio.splash();
  }

  // --- per-frame updates ------------------------------------------------
  function updatePlayerOnFoot(dt) {
    const input = G.input;
    const p = G.player.mesh.position;
    const fwd = { x: Math.sin(G.camYaw), z: Math.cos(G.camYaw) };
    const right = { x: -Math.cos(G.camYaw), z: Math.sin(G.camYaw) };
    let mx = 0;
    let mz = 0;
    if (input.keys.KeyW || input.keys.ArrowUp) { mx += fwd.x; mz += fwd.z; }
    if (input.keys.KeyS || input.keys.ArrowDown) { mx -= fwd.x; mz -= fwd.z; }
    if (input.keys.KeyD || input.keys.ArrowRight) { mx += right.x; mz += right.z; }
    if (input.keys.KeyA || input.keys.ArrowLeft) { mx -= right.x; mz -= right.z; }
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      const run = input.keys.ShiftLeft || input.keys.ShiftRight;
      const speed = run ? 9 : 5;
      p.x += (mx / len) * speed * dt;
      p.z += (mz / len) * speed * dt;
      G.player.heading = Math.atan2(mx, mz);
      G.player.mesh.rotation.y = G.player.heading;
      const bob = Math.abs(Math.sin(G.time * 10)) * 0.05;
      G.player.mesh.position.y = bob;
      const swing = Math.sin(G.time * 10) * 0.5;
      G.player.mesh.userData.armL.rotation.x = swing;
      G.player.mesh.userData.armR.rotation.x = -swing;
    } else {
      G.player.mesh.position.y = 0;
      G.player.mesh.userData.armL.rotation.x = 0;
      G.player.mesh.userData.armR.rotation.x = 0;
    }
    resolveCollision(p, 0.7, G.city.colliders);
    p.x = clamp(p.x, -G.city.bounds, G.city.bounds);
    p.z = clamp(p.z, -G.city.bounds, G.city.bounds);
    // Traffic can run the player over.
    for (const car of G.cars) {
      const d = Math.hypot(car.mesh.position.x - p.x, car.mesh.position.z - p.z);
      if (d < car.radius * 0.7 && Math.abs(car.speed) > 3) {
        damagePlayer(G, 18, 'hit by a car');
        p.x += (p.x - car.mesh.position.x) * 0.6;
        p.z += (p.z - car.mesh.position.z) * 0.6;
        G.shake = Math.min(0.6, G.shake + 0.4);
        if (G.audio) G.audio.thud();
      }
    }
    // Health slowly recovers out of trouble.
    if (G.time - G.player.lastDamageAt > 6 && G.player.health < G.stats.maxHealth) {
      G.player.health = Math.min(G.stats.maxHealth, G.player.health + 4 * dt);
    }
  }

  function updatePlayerDriving(dt) {
    const input = G.input;
    const car = G.player.car;
    const drive = {
      forward: !!(input.keys.KeyW || input.keys.ArrowUp) || !!(G.shotInput && G.shotInput.forward),
      back: !!(input.keys.KeyS || input.keys.ArrowDown),
      left: !!(input.keys.KeyA || input.keys.ArrowLeft),
      right: !!(input.keys.KeyD || input.keys.ArrowRight),
      handbrake: !!input.keys.Space,
    };
    driveCar(car, drive, dt, G);
    // Running over pedestrians is a crime.
    if (Math.abs(car.speed) > 8) {
      for (const ped of G.peds) {
        if (!ped.alive) continue;
        const d = Math.hypot(ped.mesh.position.x - car.mesh.position.x, ped.mesh.position.z - car.mesh.position.z);
        if (d < 1.9) {
          knockPedDown(G, ped);
          if (G.time - G.lastPedCrimeAt > 2) {
            G.lastPedCrimeAt = G.time;
            addWanted(G, 1, 'hit and run');
          }
          if (G.audio) G.audio.thud();
        }
      }
    }
    if (G.audio) G.audio.setEngine(Math.abs(car.speed) / car.type.topSpeed);
  }

  function updatePlayerBoating(dt) {
    const input = G.input;
    const boat = G.player.boat;
    const drive = {
      forward: !!(input.keys.KeyW || input.keys.ArrowUp) || !!(G.shotInput && G.shotInput.forward),
      back: !!(input.keys.KeyS || input.keys.ArrowDown),
      left: !!(input.keys.KeyA || input.keys.ArrowLeft),
      right: !!(input.keys.KeyD || input.keys.ArrowRight),
      handbrake: false,
    };
    driveBoat(boat, drive, dt, G);
    if (G.audio) G.audio.setEngine(Math.abs(boat.speed) / boat.type.topSpeed);
  }

  function updateCamera(dt) {
    const cam = G.camera;
    if (G.shotCamera) {
      cam.position.set(G.shotCamera.pos.x, G.shotCamera.pos.y, G.shotCamera.pos.z);
      cam.lookAt(G.shotCamera.look.x, G.shotCamera.look.y, G.shotCamera.look.z);
      return;
    }
    // Chase screenshot: a front three-quarter view, so the pursuing
    // police cars behind the player are in the frame.
    if (G.shotMode === 'chase' && G.player.car) {
      const car = G.player.car;
      const p = car.mesh.position;
      const f = forwardOf(car.heading);
      cam.position.set(p.x + f.x * 18, 9, p.z + f.z * 18);
      cam.lookAt(p.x, 1.6, p.z);
      return;
    }
    // Race shot: a high rear view over the boat and the sea.
    if (G.shotMode === 'race' && G.player.boat) {
      const boat = G.player.boat;
      const p = boat.mesh.position;
      const f = forwardOf(boat.heading);
      cam.position.set(p.x - f.x * 22, 12, p.z - f.z * 22);
      cam.lookAt(p.x + f.x * 10, 1, p.z + f.z * 10);
      return;
    }
    // Mouse orbit.
    G.camYaw -= G.input.mouseDX * 0.005;
    G.camPitch = clamp(G.camPitch + G.input.mouseDY * 0.003, 0.06, 1.15);
    const vehicle = G.player.car || G.player.boat;
    const target = vehicle ? vehicle.mesh.position : G.player.mesh.position;
    let desiredYaw = G.camYaw;
    if (vehicle) {
      // Chase camera eases behind the vehicle.
      let diff = vehicle.heading - G.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      desiredYaw = G.camYaw + diff * Math.min(1, 2.2 * dt);
      G.camYaw = desiredYaw;
    }
    const dist = vehicle ? 10.5 : 7.5;
    const height = vehicle ? 4.2 : 3.4;
    const cx = target.x - Math.sin(desiredYaw) * Math.cos(G.camPitch) * dist;
    const cz = target.z - Math.cos(desiredYaw) * Math.cos(G.camPitch) * dist;
    const cy = target.y + height + Math.sin(G.camPitch) * dist * 0.5;
    cam.position.set(cx, cy, cz);
    const lookY = target.y + (vehicle ? 1.6 : 1.7);
    cam.lookAt(target.x, lookY, target.z);
    // Impact shake.
    if (G.shake > 0.01) {
      cam.position.x += (Math.random() - 0.5) * G.shake;
      cam.position.y += (Math.random() - 0.5) * G.shake;
      G.shake = Math.max(0, G.shake - dt * 1.4);
    }
  }

  function updateAmbient(dt) {
    // Neon signs pulse against the dusk.
    if (G.city.neonSigns) {
      for (const sign of G.city.neonSigns) {
        const s = 0.6 + 0.4 * Math.sin(G.time * 3 + sign.userData.phase);
        sign.material.color.setHex(sign.userData.baseHex).multiplyScalar(s);
      }
    }
    // Day-night cycle: a full day every 4 minutes. Dusk at 0.25,
    // night at 0.5, dawn at 0.75. Sky, fog and lights follow.
    G.dayTime = (G.dayTime + dt / 240) % 1;
    const t = G.dayTime;
    const night = t > 0.4 && t < 0.85 ? 1 : t <= 0.4 ? (t - 0.25) / 0.15 : (1 - t) / 0.15;
    const nightF = clamp(night, 0, 1);
    const sky = G.city.skyDusk.clone().lerp(G.city.skyNight, nightF * 0.85);
    G.scene.background.copy(sky);
    if (G.scene.fog) G.scene.fog.color.copy(sky);
    G.city.sun.intensity = lerp(1.35, 0.25, nightF);
    G.city.hemi.intensity = lerp(1.05, 0.55, nightF);
    G.city.moonFill.intensity = lerp(0.25, 0.7, nightF);
  }

  function trackDistance() {
    const p = G.playerPos();
    if (G.lastPlayerPos) {
      const d = Math.hypot(p.x - G.lastPlayerPos.x, p.z - G.lastPlayerPos.z);
      if (G.player.car || G.player.boat) G.stats.distanceDriven += d;
    }
    G.lastPlayerPos = { x: p.x, z: p.z };
  }

  function nearestRaceStart() {
    const p = G.playerPos();
    let best = null;
    let bestD = Infinity;
    for (const r of RACES) {
      const d = Math.hypot(p.x - r.start.x, p.z - r.start.z);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  function nearShop() {
    const p = G.playerPos();
    if (Math.hypot(p.x - G.city.gunshop.x, p.z - G.city.gunshop.z) < 10) return 'gunshop';
    if (Math.hypot(p.x - G.city.respray.x, p.z - G.city.respray.z) < 10) return 'respray';
    return null;
  }

  // The master update, also used by the screenshot staging hook.
  G.update = (dt) => {
    G.time += dt;
    if (G.player.godTimer > 0) G.player.godTimer -= dt;
    updateAmbient(dt);
    updateTraffic(G, dt);
    updatePedestrians(G, dt);
    if (G.state === 'menu') {
      updateCamera(dt);
      G.input.endFrame();
      return;
    }
    if (G.state !== 'playing') return;
    G.stats.timePlayed += dt;
    trackDistance();
    const input = G.input;
    // Choice keys (1/2) answer a story choice, or buy in the shop.
    if (input.wasPressed('Digit1') || input.wasPressed('Digit2') || input.wasPressed('Digit3')) {
      const code = input.lastKey;
      if (G.mission && G.mission.awaitingChoice) {
        makeChoice(G, code === 'Digit1' ? '1' : '2');
      } else if (G.shopOpen) {
        if (code === 'Digit1') shopBuy(G, 'pistol');
        else if (code === 'Digit2') shopBuy(G, 'armor');
        else if (code === 'Digit3') respray(G);
        G.shopOpen = false;
        const shopEl = document.getElementById('shop-box');
        if (shopEl) shopEl.style.display = 'none';
      }
    }
    if (input.wasPressed('KeyE')) {
      if (G.player.boat) exitBoat();
      else if (G.player.car) exitCar();
      else {
        const p = G.player.mesh.position;
        const boat = nearestBoat(G, p.x, p.z, 5);
        if (boat) enterBoat(boat);
        else {
          const car = nearestCar(G, p.x, p.z, 3.4);
          if (car) enterCar(car);
        }
      }
    }
    if (input.wasPressed('KeyF')) melee(G);
    if (input.wasPressed('KeyT')) {
      if (!G.mission) {
        if (G.missionIndex + 1 < MISSIONS.length) startMission(G, G.missionIndex + 1);
        else if (G.missionsDone < MISSIONS.length) startMission(G, G.missionsDone);
      }
    }
    if (input.wasPressed('KeyR')) {
      if (!G.race) {
        const race = nearestRaceStart();
        if (race) startRace(G, race.id);
      }
    }
    if (input.wasPressed('KeyY')) {
      if (!G.fare && !G.race) startFare(G);
    }
    if (input.wasPressed('KeyG')) {
      const shop = nearShop();
      if (shop) {
        G.shopOpen = true;
        const shopEl = document.getElementById('shop-box');
        if (shopEl) {
          shopEl.innerHTML = shop === 'gunshop'
            ? `<b>IRON &amp; INK</b> — [1] Heavy Pistol $${SHOP.pistol.cost} · [2] Body Armor $${SHOP.armor.cost} · [3] close`
            : `<b>FRESH COAT</b> — [3] Respray $${SHOP.respray.cost} (clears all heat) · [1] close`;
          shopEl.style.display = 'block';
        }
        if (G.hud) G.hud.toast(shop === 'gunshop' ? 'Iron & Ink — press 1 or 2 to buy.' : 'Fresh Coat — press 3 for a respray.');
      }
    }
    if (input.wasPressed('KeyM')) {
      const muted = G.audio.toggleMute();
      G.hud.toast(muted ? 'Sound off (M to turn back on).' : 'Sound on.');
    }
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) {
      // v2.1 fix: Escape closes an open shop first instead of pausing
      // over it — the shop is a modal, pausing comes second.
      if (G.shopOpen) {
        G.shopOpen = false;
        const shopEl = document.getElementById('shop-box');
        if (shopEl) shopEl.style.display = 'none';
        input.endFrame();
        return;
      }
      G.state = 'paused';
      fillPauseStats(G);
      showScreen('pause');
      input.endFrame();
      return;
    }
    if (input.mouseDown && !G.player.car && !G.player.boat) shoot(G);
    if (G.player.boat) updatePlayerBoating(dt);
    else if (G.player.car) updatePlayerDriving(dt);
    else updatePlayerOnFoot(dt);
    updateWanted(G, dt);
    updatePolice(G, dt);
    updateMissions(G, dt);
    updateRace(G, dt);
    updateFare(G, dt);
    updateReels(G, dt);
    updateTurfIncome(G, dt);
    updateCrewCompanion(G, dt);
    updateTracers(G, dt);
    updateCamera(dt);
    updateHUD(G, dt);
    G.saveTimer += dt;
    if (G.saveTimer > 10) {
      G.saveTimer = 0;
      G.saveGame();
    }
    input.endFrame();
  };

  // --- main loop ---------------------------------------------------------
  const clock = new THREE.Clock();
  let firstFrame = true;
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    G.update(dt);
    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      window.__shotReady = true;
      if (!shotName) document.title = 'READY';
    }
  }

  showScreen('menu');
  // Test hooks for the headless self-checks (tools/simCheck.mjs,
  // tools/missionCheck.mjs): the same functions the keys call.
  window.__test = {
    startMission: (i) => startMission(G, i),
    makeChoice: (k) => makeChoice(G, k),
    startRace: (id) => startRace(G, id),
    startFare: () => startFare(G),
    shopBuy: (item) => shopBuy(G, item),
    respray: () => respray(G),
    recruitCrew: (id) => recruitCrew(G, id),
    enterBoat: (boat) => enterBoat(boat),
    enterCar: (car) => enterCar(car),
  };
  if (shotName) {
    setupShot(G, shotName);
    renderer.render(scene, camera);
    window.__shotReady = true;
    document.title = 'READY';
  } else {
    loop();
  }
  return G;
}

init();
