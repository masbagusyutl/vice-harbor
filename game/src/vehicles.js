// Vice Harbor — vehicles: the car factory, the player's driving model and
// the traffic system. Traffic yields to the player's car instead of
// grinding it into buildings, and police rams are gentle and rate-limited.

window.VH = window.VH || {};
(function () {
  var VH = window.VH;
  var THREE = window.THREE;

  function wheel() {
    var w = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.5, 12),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 }));
    w.rotation.z = Math.PI / 2;
    w.castShadow = true;
    return w;
  }

  // Build a car from a type definition. Boats get a hull instead of wheels.
  VH.makeCar = function (scene, type, x, z, heading) {
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshStandardMaterial({
      color: type.color, roughness: 0.35, metalness: 0.55 });
    var glassMat = new THREE.MeshStandardMaterial({
      color: 0x182430, roughness: 0.1, metalness: 0.8 });
    var body, cabin;
    if (type.id === 'boat') {
      body = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 9), bodyMat);
      body.position.y = 1.0;
      cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 3), glassMat);
      cabin.position.set(0, 2.1, -1);
      g.add(body); g.add(cabin);
    } else {
      var long = type.id === 'hauler' || type.id === 'van';
      body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, long ? 6.4 : 4.6), bodyMat);
      body.position.y = 0.85;
      cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.85, long ? 2.4 : 2.2), glassMat);
      cabin.position.set(0, 1.7, long ? -0.6 : -0.2);
      g.add(body); g.add(cabin);
      if (type.id === 'hauler') {
        var bed = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.5, 2.6),
          new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 }));
        bed.position.set(0, 1.5, 1.6); g.add(bed);
      }
      // headlights: warm emissive lamps
      var lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffedb0, emissiveIntensity: 1.6 });
      [-0.8, 0.8].forEach(function (lx) {
        var lamp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.15), lampMat);
        lamp.position.set(lx, 0.9, long ? 3.25 : 2.35);
        g.add(lamp);
      });
      [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.5], [1.0, -1.5]].forEach(function (p) {
        var w = wheel();
        w.position.set(p[0], 0.55, p[1]);
        g.add(w);
      });
    }
    if (type.id === 'police') {
      var barMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 });
      var bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.5), barMat);
      bar.position.set(0, 2.35, -0.2); g.add(bar);
      var bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 2 }));
      bar2.position.set(0, 2.35, 0.35); g.add(bar2);
    }
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    g.position.set(x, 0, z);
    g.rotation.y = heading || 0;
    scene.add(g);
    return { type: type, mesh: g, speed: 0, heading: heading || 0, x: x, z: z,
      steer: 0, health: 100, isPlayer: false, isTraffic: false, isPolice: false,
      routeDir: 0, turnAt: 0, lastRam: 0 };
  };

  // Player driving: arcade model, gentle and forgiving.
  VH.driveCar = function (car, input, dt, boost) {
    var t = car.type;
    var top = t.top * (boost || 1);
    if (input.forward) car.speed += t.accel * dt;
    else if (input.back) car.speed -= t.accel * 0.8 * dt;
    else car.speed *= Math.max(0, 1 - 1.6 * dt);
    car.speed = VH.clamp(car.speed, -top * 0.45, top);
    if (Math.abs(car.speed) > 0.5) {
      var steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      car.steer = VH.lerp(car.steer, steerTarget, Math.min(1, dt * 6));
      car.heading += car.steer * t.grip * 0.55 * dt * (car.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(car.speed) / 8);
    }
    var dx = Math.sin(car.heading) * car.speed * dt;
    var dz = Math.cos(car.heading) * car.speed * dt;
    car.x += dx; car.z += dz;
    // keep the car inside the drivable city (boats use the water instead)
    if (t.id !== 'boat') {
      car.x = VH.clamp(car.x, -455, 455);
      car.z = VH.clamp(car.z, -455, 455);
    }
    car.mesh.position.set(car.x, t.id === 'boat' ? 0.15 : 0, car.z);
    car.mesh.rotation.y = car.heading;
    return car.speed;
  };

  // --- traffic: cars cruise the road grid, turn at intersections, and yield
  // to the player's car rather than shoving it. ---
  VH.spawnTraffic = function (scene, count) {
    var rng = VH.makeRng(9911);
    var cars = [];
    for (var i = 0; i < count; i++) {
      var type = VH.pick(rng, VH.CAR_TYPES);
      var along = VH.pick(rng, [-400, -300, -200, -100, 0, 100, 200, 300, 400]);
      var cross = VH.rand(rng, -400, 400);
      var horiz = rng() < 0.5;
      var c = VH.makeCar(scene, type, horiz ? cross : along, horiz ? along : cross, horiz ? Math.PI / 2 : 0);
      c.isTraffic = true;
      c.speed = VH.rand(rng, 6, 10);
      c.routeDir = horiz ? 1 : 0; // 0 = along z, 1 = along x
      cars.push(c);
    }
    return cars;
  };

  VH.updateTraffic = function (cars, playerCar, dt, time) {
    cars.forEach(function (c) {
      if (!c.isTraffic) return;
      // yield: slow down when the player's car is ahead and close
      var slow = false;
      if (playerCar) {
        var d = VH.dist2d(c.x, c.z, playerCar.x, playerCar.z);
        if (d < 16) {
          var ahead = (Math.sin(c.heading) * (playerCar.x - c.x) + Math.cos(c.heading) * (playerCar.z - c.z)) > 0;
          if (ahead) slow = true;
        }
      }
      var target = slow ? 0 : 8;
      c.speed = VH.lerp(c.speed, target, Math.min(1, dt * 1.5));
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      // at an intersection, sometimes turn
      var nearX = Math.abs(c.x - VH.nearestRoad(c.x)) < 2;
      var nearZ = Math.abs(c.z - VH.nearestRoad(c.z)) < 2;
      if (nearX && nearZ && c.turnAt < time) {
        c.turnAt = time + 3 + Math.random() * 4;
        if (Math.random() < 0.45) {
          c.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
          c.routeDir = 1 - c.routeDir;
        }
      }
      // wrap around the city edge instead of leaving
      if (c.x > 460) c.x = -460; if (c.x < -460) c.x = 460;
      if (c.z > 460) c.z = -460; if (c.z < -460) c.z = 460;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
    });
  };
})();
