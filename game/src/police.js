// Vice Harbor v2.1 — the wanted system and the police.
// v2.1: rewritten under the new sealed recording; roadblocks, heli,
// and turf heat effects are unchanged from v2.
// Crimes raise stars. Police spawn in proportion to the stars, chase
// the player by car and on foot, ram, and shoot at 3 stars and up.
// v2 adds: roadblocks at 3 stars (parked interceptors across the road
// ahead), a police helicopter with a searchlight cone at 4 stars,
// and turf effects — heat cools faster in districts you own.
// Break line of sight, lie low, and the heat cools off.

import * as THREE from 'three';
import { clamp, pick } from './config.js';
import { createCar, forwardOf } from './vehicles.js';
import { scarePeds } from './pedestrians.js';
import { ownedHere } from './progression.js';

export function addWanted(G, n, reason) {
  const before = G.wanted;
  // Owned turf: the crew looks the other way — half the gain.
  if (n > 0 && G.stats && ownedHere(G) && G.rng() < 0.5) {
    if (G.hud) G.hud.toast('Your turf — the heat barely sticks.');
    n = 0;
  }
  G.wanted = clamp(G.wanted + n, 0, 5);
  G.lastCrimeAt = G.time;
  G.lastSeenAt = G.time;
  G.wantedDecay = 0;
  if (G.wanted > before && G.hud) G.hud.toast(`Wanted level ${G.wanted} — ${reason}`);
  if (G.audio && G.wanted > 0) G.audio.siren(true);
}

function spawnSpotNear(G, minDist, maxDist) {
  const lines = G.city.roadXs;
  const pp = G.playerPos();
  for (let tries = 0; tries < 12; tries++) {
    const x = pick(G.rng, lines) + (G.rng() < 0.5 ? 2.6 : -2.6);
    const z = -G.city.bounds + G.rng() * G.city.bounds * 2;
    const d = Math.hypot(x - pp.x, z - pp.z);
    if (d >= minDist && d <= maxDist) return { x, z };
  }
  return { x: pp.x + 60, z: pp.z };
}

function makeFootCop(G) {
  const group = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.36), navy);
  body.position.y = 1.05;
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skin);
  head.position.y = 1.7;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), new THREE.MeshLambertMaterial({ color: 0x0a1428 }));
  cap.position.y = 1.92;
  group.add(cap);
  const spot = spawnSpotNear(G, 25, 55);
  group.position.set(spot.x, 0, spot.z);
  G.scene.add(group);
  const cop = { mesh: group, heading: 0, speed: 0, shootTimer: 1 + G.rng(), alive: true, health: 2 };
  group.traverse((o) => { o.userData.copRef = cop; });
  return cop;
}

// A roadblock: two interceptors parked across the road ahead of the
// player, with a flashing light between them.
function makeRoadblock(G) {
  const pp = G.playerPos();
  const heading = G.player.car ? G.player.car.heading : G.player.heading;
  const f = forwardOf(heading);
  const bx = pp.x + f.x * 55;
  const bz = pp.z + f.z * 55;
  const cars = [];
  for (const side of [-4.5, 4.5]) {
    const car = createCar(G.scene, 'police', bx - f.z * side, bz + f.x * side, heading + Math.PI / 2, { police: true, driver: true });
    car.speed = 0;
    car.roadblock = true;
    G.cars.push(car);
    cars.push(car);
  }
  const beacon = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2.4, 1),
    new THREE.MeshBasicMaterial({ color: 0xff4040 }),
  );
  beacon.position.set(bx, 1.2, bz);
  G.scene.add(beacon);
  return { cars, beacon, timer: 25 };
}

function updateRoadblocks(G, dt) {
  if (G.wanted >= 3 && !G.roadblock && G.state === 'playing') {
    G.roadblock = makeRoadblock(G);
    if (G.hud) G.hud.toast('Roadblock ahead! 3 stars — the PD sealed the road.');
  }
  if (G.roadblock) {
    const rb = G.roadblock;
    rb.timer -= dt;
    rb.beacon.material.color.setHex(Math.floor(G.time * 6) % 2 === 0 ? 0xff4040 : 0x4080ff);
    if (rb.timer <= 0 || G.wanted < 3) {
      for (const car of rb.cars) {
        G.scene.remove(car.mesh);
        const i = G.cars.indexOf(car);
        if (i >= 0) G.cars.splice(i, 1);
      }
      G.scene.remove(rb.beacon);
      G.roadblock = null;
    }
  }
}

