// Vice Harbor — combat: melee punches and hitscan shooting from the camera.
// Shooting near witnesses and hitting people raises the wanted level.
import * as THREE from 'three';

// Find the closest hittable (ped, cop, traffic car driver) inside a cone in front of the camera.
export function shootFromCamera(game, camera) {
  const origin = camera.position.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const range = 45;
  const cosLimit = Math.cos(0.12);
  let best = null;
  let bestD = range;

  function consider(x, z, y, ref, kind) {
    const dx = x - origin.x;
    const dy = y - origin.y;
    const dz = z - origin.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > bestD || d < 0.5) return;
    const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
    if (dot > cosLimit) { bestD = d; best = { ref, kind, d }; }
  }

  for (const p of game.peds.peds) {
    if (p.state !== 'down') consider(p.x, p.z, 1.2, p, 'ped');
  }
  for (const c of game.police.footCops) consider(c.x, c.z, 1.2, c, 'cop');
  for (const car of [...game.traffic.cars, ...game.parkedCars]) {
    if (car.driver === 'traffic' || car.driver === 'player') consider(car.x, car.z, 1.0, car, 'driver');
  }

  game.audio.gunshot();
  game.lastDanger = { x: game.player.x, z: game.player.z, radius: 40, until: game.time + 3 };
  if (best) {
    game.tracerTo = best.kind === 'driver'
      ? new THREE.Vector3(best.ref.x, 1.0, best.ref.z)
      : new THREE.Vector3(best.ref.x, 1.2, best.ref.z);
    game.tracerTimer = 0.08;
    if (best.kind === 'ped') {
      best.ref.state = 'down';
      best.ref.downTimer = 8;
      game.addWanted(1, 'You shot a pedestrian');
    } else if (best.kind === 'cop') {
      game.police.footCops.splice(game.police.footCops.indexOf(best.ref), 1);
      game.scene.remove(best.ref.mesh);
      game.addWanted(2, 'You shot a cop');
    } else if (best.kind === 'driver') {
      // Shooting a driver out of a moving car: the car stops, the driver flees on foot.
      best.ref.driver = null;
      best.ref.speed = 0;
      game.addWanted(1, 'You shot a driver');
    }
    return true;
  }
  game.tracerTo = origin.clone().add(dir.clone().multiplyScalar(range));
  game.tracerTimer = 0.08;
  game.addWanted(0, 'Gunfire heard');
  return false;
}

// A punch at arm's reach. Knocks a pedestrian down; hitting a cop is a bad idea.
export function meleeAttack(game) {
  const px = game.player.x;
  const pz = game.player.z;
  const reach = 2.2;
  game.audio.punch();
  for (const p of game.peds.peds) {
    if (p.state === 'down') continue;
    if (Math.hypot(p.x - px, p.z - pz) < reach) {
      p.state = 'down';
      p.downTimer = 6;
      game.addWanted(1, 'You assaulted a pedestrian');
      game.lastDanger = { x: px, z: pz, radius: 25, until: game.time + 3 };
      return true;
    }
  }
  for (const c of [...game.police.footCops]) {
    if (Math.hypot(c.x - px, c.z - pz) < reach) {
      game.police.footCops.splice(game.police.footCops.indexOf(c), 1);
      game.scene.remove(c.mesh);
      game.addWanted(2, 'You punched a cop');
      return true;
    }
  }
  return false;
}
