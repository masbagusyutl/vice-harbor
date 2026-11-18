// Vice Harbor — screenshot staging: ?shot=<name>&seed=<n> plays the real game
// forward a fixed number of steps from a fixed seed, so each screenshot is a
// genuine frame of the game, not a mockup.
import { makeCar } from './vehicles.js';

function setCam(game, x, y, z, lookX, lookY, lookZ) {
  game.camera.position.set(x, y, z);
  game.camera.lookAt(lookX, lookY, lookZ);
  game.cameraLocked = true;
}

// Run the simulation for `steps` frames with scripted keys held down.
function simulate(game, steps, keys) {
  const input = game.input;
  for (const k of keys) input.keys.add(k);
  for (let i = 0; i < steps; i++) game.step(1 / 60, true);
  for (const k of keys) input.keys.delete(k);
}

export function stageShot(name, game) {
  game.mode = 'play';
  game.hideMenus();
  if (name === 'start') {
    // Title screen over a wide shot from the beach: palms, boardwalk, neon downtown.
    game.mode = 'title';
    game.showTitle();
    setCam(game, 205, 30, 95, -60, 8, -30);
    game.step(1 / 60, true);
    return;
  }

  if (name === 'chase') {
    // COVER chase: the player in a sports car, 4 wanted stars, VHPD on their tail.
    const car = makeCar(game.scene, 'sport', 0, 0, 0, 0xd23b8e);
    game.enterCar(car, true);
    game.wanted = 4;
    game.player.cash = 2450;
    game.missions.startMission(2);
    simulate(game, 150, ['KeyW']);
    // Pull police cars into the frame: flanking the player, lights flashing.
    const h = game.player.heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    const spots = [
      { f: 9, r: -6.5 },
      { f: -4, r: 7 },
      { f: -12, r: -5 },
    ];
    game.police.policeCars.forEach((pc, i) => {
      const s = spots[i % spots.length];
      pc.x = game.player.x + fx * s.f + rx * s.r;
      pc.z = game.player.z + fz * s.f + rz * s.r;
      pc.heading = h;
      pc.speed = 20;
    });
    game.cameraLocked = false;
    game.step(1 / 60, true);
    game.hud.showFlash('WANTED — 4 STARS! Lose the VHPD!', 30);
    return;
  }

  if (name === 'drive') {
    // Cruising downtown in a sports car, traffic all around.
    const car = makeCar(game.scene, 'sport', -58, 0, Math.PI / 2, 0x00e5ff);
    game.enterCar(car, true);
    game.player.cash = 1200;
    simulate(game, 220, ['KeyW']);
    game.cameraLocked = false;
    game.step(1 / 60, true);
    return;
  }

  if (name === 'mission') {
    // Mission in progress: on foot at the marina, Rico's marker beacon ahead.
    game.player.x = game.city.marina.x - 14;
    game.player.z = game.city.marina.z + 6;
    game.player.heading = Math.atan2(game.city.marina.x - game.player.x, game.city.marina.z - game.player.z);
    game.player.cash = 350;
    game.missions.startMission(0);
    // Camera behind the player, looking at the marina and its beacon.
    game.setCamYaw(game.player.heading + Math.PI);
    simulate(game, 60, []);
    game.cameraLocked = false;
    game.step(1 / 60, true);
    return;
  }

  // Unknown shot name: plain free roam.
  simulate(game, 30, []);
}
