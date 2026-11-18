// Vice Harbor — pedestrians.
// People walk the pavements, cross at intersections, and run away
// from gunfire, speeding cars and nearby crime. Hit one with a car
// and the law notices.

import * as THREE from 'three';
import { pick, clamp } from './config.js';

const SHIRTS = [0xff8a5c, 0x5c8aff, 0x7be36b, 0xe85cd6, 0xf2e85c, 0xffffff, 0x8a5cff, 0x5ce8d6];
const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf2c9a0];

export function makePedMesh(rng) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, SHIRTS) });
  const skin = new THREE.MeshLambertMaterial({ color: pick(rng, SKINS) });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2f3a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32), shirt);
  body.position.y = 1.05;
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.68;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.22), pants);
  legL.position.set(0, 0.32, 0.14);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.22), pants);
  legR.position.set(0, 0.32, -0.14);
  group.add(legR);
  group.userData.body = body;
  group.userData.head = head;
  return group;
}

function randomSidewalkSpot(rng, city) {
  const line = pick(rng, city.roadXs);
  const along = -city.bounds + 10 + rng() * (city.bounds * 2 - 20);
  const side = rng() < 0.5 ? 1 : -1;
  if (rng() < 0.5) return { x: along, z: line + side * 9.5 };
  return { x: line + side * 9.5, z: along };
}

export function createPedestrians(G, count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const spot = randomSidewalkSpot(G.rng, G.city);
    const mesh = makePedMesh(G.rng);
    mesh.position.set(spot.x, 0, spot.z);
    G.scene.add(mesh);
    const ped = {
      mesh,
      heading: G.rng() * Math.PI * 2,
      speed: 1.1 + G.rng() * 1.1,
      target: randomSidewalkSpot(G.rng, G.city),
      fleeing: false,
      fleeTimer: 0,
      alive: true,
      fallTimer: 0,
    };
    mesh.traverse((o) => { o.userData.pedRef = ped; });
    list.push(ped);
  }
  return list;
}

// Scare every pedestrian near a point (gunshot, crash, carjacking).
export function scarePeds(G, x, z, radius) {
  for (const ped of G.peds) {
    if (!ped.alive) continue;
    const d = Math.hypot(ped.mesh.position.x - x, ped.mesh.position.z - z);
    if (d < radius) {
      ped.fleeing = true;
      ped.fleeTimer = 2.5 + G.rng() * 1.5;
      ped.fleeFrom = { x, z };
    }
  }
}

export function updatePedestrians(G, dt) {
  for (const ped of G.peds) {
    const p = ped.mesh.position;
    if (!ped.alive) {
      ped.fallTimer -= dt;
      if (ped.fallTimer <= 0) {
        // Get back up and walk away, shaken.
        ped.alive = true;
        ped.mesh.rotation.x = 0;
        ped.mesh.position.y = 0;
        ped.fleeing = true;
        ped.fleeTimer = 3;
        ped.fleeFrom = { x: G.playerPos().x, z: G.playerPos().z };
      }
      continue;
    }
    let tx;
    let tz;
    let speed = ped.speed;
    if (ped.fleeing) {
      ped.fleeTimer -= dt;
      const dx = p.x - ped.fleeFrom.x;
      const dz = p.z - ped.fleeFrom.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = p.x + (dx / d) * 20;
      tz = p.z + (dz / d) * 20;
      speed = 4.6;
      if (ped.fleeTimer <= 0) ped.fleeing = false;
    } else {
      tx = ped.target.x;
      tz = ped.target.z;
    }
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) {
      ped.target = randomSidewalkSpot(G.rng, G.city);
      continue;
    }
    ped.heading = Math.atan2(dx, dz);
    p.x += (dx / d) * speed * dt;
    p.z += (dz / d) * speed * dt;
    p.x = clamp(p.x, -G.city.bounds, G.city.bounds);
    p.z = clamp(p.z, -G.city.bounds, G.city.bounds);
    ped.mesh.rotation.y = ped.heading;
    // Walking bob.
    const bob = Math.sin(G.time * 9 + ped.heading * 7) * 0.06;
    ped.mesh.position.y = Math.abs(bob);
  }
}

// A car hit a pedestrian: they go down, the crowd flees, stars rise.
export function knockPedDown(G, ped) {
  if (!ped.alive) return;
  ped.alive = false;
  ped.fallTimer = 4;
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = 0.3;
  scarePeds(G, ped.mesh.position.x, ped.mesh.position.z, 18);
}
