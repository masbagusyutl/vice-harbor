// Vice Harbor v2.1 — progression: stats, respect, turf, crew,
// collectibles, street races, taxi fares and the shop.
// v2.1: rewritten under the new sealed recording; same systems as v2.
// This module owns everything that makes the city a career instead
// of a sandbox: the numbers on the pause screen, the % complete,
// and the systems that pay the player for playing.

import * as THREE from 'three';
import { RACES, REELS, CREW, SHOP, TURF_INCOME, respectRank, districtAt } from './config.js';
import { createBoat } from './boats.js';
import { createCar } from './vehicles.js';

export function freshStats() {
  return {
    jobsDone: 0, racesWon: 0, racesRun: 0, faresDone: 0, faresEarned: 0,
    reelsFound: 0, copsEscaped: 0, distanceDriven: 0, timePlayed: 0,
    respect: 0, choices: [], turfOwned: [], crew: [],
    hasPistol: false, hasArmor: false, maxHealth: 100,
    boatUnlocked: false, finaleVariant: null,
  };
}

// % complete: 7 jobs (50%), 3 races won (15%), 24 reels (20%),
// 10 districts owned (15%). Jobs stay the biggest share.
export function completionPercent(G) {
  const s = G.stats;
  const jobs = (s.jobsDone / 7) * 50;
  const races = (Math.min(s.racesWon, 3) / 3) * 15;
  const reels = (s.reelsFound / 24) * 20;
  const turf = (s.turfOwned.length / 10) * 15;
  return Math.min(100, Math.round(jobs + races + reels + turf));
}

export function addRespect(G, n) {
  const before = respectRank(G.stats.respect).name;
  G.stats.respect += n;
  const after = respectRank(G.stats.respect).name;
  if (after !== before && G.hud) G.hud.toast(`Respect up — you are now ${after}.`);
}

export function crewBonus(G, id) {
  return G.stats.crew.includes(id);
}

export function payoutMultiplier(G) {
  return crewBonus(G, 'milo') ? 1.25 : 1;
}

export function applyPayout(G, base) {
  return Math.round(base * payoutMultiplier(G));
}

// --- turf -------------------------------------------------------------
export function captureTurf(G, x, z) {
  const d = districtAt(x, z);
  if (!G.stats.turfOwned.includes(d.id)) {
    G.stats.turfOwned.push(d.id);
    if (G.hud) G.hud.toast(`Turf captured: ${d.name} is yours now — it pays $${TURF_INCOME} a minute.`);
  }
}

export function ownedHere(G) {
  const p = G.playerPos();
  return G.stats.turfOwned.includes(districtAt(p.x, p.z).id);
}

// Periodic turf income, called from the main loop.
export function updateTurfIncome(G, dt) {
  G.turfTimer = (G.turfTimer || 0) + dt;
  if (G.turfTimer >= 60) {
    G.turfTimer = 0;
    const n = G.stats.turfOwned.length;
    if (n > 0) {
      const pay = n * TURF_INCOME;
      G.cash += pay;
      if (G.hud) G.hud.toast(`Turf income: +$${pay} from ${n} district${n > 1 ? 's' : ''}.`);
      if (G.audio) G.audio.ding();
    }
  }
}

// --- collectibles -------------------------------------------------------
export function buildReels(G) {
  G.reels = [];
  for (const [x, z] of REELS) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.18, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff }),
    );
    ring.position.y = 1.6;
    group.add(ring);
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5),
      new THREE.MeshBasicMaterial({ color: 0xffe27a }),
    );
    core.position.y = 1.6;
    group.add(core);
    group.position.set(x, 0, z);
    group.userData.ring = ring;
    group.userData.core = core;
    G.scene.add(group);
    G.reels.push({ mesh: group, x, z, found: false });
  }
}

