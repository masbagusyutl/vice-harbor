// Vice Harbor — traffic AI: cars drive the road grid, turn at intersections,
// slow for the car ahead, and stop at nothing. Simple, cheap, alive.
import { makeCar } from './vehicles.js';
import { CITY } from './config.js';

const TRAFFIC_TYPES = ['sedan', 'taxi', 'van', 'sedan'];

export function createTraffic(scene, city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const horizontal = rng.chance(0.5);
    const road = rng.pick(city.roads);
    const along = rng.range(-city.extent, city.extent);
    const lane = rng.chance(0.5) ? 3.2 : -3.2;
    const x = horizontal ? along : road + lane;
    const z = horizontal ? road + lane : along;
    const dir = rng.chance(0.5) ? 1 : -1;
    const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = makeCar(scene, rng.pick(TRAFFIC_TYPES), x, z, heading);
    car.driver = 'traffic';
    car.speed = rng.range(7, 11);
    car.targetRoad = road;
    car.horizontal = horizontal;
    car.dir = dir;
    car.lane = lane;
    cars.push(car);
  }

  function pickNewDirection(car) {
    // At an intersection, usually go straight, sometimes turn.
    const r = rng.next();
    const road = Math.round(car.x / CITY.pitch) * CITY.pitch;
    if (r < 0.6) return; // straight on
    if (car.horizontal) {
      car.horizontal = false;
      car.targetRoad = Math.max(-CITY.extent, Math.min(CITY.extent, Math.round(car.z / CITY.pitch) * CITY.pitch));
      car.dir = rng.chance(0.5) ? 1 : -1;
      car.lane = rng.chance(0.5) ? 3.2 : -3.2;
    } else {
      car.horizontal = true;
      car.targetRoad = Math.max(-CITY.extent, Math.min(CITY.extent, Math.round(car.x / CITY.pitch) * CITY.pitch));
      car.dir = rng.chance(0.5) ? 1 : -1;
      car.lane = rng.chance(0.5) ? 3.2 : -3.2;
    }
    car.heading = car.horizontal
      ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (car.dir > 0 ? 0 : Math.PI);
    void road;
  }

  function update(dt, allCars) {
    for (const car of cars) {
      // Slow down if another car is close ahead.
      let targetSpeed = 9;
      for (const other of allCars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
        const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
        if (ahead > 0 && ahead < 9 && side < 2.4) { targetSpeed = 0; break; }
      }
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      // Reached an intersection? Possibly turn. Reached the city edge? Turn around.
      const along = car.horizontal ? car.x : car.z;
      const cross = car.horizontal ? car.z : car.x;
      const nearestRoad = Math.round(along / CITY.pitch) * CITY.pitch;
      if (Math.abs(along - nearestRoad) < 0.6 && Math.abs(cross - car.targetRoad) < 4) {
        pickNewDirection(car);
      }
      if (Math.abs(along) > CITY.extent + 4) {
        car.dir *= -1;
        car.heading += Math.PI;
        car.x = Math.max(-CITY.extent - 4, Math.min(CITY.extent + 4, car.x));
        car.z = Math.max(-CITY.extent - 4, Math.min(CITY.extent + 4, car.z));
      }
      // Stay glued to the lane.
      if (car.horizontal) car.z += (car.targetRoad + car.lane - car.z) * Math.min(1, dt * 3);
      else car.x += (car.targetRoad + car.lane - car.x) * Math.min(1, dt * 3);
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }
  }

  return { cars, update };
}
