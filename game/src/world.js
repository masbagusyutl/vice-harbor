// Vice Harbor — the city itself. Builds the whole Three.js scene from the
// seeded data: ground and roads, ten districts of buildings, palms,
// streetlights, neon signs, the beach, the marina and the open water.
// Also owns the day-night cycle and the small mesh factories (cars, people,
// boats, beacons) the game logic uses. No gameplay rules live here.

import { DISTRICTS, WORLD } from './data.js';
import { makeSeededRandom, range, pickFrom, hashSeed } from './rng.js';

export function groundTexture(THREE, seed) {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d');
  const half = WORLD.halfSize;
  const toPx = (v) => ((v + half) / (half * 2)) * S;

  // Base: warm concrete.
  g.fillStyle = '#8a8f7a';
  g.fillRect(0, 0, S, S);
  // Beach strip along the south edge, then the water beyond it.
  g.fillStyle = '#e8d5a3';
  g.fillRect(0, toPx(-380), S, toPx(-300) - toPx(-380));
  g.fillStyle = '#1e6f8e';
  g.fillRect(0, 0, S, toPx(-380));

  // District tints, faint so the roads still read.
  const rand = makeSeededRandom(seed);
  for (const d of DISTRICTS) {
    g.fillStyle = '#' + d.color.toString(16).padStart(6, '0');
    g.globalAlpha = 0.16;
    g.fillRect(toPx(d.x0), toPx(d.z0), toPx(d.x1) - toPx(d.x0), toPx(d.z1) - toPx(d.z0));
  }
  g.globalAlpha = 1;

  // Roads: the grid lines, every block step.
  const roadPx = (WORLD.road / (half * 2)) * S;
  g.fillStyle = '#2e2e33';
  for (let k = -5; k <= 5; k += 1) {
    const c = k * WORLD.block;
    g.fillRect(toPx(c) - roadPx / 2, 0, roadPx, S);
    g.fillRect(0, toPx(c) - roadPx / 2, S, roadPx);
  }
  // Center dashes.
  g.fillStyle = '#e8e8c8';
  for (let k = -5; k <= 5; k += 1) {
    const c = k * WORLD.block;
    for (let t = -half; t < half; t += 26) {
      g.fillRect(toPx(t), toPx(c) - 1.5, 12, 3);
      g.fillRect(toPx(c) - 1.5, toPx(t), 3, 12);
    }
  }
  // Sidewalk edging around each block.
  g.strokeStyle = 'rgba(240,240,220,0.5)';
  g.lineWidth = 3;
  for (let ix = -5; ix < 5; ix += 1) {
    for (let iz = -5; iz < 5; iz += 1) {
      const x0 = ix * WORLD.block + WORLD.road / 2;
      const z0 = iz * WORLD.block + WORLD.road / 2;
      g.strokeRect(toPx(x0), toPx(z0), toPx(x0 + WORLD.block - WORLD.road) - toPx(x0), toPx(z0 + WORLD.block - WORLD.road) - toPx(z0));
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function windowTexture(THREE, baseColor, lit) {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 64, 128);
  const rand = makeSeededRandom(hashSeed(baseColor + (lit ? 'lit' : 'dim')));
  for (let y = 8; y < 120; y += 16) {
    for (let x = 8; x < 56; x += 14) {
      const on = rand() < (lit ? 0.55 : 0.18);
      g.fillStyle = on ? '#ffd97a' : '#20242e';
      g.fillRect(x, y, 9, 11);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture(text, color) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 96;
  const g = cv.getContext('2d');
  g.fillStyle = '#101018';
  g.fillRect(0, 0, 512, 96);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.strokeRect(4, 4, 504, 88);
  g.fillStyle = color;
  g.font = 'bold 52px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(THREE, seed) {
  const rand = makeSeededRandom(seed);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2a4a);
  scene.fog = new THREE.Fog(0x1a2a4a, 320, 900);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a2f22, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
  sun.position.set(180, 260, 120);
  scene.add(sun);
  const moon = new THREE.DirectionalLight(0x8fb0ff, 0.5);
  moon.position.set(-160, 220, -140);
  scene.add(moon);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.halfSize * 2 + 200, WORLD.halfSize * 2 + 200),
    new THREE.MeshLambertMaterial({ map: groundTexture(THREE, seed) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -40);
  scene.add(ground);

  // Open water, south of the beach.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 260),
    new THREE.MeshPhongMaterial({ color: 0x146b8a, shininess: 120, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.4, -480);
  scene.add(water);

  const colliders = [];
  const buildings = [];
  const winTexCache = new Map();
  const texFor = (hex, lit) => {
    const key = hex + (lit ? '1' : '0');
    if (!winTexCache.has(key)) winTexCache.set(key, windowTexture(THREE, hex, lit));
    return winTexCache.get(key);
  };
  const matCache = new Map();
  const matFor = (hex) => {
    if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshLambertMaterial({ map: texFor(hex, true) }));
    return matCache.get(hex);
  };

  // Buildings: one per block, skipped on water, the beach and the
  // marina dock. Heights and palettes follow the district.
  for (let ix = -5; ix < 5; ix += 1) {
    for (let iz = -5; iz < 5; iz += 1) {
      const cx = ix * WORLD.block + WORLD.block / 2;
      const cz = iz * WORLD.block + WORLD.block / 2;
      if (cz < -280) continue; // beach and water
      if (cx < -260 && cz < -220) continue; // marina yard stays open
      const d = DISTRICTS.find((dd) => cx >= dd.x0 && cx < dd.x1 && cz >= dd.z0 && cz < dd.z1) || DISTRICTS[0];
      const dRand = makeSeededRandom(hashSeed(d.id + ix + ':' + iz));
      const w = range(dRand, 18, 30);
      const dep = range(dRand, 18, 30);
      const h = range(dRand, 12, d.id === 'heights' ? 64 : d.id === 'neon' ? 44 : 30);
      const bx = cx;
      const bz = cz;
      const shade = '#' + new THREE.Color(d.color).multiplyScalar(range(dRand, 0.55, 1.05)).getHexString();
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, dep),
        matFor(shade),
      );
      mesh.position.set(bx, h / 2, bz);
      scene.add(mesh);
      buildings.push(mesh);
      colliders.push({ x0: bx - w / 2, z0: bz - dep / 2, x1: bx + w / 2, z1: bz + dep / 2 });
      // Rooftop box on tall towers.
      if (h > 40) {
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(6, 5, 6),
          new THREE.MeshLambertMaterial({ color: 0x222222 }),
        );
        roof.position.set(bx + w / 4, h + 2.5, bz);
        scene.add(roof);
      }
    }
  }

  // Palm trees along the beach, the boardwalk and inland — two instanced
  // meshes (trunks, crowns) instead of hundreds of individual meshes.
  const palmSpots = [];
  for (let i = 0; i < 90; i += 1) {
    // On the sand between the boardwalk road and the water, clear of the road.
    palmSpots.push([-370 + i * 8.4 + range(rand, -2, 2), -308 + range(rand, -4, 6), range(rand, -0.12, 0.12)]);
  }
  for (let i = 0; i < 40; i += 1) {
    const px = range(rand, -360, 360);
    const pz = range(rand, -260, 360);
    if (Math.abs(px % WORLD.block) < 12 || Math.abs(pz % WORLD.block) < 12) continue;
    palmSpots.push([px, pz, 0]);
  }
  {
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 9, 6);
    const crownGeo = new THREE.ConeGeometry(4.2, 5, 7);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a5230 }), palmSpots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0x2e7d32 }), palmSpots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    palmSpots.forEach(([px, pz, tilt], i) => {
      eul.set(0, 0, tilt);
      q.setFromEuler(eul);
      m4.compose(new THREE.Vector3(px, 4.5, pz), q, one);
      trunks.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(px, 11, pz), q, one);
      crowns.setMatrixAt(i, m4);
    });
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    scene.add(trunks);
    scene.add(crowns);
  }

  // Streetlights at road corners — instanced poles and lamps.
  const lampSpots = [];
  for (let k = -5; k <= 5; k += 1) {
    for (let m = -5; m <= 5; m += 1) {
      if ((k + m) % 2 !== 0) continue;
      const x = k * WORLD.block + 10;
      const z = m * WORLD.block + 10;
      if (z < -280) continue;
      lampSpots.push([x, z]);
    }
  }
  {
    const poleGeo = new THREE.CylinderGeometry(0.25, 0.35, 9, 6);
    const lampGeo = new THREE.SphereGeometry(0.9, 8, 6);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x30343a }), lampSpots.length);
    const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), lampSpots.length);
    const m4 = new THREE.Matrix4();
    const one = new THREE.Vector3(1, 1, 1);
    const noRot = new THREE.Quaternion();
    lampSpots.forEach(([x, z], i) => {
      m4.compose(new THREE.Vector3(x, 4.5, z), noRot, one);
      poles.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(x, 9.2, z), noRot, one);
      lamps.setMatrixAt(i, m4);
    });
    poles.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    scene.add(poles);
    scene.add(lamps);
  }
  const lampPositions = lampSpots;

  // District signs on posts at district corners.
  for (const d of DISTRICTS) {
    const tex = signTexture(d.sign, d.signColor);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: false }),
    );
    sign.position.set((d.x0 + d.x1) / 2, 12, d.z0 + 4);
    scene.add(sign);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 12, 6), new THREE.MeshLambertMaterial({ color: 0x30343a }));
    post.position.set((d.x0 + d.x1) / 2, 6, d.z0 + 4);
    scene.add(post);
  }

  // Marina: wooden docks and moored boats over the water.
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x8b5e34 });
  for (let i = 0; i < 4; i += 1) {
    const dock = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 60), dockMat);
    dock.position.set(-300 + i * 34, 0.8, -350);
    scene.add(dock);
  }

  // Harbor cranes at Dockside.
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd9a441 });
  for (let i = 0; i < 3; i += 1) {
    const cx = 220 + i * 70;
    const cz = -300;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(6, 42, 6), craneMat);
    leg.position.set(cx, 21, cz);
    scene.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(46, 3, 3), craneMat);
    arm.position.set(cx + 16, 42, cz);
    scene.add(arm);
    colliders.push({ x0: cx - 3, z0: cz - 3, x1: cx + 3, z1: cz + 3 });
  }

  // Containers at Dockside.
  const contColors = [0xc0392b, 0x2471a3, 0x229954, 0xd4ac0d];
  for (let i = 0; i < 14; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(12, 5, 5),
      new THREE.MeshLambertMaterial({ color: pickFrom(rand, contColors) }),
    );
    const cx = range(rand, 180, 350);
    const cz = range(rand, -260, -210);
    mesh.position.set(cx, 2.5, cz);
    mesh.rotation.y = range(rand, -0.2, 0.2);
    scene.add(mesh);
    colliders.push({ x0: cx - 6, z0: cz - 3, x1: cx + 6, z1: cz + 3 });
  }

  // Day-night: t is 0..1 across a full day. Returns the lighting state so
  // the game can show the time on the HUD.
  function applyTimeOfDay(t) {
    const day = Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5; // 1 at noon
    const dusk = Math.exp(-Math.pow((t - 0.78) * 9, 2)) + Math.exp(-Math.pow((t - 0.22) * 9, 2));
    const sky = new THREE.Color().setHSL(0.6, 0.45, 0.12 + day * 0.42);
    sky.lerp(new THREE.Color(0xff7a33), Math.min(0.55, dusk * 0.55));
    scene.background.copy(sky);
    scene.fog.color.copy(sky);
    hemi.intensity = 0.55 + day * 0.75;
    sun.intensity = 0.25 + day * 2.1;
    sun.color.setHSL(0.09, 0.85, 0.55 + day * 0.15);
    const sunAngle = t * Math.PI * 2;
    sun.position.set(Math.cos(sunAngle) * 240, 120 + Math.sin(sunAngle) * 160, Math.sin(sunAngle) * 200 + 60);
    moon.intensity = 0.15 + (1 - day) * 0.55;
    water.material.color.setHSL(0.55, 0.6, 0.12 + day * 0.22);
    return { day, dusk, hour: Math.floor(((t * 24 + 6) % 24)) };
  }

  return { scene, colliders, applyTimeOfDay, water, lampPositions };
}

