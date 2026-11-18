// Vice Harbor — the neon coastal city: low-poly blocks, roads, palms, beach, neon.
// All geometry is generated in code. No external assets.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

const roadCoords = () => {
  const out = [];
  for (let i = -3; i <= 3; i++) out.push(i * CITY.pitch);
  return out;
};

// Circle (x,z,r) vs axis-aligned building box collision.
export function collideCircle(pos, radius, colliders) {
  for (const b of colliders) {
    const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
    const cz = Math.max(b.z0, Math.min(pos.z, b.z1));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pl = pos.x - b.x0, pr = b.x1 - pos.x, pt = pos.z - b.z0, pb = b.z1 - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = b.x0 - radius;
        else if (m === pr) pos.x = b.x1 + radius;
        else if (m === pt) pos.z = b.z0 - radius;
        else pos.z = b.z1 + radius;
      }
    }
  }
}

export function buildCity(scene, rng) {
  const group = new THREE.Group();
  group.name = 'ViceHarborCity';
  const colliders = [];
  const roads = roadCoords();
  const ext = CITY.extent;
  const neonMats = [];

  // --- ground: asphalt base, sand strip, water plane ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ext * 2 + 120, ext * 2 + 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.asphalt }),
  );
  ground.name = 'ground';
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(10, 0, 0);
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(60, ext * 2 + 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.name = 'sand';
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CITY.beachX + 18, 0.02, 0);
  group.add(sand);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(120, ext * 2 + 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.water }),
  );
  water.name = 'water';
  water.rotation.x = -Math.PI / 2;
  water.position.set(CITY.waterX + 40, 0.05, 0);
  group.add(water);

  // --- road markings: centre dashes, instanced for speed ---
  const dashGeo = new THREE.BoxGeometry(0.5, 0.06, 3);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8c8 });
  const dashCount = roads.length * 2 * Math.ceil((ext * 2) / 8);
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  dashes.name = 'dashes';
  {
    const m = new THREE.Matrix4();
    let k = 0;
    for (const r of roads) {
      for (let s = -ext; s < ext; s += 8) {
        m.makeTranslation(r, 0.05, s + 2);
        dashes.setMatrixAt(k++, m);
        m.makeTranslation(s + 2, 0.05, r);
        // rotate the second set 90 degrees
        const rot = new THREE.Matrix4().makeRotationY(Math.PI / 2);
        const t = new THREE.Matrix4().makeTranslation(s + 2, 0.05, r);
        dashes.setMatrixAt(k++, t.multiply(rot));
      }
    }
    dashes.count = k;
  }
  group.add(dashes);

  // --- sidewalks: light strips along every road edge ---
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  for (const r of roads) {
    for (const off of [-CITY.roadHalf - 1.6, CITY.roadHalf + 1.6]) {
      const stripH = new THREE.Mesh(new THREE.BoxGeometry(ext * 2, 0.12, 3.2), walkMat);
      stripH.position.set(0, 0.06, r + off);
      group.add(stripH);
      const stripV = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, ext * 2), walkMat);
      stripV.position.set(r + off, 0.06, 0);
      group.add(stripV);
    }
  }

  // --- buildings: one or two per block, varied heights, lit windows, neon signs ---
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const winGeo = new THREE.BoxGeometry(1.6, 1.1, 0.15);
  const winMeshes = [];
  const neonSignGeo = new THREE.BoxGeometry(6, 1.1, 0.5);
  let buildingCount = 0;
  for (let bi = -3; bi <= 2; bi++) {
    for (let bj = -3; bj <= 2; bj++) {
      const cx = bi * CITY.pitch + CITY.pitch / 2;
      const cz = bj * CITY.pitch + CITY.pitch / 2;
      // A few blocks stay open: plazas and a park with palms.
      if (rng.chance(0.14)) continue;
      const downtown = Math.abs(bi) <= 1 && Math.abs(bj) <= 1;
      const n = rng.chance(0.45) ? 2 : 1;
      for (let q = 0; q < n; q++) {
        const w = rng.range(12, 20);
        const d = rng.range(12, 20);
        const h = downtown ? rng.range(22, 48) : rng.range(8, 26);
        const ox = n === 2 ? (q === 0 ? -11 : 11) : 0;
        const oz = n === 2 ? (q === 0 ? -11 : 11) : 0;
        const bx = cx + ox;
        const bz = cz + oz;
        const color = rng.pick(PALETTE.building);
        const mat = new THREE.MeshLambertMaterial({ color });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.name = 'building';
        b.position.set(bx, h / 2, bz);
        group.add(b);
        // Roof rim, lighter than the walls.
        const rim = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.8, 0.6, d + 0.8),
          new THREE.MeshLambertMaterial({ color: 0x2c2f3d }),
        );
        rim.position.set(bx, h + 0.3, bz);
        group.add(rim);
        colliders.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2 });
        buildingCount++;
        // Lit windows on the street-facing sides.
        const rows = Math.max(1, Math.floor(h / 4));
        const cols = Math.max(2, Math.floor(w / 4));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (!rng.chance(0.45)) continue;
            const win = new THREE.Mesh(winGeo, windowMat);
            win.name = 'window';
            win.position.set(bx - w / 2 + 2 + c * 4, 3 + r * 4, bz + d / 2 + 0.1);
            group.add(win);
            winMeshes.push(win);
          }
        }
        // Neon sign on some buildings, facing the nearest road.
        if (rng.chance(0.5)) {
          const neon = rng.pick(PALETTE.neon);
          const nm = new THREE.MeshBasicMaterial({ color: neon });
          const sign = new THREE.Mesh(neonSignGeo, nm);
          sign.name = 'neon';
          sign.position.set(bx, Math.min(h - 1.5, 7), bz + d / 2 + 0.4);
          group.add(sign);
          neonMats.push({ mat: nm, base: new THREE.Color(neon) });
        }
      }
    }
  }

  // --- streetlights along every road, instanced poles + glowing heads ---
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30313a });
  const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poleSpots = [];
  for (const r of roads) {
    for (let s = -ext + 10; s < ext; s += 29) {
      poleSpots.push([r + CITY.roadHalf + 3.4, s]);
      poleSpots.push([r - CITY.roadHalf - 3.4, s + 14]);
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, poleSpots.length);
  poles.name = 'poles';
  const heads = new THREE.InstancedMesh(headGeo, headMat, poleSpots.length);
  heads.name = 'heads';
  {
    const m = new THREE.Matrix4();
    poleSpots.forEach(([x, z], i) => {
      m.makeTranslation(x, 3, z);
      poles.setMatrixAt(i, m);
      m.makeTranslation(x, 6.1, z);
      heads.setMatrixAt(i, m);
    });
  }
  group.add(poles);
  group.add(heads);

  // --- palm trees: boardwalk row + park clusters, instanced trunks and crowns ---
  const palmSpots = [];
  for (let z = -ext; z < ext; z += 14) palmSpots.push([CITY.beachX - 6, z + rng.range(-3, 3)]);
  for (let i = 0; i < 46; i++) {
    palmSpots.push([rng.range(-ext, CITY.beachX - 20), rng.range(-ext, ext)]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.5, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6e5232 });
  const crownGeo = new THREE.ConeGeometry(2.7, 1.5, 7);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  trunks.name = 'trunks';
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  crowns.name = 'crowns';
  {
    const m = new THREE.Matrix4();
    palmSpots.forEach(([x, z], i) => {
      m.makeTranslation(x, 2.75, z);
      trunks.setMatrixAt(i, m);
      m.makeTranslation(x, 6.0, z);
      crowns.setMatrixAt(i, m);
    });
  }
  group.add(trunks);
  group.add(crowns);

  // --- boardwalk planks along the beach ---
  const boardMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(10, 0.25, ext * 2), boardMat);
  board.name = 'boardwalk';
  board.position.set(CITY.beachX - 12, 0.12, 0);
  group.add(board);

  // --- key places (world markers the missions use) ---
  const marina = { x: CITY.beachX - 14, z: 40 };
  const motel = { x: -29, z: -87 };
  const safehouse = { x: -168, z: 130 };
  const spawn = { x: 0, z: 0 };

  scene.add(group);

  return {
    group,
    colliders,
    roads,
    extent: ext,
    buildingCount,
    marina,
    motel,
    safehouse,
    spawn,
    // Pulse the neon signs so the city feels alive at dusk.
    update(t) {
      for (let i = 0; i < neonMats.length; i++) {
        const s = 0.6 + 0.4 * Math.sin(t * 2.2 + i * 1.7);
        neonMats[i].mat.color.copy(neonMats[i].base).multiplyScalar(s);
      }
    },
  };
}
