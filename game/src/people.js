// Vice Harbor — people: pedestrians who walk the sidewalks and flee danger,
// foot police, patrol cars that pursue and gently ram, and the police
// helicopter with its searchlight at 4 stars and above.

window.VH = window.VH || {};
(function () {
  var VH = window.VH;
  var THREE = window.THREE;

  var PED_COLORS = [0xd84a5a, 0x4a8ad8, 0x5ad88a, 0xd8b84a, 0x9a5ad8, 0x5ad8d0, 0xe8e8e8, 0x3a3a3a];

  function makePersonMesh(color, uniform) {
    var g = new THREE.Group();
    var mat = new THREE.MeshStandardMaterial({ color: uniform ? 0x1a2a4a : color, roughness: 0.9 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.5), mat);
    body.position.y = 1.15; body.castShadow = true; g.add(body);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8a878, roughness: 0.8 }));
    head.position.y = 2.15; head.castShadow = true; g.add(head);
    if (uniform) {
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.2, 10),
        new THREE.MeshStandardMaterial({ color: 0x0a1a3a, roughness: 0.7 }));
      cap.position.y = 2.45; g.add(cap);
    }
    return g;
  }

  VH.spawnPedestrians = function (scene, count) {
    var rng = VH.makeRng(5150);
    var peds = [];
    for (var i = 0; i < count; i++) {
      var m = makePersonMesh(PED_COLORS[i % PED_COLORS.length], false);
      var x = VH.rand(rng, -420, 420), z = VH.rand(rng, -420, 420);
      m.position.set(x, 0, z);
      scene.add(m);
      peds.push({ mesh: m, x: x, z: z, heading: VH.rand(rng, 0, Math.PI * 2),
        speed: VH.rand(rng, 1.2, 2.2), targetX: x, targetZ: z, fleeing: false,
        panic: 0 });
    }
    return peds;
  };

  VH.updatePedestrians = function (peds, player, playerCar, gunfireAt, dt, time) {
    peds.forEach(function (p) {
      var px = playerCar ? playerCar.x : player.x;
      var pz = playerCar ? playerCar.z : player.z;
      var d = VH.dist2d(p.x, p.z, px, pz);
      var threat = d < 12 && (playerCar ? Math.abs(playerCar.speed) > 12 : false);
      if (gunfireAt && VH.dist2d(p.x, p.z, gunfireAt.x, gunfireAt.z) < 25) threat = true;
      if (threat) { p.fleeing = true; p.panic = time + 3; }
      if (p.fleeing && time > p.panic) p.fleeing = false;
      var speed = p.fleeing ? 5.5 : p.speed;
      if (p.fleeing) {
        // run away from the threat
        var dx = p.x - px, dz = p.z - pz;
        var len = Math.sqrt(dx * dx + dz * dz) || 1;
        p.heading = Math.atan2(dx / len, dz / len);
      } else if (VH.dist2d(p.x, p.z, p.targetX, p.targetZ) < 3) {
        p.targetX = VH.clamp(p.x + (Math.random() - 0.5) * 160, -430, 430);
        p.targetZ = VH.clamp(p.z + (Math.random() - 0.5) * 160, -430, 430);
        p.heading = Math.atan2(p.targetX - p.x, p.targetZ - p.z);
      } else {
        p.heading = Math.atan2(p.targetX - p.x, p.targetZ - p.z);
      }
      p.x += Math.sin(p.heading) * speed * dt;
      p.z += Math.cos(p.heading) * speed * dt;
      p.x = VH.clamp(p.x, -440, 440); p.z = VH.clamp(p.z, -440, 440);
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      // walk bob
      p.mesh.position.y = Math.abs(Math.sin(time * 6 + p.x)) * 0.08;
    });
  };

  // --- police: patrol cars chase, foot officers walk the beat, the
  // helicopter hunts from above at 4+ stars. ---
  VH.police = { cars: [], officers: [], heli: null, heliLight: null, lastShot: 0 };

  VH.spawnPoliceCar = function (scene, x, z) {
    var c = VH.makeCar(scene, VH.POLICE_CAR, x, z, 0);
    c.isPolice = true;
    VH.police.cars.push(c);
    return c;
  };

  VH.spawnOfficer = function (scene, x, z) {
    var m = makePersonMesh(0x1a2a4a, true);
    m.position.set(x, 0, z);
    scene.add(m);
    var o = { mesh: m, x: x, z: z, heading: 0 };
    VH.police.officers.push(o);
    return o;
  };

  VH.spawnHelicopter = function (scene) {
    if (VH.police.heli) return VH.police.heli;
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.4, metalness: 0.5 }));
    body.castShadow = true; g.add(body);
    var rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.15, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x222222 }));
    rotor.position.y = 1.2; g.add(rotor);
    var tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 5),
      new THREE.MeshStandardMaterial({ color: 0x1a2a3a }));
    tail.position.set(0, 0.4, -5); g.add(tail);
    // searchlight cone: a visible shaft of light sweeping the streets
    var cone = new THREE.Mesh(new THREE.ConeGeometry(9, 55, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.rotation.x = Math.PI; cone.position.y = -28; g.add(cone);
    var spot = new THREE.SpotLight(0xfff2b0, 60, 120, 0.35, 0.5, 1);
    spot.position.set(0, -1, 0);
    g.add(spot); g.add(spot.target);
    spot.target.position.set(0, -55, 0);
    scene.add(g);
    VH.police.heli = { mesh: g, rotor: rotor, spot: spot, x: 0, z: 0 };
    return VH.police.heli;
  };

  VH.updatePolice = function (scene, player, playerCar, wanted, dt, time, onDamage, onBusted) {
    var tx = playerCar ? playerCar.x : player.x;
    var tz = playerCar ? playerCar.z : player.z;
    var tSpeed = playerCar ? Math.abs(playerCar.speed) : 0;

    // desired force scales with wanted level
    var wantCars = wanted >= 1 ? Math.min(wanted, 4) : 0;
    while (VH.police.cars.length < wantCars) {
      var a = Math.random() * Math.PI * 2;
      VH.spawnPoliceCar(scene, tx + Math.cos(a) * 90, tz + Math.sin(a) * 90);
    }
    while (VH.police.cars.length > wantCars) {
      var gone = VH.police.cars.pop();
      scene.remove(gone.mesh);
    }
    var wantOfficers = wanted >= 1 ? Math.min(wanted, 3) : 0;
    while (VH.police.officers.length < wantOfficers) {
      var a2 = Math.random() * Math.PI * 2;
      VH.spawnOfficer(scene, tx + Math.cos(a2) * 40, tz + Math.sin(a2) * 40);
    }
    while (VH.police.officers.length > wantOfficers) {
      var go = VH.police.officers.pop();
      scene.remove(go.mesh);
    }

    // patrol cars: steer toward the player, gentle rate-limited rams
    VH.police.cars.forEach(function (c) {
      var targetHeading = Math.atan2(tx - c.x, tz - c.z);
      c.heading = VH.angleLerp(c.heading, targetHeading, Math.min(1, dt * 1.4));
      c.speed = VH.lerp(c.speed, 30, Math.min(1, dt * 1.2));
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      var d = VH.dist2d(c.x, c.z, tx, tz);
      if (d < 5.5 && time - c.lastRam > 1.2) {
        c.lastRam = time;
        // gentle nudge, never a speed drain every frame
        if (playerCar) {
          playerCar.speed *= 0.85;
          var push = 3;
          playerCar.x += Math.sin(c.heading) * push;
          playerCar.z += Math.cos(c.heading) * push;
        } else {
          onDamage(6);
        }
        VH.audio.crash();
      }
      // shooting at 3+ stars: slow, dodgeable damage
      if (wanted >= 3 && d < 45 && time - VH.police.lastShot > 2.2) {
        VH.police.lastShot = time;
        onDamage(4);
        VH.audio.gunshot();
      }
    });

    // foot officers walk toward the player; touching one on foot = busted
    VH.police.officers.forEach(function (o) {
      var targetHeading = Math.atan2(tx - o.x, tz - o.z);
      o.heading = VH.angleLerp(o.heading, targetHeading, Math.min(1, dt * 2));
      o.x += Math.sin(o.heading) * 4.5 * dt;
      o.z += Math.cos(o.heading) * 4.5 * dt;
      o.mesh.position.set(o.x, 0, o.z);
      o.mesh.rotation.y = o.heading;
      if (!playerCar && VH.dist2d(o.x, o.z, player.x, player.z) < 1.8 && wanted > 0) onBusted();
    });

    // helicopter at 4+ stars, with its searchlight sweeping the player
    if (wanted >= 4) {
      var heli = VH.spawnHelicopter(scene);
      heli.x = VH.lerp(heli.x, tx + 12, Math.min(1, dt * 0.8));
      heli.z = VH.lerp(heli.z, tz + 12, Math.min(1, dt * 0.8));
      heli.mesh.position.set(heli.x, 55 + Math.sin(time * 0.7) * 2, heli.z);
      heli.rotor.rotation.y += dt * 22;
      heli.mesh.rotation.y = Math.atan2(tx - heli.x, tz - heli.z);
      heli.spot.target.position.set(tx - heli.x, -55, tz - heli.z);
      heli.spot.target.updateMatrixWorld();
    } else if (VH.police.heli) {
      scene.remove(VH.police.heli.mesh);
      VH.police.heli = null;
    }
    return tSpeed;
  };
})();
