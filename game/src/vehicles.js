// Vice Harbor — vehicles: building cars and driving them.
// Every car is a low-poly mesh built from boxes in code, with its own
// handling from config.js. Driving is arcade physics: accelerate,
// brake, steer, drift a little, crash into things and slow down.

import * as THREE from 'three';
import { CAR_TYPES, clamp } from './config.js';
import { resolveCollision } from './city.js';

// Build one car's mesh. `police` adds the light bar and white doors.
export function makeCarMesh(typeKey, police = false) {
  const t = CAR_TYPES[typeKey];
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: t.color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14181f });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fc4e8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(t.len, t.h * 0.62, t.w), bodyMat);
  body.position.y = 0.55;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(t.len * 0.52, t.h * 0.55, t.w * 0.88), glassMat);
  cabin.position.set(-t.len * 0.04, 0.55 + t.h * 0.55, 0);
  group.add(cabin);

  if (police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(t.len * 0.9, 0.18, t.w + 0.06), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    stripe.position.y = 0.62;
    group.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 1.1), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    bar.position.set(0, 0.55 + t.h * 0.85, -0.3);
    bar.userData.policeLight = 'red';
    group.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 1.1), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    bar2.position.set(0, 0.55 + t.h * 0.85, 0.3);
    bar2.userData.policeLight = 'blue';
    group.add(bar2);
    group.userData.lightBars = [bar, bar2];
  }

  // Headlights and taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const z of [-t.w * 0.32, t.w * 0.32]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.4), headMat);
    head.position.set(t.len / 2, 0.55, z);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.4), tailMat);
    tail.position.set(-t.len / 2, 0.55, z);
    group.add(tail);
  }

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheels = [];
  for (const [wx, wz] of [
    [t.len * 0.32, t.w / 2], [t.len * 0.32, -t.w / 2],
    [-t.len * 0.32, t.w / 2], [-t.len * 0.32, -t.w / 2],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
    wheels.push(wheel);
  }

  group.userData.wheels = wheels;
  group.userData.body = body;
  return group;
}

export function createCar(scene, typeKey, x, z, heading, opts = {}) {
  const mesh = makeCarMesh(typeKey, opts.police === true);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  mesh.traverse((o) => { o.userData.carRef = null; });
  scene.add(mesh);
  const car = {
    mesh,
    typeKey,
    type: CAR_TYPES[typeKey],
    heading,
    speed: 0,
    steer: 0,
    driver: opts.driver !== false,
    traffic: opts.traffic === true,
    police: opts.police === true,
    parked: opts.parked === true,
    health: 100,
    radius: CAR_TYPES[typeKey].len * 0.55,
  };
  mesh.traverse((o) => { o.userData.carRef = car; });
  return car;
}

export function forwardOf(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

// Arcade driving step for the player's car (and police pursuit cars).
// input: { forward, back, left, right, handbrake } as booleans.
export function driveCar(car, input, dt, G) {
  const t = car.type;
  if (input.forward) car.speed += t.accel * dt;
  if (input.back) {
    car.speed -= car.speed > 0.5 ? t.brake * dt : t.accel * 0.55 * dt;
  }
  if (input.handbrake) car.speed *= Math.max(0, 1 - 4 * dt);
  // Rolling drag and top speed.
  car.speed -= car.speed * 0.35 * dt;
  car.speed = clamp(car.speed, -11, t.topSpeed);
  if (Math.abs(car.speed) < 0.05 && !input.forward && !input.back) car.speed = 0;

  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const grip = clamp(Math.abs(car.speed) / 9, 0, 1);
  car.steer = steerInput * t.turn * grip * (car.speed >= 0 ? 1 : -1);
  car.heading += car.steer * dt;
  const f = forwardOf(car.heading);
  car.mesh.position.x += f.x * car.speed * dt;
  car.mesh.position.z += f.z * car.speed * dt;
  car.mesh.rotation.y = car.heading;

  // Spin the wheels.
  const spin = (car.speed * dt) / 0.38;
  for (const w of car.mesh.userData.wheels) w.rotation.z -= spin;

  // Buildings stop cars hard; the world edge stops them too.
  const hit = resolveCollision(car.mesh.position, car.radius, G.city.colliders);
  const B = G.city.bounds;
  car.mesh.position.x = clamp(car.mesh.position.x, -B, B);
  car.mesh.position.z = clamp(car.mesh.position.z, -B, B);
  if (hit && Math.abs(car.speed) > 6) {
    car.speed *= 0.45;
    if (G.audio) G.audio.thud();
    if (G.shake !== undefined) G.shake = Math.min(0.5, G.shake + 0.25);
  } else if (hit) {
    car.speed *= 0.7;
  }
  return hit;
}

// Simple circle-vs-circle push between two cars.
export function separateCars(a, b) {
  const dx = b.mesh.position.x - a.mesh.position.x;
  const dz = b.mesh.position.z - a.mesh.position.z;
  const d = Math.hypot(dx, dz);
  const min = a.radius + b.radius - 0.4;
  if (d > 0.001 && d < min) {
    const push = (min - d) / 2;
    const nx = dx / d;
    const nz = dz / d;
    a.mesh.position.x -= nx * push;
    a.mesh.position.z -= nz * push;
    b.mesh.position.x += nx * push;
    b.mesh.position.z += nz * push;
    return true;
  }
  return false;
}

export function nearestCar(G, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    const d = Math.hypot(car.mesh.position.x - x, car.mesh.position.z - z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}