export function updateReels(G, dt) {
  const p = G.playerPos();
  for (const r of G.reels || []) {
    if (r.found) continue;
    r.mesh.rotation.y += dt * 1.5;
    r.mesh.userData.core.position.y = 1.6 + Math.sin(G.time * 2 + r.x) * 0.3;
    if (Math.hypot(p.x - r.x, p.z - r.z) < 3.5) {
      r.found = true;
      G.scene.remove(r.mesh);
      G.stats.reelsFound += 1;
      addRespect(G, 5);
      G.cash += 25;
      if (G.hud) G.hud.toast(`Harbor Reel found! ${G.stats.reelsFound}/24 — +$25, +5 respect.`);
      if (G.audio) G.audio.ding();
      G.saveGame();
    }
  }
}

// --- races ---------------------------------------------------------------
export function startRace(G, raceId) {
  const def = RACES.find((r) => r.id === raceId);
  if (!def || G.race) return false;
  if (def.kind === 'boat' && !G.stats.boatUnlocked) {
    if (G.hud) G.hud.toast('The Harbor Regatta needs a boat — steal the Wave Runner in job 5 first.');
    return false;
  }
  // Put the player in the right vehicle at the start line.
  if (def.kind === 'boat') {
    let boat = G.boats.find((b) => b.typeKey === 'speedboat' && !b.raceRival);
    if (!boat) {
      boat = createBoat(G.scene, 'speedboat', def.start.x, def.start.z, def.start.heading, {});
      G.boats.push(boat);
    }
    boat.mesh.position.set(def.start.x, 0.05, def.start.z);
    boat.heading = def.start.heading;
    boat.mesh.rotation.y = def.start.heading;
    boat.speed = 0;
    if (G.player.car) { G.player.car = null; G.player.mesh.visible = true; }
    G.player.boat = boat;
    G.player.mesh.visible = false;
  } else {
    const car = createCar(G.scene, 'sports', def.start.x, def.start.z, def.start.heading, { driver: true, parked: false });
    G.cars.push(car);
    if (G.player.car) { G.player.car = null; }
    G.player.car = car;
    G.player.boat = null;
    G.player.mesh.visible = false;
    G.camYaw = def.start.heading;
  }
  G.race = {
    def,
    checkpoint: 0,
    place: 1,
    // Rivals are simulated: each has a progress 0..1 along the route.
    rivals: def.rivals.map((name, i) => ({ name, progress: 0, speed: 0.055 + i * 0.004 })),
    elapsed: 0,
    beacon: null,
  };
  makeRaceBeacon(G);
  G.stats.racesRun += 1;
  if (G.hud) {
    G.hud.toast(`Race started: ${def.name} — ${def.checkpoints.length} gates. Beat ${def.rivals.join(', ')}!`);
    G.hud.setObjective(`${def.name} — gate 1/${def.checkpoints.length}`);
  }
  return true;
}

function makeRaceBeacon(G) {
  const race = G.race;
  if (!race) return;
  if (race.beacon) G.scene.remove(race.beacon);
  const cp = race.def.checkpoints[race.checkpoint];
  const group = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7bff5e, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 15;
  group.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.3, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0x7bff5e }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  group.add(ring);
  group.position.set(cp.x, 0, cp.z);
  G.scene.add(group);
  race.beacon = group;
}

export function updateRace(G, dt) {
  const race = G.race;
  if (!race) return;
  race.elapsed += dt;
  // Rivals advance; the player's progress is gates cleared.
  for (const r of race.rivals) {
    r.progress = Math.min(1, r.progress + r.speed * dt * (0.9 + Math.sin(race.elapsed + r.name.length) * 0.1));
  }
  const playerProgress = race.checkpoint / race.def.checkpoints.length;
  let ahead = 0;
  for (const r of race.rivals) if (r.progress > playerProgress) ahead++;
  race.place = ahead + 1;
  // Gate reached?
  const cp = race.def.checkpoints[race.checkpoint];
  const p = G.playerPos();
  if (Math.hypot(p.x - cp.x, p.z - cp.z) < 9) {
    race.checkpoint += 1;
    if (race.checkpoint >= race.def.checkpoints.length) {
      finishRace(G);
      return;
    }
    makeRaceBeacon(G);
    if (G.hud) G.hud.setObjective(`${race.def.name} — gate ${race.checkpoint + 1}/${race.def.checkpoints.length} — ${ordinal(race.place)} place`);
    if (G.audio) G.audio.ding();
  }
  // Race HUD line.
  if (G.hud && G.hud.setRace) {
    G.hud.setRace(`${race.def.name} — ${ordinal(race.place)} of 4 — gate ${race.checkpoint + 1}/${race.def.checkpoints.length} — ${race.elapsed.toFixed(0)}s`);
  }
}

