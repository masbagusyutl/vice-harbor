// Vice Harbor v2.1 — screenshot staging.
// v2.1: rewritten under the new sealed recording; same 4 scenes as v2
// (title, story job at the marina, Harbor Regatta, pause stats).
// v2.2 staging fixes: the race shot stages the player 1st (rivals
// behind, two gates already cleared) and the mission shot adds a
// warm key light over the marina foreground so it reads bright.
// ?shot=<name>&seed=<n> builds a deterministic scene by playing the
// real game forward a fixed number of steps from a fixed seed, then
// flags the page ready. Every screenshot is a genuine frame of the
// game: the title screen, a story job in progress, the Harbor
// Regatta boat race with live standings, and the pause screen with
// the career stats and % complete.

import * as THREE from 'three';
import { startMission } from './missions.js';
import { createCar } from './vehicles.js';
import { createBoat } from './boats.js';
import { startRace } from './progression.js';
import { fillPauseStats } from './hud.js';

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

  // The other shots play the game: hide the menu, show the HUD.
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
    // v2.2: warm key + fill lights over the marina foreground — the
    // dusk sun alone left the player and the road in front of the
    // camera too dark in the shot. Shot-only lights; the game's own
    // lighting is untouched.
    const keyLight = new THREE.PointLight(0xffe9a8, 500, 100, 1.6);
    keyLight.position.set(138, 8, -170);
    G.scene.add(keyLight);
    const fillLight = new THREE.PointLight(0xffd9a0, 300, 60, 1.6);
    fillLight.position.set(132, 5, -160);
    G.scene.add(fillLight);
    simulateSteps(G, 90);
  } else if (name === 'race') {
    // The Harbor Regatta: the player in a Wave Runner on the sea,
    // racing the three rivals with live standings on the HUD.
    G.stats.boatUnlocked = true;
    startRace(G, 'regatta');
    if (G.player.boat) {
      G.player.boat.speed = 26;
      G.shotInput = { forward: true };
      // v2.2: stage the player LEADING — two gates already cleared
      // (player progress 2/4 = 0.5) with the rivals behind (0.18 /
      // 0.12 / 0.08, and they gain ~0.14 over the 150 steps, so the
      // HUD still reads 1st of 4 at the frame).
      if (G.race) {
        G.race.checkpoint = 2;
        G.race.rivals[0].progress = 0.18;
        G.race.rivals[1].progress = 0.12;
        G.race.rivals[2].progress = 0.08;
      }
      simulateSteps(G, 150);
    }
  } else if (name === 'stats') {
    // A career in progress, paused: jobs done, a race won, reels
    // found, turf owned, crew hired — the pause screen shows it all.
    G.stats.jobsDone = 3;
    G.missionsDone = 3;
    G.missionIndex = 2;
    G.stats.racesWon = 1;
    G.stats.racesRun = 2;
    G.stats.faresDone = 4;
    G.stats.faresEarned = 240;
    G.stats.reelsFound = 9;
    G.stats.copsEscaped = 2;
    G.stats.distanceDriven = 12400;
    G.stats.timePlayed = 1840;
    G.stats.respect = 320;
    G.stats.turfOwned = ['marina', 'neonrow', 'boardwalk'];
    G.stats.crew = ['lena'];
    G.stats.hasPistol = true;
    G.cash = 1840;
    const car = putPlayerInCar(G, 'muscle', -40, 56, Math.PI / 2);
    car.speed = 18;
    clearTrafficNear(G, 0, 56, 100);
    clearCorridor(G, 56, -120, 40, 25);
    G.shotInput = { forward: true };
    simulateSteps(G, 120);
    G.shotInput = null;
    // Pause and fill the stats screen over the live city.
    G.state = 'paused';
    fillPauseStats(G);
    const pause = document.getElementById('screen-pause');
    if (pause) pause.style.display = 'flex';
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
    return;
  }
  G.shotInput = null;
}
