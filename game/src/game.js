// Vice Harbor — the game itself. Third-person open-world crime game built
// on Three.js: on-foot and driving movement, traffic and pedestrians, a
// wanted system with police, roadblocks and a helicopter, seven story jobs
// with branching choices, three street races, taxi fares, 24 hidden
// medallions, turf control, a hireable crew, shops, a save system, a HUD
// with a live minimap, and a day-night cycle. Everything is original.
//
// The game is deterministic for a given seed: the world, traffic and
// pedestrians all draw from seeded streams, and the URL ?seed= overrides it.

import {
  WORLD, DISTRICTS, VEHICLES, RESPECT_RANKS, WEAPONS, CREW, RIVAL_DRIVERS,
  RACES, JOBS, COLLECTIBLE_SPOTS, SHOPS, TAXI_FARE, RESPRAY_COST,
  TURF_INCOME, TURF_INTERVAL, districtAt,
} from './data.js';
import { makeSeededRandom, range, rangeInt, pickFrom, chance } from './rng.js';
import { createSoundBank } from './audio.js';
import { buildCity, makeCarMesh, makePersonMesh, makeBeaconMesh, makeMedallionMesh } from './world.js';

const THREE = window.THREE;
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || WORLD.seed);
const SAVE_KEY = 'vice-harbor-save-v3';
const HALF = WORLD.halfSize;

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const rand = makeSeededRandom(SEED);

// ---------------------------------------------------------------- state
const S = {
  running: false, paused: false, over: false,
  time: 0, timeOfDay: 0.72, // late afternoon, sliding into dusk
  cash: 250, respect: 0,
  health: 100, armor: 0,
  wanted: 0, heat: 0,
  weapon: 'fists', ownedWeapons: ['fists'],
  jobIndex: 0, jobActive: false, jobStep: 0, jobData: null,
  jobChoice: null, jobModifier: 1, escortFollower: null, chaseTarget: null,
  surviveTimer: 0, surviveAttackers: [],
  raceActive: false, race: null, raceCheckpoint: 0, raceRivals: [],
  raceStartTime: 0, racePlayerProgress: 0, raceCooldown: 0,
  taxiActive: false, taxiPassenger: null, taxiDest: null, taxiFare: 0,
  collectibles: new Set(), turf: new Set(), crew: [],
  choices: {},
  stats: { jobsDone: 0, racesWon: 0, racesRun: 0, fares: 0, cashEarned: 0, carsStolen: 0, shotsFired: 0, arrests: 0, deaths: 0 },
  muted: false,
};

const player = {
  x: -240, z: -260, heading: 0, speed: 0, onFoot: true, moving: false,
  car: null, mesh: null, camYaw: 0, camPitch: 0.32, camDist: 9,
};

const keys = {};
const sounds = createSoundBank();

// ---------------------------------------------------------------- setup
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
$('game').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
const city = buildCity(THREE, SEED);
const scene = city.scene;
const colliders = city.colliders;

player.mesh = makePersonMesh(THREE, 0x2a9d8f, 0xc68642);
scene.add(player.mesh);

// Objective beacon, hidden until a job or race needs it.
const beacon = makeBeaconMesh(THREE, 0xffd60a);
beacon.visible = false;
scene.add(beacon);

// Parked cars the player can steal, scattered on roads.
const parkedCars = [];
function spawnParkedCar(vehicleDef, x, z, heading) {
  const mesh = makeCarMesh(THREE, vehicleDef.color, vehicleDef.kind);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const car = { def: vehicleDef, mesh, x, z, heading, speed: 0, parked: true, isBoat: vehicleDef.kind === 'boat' };
  parkedCars.push(car);
  return car;
}
const parkedSpots = [
  ['cormorant', -222, -222, 0], ['sardine', -148, -222, Math.PI / 2], ['pelican', -74, -148, 0],
  ['tiderunner', 222, 148, Math.PI], ['albatross', -148, 296, Math.PI / 2], ['cormorant', 74, 74, 0],
  ['sardine', 222, -74, Math.PI / 2], ['pelican', -296, 74, 0], ['tiderunner', 148, 222, Math.PI],
  ['cormorant', 0, 296, 0], ['sardine', 296, -222, Math.PI / 2], ['albatross', -74, -296, 0],
  ['dory', -148, 0, Math.PI / 2], ['dory', 74, -148, 0],
];
for (const [id, x, z, h] of parkedSpots) {
  spawnParkedCar(VEHICLES.find((v) => v.id === id), x, z, h);
}
// The boat, moored at the marina, close enough to the beach to board.
const boat = spawnParkedCar(VEHICLES.find((v) => v.id === 'marlin'), -266, -328, 0);

