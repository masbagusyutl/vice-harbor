// Vice Harbor — story missions.
// Three chained jobs, each with a glowing 3D beacon in the world, a
// minimap blip and a HUD objective line. Finish one to unlock the
// next; timed jobs can fail and be retried with T.

import * as THREE from 'three';
import { MISSIONS } from './config.js';
import { addWanted } from './police.js';

const MARKER_SPOTS = {
  meet: (G) => G.city.marina,
  delivery: (G) => G.city.delivery,
  getaway: (G) => G.city.hideout,
};

function makeBeacon(G, x, z) {
  const group = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 17;
  group.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.22, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  group.add(ring);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color: 0xffe27a }),
  );
  gem.position.y = 4.5;
  group.add(gem);
  group.userData.gem = gem;
  group.position.set(x, 0, z);
  G.scene.add(group);
  return group;
}

export function startMission(G, index) {
  const def = MISSIONS[index];
  if (!def) return;
  clearBeacon(G);
  const spot = MARKER_SPOTS[def.id](G);
  G.mission = {
    def,
    index,
    state: 'active',
    timeLeft: def.timeLimit,
    x: spot.x,
    z: spot.z,
    beacon: makeBeacon(G, spot.x, spot.z),
  };
  G.missionIndex = index;
  if (def.id === 'getaway') {
    G.wanted = 3;
    G.lastCrimeAt = G.time;
    G.lastSeenAt = G.time;
    if (G.audio) G.audio.siren(true);
    if (G.hud) G.hud.toast('3 stars! Reach the hideout — lose the cops or outrun them.');
  } else if (G.hud) {
    G.hud.toast(`Mission: ${def.title} — $${def.reward}`);
  }
  if (G.hud) G.hud.setObjective(`${def.title} — $${def.reward}`);
}

export function clearBeacon(G) {
  if (G.mission && G.mission.beacon) {
    G.scene.remove(G.mission.beacon);
    G.mission.beacon = null;
  }
}

export function completeMission(G) {
  const m = G.mission;
  if (!m) return;
  G.cash += m.def.reward;
  G.missionsDone += 1;
  if (G.audio) G.audio.ding();
  if (G.hud) {
    G.hud.toast(`Mission complete! +$${m.def.reward} — ${m.def.title}`);
    G.hud.setObjective('Mission complete! Press T for the next job.');
  }
  clearBeacon(G);
  G.mission = null;
  G.saveGame();
  // The next job starts a few seconds later.
  G.nextMissionAt = G.time + 3;
}

export function failMission(G, why) {
  const m = G.mission;
  if (!m) return;
  if (G.hud) {
    G.hud.toast(`Mission failed — ${why}. Press T to retry.`);
    G.hud.setObjective(`Mission failed. Press T to retry: ${m.def.title}`);
  }
  clearBeacon(G);
  G.mission = null;
}

export function updateMissions(G, dt) {
  // Auto-start the next job after a breather.
  if (!G.mission && G.nextMissionAt && G.time >= G.nextMissionAt) {
    G.nextMissionAt = 0;
    if (G.missionIndex + 1 < MISSIONS.length) startMission(G, G.missionIndex + 1);
    else if (G.hud) G.hud.setObjective('All jobs done — Vice Harbor is yours. Free roam!');
  }
  const m = G.mission;
  if (!m || m.state !== 'active') return;
  // Animate the beacon.
  if (m.beacon) {
    m.beacon.userData.gem.position.y = 4.5 + Math.sin(G.time * 2.5) * 0.7;
    m.beacon.userData.gem.rotation.y += dt * 2;
    m.beacon.rotation.y += dt * 0.6;
  }
  // Timed jobs.
  if (m.def.timeLimit > 0) {
    m.timeLeft -= dt;
    if (m.timeLeft <= 0) {
      failMission(G, 'time ran out');
      return;
    }
  }
  // Reached the marker?
  const p = G.playerPos();
  const d = Math.hypot(p.x - m.x, p.z - m.z);
  if (d < 7) completeMission(G);
}

export function missionObjectiveText(G) {
  const m = G.mission;
  if (m) {
    const timer = m.def.timeLimit > 0 ? ` — ${Math.ceil(m.timeLeft)}s left` : '';
    return `${m.def.title}${timer}`;
  }
  if (G.missionIndex + 1 < MISSIONS.length) return 'Press T to start the next job';
  if (G.missionsDone >= MISSIONS.length) return 'All jobs done — free roam!';
  return 'Press T to start the first job';
}
