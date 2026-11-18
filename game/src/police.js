// Vice Harbor — the wanted system: stars rise with crime, VHPD responds,
// pursuit escalates with stars, and lying low out of sight cools it down.
import * as THREE from 'three';
import { WANTED } from './config.js';
import { makeCar, createCarMesh } from './vehicles.js';

export function createPolice(scene, city, rng) {
  const policeCars = [];
  const footCops = [];
  let decayTimer = 0;

  function spawnPoliceCar(playerPos) {
    const road = city.roads[Math.floor(rng.next() * city.roads.length)];
    const horizontal = rng.chance(0.5);
    const behind = rng.chance(0.5) ? 1 : -1;
    const x = horizontal ? playerPos.x + behind * rng.range(45, 70) : road;
    const z = horizontal ? road : playerPos.z + behind * rng.range(45, 70);
    const heading = horizontal ? (behind > 0 ? -Math.PI / 2 : Math.PI / 2) : (behind > 0 ? Math.PI : 0);
    const car = makeCar(scene, 'police', x, z, heading);
    car.driver = 'police';
    car.speed = 12;
    policeCars.push(car);
    return car;
  }

  function spawnFootCop(playerPos) {
    const mesh = createCarMesh('police', 0x1c2733); // placeholder replaced below
    // Foot cops are simple uniformed figures, not cars.
    scene.remove(mesh);
    const g = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.25), navy);
    legs.position.y = 0.4;
    g.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), navy);
    torso.position.y = 1.12;
    g.add(torso);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4), new THREE.MeshLambertMaterial({ color: 0x0e141c }));
    cap.position.y = 1.82;
    g.add(cap);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), skin);
    head.position.y = 1.6;
    g.add(head);
    const angle = rng.range(0, Math.PI * 2);
    const x = playerPos.x + Math.sin(angle) * rng.range(18, 30);
    const z = playerPos.z + Math.cos(angle) * rng.range(18, 30);
    g.position.set(x, 0, z);
    scene.add(g);
    const cop = { mesh: g, x, z, heading: angle, speed: rng.range(3.2, 4), shootTimer: rng.range(1, 2) };
    footCops.push(cop);
    return cop;
  }

  function removeCar(car) {
    scene.remove(car.mesh);
    const i = policeCars.indexOf(car);
    if (i >= 0) policeCars.splice(i, 1);
  }

  function removeCop(cop) {
    scene.remove(cop.mesh);
    const i = footCops.indexOf(cop);
    if (i >= 0) footCops.splice(i, 1);
  }

  // state: { wanted, player: {x,z,onFoot,health}, onBusted, onDamage }
  function update(dt, state) {
    const wanted = state.wanted;
    const px = state.player.x;
    const pz = state.player.z;

    // Keep the response proportional to the stars.
    const wantCars = wanted >= 1 ? Math.min(wanted, 3) : 0;
    const wantCops = wanted >= 2 ? Math.min(wanted - 1, 3) : 0;
    while (policeCars.length < wantCars) spawnPoliceCar(state.player);
    while (policeCars.length > wantCars) removeCar(policeCars[policeCars.length - 1]);
    while (footCops.length < wantCops) spawnFootCop(state.player);
    while (footCops.length > wantCops) removeCop(footCops[footCops.length - 1]);

    // Police cars chase: steer toward the player, ram on contact.
    let nearestPolice = Infinity;
    for (const car of policeCars) {
      const dx = px - car.x;
      const dz = pz - car.z;
      const dist = Math.hypot(dx, dz);
      nearestPolice = Math.min(nearestPolice, dist);
      const targetHeading = Math.atan2(dx, dz);
      let dh = targetHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
      car.speed = Math.min(car.def.topSpeed, car.speed + car.def.accel * dt * 0.7);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      // Flashing light bar.
      car.flash += dt;
      if (car.mesh.userData.lightBar) {
        car.mesh.userData.lightBar.material.color.setHex(Math.floor(car.flash * 4) % 2 === 0 ? 0xff2e2e : 0x2e6bff);
      }
      // Ramming the player's car slows it; touching the player on foot busts them.
      if (dist < 2.6 && state.player.onFoot) state.onBusted();
      if (dist < 3.4 && !state.player.onFoot && state.playerCar) {
        state.playerCar.speed *= 0.92;
      }
    }

    // Foot cops run at the player; close contact busts, and at 3+ stars they shoot.
    for (const cop of [...footCops]) {
      const dx = px - cop.x;
      const dz = pz - cop.z;
      const dist = Math.hypot(dx, dz);
      nearestPolice = Math.min(nearestPolice, dist);
      cop.heading = Math.atan2(dx, dz);
      cop.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.z += Math.cos(cop.heading) * cop.speed * dt;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      if (dist < 1.6 && state.player.onFoot) state.onBusted();
      if (wanted >= WANTED.copShootStars && dist < 28 && dist > 4) {
        cop.shootTimer -= dt;
        if (cop.shootTimer <= 0) {
          cop.shootTimer = rng.range(0.9, 1.6);
          state.onDamage(6, 'police');
        }
      }
    }

    // Wanted cooldown: out of sight of every unit, stars drop one at a time.
    if (wanted > 0) {
      if (nearestPolice > 55) {
        decayTimer += dt;
        if (decayTimer >= WANTED.decayDelay) {
          decayTimer = 0;
          state.wanted = Math.max(0, wanted - 1);
        }
      } else {
        decayTimer = 0;
      }
    }
    return { nearestPolice };
  }

  function clearAll() {
    while (policeCars.length) removeCar(policeCars[0]);
    while (footCops.length) removeCop(footCops[0]);
  }

  return { policeCars, footCops, update, clearAll, spawnPoliceCar };
}
