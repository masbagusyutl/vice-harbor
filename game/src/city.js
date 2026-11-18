// Vice Harbor — the neon coastal city.
// Builds the whole 3D world from code: road grid, city blocks with
// varied buildings and lit windows, neon signs, streetlights, palm
// trees, and a beach / boardwalk / sea edge. No external assets.
// Returns the road network, building colliders and key locations
// (marina, hideout, delivery tower, hospital) the missions use.

import * as THREE from 'three';
import { WORLD, PALETTE, pick, clamp } from './config.js';

function roadLines() {
  const lines = [];
  const half = ((WORLD.intersections - 1) / 2) * WORLD.spacing;
  for (let i = 0; i < WORLD.intersections; i++) lines.push(-half + i * WORLD.spacing);
  return lines;
}

// Push a circle out of every building AABB it overlaps. Returns true
// when a collision happened (used for crash feedback).
export function resolveCollision(pos, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const cx = clamp(pos.x, c.minX, c.maxX);
    const cz = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Dead centre inside a box: shove out along the smallest axis.
        const pushL = pos.x - c.minX + radius;
        const pushR = c.maxX - pos.x + radius;
        const pushB = pos.z - c.minZ + radius;
        const pushF = c.maxZ - pos.z + radius;
        const m = Math.min(pushL, pushR, pushB, pushF);
        if (m === pushL) pos.x = c.minX - radius;
        else if (m === pushR) pos.x = c.maxX + radius;
        else if (m === pushB) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  return hit;
}