// Traffic: cars that drive the road grid forever.
const traffic = [];
function spawnTrafficCar() {
  const def = pickFrom(rand, VEHICLES.filter((v) => v.kind !== 'police' && v.kind !== 'boat'));
  const mesh = makeCarMesh(THREE, def.color, def.kind);
  scene.add(mesh);
  const car = { def, mesh, x: 0, z: 0, heading: 0, speed: 0, targetX: 0, targetZ: 0, cruise: range(rand, 10, 18), brake: 0 };
  traffic.push(car);
  placeTrafficOnRoad(car, true);
  return car;
}
function nearestRoadCoord(v) {
  return Math.round(v / WORLD.block) * WORLD.block;
}
function placeTrafficOnRoad(car, anywhere) {
  const k = rangeInt(rand, -5, 5) * WORLD.block;
  const m = rangeInt(rand, -5, 5) * WORLD.block;
  if (anywhere) {
    car.x = k; car.z = m;
  } else {
    // Respawn near the player, on a road a little ahead.
    car.x = nearestRoadCoord(player.x + range(rand, -160, 160));
    car.z = nearestRoadCoord(player.z + range(rand, -160, 160));
  }
  car.z = clamp(car.z, -280, 370);
  car.heading = pickFrom(rand, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
  pickTrafficTarget(car);
}
function pickTrafficTarget(car) {
  const alongX = Math.abs(Math.sin(car.heading)) < 0.5;
  const step = WORLD.block * (chance(rand, 0.75) ? 1 : 2);
  const dir = chance(rand, 0.5) ? 1 : -1;
  if (alongX) {
    car.targetX = clamp(car.x + dir * step, -370, 370);
    car.targetZ = nearestRoadCoord(car.z);
  } else {
    car.targetZ = clamp(car.z + dir * step, -280, 370);
    car.targetX = nearestRoadCoord(car.x);
  }
  // Sometimes turn at the next intersection instead of going straight.
  if (chance(rand, 0.35)) {
    const turn = chance(rand, 0.5) ? Math.PI / 2 : -Math.PI / 2;
    car.heading = ((car.heading + turn + Math.PI * 2) % (Math.PI * 2));
    if (alongX) { car.targetZ = clamp(car.z + dir * step, -280, 370); car.targetX = nearestRoadCoord(car.x); }
    else { car.targetX = clamp(car.x + dir * step, -370, 370); car.targetZ = nearestRoadCoord(car.z); }
  }
}
for (let i = 0; i < 12; i += 1) spawnTrafficCar();

// Pedestrians on the sidewalks.
const peds = [];
const SKINS = [0xc68642, 0x8d5524, 0xe0ac69, 0x5c3a21, 0xf1c27d];
const SHIRTS = [0x3a7bd5, 0xe63946, 0x2a9d8f, 0xf4a261, 0x9b5de5, 0xef476f, 0x80b918];
function spawnPed(x, z) {
  const mesh = makePersonMesh(THREE, pickFrom(rand, SHIRTS), pickFrom(rand, SKINS));
  scene.add(mesh);
  const ped = { mesh, x, z, heading: pickFrom(rand, [0, Math.PI / 2, Math.PI, -Math.PI / 2]), speed: range(rand, 1.2, 2.2), fleeing: 0, tx: x, tz: z, alive: true };
  peds.push(ped);
  return ped;
}
for (let i = 0; i < 18; i += 1) {
  spawnPed(range(rand, -360, 360), range(rand, -260, 360));
}

// Police: foot officers, patrol cars, roadblocks, helicopter.
const police = [];
const heli = { mesh: null, active: false, angle: 0 };
{
  const hg = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.6, 6.5), new THREE.MeshLambertMaterial({ color: 0x1b263b }));
  hg.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 5), new THREE.MeshLambertMaterial({ color: 0x1b263b }));
  tail.position.set(0, 0.3, -5);
  hg.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.7), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  rotor.position.y = 1.1;
  rotor.name = 'rotor';
  hg.add(rotor);
  const light = new THREE.Mesh(new THREE.ConeGeometry(3.2, 18, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  light.position.y = -9;
  light.rotation.x = Math.PI;
  hg.add(light);
  hg.visible = false;
  scene.add(hg);
  heli.mesh = hg;
}
function spawnPoliceCar() {
  const def = VEHICLES.find((v) => v.id === 'mako');
  const mesh = makeCarMesh(THREE, def.color, 'police');
  scene.add(mesh);
  const cop = { kind: 'car', def, mesh, x: player.x + range(rand, -120, 120), z: player.z + range(rand, -120, 120), heading: 0, speed: 0, ramCooldown: 0, flash: 0 };
  cop.x = clamp(cop.x, -360, 360); cop.z = clamp(cop.z, -270, 360);
  police.push(cop);
  return cop;
}
function spawnPoliceFoot() {
  const mesh = makePersonMesh(THREE, 0x1b263b, pickFrom(rand, SKINS));
  scene.add(mesh);
  const cop = { kind: 'foot', mesh, x: player.x + range(rand, -60, 60), z: player.z + range(rand, -60, 60), heading: 0, speed: 0, shootCooldown: 0 };
  cop.x = clamp(cop.x, -360, 360); cop.z = clamp(cop.z, -270, 360);
  police.push(cop);
  return cop;
}
function clearPolice() {
  for (const cop of police) scene.remove(cop.mesh);
  police.length = 0;
  heli.active = false;
  heli.mesh.visible = false;
  sounds.siren(false);
}

// Collectible medallions.
const medallions = [];
for (const [x, z] of COLLECTIBLE_SPOTS) {
  const mesh = makeMedallionMesh(THREE);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  medallions.push({ x, z, mesh, found: false });
}

// Shop and location markers.
const shopMarkers = [];
function addMarker(x, z, colorHex, label) {
  const m = makeBeaconMesh(THREE, colorHex);
  m.position.set(x, 0, z);
  m.scale.setScalar(0.6);
  scene.add(m);
  shopMarkers.push({ x, z, mesh: m, label });
  return m;
}
addMarker(SHOPS.gun.x, SHOPS.gun.z, 0x2a9d8f, SHOPS.gun.name);
addMarker(SHOPS.respray.x, SHOPS.respray.z, 0xef476f, SHOPS.respray.name);
addMarker(SHOPS.marina.x, SHOPS.marina.z, 0x2e86ab, SHOPS.marina.name);

// ---------------------------------------------------------------- input
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  sounds.unlock();
  if (e.code === 'KeyM') { S.muted = sounds.toggleMute(); toast(S.muted ? 'Sound muted (M to unmute)' : 'Sound on'); }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (S.running && !S.over) togglePause();
  }
  if (e.code === 'KeyE') tryInteract();
  if (e.code === 'KeyT') toggleTaxi();
  if (e.code === 'Digit1' || e.code === 'Digit2') {
    if (S.jobActive && S.jobData && S.jobData.steps[S.jobStep].type === 'choice') resolveChoice(e.code === 'Digit1' ? '1' : '2');
    else if (shopOpen) buyWeapon(e.code === 'Digit1' ? 0 : 1);
  }
  if (e.code === 'Enter') {
    if ($('startScreen').classList.contains('show')) startGame(false);
    else if ($('wastedScreen').classList.contains('show') || $('bustedScreen').classList.contains('show')) respawn();
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
let dragging = false, lastMX = 0, lastMY = 0;
renderer.domElement.addEventListener('mousedown', (e) => { dragging = true; lastMX = e.clientX; lastMY = e.clientY; if (S.running && !S.paused) tryShoot(); });
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  player.camYaw -= (e.clientX - lastMX) * 0.005;
  player.camPitch = clamp(player.camPitch + (e.clientY - lastMY) * 0.004, 0.08, 1.1);
  lastMX = e.clientX; lastMY = e.clientY;
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- helpers
let toastTimer = null;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
function showScreen(id) {
  for (const s of ['startScreen', 'pauseScreen', 'wastedScreen', 'bustedScreen', 'jobScreen', 'dialogueBox', 'choiceBox', 'shopBox']) $(s).classList.remove('show');
  if (id) $(id).classList.add('show');
}
function addCash(amount, why) {
  S.cash += amount;
  if (amount > 0) { S.stats.cashEarned += amount; sounds.cash(); }
  if (why) toast((amount > 0 ? '+' : '') + '$' + amount + ' — ' + why);
}
function respectPoints() { return S.respect; }
function respectRank() {
  let rank = RESPECT_RANKS[0];
  for (const r of RESPECT_RANKS) if (S.respect >= r.need) rank = r;
  return rank;
}
function addRespect(n) {
  const before = respectRank().name;
  S.respect += n;
  if (respectRank().name !== before) toast('Respect up! You are now ' + respectRank().name);
}
function addHeat(n) {
  if (S.crew.some((c) => c.id === 'finn')) n *= 0.7;
  S.heat = clamp(S.heat + n, 0, 100);
  const stars = Math.min(5, Math.floor(S.heat / 20) + (S.heat > 0 ? 0 : 0));
  const newStars = S.heat <= 0 ? 0 : Math.min(5, Math.ceil(S.heat / 20));
  if (newStars > S.wanted) { S.wanted = newStars; sounds.wanted(); toast('Wanted level ' + S.wanted + ' — the harbor patrol is coming'); }
  else S.wanted = newStars;
  if (S.wanted === 0) clearPolice();
}
function collideCircle(pos, radius) {
  // Push a circle out of every building collider it overlaps.
  for (const c of colliders) {
    const nx = clamp(pos.x, c.x0, c.x1);
    const nz = clamp(pos.z, c.z0, c.z1);
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        pos.x = c.x1 + radius;
      }
    }
  }
  pos.x = clamp(pos.x, -HALF, HALF);
  pos.z = clamp(pos.z, -HALF, HALF);
}
function onRoad(x, z) {
  const rx = Math.abs(x - nearestRoadCoord(x));
  const rz = Math.abs(z - nearestRoadCoord(z));
  return rx < WORLD.road / 2 + 2 || rz < WORLD.road / 2 + 2;
}

// ---------------------------------------------------------------- movement
function driveCar(car, dt, throttle, steer) {
  const def = car.def;
  let boost = 1;
  if (S.crew.some((c) => c.id === 'mara') && car === player.car) boost = 1.15;
  const top = def.topSpeed * boost;
  car.speed = clamp(car.speed + throttle * def.accel * dt, -top * 0.45, top);
  if (throttle === 0) car.speed *= Math.max(0, 1 - 1.6 * dt);
  if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
  car.heading += steer * def.grip * 0.55 * dt * Math.sign(car.speed || 1) * clamp(Math.abs(car.speed) / 8, 0.25, 1);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const pos = { x: nx, z: nz };
  collideCircle(pos, 1.6);
  if (pos.x !== nx || pos.z !== nz) {
    if (Math.abs(car.speed) > 14 && car === player.car) { sounds.crash(); damagePlayer(3); }
    car.speed *= 0.55;
  }
  car.x = pos.x; car.z = pos.z;
  if (car.isBoat) {
    // Boats live on the water: push them back toward the sea if they beach.
    if (car.z > -326) { car.z = -326; car.speed *= 0.5; }
    car.x = clamp(car.x, -370, 370);
    car.z = clamp(car.z, -560, -326);
  } else {
    if (car.z < -324) { car.z = -324; car.speed *= 0.5; }
  }
  car.mesh.position.set(car.x, car.isBoat ? 0.3 : 0, car.z);
  car.mesh.rotation.y = car.heading;
  car.mesh.rotation.z = -steer * clamp(Math.abs(car.speed) / 30, 0, 1) * 0.06;
  for (const w of car.mesh.userData.wheels || []) w.rotation.x += car.speed * dt * 2.4;
}

function updatePlayer(dt) {
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
  if (player.onFoot) {
    let fx = 0, fz = 0;
    const fwd = { x: -Math.sin(player.camYaw), z: -Math.cos(player.camYaw) };
    const right = { x: Math.cos(player.camYaw), z: -Math.sin(player.camYaw) };
    if (keys['KeyW']) { fx += fwd.x; fz += fwd.z; }
    if (keys['KeyS']) { fx -= fwd.x; fz -= fwd.z; }
    if (keys['KeyA']) { fx -= right.x; fz -= right.z; }
    if (keys['KeyD']) { fx += right.x; fz += right.z; }
    const len = Math.hypot(fx, fz);
    player.moving = len > 0;
    if (len > 0) {
      const sp = sprint ? 9.5 : 5.2;
      fx /= len; fz /= len;
      player.heading = Math.atan2(fx, fz);
      const pos = { x: player.x + fx * sp * dt, z: player.z + fz * sp * dt };
      collideCircle(pos, 0.9);
      player.x = pos.x; player.z = pos.z;
      if (player.z < -324) player.z = -324; // the sea stops a walker
      if (S.escortFollower) moveFollower(dt);
    }
    player.mesh.position.set(player.x, 0, player.z);
    player.mesh.rotation.y = player.heading;
    player.mesh.position.y = player.moving ? Math.abs(Math.sin(S.time * 12)) * 0.12 : 0;
  } else if (player.car) {
    const car = player.car;
    let throttle = 0;
    if (keys['KeyW']) throttle = 1;
    if (keys['KeyS']) throttle = -0.8;
    let steer = 0;
    if (keys['KeyA']) steer = 1;
    if (keys['KeyD']) steer = -1;
    if (keys['Space']) { car.speed *= Math.max(0, 1 - 3 * dt); }
    driveCar(car, dt, throttle, steer);
    player.x = car.x; player.z = car.z;
    player.heading = car.heading;
    player.camYaw = car.heading + Math.PI;
    sounds.engine(Math.abs(car.speed) / car.def.topSpeed);
    if (S.escortFollower) moveFollower(dt);
  }
}

