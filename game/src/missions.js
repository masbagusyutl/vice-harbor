// Vice Harbor — three chained story missions with world markers and cash rewards.
import * as THREE from 'three';
import { MISSIONS } from './config.js';

function makeBeacon(color) {
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 14, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  cyl.position.y = 7;
  g.add(cyl);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.18, 8, 32),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  g.add(ring);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  core.position.y = 1.2;
  g.add(core);
  g.userData.cyl = cyl;
  g.userData.ring = ring;
  return g;
}

export function createMissions(scene, city) {
  const beacon = makeBeacon(0xffe14d);
  beacon.visible = false;
  scene.add(beacon);

  const places = {
    marina: city.marina,
    motel: city.motel,
    safehouse: city.safehouse,
  };

  let index = 0; // which mission is active
  let stage = 'go'; // go | done
  let timer = 0;
  let timerRunning = false;
  let completed = false;
  let message = '';
  let messageTimer = 0;

  function currentDef() { return MISSIONS[index] || null; }

  function targetPos() {
    if (index === 0) return places.marina;
    if (index === 1) return places.motel;
    if (index === 2) return places.safehouse;
    return null;
  }

  function startMission(i) {
    index = i;
    stage = 'go';
    timer = 0;
    timerRunning = false;
    beacon.visible = true;
    const p = targetPos();
    if (p) beacon.position.set(p.x, 0, p.z);
  }

  function objectiveText() {
    if (completed) return 'All missions complete — free roam. Keep the city yours.';
    const def = currentDef();
    if (!def) return '';
    if (index === 1 && timerRunning) return `${def.title} — ${Math.max(0, Math.ceil(def.timeLimit - timer))}s left`;
    return `${def.title} — ${def.text}`;
  }

  // state: { player: {x,z}, wanted, onReward(amount, text), onHeat() }
  function update(dt, t, state) {
    if (messageTimer > 0) messageTimer -= dt;
    if (completed) { beacon.visible = false; return; }
    const def = currentDef();
    if (!def) return;
    const target = targetPos();
    if (!target) return;
    const d = Math.hypot(state.player.x - target.x, state.player.z - target.z);

    // Mission 2 starts the heat the moment it begins.
    if (index === 2 && !state.heatStarted) {
      state.heatStarted = true;
      state.onHeat();
    }
    // Mission 1's clock starts when the player leaves Rico's side.
    if (index === 1 && !timerRunning && d > 6) {
      timerRunning = true;
      timer = 0;
    }
    if (timerRunning) {
      timer += dt;
      if (timer >= def.timeLimit) {
        // Out of time: back to the marina to try again.
        timerRunning = false;
        timer = 0;
        message = 'Too slow — the package is stale. Head back to Rico and try again.';
        messageTimer = 5;
        index = 0;
        startMission(0);
        return;
      }
    }
    // Beacon pulse.
    beacon.userData.cyl.material.opacity = 0.25 + 0.15 * Math.sin(t * 3);
    beacon.userData.ring.scale.setScalar(1 + 0.15 * Math.sin(t * 3));

    if (d < 5) {
      if (index === 2) {
        // Getaway: must also be clean before the payout lands.
        if (state.wanted === 0) {
          state.onReward(def.reward, `${def.title} complete — $${def.reward}`);
          advance();
        } else {
          message = 'You are at the safehouse — stay out of sight until the stars clear.';
          messageTimer = 2;
        }
        return;
      }
      state.onReward(def.reward, `${def.title} complete — $${def.reward}`);
      advance();
    }
  }

  function advance() {
    index += 1;
    if (index >= MISSIONS.length) {
      completed = true;
      beacon.visible = false;
      return;
    }
    startMission(index);
  }

  function reset(saveIndex) {
    completed = false;
    index = saveIndex || 0;
    if (index >= MISSIONS.length) { completed = true; beacon.visible = false; return; }
    startMission(index);
  }

  return {
    get index() { return index; },
    get completed() { return completed; },
    get timerRunning() { return timerRunning; },
    get timeLeft() {
      const def = currentDef();
      return def && def.timeLimit ? Math.max(0, def.timeLimit - timer) : 0;
    },
    targetPos,
    objectiveText,
    update,
    reset,
    startMission,
    get flashMessage() { return messageTimer > 0 ? message : ''; },
  };
}