function ordinal(n) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

export function finishRace(G) {
  const race = G.race;
  if (!race) return;
  if (race.beacon) G.scene.remove(race.beacon);
  const won = race.place === 1;
  const prize = won ? applyPayout(G, race.def.prize) : Math.round(race.def.prize * 0.2);
  G.cash += prize;
  if (won) {
    G.stats.racesWon += 1;
    addRespect(G, 40);
    captureTurf(G, G.playerPos().x, G.playerPos().z);
  }
  if (G.hud) {
    G.hud.toast(won
      ? `You won the ${race.def.name}! +$${prize} — 1st of 4.`
      : `Finished ${ordinal(race.place)} in the ${race.def.name}. +$${prize} consolation.`);
    G.hud.setObjective(won ? 'Race won! Press T for the next job.' : 'Press T for the next job.');
    if (G.hud.setRace) G.hud.setRace('');
  }
  if (G.audio) G.audio.ding();
  G.race = null;
  G.saveGame();
}

export function abandonRace(G) {
  if (!G.race) return;
  if (G.race.beacon) G.scene.remove(G.race.beacon);
  G.race = null;
  if (G.hud && G.hud.setRace) G.hud.setRace('');
}

// --- taxi fares ------------------------------------------------------------
export function startFare(G) {
  if (G.fare || G.race) return false;
  const lines = G.city.roadXs;
  const rng = G.rng;
  const px = G.playerPos().x;
  const pz = G.playerPos().z;
  // Pickup a short drive away on a road, destination across town.
  const pickX = lines[Math.floor(rng() * lines.length)] + 3;
  const pickZ = -140 + rng() * 280;
  const dropX = lines[Math.floor(rng() * lines.length)] + 3;
  const dropZ = -140 + rng() * 280;
  if (Math.hypot(pickX - px, pickZ - pz) < 20) return startFare(G);
  G.fare = {
    stage: 'pickup',
    pickX, pickZ, dropX, dropZ,
    pay: 40 + Math.floor(rng() * 5) * 10,
    beacon: null,
  };
  makeFareBeacon(G);
  if (G.hud) {
    G.hud.toast(`Fare: pick up the passenger at the yellow marker ($${G.fare.pay}).`);
    G.hud.setObjective('Taxi fare — pick up the passenger');
  }
  return true;
}

function makeFareBeacon(G) {
  const fare = G.fare;
  if (!fare) return;
  if (fare.beacon) G.scene.remove(fare.beacon);
  const spot = fare.stage === 'pickup' ? { x: fare.pickX, z: fare.pickZ } : { x: fare.dropX, z: fare.dropZ };
  const group = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc300, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 13;
  group.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.4, 0.25, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc300 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  group.add(ring);
  group.position.set(spot.x, 0, spot.z);
  G.scene.add(group);
  fare.beacon = group;
}

export function updateFare(G, dt) {
  const fare = G.fare;
  if (!fare) return;
  const p = G.playerPos();
  const target = fare.stage === 'pickup' ? { x: fare.pickX, z: fare.pickZ } : { x: fare.dropX, z: fare.dropZ };
  if (Math.hypot(p.x - target.x, p.z - target.z) < 8) {
    if (fare.stage === 'pickup') {
      fare.stage = 'drop';
      makeFareBeacon(G);
      if (G.hud) {
        G.hud.toast('Passenger aboard — take them to the yellow marker.');
        G.hud.setObjective('Taxi fare — drop off the passenger');
      }
    } else {
      if (fare.beacon) G.scene.remove(fare.beacon);
      const pay = applyPayout(G, fare.pay);
      G.cash += pay;
      G.stats.faresDone += 1;
      G.stats.faresEarned += pay;
      addRespect(G, 10);
      if (G.hud) {
        G.hud.toast(`Fare complete! +$${pay}. (${G.stats.faresDone} fares done)`);
        G.hud.setObjective('Press T for the next job.');
      }
      if (G.audio) G.audio.ding();
      G.fare = null;
      G.saveGame();
    }
  }
}