function moveFollower(dt) {
  const f = S.escortFollower;
  if (!f || !f.alive) return;
  const d = dist2d(f.x, f.z, player.x, player.z);
  if (d > 3.5) {
    const sp = Math.min(10, 4 + d * 0.4);
    const dx = (player.x - f.x) / d, dz = (player.z - f.z) / d;
    const pos = { x: f.x + dx * sp * dt, z: f.z + dz * sp * dt };
    collideCircle(pos, 0.9);
    f.x = pos.x; f.z = pos.z;
    f.mesh.position.set(f.x, 0, f.z);
    f.mesh.rotation.y = Math.atan2(dx, dz);
  }
}

// ---------------------------------------------------------------- traffic & peds
function updateTraffic(dt) {
  for (const car of traffic) {
    const dx = car.targetX - car.x, dz = car.targetZ - car.z;
    const d = Math.hypot(dx, dz);
    if (d < 3) { pickTrafficTarget(car); continue; }
    // Yield to the player's car instead of grinding into it.
    let blocked = false;
    if (player.car) {
      const pdx = player.car.x - car.x, pdz = player.car.z - car.z;
      const ahead = pdx * Math.sin(car.heading) + pdz * Math.cos(car.heading);
      const side = Math.abs(pdx * Math.cos(car.heading) - pdz * Math.sin(car.heading));
      if (ahead > 0 && ahead < 13 && side < 3) blocked = true;
    }
    const want = blocked ? 0 : car.cruise;
    car.speed += clamp(want - car.speed, -14 * dt, 8 * dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const pos = { x: car.x, z: car.z };
    collideCircle(pos, 1.6);
    car.x = pos.x; car.z = pos.z;
    if (Math.abs(car.x) > 375 || Math.abs(car.z) > 375 || car.z < -300) placeTrafficOnRoad(car, false);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    for (const w of car.mesh.userData.wheels || []) w.rotation.x += car.speed * dt * 2.4;
  }
}

function updatePeds(dt) {
  for (const ped of peds) {
    if (!ped.alive) continue;
    // Flee gunfire and speeding cars.
    const pd = dist2d(ped.x, ped.z, player.x, player.z);
    let speed = ped.speed;
    if (ped.fleeing > 0) {
      ped.fleeing -= dt;
      speed = 6;
      const dx = (ped.x - player.x) / (pd || 1), dz = (ped.z - player.z) / (pd || 1);
      ped.tx = ped.x + dx * 30; ped.tz = ped.z + dz * 30;
    } else if (pd < 7 && player.car && Math.abs(player.car.speed) > 12) {
      ped.fleeing = 2.5;
    }
    const dx = ped.tx - ped.x, dz = ped.tz - ped.z;
    const d = Math.hypot(dx, dz);
    if (d < 2) {
      ped.tx = clamp(ped.x + range(rand, -70, 70), -360, 360);
      ped.tz = clamp(ped.z + range(rand, -70, 70), -260, 360);
      ped.heading = pickFrom(rand, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    } else {
      ped.heading = Math.atan2(dx, dz);
      ped.x += (dx / d) * speed * dt;
      ped.z += (dz / d) * speed * dt;
      const pos = { x: ped.x, z: ped.z };
      collideCircle(pos, 0.8);
      ped.x = pos.x; ped.z = pos.z;
    }
    ped.mesh.position.set(ped.x, Math.abs(Math.sin(S.time * 8 + ped.x)) * 0.08, ped.z);
    ped.mesh.rotation.y = ped.heading;
  }
}

// ---------------------------------------------------------------- police
let roadblock = null;
function ensurePolice() {
  const wantCars = S.wanted >= 2 ? Math.min(3, S.wanted - 1) : 0;
  const wantFoot = S.wanted >= 1 ? Math.min(4, S.wanted + 1) : 0;
  const cars = police.filter((c) => c.kind === 'car').length;
  const foot = police.filter((c) => c.kind === 'foot').length;
  for (let i = cars; i < wantCars; i += 1) spawnPoliceCar();
  for (let i = foot; i < wantFoot; i += 1) spawnPoliceFoot();
  if (S.wanted >= 3 && !roadblock) {
    const def = VEHICLES.find((v) => v.id === 'mako');
    const ahead = 60;
    const bx = player.x - Math.sin(player.heading) * ahead;
    const bz = player.z - Math.cos(player.heading) * ahead;
    const group = new THREE.Group();
    for (let i = -1; i <= 1; i += 1) {
      const m = makeCarMesh(THREE, def.color, 'police');
      m.position.set(i * 6, 0, 0);
      m.rotation.y = Math.PI / 2;
      group.add(m);
    }
    group.position.set(clamp(bx, -350, 350), 0, clamp(bz, -260, 350));
    scene.add(group);
    roadblock = { group, x: group.position.x, z: group.position.z };
    toast('Roadblock ahead! The harbor patrol sealed the road.');
  }
  if (S.wanted < 3 && roadblock) { scene.remove(roadblock.group); roadblock = null; }
  const heliWant = S.wanted >= 4;
  if (heliWant && !heli.active) { heli.active = true; heli.mesh.visible = true; toast('Police helicopter overhead — stay out of the searchlight!'); }
  if (!heliWant && heli.active) { heli.active = false; heli.mesh.visible = false; }
  sounds.siren(S.wanted >= 2);
}

function updatePolice(dt) {
  ensurePolice();
  // Heat cools when no officer can see the player; turf you own cools faster.
  const d = districtAt(player.x, player.z);
  const inTurf = S.turf.has(d.id);
  let seen = false;
  for (const cop of police) {
    const cd = dist2d(cop.x, cop.z, player.x, player.z);
    if (cd < 70) seen = true;
  }
  if (heli.active) seen = true;
  if (!seen && S.heat > 0) {
    S.heat = Math.max(0, S.heat - dt * (inTurf ? 4.5 : 2.2));
    const stars = S.heat <= 0 ? 0 : Math.min(5, Math.ceil(S.heat / 20));
    S.wanted = stars;
    if (stars === 0) clearPolice();
  }
  for (const cop of police) {
    if (cop.kind === 'car') {
      cop.ramCooldown = Math.max(0, cop.ramCooldown - dt);
      // Chase the player's car, not the on-foot spot.
      const tx = player.x, tz = player.z;
      const dx = tx - cop.x, dz = tz - cop.z;
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - cop.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      cop.heading += clamp(dh, -1.6 * dt, 1.6 * dt);
      const dist = Math.hypot(dx, dz);
      const targetSpeed = dist > 4 ? Math.min(40, 26 + S.wanted * 3) : 0;
      cop.speed += clamp(targetSpeed - cop.speed, -20 * dt, 14 * dt);
      cop.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.z += Math.cos(cop.heading) * cop.speed * dt;
      const pos = { x: cop.x, z: cop.z };
      collideCircle(pos, 1.6);
      cop.x = pos.x; cop.z = pos.z;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      cop.flash += dt;
      const bars = [cop.mesh.getObjectByName('lightbar'), cop.mesh.getObjectByName('lightbar2')];
      if (bars[0]) bars[0].visible = Math.floor(cop.flash * 4) % 2 === 0;
      if (bars[1]) bars[1].visible = Math.floor(cop.flash * 4) % 2 === 1;
      // Gentle, rate-limited ramming: a nudge and a little damage, at most
      // once every 1.5 seconds per patrol car, never a speed drain.
      if (player.car && dist < 4.5 && cop.ramCooldown <= 0) {
        cop.ramCooldown = 1.5;
        sounds.crash();
        player.car.speed *= 0.92;
        player.car.x += Math.sin(cop.heading) * 1.2;
        player.car.z += Math.cos(cop.heading) * 1.2;
        player.x = player.car.x; player.z = player.car.z;
        damagePlayer(4);
        toast('Patrol car rammed you!');
      }
    } else {
      cop.shootCooldown = Math.max(0, cop.shootCooldown - dt);
      const dx = player.x - cop.x, dz = player.z - cop.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.2) {
        cop.heading = Math.atan2(dx, dz);
        cop.x += Math.sin(cop.heading) * 5.5 * dt;
        cop.z += Math.cos(cop.heading) * 5.5 * dt;
        const pos = { x: cop.x, z: cop.z };
        collideCircle(pos, 0.9);
        cop.x = pos.x; cop.z = pos.z;
      }
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      if (dist < 26 && S.wanted >= 2 && cop.shootCooldown <= 0) {
        cop.shootCooldown = 1.4;
        sounds.shoot();
        if (chance(rand, 0.45)) damagePlayer(6);
      }
      if (dist < 2.2 && S.wanted >= 1) {
        S.over = true;
        S.stats.arrests += 1;
        sounds.busted();
        showScreen('bustedScreen');
        $('bustedText').textContent = 'The harbor patrol caught you on foot in ' + districtAt(player.x, player.z).name + '.';
      }
    }
  }
  if (heli.active) {
    heli.angle += dt * 0.5;
    heli.mesh.position.set(player.x + Math.cos(heli.angle) * 26, 55, player.z + Math.sin(heli.angle) * 26);
    heli.mesh.rotation.y = Math.atan2(player.x - heli.mesh.position.x, player.z - heli.mesh.position.z);
    const rotor = heli.mesh.getObjectByName('rotor');
    if (rotor) rotor.rotation.y += dt * 18;
    addHeat(dt * 1.2); // the searchlight keeps the heat up
  }
}

function damagePlayer(n) {
  if (!S.running || S.over) return;
  if (S.armor > 0) {
    const absorbed = Math.min(S.armor, n);
    S.armor -= absorbed;
    n -= absorbed;
  }
  S.health -= n;
  if (S.health <= 0) {
    S.health = 0;
    S.over = true;
    S.stats.deaths += 1;
    sounds.engineStop();
    sounds.wasted();
    showScreen('wastedScreen');
    $('wastedText').textContent = 'You went down in ' + districtAt(player.x, player.z).name + ' with $' + S.cash + ' in your pocket.';
  }
}

function respawn() {
  S.health = 100;
  S.armor = 0;
  S.heat = 0; S.wanted = 0;
  clearPolice();
  player.x = -240; player.z = -260;
  player.onFoot = true; player.car = null;
  player.mesh.visible = true;
  S.over = false;
  S.jobActive = false;
  S.raceActive = false;
  beacon.visible = false;
  showScreen(null);
  $('hud').classList.add('show');
  toast('You woke up at the Marina Bay clinic. The harbor moves on.');
  saveGame();
}

// ---------------------------------------------------------------- interact
function nearestParkedCar(maxD) {
  let best = null, bd = maxD;
  for (const car of parkedCars) {
    const d = dist2d(car.x, car.z, player.x, player.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

function tryInteract() {
  if (!S.running || S.paused || S.over) return;
  // Shops first.
  if (dist2d(player.x, player.z, SHOPS.gun.x, SHOPS.gun.z) < 9) { openShop(); return; }
  if (dist2d(player.x, player.z, SHOPS.respray.x, SHOPS.respray.z) < 9) {
    if (S.cash >= RESPRAY_COST && S.wanted > 0) {
      S.cash -= RESPRAY_COST;
      S.heat = 0; S.wanted = 0;
      clearPolice();
      sounds.cash();
      toast('Fresh paint at Color Cove. Heat cleared for $' + RESPRAY_COST + '.');
    } else if (S.wanted === 0) toast('Color Cove: no heat to clear. Come back when the patrol knows your name.');
    else toast('Color Cove respray costs $' + RESPRAY_COST + '. You have $' + S.cash + '.');
    return;
  }
  if (player.onFoot) {
    const car = nearestParkedCar(5);
    if (car) {
      player.onFoot = false;
      player.car = car;
      car.parked = false;
      player.mesh.visible = false;
      sounds.engineStart();
      if (car.def.id !== 'dory' && car.def.id !== 'mako') {
        S.stats.carsStolen += 1;
        addHeat(8);
        toast('You took the ' + car.def.name + '. The harbor saw that.');
      } else if (car.def.id === 'mako') {
        addHeat(25);
        toast('You stole a patrol car! Every officer in the harbor is coming.');
      } else {
        toast('You are driving the ' + car.def.name + '.');
      }
      // A stolen car finishes a theft step.
      if (S.jobActive) checkJobStep('car', car.def.id);
    }
  } else if (player.car) {
    player.onFoot = true;
    player.car.speed = 0;
    player.mesh.visible = true;
    player.x = player.car.x + Math.sin(player.car.heading + Math.PI / 2) * 2.5;
    player.z = player.car.z + Math.cos(player.car.heading + Math.PI / 2) * 2.5;
    player.car = null;
    sounds.engineStop();
  }
}

function tryShoot() {
  if (!S.running || S.paused || S.over) return;
  const weapon = WEAPONS.find((w) => w.id === S.weapon);
  if (!weapon || weapon.id === 'fists') return;
  S.stats.shotsFired += 1;
  sounds.shoot();
  // Hitscan: nearest police officer or pedestrian roughly in front of the camera.
  const fx = -Math.sin(player.camYaw), fz = -Math.cos(player.camYaw);
  let best = null, bd = weapon.range;
  const consider = (x, z, obj) => {
    const dx = x - player.x, dz = z - player.z;
    const d = Math.hypot(dx, dz);
    const dot = d > 0 ? (dx * fx + dz * fz) / d : 1;
    if (d < bd && dot > 0.86) { bd = d; best = obj; }
  };
  for (const cop of police) consider(cop.x, cop.z, cop);
  for (const ped of peds) if (ped.alive) consider(ped.x, ped.z, ped);
  if (best) {
    let dmg = weapon.damage;
    if (S.crew.some((c) => c.id === 'bo')) dmg *= 1.4;
    if (best.kind === 'car') {
      best.speed *= 0.7;
      addHeat(4);
    } else if (best.kind === 'foot') {
      scene.remove(best.mesh);
      police.splice(police.indexOf(best), 1);
      addHeat(10);
      toast('Officer down. That will cost you.');
    } else {
      best.alive = false;
      best.mesh.visible = false;
      for (const p of peds) if (p === best) p.fleeing = 0;
      addHeat(14);
      toast('A bystander went down. The harbor patrol is on its way.');
      for (const p of peds) if (dist2d(p.x, p.z, player.x, player.z) < 30) p.fleeing = 3;
    }
  }
}

// ---------------------------------------------------------------- shops
let shopOpen = false;
function openShop() {
  shopOpen = true;
  const rank = respectRank();
  let html = '<h2>' + SHOPS.gun.name + '</h2><p>' + SHOPS.gun.blurb + ' Your cash: $' + S.cash + ' — Rank: ' + rank.name + '</p>';
  WEAPONS.forEach((w, i) => {
    const owned = S.ownedWeapons.includes(w.id);
    const locked = RESPECT_RANKS[w.respect].need > S.respect;
    html += '<div class="shopRow"><span>' + (i + 1) + '. ' + w.name + ' — $' + w.price + ' (dmg ' + w.damage + ', range ' + w.range + 'm)</span><span>' + (owned ? 'OWNED — press to equip' : locked ? 'Needs ' + RESPECT_RANKS[w.respect].name : 'Press ' + (i + 1) + ' to buy') + '</span></div>';
  });
  html += '<p>Armor plate $300 — press A. Close — press E.</p>';
  $('shopBox').innerHTML = html;
  $('shopBox').classList.add('show');
}
function buyWeapon(index) {
  if (!shopOpen) return;
  const w = WEAPONS[index];
  if (!w) return;
  if (S.ownedWeapons.includes(w.id)) { S.weapon = w.id; sounds.click(); toast('Equipped the ' + w.name + '.'); $('shopBox').classList.remove('show'); shopOpen = false; return; }
  if (RESPECT_RANKS[w.respect].need > S.respect) { toast('You need the rank ' + RESPECT_RANKS[w.respect].name + ' for the ' + w.name + '.'); return; }
  if (S.cash < w.price) { toast('Not enough cash for the ' + w.name + '.'); return; }
  S.cash -= w.price;
  S.ownedWeapons.push(w.id);
  S.weapon = w.id;
  sounds.cash();
  toast('Bought the ' + w.name + ' for $' + w.price + '.');
  $('shopBox').classList.remove('show');
  shopOpen = false;
}
addEventListener('keydown', (e) => {
  if (shopOpen && e.code === 'KeyA') {
    if (S.cash >= 300) { S.cash -= 300; S.armor = 100; sounds.cash(); toast('Armor plate fitted.'); $('shopBox').classList.remove('show'); shopOpen = false; }
    else toast('Armor costs $300.');
  }
  if (shopOpen && e.code === 'KeyE') { $('shopBox').classList.remove('show'); shopOpen = false; }
});

// ---------------------------------------------------------------- jobs
function currentJob() { return JOBS[S.jobIndex] || null; }
function startJob(index) {
  const job = JOBS[index];
  if (!job) return;
  S.jobIndex = index;
  S.jobActive = true;
  S.jobStep = 0;
  S.jobModifier = 1;
  S.jobChoice = null;
  sounds.jobStart();
  showDialogue(job.giver + ': "' + job.intro + '"');
  setJobBeacon();
  toast('Job ' + job.num + ' of 7 — ' + job.name);
}
function setJobBeacon() {
  const job = currentJob();
  if (!job || !S.jobActive) { beacon.visible = false; return; }
  const step = job.steps[S.jobStep];
  if (!step) { beacon.visible = false; return; }
  beacon.position.set(step.x, 0, step.z);
  beacon.visible = true;
}
function jobObjectiveText() {
  if (!S.jobActive) {
    const next = currentJob();
    return next ? 'Next job: ' + next.name + ' — find the ' + next.giver + ' marker' : 'All 7 jobs done. The harbor is yours.';
  }
  const job = currentJob();
  const step = job.steps[S.jobStep];
  if (!step) return job.name;
  if (step.type === 'survive') return step.label + ' — ' + Math.ceil(S.surviveTimer) + 's left';
  if (step.type === 'choice') return step.label;
  return job.name + ': ' + step.label;
}
function showDialogue(text) {
  $('dialogueBox').textContent = text;
  $('dialogueBox').classList.add('show');
  setTimeout(() => $('dialogueBox').classList.remove('show'), 6000);
}
function resolveChoice(key) {
  const job = currentJob();
  const step = job.steps[S.jobStep];
  const opt = step.options.find((o) => o.key === key);
  if (!opt) return;
  S.jobChoice = key;
  S.choices[job.branch || job.id] = opt.label;
  $('choiceBox').classList.remove('show');
  if (job.id === 'harbor-run' && key === '2') {
    addCash(2200, 'the patrol paid for the dockhand');
    S.jobModifier = 1;
    toast('Betrayed. The patrol pays well. Nobody forgets.');
  }
  if (job.id === 'harbor-run' && key === '1') {
    toast('Spared. The dockhand will remember this at the finale.');
  }
  if (job.id === 'quiet-or-loud' && key === '1') {
    S.jobModifier = 0.6;
    toast('Quiet it is. Small take, no heat.');
  }
  if (job.id === 'quiet-or-loud' && key === '2') {
    S.jobModifier = 1.5;
    addHeat(60);
    toast('Loud it is! Triple take — and the whole harbor is awake.');
  }
  showDialogue(job.giver + ': "' + opt.effect + '"');
  advanceJobStep();
}
function advanceJobStep() {
  const job = currentJob();
  S.jobStep += 1;
  if (S.jobStep >= job.steps.length) { completeJob(); return; }
  const step = job.steps[S.jobStep];
  if (step.type === 'choice') {
    let html = '<h2>' + job.name + ' — a choice</h2><p>' + step.label + '</p>';
    for (const o of step.options) html += '<p><b>Press ' + o.key + '</b> — ' + o.label + ': ' + o.effect + '</p>';
    $('choiceBox').innerHTML = html;
    $('choiceBox').classList.add('show');
    beacon.position.set(step.x, 0, step.z);
    beacon.visible = true;
    return;
  }
  if (step.type === 'escort') spawnEscortFollower(step);
  if (step.type === 'chase') spawnChaseTarget(step);
  if (step.type === 'survive') { S.surviveTimer = step.seconds; spawnSurvivors(step); }
  if (step.type === 'pickup' && job.id === 'hot-wheels') {
    // The Tide Runner waits at the chop shop for this job.
    const car = parkedCars.find((c) => c.def.id === 'tiderunner' && c.parked);
    if (car) { car.x = step.x; car.z = step.z; car.mesh.position.set(step.x, 0, step.z); }
  }
  sounds.pickup();
  setJobBeacon();
}
function spawnEscortFollower(step) {
  const mesh = makePersonMesh(THREE, 0xf4a261, 0x8d5524);
  mesh.position.set(player.x + 3, 0, player.z + 3);
  scene.add(mesh);
  S.escortFollower = { mesh, x: player.x + 3, z: player.z + 3, alive: true };
}
function spawnChaseTarget(step) {
  const def = VEHICLES.find((v) => v.id === 'cormorant');
  const mesh = makeCarMesh(THREE, 0xe63946, 'sedan');
  mesh.position.set(step.x, 0, step.z);
  scene.add(mesh);
  const car = { def, mesh, x: step.x, z: step.z, heading: 0, speed: 0, parked: false, isBoat: false };
  S.chaseTarget = car;
  toast('Target spotted — run them down!');
}
function spawnSurvivors(step) {
  S.surviveAttackers = [];
  for (let i = 0; i < 3; i += 1) {
    const mesh = makePersonMesh(THREE, 0x111111, pickFrom(rand, SKINS));
    const ax = step.x + range(rand, -30, 30), az = step.z + range(rand, -30, 30);
    mesh.position.set(ax, 0, az);
    scene.add(mesh);
    S.surviveAttackers.push({ mesh, x: ax, z: az, heading: 0, shootCooldown: range(rand, 0.5, 1.5), alive: true });
  }
  toast("Big Ray's crew is coming up the pier. Hold the line!");
}
function checkJobStep(kind, extra) {
  if (!S.jobActive) return;
  const job = currentJob();
  const step = job.steps[S.jobStep];
  if (!step) return;
  if (step.type === 'goto' || step.type === 'escort' || step.type === 'deliver' || step.type === 'pickup') {
    const d = dist2d(player.x, player.z, step.x, step.z);
    const need = step.type === 'escort' ? 10 : 8;
    if (d < need) {
      if (step.type === 'pickup' && step.needCar && kind !== 'car') return;
      if (step.type === 'pickup' && step.needCar && extra !== step.needCar) return;
      if (step.type === 'escort' && S.escortFollower && dist2d(S.escortFollower.x, S.escortFollower.z, step.x, step.z) > 16) {
        toast('Your escort is too far behind. Wait for them.');
        return;
      }
      if (step.type === 'escort' && S.escortFollower) {
        scene.remove(S.escortFollower.mesh);
        S.escortFollower = null;
      }
      if (step.type === 'pickup') addCash(150, 'grabbed the goods');
      sounds.checkpoint();
      advanceJobStep();
    }
  }
}
function completeJob() {
  const job = currentJob();
  const payout = Math.round(job.payout * S.jobModifier);
  addCash(payout, job.name + ' complete');
  addRespect(150);
  S.stats.jobsDone += 1;
  S.jobActive = false;
  beacon.visible = false;
  // The job's district joins your turf.
  if (!S.turf.has(job.district)) {
    S.turf.add(job.district);
    const d = DISTRICTS.find((dd) => dd.id === job.district);
    toast('Turf captured: ' + (d ? d.name : job.district) + ' now pays you $' + TURF_INCOME + ' a minute.');
  }
  sounds.jobDone();
  $('jobTitle').textContent = 'JOB COMPLETE — ' + job.name;
  $('jobBody').textContent = job.outro + ' Payout: $' + payout + '  •  Respect +150  •  Jobs done: ' + S.stats.jobsDone + ' / 7';
  showScreen('jobScreen');
  setTimeout(() => { if (!$('pauseScreen').classList.contains('show')) showScreen(null); }, 5200);
  S.jobIndex += 1;
  saveGame();
}
function updateJob(dt) {
  if (!S.jobActive) return;
  const job = currentJob();
  const step = job.steps[S.jobStep];
  if (!step) return;
  if (step.type === 'chase' && S.chaseTarget) {
    const t = S.chaseTarget;
    // The target flees along the roads, away from the player.
    const away = Math.atan2(t.x - player.x, t.z - player.z);
    t.heading += clamp(((away - t.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1.4 * dt, 1.4 * dt);
    t.speed = Math.min(30, t.speed + 12 * dt);
    t.x += Math.sin(t.heading) * t.speed * dt;
    t.z += Math.cos(t.heading) * t.speed * dt;
    const pos = { x: t.x, z: t.z };
    collideCircle(pos, 1.6);
    t.x = clamp(pos.x, -360, 360); t.z = clamp(pos.z, -270, 360);
    t.mesh.position.set(t.x, 0, t.z);
    t.mesh.rotation.y = t.heading;
    beacon.position.set(t.x, 0, t.z);
    beacon.visible = true;
    const d = dist2d(player.x, player.z, t.x, t.z);
    if (d < 6) {
      scene.remove(t.mesh);
      S.chaseTarget = null;
      sounds.checkpoint();
      advanceJobStep();
    }
  }
  if (step.type === 'survive') {
    S.surviveTimer -= dt;
    for (const a of S.surviveAttackers) {
      if (!a.alive) continue;
      const dx = player.x - a.x, dz = player.z - a.z;
      const d = Math.hypot(dx, dz);
      a.heading = Math.atan2(dx, dz);
      if (d > 6) { a.x += Math.sin(a.heading) * 5 * dt; a.z += Math.cos(a.heading) * 5 * dt; }
      a.mesh.position.set(a.x, 0, a.z);
      a.mesh.rotation.y = a.heading;
      a.shootCooldown -= dt;
      if (d < 30 && a.shootCooldown <= 0) {
        a.shootCooldown = 1.6;
        sounds.shoot();
        if (chance(rand, 0.4)) damagePlayer(5);
      }
    }
    if (S.surviveTimer <= 0) {
      for (const a of S.surviveAttackers) scene.remove(a.mesh);
      S.surviveAttackers = [];
      sounds.checkpoint();
      advanceJobStep();
    }
  }
  if (step.type !== 'choice' && step.type !== 'chase' && step.type !== 'survive') checkJobStep('proximity');
  if (step.type === 'choice') {
    // Keep the choice box up until a key is pressed.
    if (!$('choiceBox').classList.contains('show')) {
      let html = '<h2>' + job.name + ' — a choice</h2><p>' + step.label + '</p>';
      for (const o of step.options) html += '<p><b>Press ' + o.key + '</b> — ' + o.label + ': ' + o.effect + '</p>';
      $('choiceBox').innerHTML = html;
      $('choiceBox').classList.add('show');
    }
  }
}

// ---------------------------------------------------------------- races
function startRace(raceId) {
  const race = RACES.find((r) => r.id === raceId);
  if (!race) return;
  if (S.cash < race.entry) { toast('The ' + race.name + ' costs $' + race.entry + ' to enter. You have $' + S.cash + '.'); return; }
  S.cash -= race.entry;
  S.raceActive = true;
  S.race = race;
  S.raceCheckpoint = 0;
  S.raceRivals = [];
  S.raceStartTime = S.time;
  S.stats.racesRun += 1;
  const start = race.checkpoints[0];
  // Put the player in a car at the start line if they are on foot.
  if (player.onFoot) {
    const car = nearestParkedCar(60) || parkedCars[0];
    player.onFoot = false;
    player.car = car;
    car.parked = false;
    player.mesh.visible = false;
  }
  player.x = start[0]; player.z = start[1];
  if (player.car) { player.car.x = start[0]; player.car.z = start[1]; player.car.heading = 0; player.car.speed = 0; }
  // Rivals line up just ahead and behind.
  RIVAL_DRIVERS.forEach((rival, i) => {
    const def = VEHICLES.find((v) => v.id === 'albatross');
    const mesh = makeCarMesh(THREE, rival.color, 'sports');
    scene.add(mesh);
    const rx = start[0] + (i - 1) * 5;
    const rz = start[1] - 8 - i * 4;
    mesh.position.set(rx, 0, rz);
    S.raceRivals.push({ ...rival, mesh, x: rx, z: rz, heading: 0, speed: 0, checkpoint: 0, progress: 0 });
  });
  beacon.position.set(race.checkpoints[1][0], 0, race.checkpoints[1][1]);
  beacon.visible = true;
  sounds.jobStart();
  showDialogue('Starter: "' + race.name + ' — ' + race.blurb + ' First across every gate takes $' + race.prize + '!"');
}
function raceProgressOf(x, z, checkpoint) {
  const race = S.race;
  const next = race.checkpoints[(checkpoint + 1) % race.checkpoints.length];
  return checkpoint * 1000 - dist2d(x, z, next[0], next[1]);
}
function updateRace(dt) {
  if (!S.raceActive || !S.race) return;
  const race = S.race;
  const next = race.checkpoints[(S.raceCheckpoint + 1) % race.checkpoints.length];
  if (dist2d(player.x, player.z, next[0], next[1]) < 14) {
    S.raceCheckpoint += 1;
    sounds.checkpoint();
    if (S.raceCheckpoint >= race.checkpoints.length - 1) { finishRace(); return; }
    const following = race.checkpoints[(S.raceCheckpoint + 1) % race.checkpoints.length];
    beacon.position.set(following[0], 0, following[1]);
  }
  for (const rival of S.raceRivals) {
    const rNext = race.checkpoints[(rival.checkpoint + 1) % race.checkpoints.length];
    const dx = rNext[0] - rival.x, dz = rNext[1] - rival.z;
    const d = Math.hypot(dx, dz);
    rival.heading = Math.atan2(dx, dz);
    const top = 34 * rival.skill + Math.sin(S.time * 0.7 + rival.x) * 2;
    rival.speed = Math.min(top, rival.speed + 16 * dt);
    if (d < 12) rival.checkpoint += 1;
    rival.x += Math.sin(rival.heading) * rival.speed * dt;
    rival.z += Math.cos(rival.heading) * rival.speed * dt;
    rival.mesh.position.set(rival.x, 0, rival.z);
    rival.mesh.rotation.y = rival.heading;
    rival.progress = raceProgressOf(rival.x, rival.z, rival.checkpoint);
  }
  S.racePlayerProgress = raceProgressOf(player.x, player.z, S.raceCheckpoint);
}
function raceStandings() {
  const rows = [{ name: 'Rook Vega (you)', progress: S.racePlayerProgress }];
  for (const r of S.raceRivals) rows.push({ name: r.name, progress: r.progress });
  rows.sort((a, b) => b.progress - a.progress);
  return rows;
}
function finishRace() {
  const standings = raceStandings();
  const place = standings.findIndex((r) => r.name.includes('you')) + 1;
  S.raceActive = false;
  S.raceCooldown = 5; // standing on the start line must not restart the race
  beacon.visible = false;
  for (const r of S.raceRivals) scene.remove(r.mesh);
  S.raceRivals = [];
  if (place === 1) {
    addCash(S.race.prize, 'won the ' + S.race.name);
    addRespect(120);
    S.stats.racesWon += 1;
    $('jobTitle').textContent = 'RACE WON — ' + S.race.name;
    $('jobBody').textContent = 'You beat ' + RIVAL_DRIVERS.map((r) => r.name).join(', ') + ' to the line. Prize: $' + S.race.prize + '  •  Races won: ' + S.stats.racesWon + ' / 3';
  } else {
    $('jobTitle').textContent = 'RACE OVER — ' + S.race.name;
    $('jobBody').textContent = 'You finished ' + place + ' of 4. ' + standings[0].name + ' takes the $' + S.race.prize + '. Run it again from the race marker.';
  }
  sounds.jobDone();
  showScreen('jobScreen');
  setTimeout(() => { if (!$('pauseScreen').classList.contains('show')) showScreen(null); }, 5200);
  saveGame();
}

// ---------------------------------------------------------------- taxi
function toggleTaxi() {
  if (!S.running || S.paused || S.over) return;
  if (S.taxiActive) {
    S.taxiActive = false;
    if (S.taxiPassenger) { scene.remove(S.taxiPassenger.mesh); S.taxiPassenger = null; }
    beacon.visible = false;
    toast('Taxi shift ended.');
    return;
  }
  if (!player.car) { toast('You need a car to run fares. Steal one first.'); return; }
  const dest = pickFrom(rand, [[-180, 320], [220, -60], [-60, -260], [300, 200], [-300, 0], [60, 120]]);
  S.taxiDest = dest;
  S.taxiFare = TAXI_FARE + rangeInt(rand, 0, 120);
  const mesh = makePersonMesh(THREE, 0xef476f, pickFrom(rand, SKINS));
  mesh.position.set(player.x + 4, 0, player.z + 4);
  scene.add(mesh);
  S.taxiPassenger = { mesh, x: player.x + 4, z: player.z + 4 };
  S.taxiActive = true;
  beacon.position.set(dest[0], 0, dest[1]);
  beacon.visible = true;
  showDialogue('Passenger: "Take me to ' + districtAt(dest[0], dest[1]).name + ', and step on it — $' + S.taxiFare + ' in it for you."');
}
function updateTaxi(dt) {
  if (!S.taxiActive || !S.taxiPassenger) return;
  const p = S.taxiPassenger;
  // The passenger rides with you once you drive off; the marker is the goal.
  if (player.car) {
    p.x = player.x; p.z = player.z;
    p.mesh.visible = false;
  } else {
    p.mesh.visible = true;
    const d = dist2d(p.x, p.z, player.x, player.z);
    if (d > 3) {
      const dx = (player.x - p.x) / d, dz = (player.z - p.z) / d;
      p.x += dx * 5 * dt; p.z += dz * 5 * dt;
      p.mesh.position.set(p.x, 0, p.z);
    }
  }
  if (dist2d(player.x, player.z, S.taxiDest[0], S.taxiDest[1]) < 10) {
    scene.remove(p.mesh);
    S.taxiPassenger = null;
    S.taxiActive = false;
    beacon.visible = false;
    addCash(S.taxiFare, 'taxi fare to ' + districtAt(S.taxiDest[0], S.taxiDest[1]).name);
    addRespect(25);
    S.stats.fares += 1;
    saveGame();
  }
}

// ---------------------------------------------------------------- collectibles & turf
function updateCollectibles() {
  for (const m of medallions) {
    if (m.found) continue;
    m.mesh.userData.coin.rotation.y += 0.03;
    m.mesh.userData.coin.position.y = 1.4 + Math.sin(S.time * 2 + m.x) * 0.25;
    if (dist2d(player.x, player.z, m.x, m.z) < 3.5) {
      m.found = true;
      m.mesh.visible = false;
      S.collectibles.add(m.x + ':' + m.z);
      addCash(100, 'harbor medallion found (' + S.collectibles.size + ' / 24)');
      addRespect(20);
      sounds.pickup();
      // Finding every medallion in a district captures it.
      const d = districtAt(m.x, m.z);
      const inDistrict = medallions.filter((mm) => districtAt(mm.x, mm.z).id === d.id);
      if (inDistrict.every((mm) => mm.found) && !S.turf.has(d.id)) {
        S.turf.add(d.id);
        toast('Turf captured: ' + d.name + ' is yours — all its medallions found.');
      }
    }
  }
}
let turfTimer = 0;
function updateTurf(dt) {
  turfTimer += dt;
  if (turfTimer >= TURF_INTERVAL) {
    turfTimer = 0;
    if (S.turf.size > 0) addCash(S.turf.size * TURF_INCOME, 'turf income from ' + S.turf.size + ' district' + (S.turf.size > 1 ? 's' : ''));
  }
}

// ---------------------------------------------------------------- HUD & minimap
const minimap = $('minimap');
const mctx = minimap.getContext('2d');
function drawMinimap() {
  const W = minimap.width, H = minimap.height;
  const scale = W / (HALF * 2 + 120);
  const toX = (x) => (x + HALF + 60) * scale;
  const toY = (z) => (z + HALF + 60) * scale;
  mctx.fillStyle = '#0d1b2a';
  mctx.fillRect(0, 0, W, H);
  for (const d of DISTRICTS) {
    mctx.fillStyle = '#' + d.color.toString(16).padStart(6, '0');
    mctx.globalAlpha = S.turf.has(d.id) ? 0.85 : 0.3;
    mctx.fillRect(toX(d.x0), toY(d.z0), (d.x1 - d.x0) * scale, (d.z1 - d.z0) * scale);
  }
  mctx.globalAlpha = 1;
  mctx.strokeStyle = 'rgba(255,255,255,0.35)';
  mctx.lineWidth = 1;
  for (let k = -5; k <= 5; k += 1) {
    mctx.beginPath(); mctx.moveTo(toX(k * WORLD.block), 0); mctx.lineTo(toX(k * WORLD.block), H); mctx.stroke();
    mctx.beginPath(); mctx.moveTo(0, toY(k * WORLD.block)); mctx.lineTo(W, toY(k * WORLD.block)); mctx.stroke();
  }
  mctx.fillStyle = '#1e6f8e';
  mctx.fillRect(0, 0, W, toY(-330));
  for (const m of medallions) {
    if (m.found) continue;
    mctx.fillStyle = '#ffd60a';
    mctx.beginPath(); mctx.arc(toX(m.x), toY(m.z), 2, 0, Math.PI * 2); mctx.fill();
  }
  for (const cop of police) {
    mctx.fillStyle = cop.kind === 'car' ? '#ff2222' : '#ff8888';
    mctx.beginPath(); mctx.arc(toX(cop.x), toY(cop.z), 3, 0, Math.PI * 2); mctx.fill();
  }
  if (beacon.visible) {
    mctx.fillStyle = '#ffd60a';
    mctx.beginPath(); mctx.arc(toX(beacon.position.x), toY(beacon.position.z), 5, 0, Math.PI * 2); mctx.fill();
    mctx.strokeStyle = '#ffd60a';
    mctx.beginPath(); mctx.arc(toX(beacon.position.x), toY(beacon.position.z), 8 + Math.sin(S.time * 4) * 2, 0, Math.PI * 2); mctx.stroke();
  }
  // Player arrow: the minimap has east to the right and south up, so the
  // arrow's screen angle is pi minus the heading.
  mctx.save();
  mctx.translate(toX(player.x), toY(player.z));
  mctx.rotate(Math.PI - player.heading);
  mctx.fillStyle = '#ffffff';
  mctx.beginPath(); mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(-5, 6); mctx.closePath(); mctx.fill();
  mctx.restore();
}
function percentComplete() {
  const jobs = (S.stats.jobsDone / 7) * 40;
  const races = (S.stats.racesWon / 3) * 15;
  const coll = (S.collectibles.size / 24) * 15;
  const turf = (S.turf.size / 10) * 20;
  const fares = (Math.min(S.stats.fares, 10) / 10) * 10;
  return Math.min(100, Math.round(jobs + races + coll + turf + fares));
}
let hudTimer = 0;
function updateHUD(dt) {
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.15;
  $('healthFill').style.width = S.health + '%';
  $('healthText').textContent = 'HP ' + Math.round(S.health) + (S.armor > 0 ? '  •  Armor ' + Math.round(S.armor) : '');
  $('cashText').textContent = '$' + S.cash;
  $('starsText').textContent = '★'.repeat(S.wanted) + '☆'.repeat(5 - S.wanted);
  $('objectiveText').textContent = jobObjectiveText();
  $('districtText').textContent = districtAt(player.x, player.z).name + '  •  ' + respectRank().name;
  const tod = city.applyTimeOfDay(S.timeOfDay);
  $('clockText').textContent = String(tod.hour).padStart(2, '0') + ':00  •  ' + (tod.day > 0.6 ? 'Day' : tod.dusk > 0.25 ? 'Dusk' : 'Night');
  $('speedText').textContent = player.car ? Math.round(Math.abs(player.car.speed) * 2.2) + ' mph — ' + player.car.def.name : 'On foot — ' + S.weapon;
  if (S.raceActive) {
    const rows = raceStandings();
    $('standingsBox').innerHTML = '<b>' + S.race.name + ' — standings</b><br>' + rows.map((r, i) => (i + 1) + '. ' + r.name).join('<br>');
    $('standingsBox').classList.add('show');
  } else {
    $('standingsBox').classList.remove('show');
  }
  drawMinimap();
}

// ---------------------------------------------------------------- screens & save
function togglePause() {
  S.paused = !S.paused;
  if (S.paused) {
    $('hud').classList.remove('show');
    $('pauseStats').innerHTML =
      '<p><b>' + percentComplete() + '% COMPLETE</b> — ' + respectRank().name + ' (' + S.respect + ' respect)</p>' +
      '<p>Cash $' + S.cash + '  •  Jobs ' + S.stats.jobsDone + ' / 7  •  Races won ' + S.stats.racesWon + ' / 3  •  Fares ' + S.stats.fares + '</p>' +
      '<p>Medallions ' + S.collectibles.size + ' / 24  •  Turf ' + S.turf.size + ' / 10 districts  •  Cars stolen ' + S.stats.carsStolen + '</p>' +
      '<p>Crew: ' + (S.crew.length ? S.crew.map((c) => c.name + ' (' + c.role + ')').join(', ') : 'none hired yet') + '</p>' +
      '<p>Choices made: ' + (Object.keys(S.choices).length ? Object.entries(S.choices).map(([k, v]) => k + ' → ' + v).join('; ') : 'none yet') + '</p>' +
      '<p>Cash earned $' + S.stats.cashEarned + '  •  Shots fired ' + S.stats.shotsFired + '</p>';
    let crewHtml = '<h3>Hire crew (from the pause screen)</h3>';
    for (const c of CREW) {
      const hired = S.crew.some((h) => h.id === c.id);
      crewHtml += '<p>' + c.name + ' — ' + c.role + ': ' + c.bonus + ' — ' + (hired ? 'HIRED' : '$' + c.hire + ' <button data-crew="' + c.id + '">Hire</button>') + '</p>';
    }
    $('crewBox').innerHTML = crewHtml;
    $('crewBox').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => hireCrew(b.dataset.crew)));
    showScreen('pauseScreen');
    sounds.engineStop();
  } else {
    $('hud').classList.add('show');
    showScreen(null);
  }
}
function hireCrew(id) {
  const c = CREW.find((x) => x.id === id);
  if (!c || S.crew.some((h) => h.id === id)) return;
  if (S.crew.length >= 3) { toast('Your crew is full — three is the limit.'); return; }
  if (S.cash < c.hire) { toast('Hiring ' + c.name + ' costs $' + c.hire + '.'); return; }
  S.cash -= c.hire;
  S.crew.push(c);
  sounds.cash();
  toast(c.name + ' joined your crew as ' + c.role + '.');
  togglePause(); togglePause();
  saveGame();
}
function saveGame() {
  try {
    const data = {
      cash: S.cash, respect: S.respect, health: S.health, armor: S.armor,
      weapon: S.weapon, ownedWeapons: S.ownedWeapons,
      jobIndex: S.jobIndex, collectibles: [...S.collectibles], turf: [...S.turf],
      crew: S.crew.map((c) => c.id), choices: S.choices, stats: S.stats,
      x: player.x, z: player.z,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable: the game still plays */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    S.cash = d.cash; S.respect = d.respect; S.health = d.health; S.armor = d.armor || 0;
    S.weapon = d.weapon; S.ownedWeapons = d.ownedWeapons || ['fists'];
    S.jobIndex = d.jobIndex || 0;
    S.collectibles = new Set(d.collectibles || []);
    S.turf = new Set(d.turf || []);
    S.crew = (d.crew || []).map((id) => CREW.find((c) => c.id === id)).filter(Boolean);
    S.choices = d.choices || {};
    Object.assign(S.stats, d.stats || {});
    player.x = d.x || -240; player.z = d.z || -260;
    for (const m of medallions) if (S.collectibles.has(m.x + ':' + m.z)) { m.found = true; m.mesh.visible = false; }
    return true;
  } catch (e) { return false; }
}
function startGame(continueSave) {
  sounds.unlock();
  if (continueSave) loadGame();
  S.running = true;
  S.paused = false;
  S.over = false;
  showScreen(null);
  $('hud').classList.add('show');
  $('startScreen').classList.remove('show');
  if (!S.jobActive && S.jobIndex < JOBS.length) {
    // The first job starts when the player reaches the Marina Bay marker;
    // until then the HUD points at it.
    beacon.position.set(-222, 0, -296);
    beacon.visible = true;
    showDialogue("Iris Kade: \"Rook. Marina Bay, by the boats. We need to talk.\"");
  }
  toast('Vice Harbor — WASD to move, E to enter a car, mouse drag to look.');
}

// Start / continue buttons.
$('startBtn').addEventListener('click', () => startGame(false));
$('continueBtn').addEventListener('click', () => startGame(true));
$('resumeBtn').addEventListener('click', () => togglePause());
$('saveBtn').addEventListener('click', () => { saveGame(); toast('Game saved.'); });
$('quitBtn').addEventListener('click', () => { saveGame(); location.reload(); });
$('respawnBtn').addEventListener('click', respawn);
$('bustedRespawnBtn').addEventListener('click', respawn);
$('jobOkBtn').addEventListener('click', () => showScreen(null));
// Job starter: walking into the Marina Bay marker begins the next job.
function checkJobStarter() {
  if (!S.running || S.jobActive || S.jobIndex >= JOBS.length) return;
  if (dist2d(player.x, player.z, -222, -296) < 10) startJob(S.jobIndex);
}
setInterval(() => { if (S.running && !S.paused && !S.over) saveGame(); }, 30000);

// ---------------------------------------------------------------- camera
function updateCamera(dt) {
  const target = player.car ? { x: player.car.x, z: player.car.z, y: 2.2 } : { x: player.x, z: player.z, y: 1.8 };
  const dist = player.car ? 13 : 9;
  const yaw = player.car ? player.car.heading + Math.PI : player.camYaw;
  const pitch = player.camPitch;
  const cx = target.x + Math.sin(yaw) * Math.cos(pitch) * dist;
  const cz = target.z + Math.cos(yaw) * Math.cos(pitch) * dist;
  const cy = target.y + Math.sin(pitch) * dist + 2.5;
  camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 6));
  camera.lookAt(target.x, target.y + 0.5, target.z);
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.1, clock.getDelta());
  if (S.running && !S.paused && !S.over) {
    S.time += dt;
    S.timeOfDay = (S.timeOfDay + dt / 240) % 1; // a full day every 4 minutes
    if (S.raceCooldown > 0) S.raceCooldown -= dt;
    updatePlayer(dt);
    updateTraffic(dt);
    updatePeds(dt);
    updatePolice(dt);
    updateJob(dt);
    updateRace(dt);
    updateTaxi(dt);
    updateCollectibles();
    updateTurf(dt);
    checkJobStarter();
    // Race start markers: driving into one starts that race.
    if (!S.raceActive && S.raceCooldown <= 0) {
      for (const race of RACES) {
        const s = race.checkpoints[0];
        if (dist2d(player.x, player.z, s[0], s[1]) < 10 && player.car) {
          startRace(race.id);
          break;
        }
      }
    }
    updateHUD(dt);
    updateCamera(dt);
    for (const m of shopMarkers) m.mesh.userData.ring.rotation.z += dt;
    beacon.userData.ring.rotation.z += dt * 2;
  } else if (!S.running) {
    // Title screen: slow orbit over the harbor.
    S.time += dt;
    const a = S.time * 0.05;
    camera.position.set(Math.sin(a) * 260, 120, -120 + Math.cos(a) * 260);
    camera.lookAt(0, 0, -60);
    city.applyTimeOfDay(S.timeOfDay);
  }
  renderer.render(scene, camera);
}
city.applyTimeOfDay(S.timeOfDay);
animate();

// ---------------------------------------------------------------- shot staging & debug API
// URL ?scene=title|job|race|pause stages one of the four screenshots so
// the renders are reproducible; ?seed= fixes the world.
function stageScene(name) {
  if (name === 'title') { showScreen('startScreen'); return; }
  startGame(false);
  if (name === 'job') {
    S.cash = 5200;
    startJob(0);
    // On the boardwalk road, facing east toward the beacon: road, city and
    // the beam all in frame, bright midday light.
    player.x = -260; player.z = -296;
    player.heading = Math.PI / 2;
    player.camYaw = -Math.PI / 2;
    player.mesh.position.set(player.x, 0, player.z);
    player.mesh.rotation.y = player.heading;
    S.timeOfDay = 0.3;
  }
  if (name === 'race') {
    S.cash = 5200;
    startRace('boardwalk');
    // Stage the player second: one rival just ahead on the road, two behind
    // at the start line, so the standings read 1. Celia, 2. you.
    if (S.raceRivals[0]) {
      S.raceRivals[0].x = 40; S.raceRivals[0].z = -296;
      S.raceRivals[0].heading = Math.PI / 2; S.raceRivals[0].speed = 28;
      S.raceRivals[0].mesh.position.set(40, 0, -296);
    }
    if (player.car) { player.car.x = 20; player.car.z = -296; player.car.heading = Math.PI / 2; player.car.speed = 26; }
    player.x = 20; player.z = -296;
    S.timeOfDay = 0.3; // bright midday for a readable race shot
  }
  if (name === 'pause') {
    S.cash = 12400;
    S.stats.jobsDone = 4; S.stats.racesWon = 2; S.stats.fares = 7;
    S.stats.cashEarned = 21350; S.stats.carsStolen = 11; S.stats.shotsFired = 46;
    S.respect = 520;
    S.collectibles.add('-350:-350'); S.collectibles.add('-200:-340'); S.collectibles.add('120:-350');
    S.collectibles.add('-340:-160'); S.collectibles.add('40:-180'); S.collectibles.add('-340:0');
    S.turf.add('marina'); S.turf.add('coral'); S.turf.add('neon');
    S.crew.push(CREW[0], CREW[1]);
    S.choices['dockhand'] = 'Spare him';
    S.choices['vault'] = 'Loud';
    togglePause();
  }
}
if (params.get('scene')) stageScene(params.get('scene'));

// Headless checks and the debug console use this. It never writes files.
window.VH = {
  state: S,
  player,
  startJob,
  startRace,
  stageScene,
  districtAt,
  percentComplete,
  counts: { jobs: JOBS.length, races: RACES.length, collectibles: COLLECTIBLE_SPOTS.length, districts: DISTRICTS.length, vehicles: VEHICLES.length },
  noConsoleErrors: true,
};
addEventListener('error', (e) => { window.VH.noConsoleErrors = false; });
