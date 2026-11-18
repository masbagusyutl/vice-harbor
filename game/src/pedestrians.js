// Vice Harbor — pedestrians: walk the pavements, chat in place, flee from danger.
import * as THREE from 'three';
import { CITY } from './config.js';

const SHIRT_COLORS = [0xe25822, 0x4caf50, 0x9b59b6, 0xdddddd, 0x3f6fb5, 0xf2c230, 0xd23b8e];
const SKIN_COLORS = [0xe8b98a, 0xc98d5f, 0x8a5a3b, 0xf0c8a0];

function createPedMesh(rng) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick(SKIN_COLORS) });
  const shirt = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRT_COLORS) });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c2f3d });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.25), pants);
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), shirt);
  torso.position.y = 1.12;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.62;
  g.add(head);
  g.userData.torso = torso;
  g.userData.legs = legs;
  return g;
}

export function createPedestrians(scene, city, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const road = rng.pick(city.roads);
    const along = rng.range(-city.extent, city.extent);
    const side = rng.chance(0.5) ? 1 : -1;
    const horizontal = rng.chance(0.5);
    const x = horizontal ? along : road + side * (CITY.roadHalf + 1.6);
    const z = horizontal ? road + side * (CITY.roadHalf + 1.6) : along;
    const mesh = createPedMesh(rng);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      mesh, x, z,
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(1, 1.8),
      road, side, horizontal,
      state: 'walk', // walk | flee | down
      downTimer: 0,
      walkPhase: rng.range(0, Math.PI * 2),
    });
  }

  function update(dt, t, danger) {
    for (const p of peds) {
      if (p.state === 'down') {
        p.downTimer -= dt;
        p.mesh.rotation.x = -Math.PI / 2 * 0.9;
        if (p.downTimer <= 0) { p.state = 'walk'; p.mesh.rotation.x = 0; }
        continue;
      }
      // Flee if danger (gunfire, a speeding car, the player) is close.
      let flee = false;
      if (danger) {
        const d = Math.hypot(p.x - danger.x, p.z - danger.z);
        if (d < danger.radius) flee = true;
      }
      if (flee) {
        p.state = 'flee';
        const away = Math.atan2(p.x - danger.x, p.z - danger.z);
        p.heading = away;
        p.x += Math.sin(p.heading) * 4.5 * dt;
        p.z += Math.cos(p.heading) * 4.5 * dt;
      } else {
        p.state = 'walk';
        p.x += Math.sin(p.heading) * p.speed * dt;
        p.z += Math.cos(p.heading) * p.speed * dt;
        // Turn around at the city edge or at a random whim.
        const along = p.horizontal ? p.x : p.z;
        if (Math.abs(along) > city.extent || rng.chance(dt * 0.02)) p.heading += Math.PI;
        if (p.horizontal) p.z += (p.road + p.side * (CITY.roadHalf + 1.6) - p.z) * Math.min(1, dt * 2);
        else p.x += (p.road + p.side * (CITY.roadHalf + 1.6) - p.x) * Math.min(1, dt * 2);
      }
      p.walkPhase += dt * (p.state === 'flee' ? 14 : 7);
      p.mesh.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * 0.06, p.z);
      p.mesh.rotation.y = p.heading;
      p.mesh.userData.legs.rotation.x = Math.sin(p.walkPhase) * 0.5;
    }
  }

  return { peds, update };
}