// --- shop -------------------------------------------------------------------
export function shopBuy(G, item) {
  const def = SHOP[item];
  if (!def) return false;
  if (item === 'pistol' && G.stats.hasPistol) return false;
  if (item === 'armor' && G.stats.hasArmor) return false;
  if (G.cash < def.cost) {
    if (G.hud) G.hud.toast(`Not enough cash for ${def.name} — $${def.cost} needed.`);
    return false;
  }
  G.cash -= def.cost;
  if (item === 'pistol') G.stats.hasPistol = true;
  if (item === 'armor') {
    G.stats.hasArmor = true;
    G.stats.maxHealth = 150;
    G.player.health = 150;
  }
  if (G.hud) G.hud.toast(`Bought ${def.name} for $${def.cost}. ${def.desc}.`);
  if (G.audio) G.audio.ding();
  G.saveGame();
  return true;
}

export function respray(G) {
  if (G.cash < SHOP.respray.cost) {
    if (G.hud) G.hud.toast(`Fresh Coat costs $${SHOP.respray.cost} — you are short.`);
    return false;
  }
  if (G.wanted === 0) {
    if (G.hud) G.hud.toast('No heat to clear — save your money.');
    return false;
  }
  G.cash -= SHOP.respray.cost;
  G.wanted = 0;
  if (G.audio) G.audio.siren(false);
  if (G.hud) G.hud.toast('Fresh Coat — new paint, clean slate. Heat cleared.');
  G.saveGame();
  return true;
}

// --- crew --------------------------------------------------------------------
export function recruitCrew(G, id) {
  const def = CREW.find((c) => c.id === id);
  if (!def || G.stats.crew.includes(id)) return false;
  if (G.cash < def.cost) {
    if (G.hud) G.hud.toast(`${def.name} costs $${def.cost} — you are short.`);
    return false;
  }
  G.cash -= def.cost;
  G.stats.crew.push(id);
  if (G.hud) G.hud.toast(`${def.name} joined your crew! ${def.role} — ${def.bonus}.`);
  if (G.audio) G.audio.ding();
  G.saveGame();
  return true;
}

// A crew member rides along at job starts: a visible companion ped
// standing beside the player when a job begins.
export function spawnCrewCompanion(G) {
  if (!G.stats.crew.length) return;
  const id = G.stats.crew[0];
  const def = CREW.find((c) => c.id === id);
  if (!def || G.crewCompanion) return;
  // Reuse the pedestrian mesh builder for a companion figure.
  import('./pedestrians.js').then(({ makePedMesh }) => {
    const mesh = makePedMesh(G.rng);
    const p = G.player.mesh.position;
    mesh.position.set(p.x + 2, 0, p.z + 2);
    G.scene.add(mesh);
    G.crewCompanion = { mesh, name: def.name, timer: 12 };
    if (G.hud) G.hud.toast(`${def.name} is riding with you — ${def.bonus}.`);
  });
}

export function updateCrewCompanion(G, dt) {
  const c = G.crewCompanion;
  if (!c) return;
  c.timer -= dt;
  const target = G.playerPos();
  const p = c.mesh.position;
  const d = Math.hypot(target.x - p.x, target.z - p.z);
  if (d > 4) {
    const dx = (target.x - p.x) / d;
    const dz = (target.z - p.z) / d;
    p.x += dx * 6 * dt;
    p.z += dz * 6 * dt;
    c.mesh.rotation.y = Math.atan2(dx, dz);
  }
  if (c.timer <= 0) {
    G.scene.remove(c.mesh);
    G.crewCompanion = null;
  }
}
