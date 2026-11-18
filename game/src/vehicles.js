// Vice Harbor — cars: low-poly meshes built from boxes, plus arcade driving physics.
import * as THREE from 'three';
import { CAR_TYPES } from './config.js';
import { collideCircle } from './city.js';

const PALETTE_VARIANTS = [0x3f6fb5, 0xd23b8e, 0xf2c230, 0x7d8a99, 0x4caf50, 0xe25822, 0x9b59b6, 0xdddddd];

// Build a simple low-poly car. type picks handling; color overrides the paint.
export function createCarMesh(type, color) {
  const def = CAR_TYPES[type] || CAR_TYPES.sedan;
  const paint = color ?? def.color;
  const g = new THREE.Group();
  const L = def.length;
  const bodyMat = new THREE.MeshLambertMaterial({ color: paint });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18222e });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161a });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, L), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, L * 0.5), glassMat);
  cabin.position.set(0, 1.2, -L * 0.06);
  g.add(cabin);
  // Headlights and taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2e2e });
  for (const s of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), headMat);
    h.position.set(s, 0.6, L / 2 + 0.02);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat);
    t.position.set(s, 0.6, -L / 2 - 0.02);
    g.add(t);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-0.95, L / 2 - 0.8], [0.95, L / 2 - 0.8], [-0.95, -L / 2 + 0.8], [0.95, -L / 2 + 0.8]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(wx, 0.38, wz);
    g.add(w);
  }
  if (type === 'police') {
    const barMat = new THREE.MeshBasicMaterial({ color: 0xff2e2e });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.4), barMat);
    bar.position.set(0, 1.62, 0);
    g.add(bar);
    g.userData.lightBar = bar;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, L * 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.55;
    g.add(stripe);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    sign.position.set(0, 1.65, 0);
    g.add(sign);
  }
  g.userData.def = def;
  return g;
}

export function makeCar(scene, type, x, z, heading, color) {
  const mesh = createCarMesh(type, color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const def = CAR_TYPES[type] || CAR_TYPES.sedan;
  return {
    mesh, type, def,
    heading, speed: 0,
    x, z,
    driver: null, // 'player' | 'traffic' | 'police' | null (parked)
    flash: 0,
  };
}

// Arcade car physics for the car the player drives. Returns nothing; mutates car.
export function updatePlayerCar(car, input, dt, colliders, bounds) {
  const def = car.def;
  const fwd = input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0;
  const back = input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0;
  const steer = (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0)
    - (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0);
  if (fwd) car.speed += def.accel * dt;
  else if (back) car.speed -= (car.speed > 0.5 ? def.brake : def.accel * 0.6) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  car.speed = Math.max(-def.topSpeed * 0.45, Math.min(def.topSpeed, car.speed));
  const dir = car.speed >= 0 ? 1 : -1;
  car.heading += steer * def.turn * dt * Math.min(1, Math.abs(car.speed) / 6) * dir;
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const pos = { x: nx, z: nz };
  collideCircle(pos, 1.5, colliders);
  if (Math.abs(pos.x - nx) > 0.01 || Math.abs(pos.z - nz) > 0.01) car.speed *= 0.4;
  car.x = Math.max(-bounds, Math.min(bounds + 60, pos.x));
  car.z = Math.max(-bounds, Math.min(bounds, pos.z));
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  return Math.abs(car.speed) / def.topSpeed;
}

// Parked cars along the roads, some of which the player can steal.
export function spawnParkedCars(scene, city, rng, count) {
  const cars = [];
  const types = ['sedan', 'sport', 'taxi', 'van'];
  for (let i = 0; i < count; i++) {
    const road = rng.pick(city.roads);
    const along = rng.range(-city.extent + 10, city.extent - 10);
    const side = rng.chance(0.5) ? 1 : -1;
    const horizontal = rng.chance(0.5);
    const x = horizontal ? along : road + side * (7 + 2.6);
    const z = horizontal ? road + side * (7 + 2.6) : along;
    const heading = horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
    const car = makeCar(scene, rng.pick(types), x, z, heading, rng.pick(PALETTE_VARIANTS));
    car.driver = null;
    cars.push(car);
  }
  return cars;
}

export function nearestCar(cars, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const c of cars) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