export function buildCity(scene, rng) {
  const lines = roadLines();
  const B = WORLD.bounds;
  const city = {
    roadXs: lines,
    roadZs: lines,
    colliders: [],
    marina: { x: 150, z: -182 },
    hideout: { x: -168, z: -182 },
    delivery: { x: -150, z: 168 },
    hospital: { x: 168, z: 168 },
    bounds: B,
  };

  // --- sky, fog and dusk lighting -------------------------------------
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 90, 420);
  const hemi = new THREE.HemisphereLight(0xffb36b, 0x1a2340, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9a4d, 1.35);
  sun.position.set(-120, 90, -160);
  scene.add(sun);
  const moonFill = new THREE.DirectionalLight(0x7a86ff, 0.25);
  moonFill.position.set(80, 120, 140);
  scene.add(moonFill);

  // --- ground, roads, sidewalks ---------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(B * 2 + 320, B * 2 + 320),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, -40);
  scene.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  for (const x of lines) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadHalf * 2, B * 2), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.02, 0);
    scene.add(road);
    const roadZ = new THREE.Mesh(new THREE.PlaneGeometry(B * 2, WORLD.roadHalf * 2), roadMat);
    roadZ.rotation.x = -Math.PI / 2;
    roadZ.position.set(0, 0.02, x);
    scene.add(roadZ);
  }
  // Sidewalk slabs: one per block, slightly raised.
  for (let i = 0; i < lines.length - 1; i++) {
    for (let j = 0; j < lines.length - 1; j++) {
      const cx = (lines[i] + lines[i + 1]) / 2;
      const cz = (lines[j] + lines[j + 1]) / 2;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(WORLD.spacing - WORLD.roadHalf * 2 + 2, 0.3, WORLD.spacing - WORLD.roadHalf * 2 + 2),
        walkMat,
      );
      slab.position.set(cx, 0.12, cz);
      scene.add(slab);
    }
  }

  // --- road centre dashes (instanced) ---------------------------------
  const dashGeo = new THREE.BoxGeometry(0.5, 0.06, 3);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8c8 });
  const dashCount = lines.length * 2 * Math.floor((B * 2) / 8);
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  const m4 = new THREE.Matrix4();
  let di = 0;
  for (const x of lines) {
    for (let z = -B + 4; z < B; z += 8) {
      m4.makeTranslation(x, 0.06, z);
      dashes.setMatrixAt(di++, m4);
    }
  }
  for (const z of lines) {
    for (let x = -B + 4; x < B; x += 8) {
      m4.makeRotationY(Math.PI / 2);
      m4.setPosition(x, 0.06, z);
      dashes.setMatrixAt(di++, m4);
    }
  }
  dashes.count = di;
  scene.add(dashes);

  // --- buildings -------------------------------------------------------
  const windowGeo = new THREE.PlaneGeometry(1.1, 1.5);
  const windowMat = new THREE.MeshBasicMaterial({ color: PALETTE.windowLit });
  const windowSpots = [];
  const neonMat = (color) => new THREE.MeshBasicMaterial({ color });
  const buildingMats = PALETTE.building.map(
    (c) => new THREE.MeshLambertMaterial({ color: c }),
  );
  let neonCount = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    for (let j = 0; j < lines.length - 1; j++) {
      const bx = (lines[i] + lines[i + 1]) / 2;
      const bz = (lines[j] + lines[j + 1]) / 2;
      const blockSize = WORLD.spacing - WORLD.roadHalf * 2;
      // One or two towers per block, with a gap between them.
      const towers = rng() < 0.45 ? 2 : 1;
      for (let t = 0; t < towers; t++) {
        const w = blockSize * (towers === 1 ? 0.72 : 0.42);
        const d = blockSize * (towers === 1 ? 0.72 : 0.42);
        const h = 7 + Math.pow(rng(), 1.6) * 34;
        const ox = towers === 1 ? 0 : (t === 0 ? -blockSize * 0.22 : blockSize * 0.22);
        const oz = towers === 1 ? 0 : (t === 0 ? blockSize * 0.22 : -blockSize * 0.22);
        const x = bx + ox;
        const z = bz + oz;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          pick(rng, buildingMats),
        );
        mesh.position.set(x, 0.3 + h / 2, z);
        scene.add(mesh);
        city.colliders.push({
          minX: x - w / 2, maxX: x + w / 2,
          minZ: z - d / 2, maxZ: z + d / 2,
        });
        // Rooftop rim for the taller towers.
        if (h > 24) {
          const rim = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
            new THREE.MeshLambertMaterial({ color: 0x2a2f3a }),
          );
          rim.position.set(x, 0.3 + h + 0.25, z);
          scene.add(rim);
        }
        // Lit windows on the two street-facing sides.
        const floors = Math.floor(h / 3.2);
        const cols = Math.max(2, Math.floor(w / 3.4));
        for (let f = 0; f < floors; f++) {
          for (let c = 0; c < cols; c++) {
            if (rng() < 0.42) continue;
            const wy = 2.2 + f * 3.2;
            const wx = x - w / 2 + 1.8 + c * 3.4;
            windowSpots.push({ x: wx, y: wy, z: z + d / 2 + 0.06, ry: 0 });
            if (rng() < 0.5) {
              windowSpots.push({ x: x + w / 2 + 0.06, y: wy, z: bz + oz - d / 2 + 1.8 + c * 3.4, ry: Math.PI / 2 });
            }
          }
        }
        // A pulsing neon sign on some buildings.
        if (neonCount < 14 && rng() < 0.35) {
          const color = pick(rng, PALETTE.neon);
          const sign = new THREE.Mesh(
            new THREE.BoxGeometry(Math.min(9, w * 0.7), 0.9, 0.3),
            neonMat(color),
          );
          sign.position.set(x, 0.3 + h * 0.72, z + d / 2 + 0.2);
          sign.userData.neon = true;
          sign.userData.phase = rng() * 6.28;
          sign.userData.baseHex = color;
          scene.add(sign);
          city.neonSigns = city.neonSigns || [];
          city.neonSigns.push(sign);
          neonCount++;
        }
      }
    }
  }
  const windows = new THREE.InstancedMesh(windowGeo, windowMat, Math.max(1, windowSpots.length));
  windowSpots.forEach((s, idx) => {
    m4.makeRotationY(s.ry);
    m4.setPosition(s.x, s.y, s.z);
    windows.setMatrixAt(idx, m4);
  });
  windows.count = windowSpots.length;
  scene.add(windows);

  // --- streetlights (instanced) ---------------------------------------
  const lampPoleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.5, 5);
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x30343c });
  const lampHeadGeo = new THREE.BoxGeometry(1.4, 0.25, 0.5);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lampSpots = [];
  for (const x of lines) {
    for (const z of lines) {
      lampSpots.push({ x: x + 8.5, z: z + 8.5 });
      lampSpots.push({ x: x - 8.5, z: z - 8.5 });
    }
  }
  const poles = new THREE.InstancedMesh(lampPoleGeo, lampPoleMat, lampSpots.length);
  const heads = new THREE.InstancedMesh(lampHeadGeo, lampHeadMat, lampSpots.length);
  lampSpots.forEach((s, idx) => {
    m4.makeTranslation(s.x, 3.25, s.z);
    poles.setMatrixAt(idx, m4);
    m4.makeTranslation(s.x, 6.5, s.z);
    heads.setMatrixAt(idx, m4);
  });
  scene.add(poles);
  scene.add(heads);

  // --- palm trees along the boardwalk and plazas ----------------------
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 7, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
  const frondGeo = new THREE.ConeGeometry(2.6, 2.2, 6);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2e8a4a });
  const palmSpots = [];
  for (let x = -B + 14; x <= B - 14; x += 28) palmSpots.push({ x, z: -186, lean: (rng() - 0.5) * 0.3 });
  for (let i = 0; i < 22; i++) {
    palmSpots.push({
      x: -B + 20 + rng() * (B * 2 - 40),
      z: -B + 20 + rng() * (B * 2 - 40),
      lean: (rng() - 0.5) * 0.3,
    });
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  palmSpots.forEach((s, idx) => {
    e.set(s.lean, 0, s.lean * 0.6);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(s.x, 3.5, s.z), q, new THREE.Vector3(1, 1, 1));
    trunks.setMatrixAt(idx, m4);
    m4.compose(new THREE.Vector3(s.x, 7.6, s.z), q, new THREE.Vector3(1, 0.9, 1));
    fronds.setMatrixAt(idx, m4);
  });
  scene.add(trunks);
  scene.add(fronds);

  // --- beach, boardwalk and sea ---------------------------------------
  const boardwalk = new THREE.Mesh(
    new THREE.BoxGeometry(B * 2 + 40, 0.4, 10),
    new THREE.MeshLambertMaterial({ color: 0x8a6a45 }),
  );
  boardwalk.position.set(0, 0.2, -191);
  scene.add(boardwalk);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(B * 2 + 40, WORLD.sandDepth),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, WORLD.beachZ - WORLD.sandDepth / 2 - 5);
  scene.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(B * 2 + 120, WORLD.seaDepth),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea, emissive: 0x06283a }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, WORLD.beachZ - WORLD.sandDepth - WORLD.seaDepth / 2 - 5);
  scene.add(sea);

  // --- neon glow accents at the marina and hideout --------------------
  const glow = (x, z, color) => {
    const light = new THREE.PointLight(color, 60, 60, 1.8);
    light.position.set(x, 6, z);
    scene.add(light);
  };
  glow(city.marina.x, city.marina.z, 0xff2e88);
  glow(city.hideout.x, city.hideout.z, 0x00e5ff);
  glow(0, 0, 0xff7b2e);

  return city;
}
