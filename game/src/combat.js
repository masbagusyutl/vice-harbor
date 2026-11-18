// Vice Harbor — combat.
// Hitscan shooting from the camera crosshair, a melee swing, muzzle
// tracers, and the damage the player takes. Shooting in public and
// hurting people both raise the wanted level.

import * as THREE from 'three';
import { addWanted, killCharacter } from './police.js';
import { scarePeds, knockPedDown } from './pedestrians.js';

const raycaster = new THREE.Raycaster();
const screenCentre = new THREE.Vector2(0, 0);

function collectTargets(G) {
  const targets = [];
  for (const ped of G.peds) if (ped.alive) targets.push(ped.mesh);
  for (const cop of G.footCops) if (cop.alive) targets.push(cop.mesh);
  for (const car of G.cars) {
    if (car !== G.player.car) targets.push(car.mesh);
  }
  return targets;
}

function showTracer(G, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 }));
  G.scene.add(line);
  G.tracers.push({ line, life: 0.09 });
}

export function shoot(G) {
  if (G.state !== 'playing' || G.player.car) return;
  if (G.time - (G.lastShotAt || 0) < 0.22) return;
  G.lastShotAt = G.time;
  if (G.audio) G.audio.shot(false);
  raycaster.setFromCamera(screenCentre, G.camera);
  raycaster.far = 90;
  const hits = raycaster.intersectObjects(collectTargets(G), true);
  const from = G.camera.position.clone();
  let end = raycaster.ray.at(90, new THREE.Vector3());
  if (hits.length > 0) {
    const hit = hits[0];
    end = hit.point.clone();
    // Walk up to the object that carries a ref.
    let obj = hit.object;
    let ref = null;
    let kind = null;
    while (obj) {
      if (obj.userData.pedRef) { ref = obj.userData.pedRef; kind = 'ped'; break; }
      if (obj.userData.copRef) { ref = obj.userData.copRef; kind = 'cop'; break; }
      if (obj.userData.carRef) { ref = obj.userData.carRef; kind = 'car'; break; }
      obj = obj.parent;
    }
    if (kind === 'ped' && ref) {
      knockPedDown(G, ref);
      addWanted(G, 1, 'assault');
    } else if (kind === 'cop' && ref) {
      ref.health -= 1;
      if (ref.health <= 0) {
        killCharacter(G, ref);
        addWanted(G, 1, 'officer down');
      }
    } else if (kind === 'car' && ref) {
      ref.health -= 10;
      if (G.audio) G.audio.thud();
    }
  }
  showTracer(G, from, end);
  // Bystanders scatter at the sound.
  scarePeds(G, G.playerPos().x, G.playerPos().z, 22);
  // Firing a gun in the city is a crime, but only once per burst.
  if (G.time - (G.lastShotCrimeAt || 0) > 4) {
    G.lastShotCrimeAt = G.time;
    addWanted(G, 1, 'shots fired');
  }
  G.shake = Math.min(0.4, G.shake + 0.12);
}

export function melee(G) {
  if (G.state !== 'playing' || G.player.car) return;
  if (G.time - (G.lastMeleeAt || 0) < 0.5) return;
  G.lastMeleeAt = G.time;
  if (G.audio) G.audio.swing();
  const p = G.player.mesh.position;
  let best = null;
  let bestD = 2.4;
  for (const ped of G.peds) {
    if (!ped.alive) continue;
    const d = Math.hypot(ped.mesh.position.x - p.x, ped.mesh.position.z - p.z);
    if (d < bestD) { bestD = d; best = ped; }
  }
  for (const cop of G.footCops) {
    if (!cop.alive) continue;
    const d = Math.hypot(cop.mesh.position.x - p.x, cop.mesh.position.z - p.z);
    if (d < bestD) { bestD = d; best = cop; }
  }
  if (best) {
    knockPedDown(G, best);
    addWanted(G, 1, 'assault');
    if (G.hud) G.hud.toast('You threw a punch. The crowd saw it.');
  }
}

export function updateTracers(G, dt) {
  for (let i = G.tracers.length - 1; i >= 0; i--) {
    const t = G.tracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      G.scene.remove(t.line);
      t.line.geometry.dispose();
      G.tracers.splice(i, 1);
    }
  }
}

// A police tracer from a cop's position to the player (visual only).
export function policeTracer(G, from, to) {
  showTracer(G, from.clone().setY(1.4), to.clone().setY(1.2));
}