// --- Mesh factories -------------------------------------------------------

export function makeCarMesh(THREE, colorHex, kind) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color: colorHex, shininess: 90 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x111826, shininess: 140 });
  const bodyLen = kind === 'van' ? 5.6 : kind === 'pickup' ? 5.2 : kind === 'boat' ? 5.4 : 4.6;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.85, bodyLen), paint);
  body.position.y = 0.75;
  g.add(body);
  if (kind === 'boat') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, bodyLen + 0.6), new THREE.MeshPhongMaterial({ color: 0xf5f5f0, shininess: 60 }));
    hull.position.y = 0.45;
    g.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0x333333 }));
    mast.position.set(0, 2.2, 0.4);
    g.add(mast);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.7, kind === 'van' ? 3.4 : 2.2), glass);
    cabin.position.set(0, 1.45, kind === 'van' ? 0.2 : -0.2);
    g.add(cabin);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.95, -0.2);
    bar.name = 'lightbar';
    g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar2.position.set(0, 1.95, 0.35);
    bar2.name = 'lightbar2';
    g.add(bar2);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xffd60a }));
    sign.position.set(0, 1.95, -0.2);
    g.add(sign);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  if (kind !== 'boat') {
    for (const [wx, wz] of [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.5], [1.0, -1.5]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.42, wz);
      g.add(w);
      wheels.push(w);
    }
  }
  g.userData.wheels = wheels;
  return g;
}

export function makePersonMesh(THREE, shirtHex, skinHex) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: skinHex || 0xc68642 });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtHex || 0x3a7bd5 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.32), new THREE.MeshLambertMaterial({ color: 0x222831 }));
  legs.position.y = 0.42;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.36), shirt);
  torso.position.y = 1.2;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), skin);
  head.position.y = 1.85;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), shirt);
  cap.position.y = 1.88;
  g.add(cap);
  return g;
}

export function makeBeaconMesh(THREE, colorHex) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 1.6, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 13;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.4, 24),
    new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}

export function makeMedallionMesh(THREE) {
  const g = new THREE.Group();
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 0.18, 20),
    new THREE.MeshPhongMaterial({ color: 0xffd60a, emissive: 0x8a6d00, shininess: 160 }),
  );
  coin.rotation.x = Math.PI / 2;
  coin.position.y = 1.4;
  g.add(coin);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.18 }),
  );
  glow.position.y = 1.4;
  g.add(glow);
  g.userData.coin = coin;
  return g;
}