// Police helicopter: a simple heli model circling overhead with a
// visible searchlight cone and a spotlight on the ground.
function makeHeli(G) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.6, 2), bodyMat);
  group.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 0.6), bodyMat);
  tail.position.set(-3.6, 0.3, 0);
  group.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(7, 0.12, 0.7), new THREE.MeshLambertMaterial({ color: 0x30343c }));
  rotor.position.y = 1.1;
  group.add(rotor);
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.15, 0.3), new THREE.MeshLambertMaterial({ color: 0x30343c }));
  skidL.position.set(0, -1, 0.9);
  group.add(skidL);
  const skidR = skidL.clone();
  skidR.position.z = -0.9;
  group.add(skidR);
  // Searchlight cone: a translucent cone from the heli to the ground.
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(7, 34, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  cone.position.y = -17;
  cone.rotation.x = Math.PI;
  group.add(cone);
  const spot = new THREE.SpotLight(0xfff2b0, 220, 70, 0.32, 0.5, 1.2);
  spot.position.set(0, -1, 0);
  group.add(spot);
  const target = new THREE.Object3D();
  target.position.set(0, -34, 0);
  group.add(target);
  spot.target = target;
  group.userData.rotor = rotor;
  group.userData.cone = cone;
  G.scene.add(group);
  return { mesh: group, angle: 0 };
}

function updateHeli(G, dt) {
  if (G.wanted >= 4 && !G.heli && G.state === 'playing') {
    G.heli = makeHeli(G);
    if (G.hud) G.hud.toast('Police helicopter overhead — the searchlight is on you!');
    if (G.audio) G.audio.siren(true);
  }
  if (G.heli) {
    if (G.wanted < 4) {
      G.scene.remove(G.heli.mesh);
      G.heli = null;
      return;
    }
    const heli = G.heli;
    heli.angle += dt * 0.5;
    const pp = G.playerPos();
    const r = 26;
    heli.mesh.position.set(pp.x + Math.cos(heli.angle) * r, 34, pp.z + Math.sin(heli.angle) * r);
    heli.mesh.rotation.y = -heli.angle;
    heli.mesh.userData.rotor.rotation.y += dt * 18;
    // The searchlight cone tracks the player.
    heli.mesh.lookAt(pp.x, 0, pp.z);
    heli.mesh.rotateY(Math.PI / 2);
  }
}

function ensurePolice(G) {
  const wantCars = G.wanted === 0 ? 0 : Math.min(G.wanted + 1, 4);
  const wantCops = G.wanted >= 3 ? Math.min(G.wanted - 1, 3) : 0;
  while (G.policeCars.length < wantCars) {
    const spot = spawnSpotNear(G, 45, 80);
    const car = createCar(G.scene, 'police', spot.x, spot.z, 0, { police: true, driver: true });
    G.cars.push(car);
    G.policeCars.push(car);
  }
  while (G.policeCars.length > wantCars) {
    const car = G.policeCars.pop();
    G.scene.remove(car.mesh);
    const idx = G.cars.indexOf(car);
    if (idx >= 0) G.cars.splice(idx, 1);
  }
  while (G.footCops.length < wantCops) G.footCops.push(makeFootCop(G));
  while (G.footCops.length > wantCops) {
    const cop = G.footCops.pop();
    G.scene.remove(cop.mesh);
  }
}

export function updateWanted(G, dt) {
  if (G.wanted <= 0) {
    if (G.audio) G.audio.siren(false);
    updateRoadblocks(G, dt);
    updateHeli(G, dt);
    return;
  }
  // Any police close by keeps the player "seen".
  const pp = G.playerPos();
  let seen = false;
  for (const car of G.policeCars) {
    if (Math.hypot(car.mesh.position.x - pp.x, car.mesh.position.z - pp.z) < 55) { seen = true; break; }
  }
  if (!seen) {
    for (const cop of G.footCops) {
      if (Math.hypot(cop.mesh.position.x - pp.x, cop.mesh.position.z - pp.z) < 35) { seen = true; break; }
    }
  }
  if (seen) {
    G.lastSeenAt = G.time;
    G.wantedDecay = 0;
  } else if (G.time - G.lastSeenAt > 5) {
    G.wantedDecay += dt;
    // Owned turf and Lena the lookout cool the heat faster.
    let coolEvery = 5;
    if (G.stats) {
      if (ownedHere(G)) coolEvery = 3;
      if (G.stats.crew.includes('lena')) coolEvery *= 0.7;
    }
    if (G.wantedDecay >= coolEvery) {
      G.wantedDecay = 0;
      G.wanted = Math.max(0, G.wanted - 1);
      if (G.wanted === 0 && G.stats) G.stats.copsEscaped += 1;
      if (G.hud) G.hud.toast(G.wanted === 0 ? 'You lost the heat.' : `Wanted level down to ${G.wanted}.`);
      if (G.wanted === 0 && G.audio) G.audio.siren(false);
    }
  }
  ensurePolice(G);
  updateRoadblocks(G, dt);
  updateHeli(G, dt);
}

