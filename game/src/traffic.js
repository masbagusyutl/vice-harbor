// Vice Harbor — traffic AI.
// Ambient cars drive the road grid: they follow a road line, turn at
// intersections, slow down for the car ahead, and never leave the city.
// They are also the cars the player can steal.

import { CAR_TYPES, pick } from './config.js';
import { createCar, forwardOf, separateCars } from './vehicles.js';

const TRAFFIC_TYPES = ['compact', 'sedan', 'sedan', 'taxi', 'van', 'compact'];

function randomRoadSpot(rng, city) {
  const axis = rng() < 0.5 ? 'x' : 'z';
  const line = pick(rng, city.roadXs);
  const along = -city.bounds + 10 + rng() * (city.bounds * 2 - 20);
  const dir = rng() < 0.5 ? 1 : -1;
  const lane = 2.6;
  if (axis === 'x') return { x: along, z: line + (dir > 0 ? lane : -lane), axis, dir };
  return { x: line + (dir > 0 ? -lane : lane), z: along, axis, dir };
}

export function createTraffic(G, count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const spot = randomRoadSpot(G.rng, G.city);
    const typeKey = pick(G.rng, TRAFFIC_TYPES);
    const heading = spot.axis === 'x' ? (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (spot.dir > 0 ? 0 : Math.PI);
    const car = createCar(G.scene, typeKey, spot.x, spot.z, heading, { traffic: true, driver: true });
    car.axis = spot.axis;
    car.dir = spot.dir;
    car.cruise = 9 + G.rng() * 5;
    car.wait = 0;
    G.cars.push(car);
    list.push(car);
  }
  return list;
}

function nearestLine(value, lines) {
  let best = lines[0];
  let bestD = Math.abs(value - lines[0]);
  for (const l of lines) {
    const d = Math.abs(value - l);
    if (d < bestD) { bestD = d; best = l; }
  }
  return { line: best, dist: bestD };
}

// Pick a new direction at an intersection: keep going, turn left or
// right, never reverse, never leave the city.
function chooseTurn(car, G) {
  const options = [];
  const B = G.city.bounds;
  const p = car.mesh.position;
  if (car.axis === 'x') {
    if (car.dir > 0 && p.x < B - 30) options.push({ axis: 'x', dir: 1 });
    if (car.dir < 0 && p.x > -B + 30) options.push({ axis: 'x', dir: -1 });
    if (p.z < B - 30) options.push({ axis: 'z', dir: 1 });
    if (p.z > -B + 30) options.push({ axis: 'z', dir: -1 });
  } else {
    if (car.dir > 0 && p.z < B - 30) options.push({ axis: 'z', dir: 1 });
    if (car.dir < 0 && p.z > -B + 30) options.push({ axis: 'z', dir: -1 });
    if (p.x < B - 30) options.push({ axis: 'x', dir: 1 });
    if (p.x > -B + 30) options.push({ axis: 'x', dir: -1 });
  }
  if (options.length === 0) {
    car.dir *= -1;
    return;
  }
  const next = pick(G.rng, options);
  car.axis = next.axis;
  car.dir = next.dir;
  // Snap onto the new road's lane.
  if (car.axis === 'x') {
    const near = nearestLine(p.z, G.city.roadZs);
    p.z = near.line + (car.dir > 0 ? 2.6 : -2.6);
  } else {
    const near = nearestLine(p.x, G.city.roadXs);
    p.x = near.line + (car.dir > 0 ? -2.6 : 2.6);
  }
  car.heading = car.axis === 'x'
    ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
    : (car.dir > 0 ? 0 : Math.PI);
  car.mesh.rotation.y = car.heading;
}

function carAhead(car, G) {
  const f = forwardOf(car.heading);
  const p = car.mesh.position;
  for (const other of G.cars) {
    if (other === car) continue;
    const dx = other.mesh.position.x - p.x;
    const dz = other.mesh.position.z - p.z;
    const along = dx * f.x + dz * f.z;
    const side = Math.abs(dx * f.z - dz * f.x);
    if (along > 0 && along < 10 && side < 2.2) return true;
  }
  return false;
}

export function updateTraffic(G, dt) {
  for (const car of G.traffic) {
    if (!car.traffic) continue;
    const p = car.mesh.position;
    // At an intersection, sometimes turn.
    const cross = car.axis === 'x'
      ? nearestLine(p.x, G.city.roadXs)
      : nearestLine(p.z, G.city.roadZs);
    if (cross.dist < 1.2 && G.rng() < 0.35) chooseTurn(car, G);

    let target = car.cruise;
    if (carAhead(car, G)) target = 0;
    car.speed += (target - car.speed) * Math.min(1, 2.2 * dt);
    const f = forwardOf(car.heading);
    p.x += f.x * car.speed * dt;
    p.z += f.z * car.speed * dt;
    // Keep inside the city: force a turn at the edge.
    if (Math.abs(p.x) > G.city.bounds - 4 || Math.abs(p.z) > G.city.bounds - 4) {
      chooseTurn(car, G);
    }
    const spin = (car.speed * dt) / 0.38;
    for (const w of car.mesh.userData.wheels) w.rotation.z -= spin;
  }
  // Keep cars from overlapping each other. The player's car has right
  // of way: only the other car gets pushed out of its path, so the
  // player never gets ground into a building by a traffic car.
  for (let i = 0; i < G.cars.length; i++) {
    for (let j = i + 1; j < G.cars.length; j++) {
      const a = G.cars[i];
      const b = G.cars[j];
      if (a === G.player.car || b === G.player.car) {
        const other = a === G.player.car ? b : a;
        const self = a === G.player.car ? a : b;
        const dx = other.mesh.position.x - self.mesh.position.x;
        const dz = other.mesh.position.z - self.mesh.position.z;
        const d = Math.hypot(dx, dz);
        const min = self.radius + other.radius - 0.4;
        if (d > 0.001 && d < min) {
          const push = min - d;
          other.mesh.position.x += (dx / d) * push;
          other.mesh.position.z += (dz / d) * push;
          if (other.traffic) other.speed = Math.min(other.speed, self.speed * 0.5);
        }
      } else {
        separateCars(a, b);
      }
    }
  }
}
