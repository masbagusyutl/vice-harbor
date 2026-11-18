// Vice Harbor v2.1 — boats.
// v2.1: rewritten under the new sealed recording; same sea as v2.
// The sea along the south edge is drivable: a Wave Runner speedboat
// the player can board (E, standing on the dock or in the shallows)
// and drive on the water, plus the Harbor Regatta boat race. Boat
// physics are arcade like the cars, but with water drag and no
// building collisions — only the sea rectangle bounds them.

import * as THREE from 'three';
import { BOAT_TYPES, WORLD, clamp } from './config.js';

export function makeBoatMesh(typeKey) {
  const t = BOAT_TYPES[typeKey];
  const group = new THREE.Group();
  const hullMat = new THREE.MeshLambertMaterial({ color: t.color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14181f });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fc4e8 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(t.len, 0.7, t.w), hullMat);
  hull.position.y = 0.55;
  group.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(t.w * 0.5, 1.6, 4), hullMat);
  bow.rotation.z = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(t.len / 2 + 0.7, 0.55, 0);
  group.add(bow);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(t.len * 0.4, 0.6, t.w * 0.7), glassMat);
  cabin.position.set(-0.4, 1.1, 0);
  group.add(cabin);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(t.len * 0.9, 0.16, t.w + 0.06), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  stripe.position.y = 0.62;
  group.add(stripe);
  // Outboard motor.
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), darkMat);
  motor.position.set(-t.len / 2 - 0.2, 0.7, 0);
  group.add(motor);
  group.userData.body = hull;
  return group;
}

export function createBoat(scene, typeKey, x, z, heading, opts = {}) {
  const mesh = makeBoatMesh(typeKey);
  mesh.position.set(x, 0.05, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const boat = {
    mesh,
    typeKey,
    type: BOAT_TYPES[typeKey],
    heading,
    speed: 0,
    steer: 0,
    boat: true,
    parked: opts.parked === true,
    radius: BOAT_TYPES[typeKey].len * 0.55,
    bobPhase: Math.random() * 6,
  };
  mesh.traverse((o) => { o.userData.boatRef = boat; });
  return boat;
}

export function forwardOfBoat(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

// Arcade boat step: accelerate, steer, water drag, stay in the sea.
export function driveBoat(boat, input, dt, G) {
  const t = boat.type;
  if (input.forward) boat.speed += t.accel * dt;
  if (input.back) boat.speed -= t.brake * dt * 0.6;
  boat.speed -= boat.speed * 0.55 * dt; // water drag
  boat.speed = clamp(boat.speed, -8, t.topSpeed);
  if (Math.abs(boat.speed) < 0.05 && !input.forward && !input.back) boat.speed = 0;
  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const grip = clamp(Math.abs(boat.speed) / 8, 0, 1);
  boat.steer = steerInput * t.turn * grip * (boat.speed >= 0 ? 1 : -1);
  boat.heading += boat.steer * dt;
  const f = forwardOfBoat(boat.heading);
  boat.mesh.position.x += f.x * boat.speed * dt;
  boat.mesh.position.z += f.z * boat.speed * dt;
  boat.mesh.rotation.y = boat.heading;
  // Gentle bob on the water.
  boat.mesh.position.y = 0.05 + Math.sin(G.time * 1.8 + boat.bobPhase) * 0.08;
  boat.mesh.rotation.z = Math.sin(G.time * 1.4 + boat.bobPhase) * 0.02;
  // Stay in the sea rectangle.
  const sea = WORLD.sea;
  boat.mesh.position.x = clamp(boat.mesh.position.x, sea.x0 + 4, sea.x1 - 4);
  boat.mesh.position.z = clamp(boat.mesh.position.z, sea.z0 + 4, sea.z1 - 4);
  if (boat.mesh.position.z > sea.z1 - 4 || boat.mesh.position.z < sea.z0 + 4) boat.speed *= 0.6;
}

export function nearestBoat(G, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const b of G.boats || []) {
    const d = Math.hypot(b.mesh.position.x - x, b.mesh.position.z - z);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}