function pursueSteering(car, tx, tz, dt) {
  const p = car.mesh.position;
  const desired = Math.atan2(tx - p.x, tz - p.z);
  let diff = desired - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turnRate = 2.6;
  car.heading += clamp(diff, -turnRate * dt, turnRate * dt);
  car.mesh.rotation.y = car.heading;
}

export function updatePolice(G, dt) {
  const pp = G.playerPos();
  const ph = G.player.car ? G.player.car.heading : G.player.heading;
  for (let ci = 0; ci < G.policeCars.length; ci++) {
    const car = G.policeCars[ci];
    if (car.roadblock) continue;
    const p = car.mesh.position;
    const d = Math.hypot(pp.x - p.x, pp.z - p.z);
    // Each unit aims at its own slot beside the player, so the pursuit
    // fans out instead of piling onto one point.
    const side = (ci % 2 === 0 ? 1 : -1) * 4;
    const tx = pp.x + (-Math.cos(ph)) * side;
    const tz = pp.z + Math.sin(ph) * side;
    pursueSteering(car, tx, tz, dt);
    const targetSpeed = d > 12 ? car.type.topSpeed : Math.max(6, car.type.topSpeed * 0.6);
    car.speed += (targetSpeed - car.speed) * Math.min(1, 1.6 * dt);
    const f = forwardOf(car.heading);
    p.x += f.x * car.speed * dt;
    p.z += f.z * car.speed * dt;
    // Ramming the player's car: a thud and a speed cut, but only once
    // per unit per beat — never a per-frame grind to a stop.
    if (d < car.radius + (G.player.car ? G.player.car.radius : 1.2)) {
      if (G.player.car) {
        if (G.time - (car.lastRamAt || -10) > 0.8) {
          car.lastRamAt = G.time;
          G.player.car.speed *= 0.85;
          G.shake = Math.min(0.6, G.shake + 0.3);
          if (G.audio) G.audio.thud();
        }
      } else if (G.time - (car.lastRamAt || -10) > 0.8) {
        car.lastRamAt = G.time;
        damagePlayer(G, 10, 'rammed');
      }
    }
    // Flash the light bar.
    if (car.mesh.userData.lightBars) {
      const on = Math.floor(G.time * 6) % 2 === 0;
      car.mesh.userData.lightBars[0].visible = on;
      car.mesh.userData.lightBars[1].visible = !on;
    }
    const spin = (car.speed * dt) / 0.38;
    for (const w of car.mesh.userData.wheels) w.rotation.z -= spin;
  }

  for (const cop of G.footCops) {
    if (!cop.alive) continue;
    const p = cop.mesh.position;
    const d = Math.hypot(pp.x - p.x, pp.z - p.z);
    const desired = Math.atan2(pp.x - p.x, pp.z - p.z);
    cop.heading = desired;
    cop.mesh.rotation.y = desired;
    if (d > 2) {
      const speed = d > 20 ? 5.2 : 4.2;
      p.x += Math.sin(desired) * speed * dt;
      p.z += Math.cos(desired) * speed * dt;
    }
    // Busted: a cop reaches the player on foot.
    if (d < 1.7 && !G.player.car && G.wanted >= 2 && G.state === 'playing') {
      G.busted();
      return;
    }
    // Shooting at 3+ stars.
    if (G.wanted >= 3 && d < 30 && d > 3) {
      cop.shootTimer -= dt;
      if (cop.shootTimer <= 0) {
        cop.shootTimer = 0.85 + G.rng() * 0.5;
        if (G.audio) G.audio.shot(true);
        if (G.rng() < 0.32) damagePlayer(G, 6, 'police fire');
        if (G.combat) G.combat.policeTracer(G, p, pp);
      }
    }
  }
}

export function damagePlayer(G, amount, source) {
  if (G.state !== 'playing' || G.player.godTimer > 0) return;
  // Big Sal on the crew: 25% less damage taken.
  if (G.stats && G.stats.crew.includes('sal')) amount = Math.round(amount * 0.75);
  G.player.health -= amount;
  G.player.lastDamageAt = G.time;
  if (G.hud) G.hud.flashDamage();
  if (G.player.health <= 0) {
    G.player.health = 0;
    G.wasted();
  }
}

// A cop or pedestrian was shot: they go down, witnesses flee.
export function killCharacter(G, ref) {
  if (ref.alive === false) return;
  ref.alive = false;
  ref.mesh.rotation.x = -Math.PI / 2;
  ref.mesh.position.y = 0.3;
  scarePeds(G, ref.mesh.position.x, ref.mesh.position.z, 20);
}
