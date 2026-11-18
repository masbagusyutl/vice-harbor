// Vice Harbor — screenshot staging.
// ?shot=<name>&seed=<n> builds a deterministic scene by playing the
// real game forward a fixed number of steps from a fixed seed, then
// flags the page ready. Every screenshot is a genuine frame of the
// game: title screen, police chase, driving, and a mission in progress.

import { startMission } from './missions.js';
import { createCar } from './vehicles.js';

// Run the real update loop a fixed number of steps, headless-style.
export function simulateSteps(G, steps) {
  for (let i = 0; i < steps; i++) G.update(1 / 60);
}

// Put the player in a car on a road, ready to drive straight.
function putPlayerInCar(G, typeKey, x, z, heading) {
  const car = createCar(G.scene, typeKey, x, z, heading, { driver: true, parked: false });
  G.cars.push(car);
  G.player.car = car;
  G.player.mesh.visible = false;
  G.camYaw = heading;
  G.camPitch = 0.32;
  return car;
}

// Clear traffic near a path so the shot stays readable.
function clearTrafficNear(G, x, z, radius) {
  for (const car of G.traffic) {
    if (!car.traffic) continue;
    if (Math.hypot(car.mesh.position.x - x, car.mesh.position.z - z) < radius) {
      car.traffic = false;
      car.mesh.visible = false;
    }
  }
}

// Clear a corridor along a road so the shot stays readable: hide any
// parked or traffic car inside it (the camera passes close by them).
function clearCorridor(G, z, x0, x1, halfWidth) {
  for (const car of G.cars) {
    if (car === G.player.car || car.police) continue;
    const p = car.mesh.position;
    if (Math.abs(p.z - z) < halfWidth && p.x > x0 - 20 && p.x < x1 + 20) {
      car.traffic = false;
      car.mesh.visible = false;
    }
  }
}

export function setupShot(G, name) {
  G.shotMode = name;
  if (name === 'start') {
    // Title screen over the dusk city: fixed vista camera, ambient life.
    G.state = 'menu';
    G.shotCamera = {
      pos: { x: -60, y: 34, z: 150 },
      look: { x: 20, y: 8, z: -60 },
    };
    simulateSteps(G, 240);
    return;
  }

  // The other three shots play the game: hide the menu, show the HUD.
  G.startGame();
  if (name === 'chase') {
    const car = putPlayerInCar(G, 'sports', -120, 0, Math.PI / 2);
    car.speed = 30;
    G.wanted = 4;
    G.lastSeenAt = G.time;
    if (G.audio) G.audio.siren(true);
    clearTrafficNear(G, -60, 0, 90);
    clearCorridor(G, 0, -170, 20, 25);
    // Three interceptors in pursuit, close behind and closing in.
    for (let i = 0; i < 3; i++) {
      const cop = createCar(G.scene, 'police', -132 - i * 8, (i - 1) * 5, Math.PI / 2, { police: true, driver: true });
      cop.speed = 36;
      G.cars.push(cop);
      G.policeCars.push(cop);
    }
    G.shotInput = { forward: true };
    simulateSteps(G, 120);
  } else if (name === 'drive') {
    // Drive in the right-hand lane so oncoming traffic passes cleanly.
    const car = putPlayerInCar(G, 'sedan', -140, 58.6, Math.PI / 2);
    car.speed = 22;
    clearTrafficNear(G, -40, 56, 130);
    clearCorridor(G, 56, -170, -20, 25);
    G.shotInput = { forward: true };
    simulateSteps(G, 170);
  } else if (name === 'mission') {
    // On foot at the marina, first mission active, beacon glowing.
    G.player.mesh.position.set(140, 0, -175);
    G.player.heading = 2.18;
    G.camYaw = 2.18;
    G.camPitch = 0.22;
    startMission(G, 0);
    simulateSteps(G, 90);
  }
  G.shotInput = null;
}
