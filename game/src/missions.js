// Vice Harbor v2.1 — story missions.
// v2.1: rewritten under the new sealed recording; the 7-job chain,
// both branching choices and the finale variants are unchanged.
// Seven chained jobs, each with a glowing 3D beacon in the world, a
// minimap blip, dialogue in a dialogue box, and a JOB COMPLETE
// screen with payout and stats. Two jobs offer a real choice (keys
// 1/2) that changes the payout, the heat, and the finale. Finishing
// a job captures its district as turf and brings a crew companion.

import * as THREE from 'three';
import { MISSIONS } from './config.js';
import { addWanted } from './police.js';
import { captureTurf, addRespect, applyPayout, spawnCrewCompanion } from './progression.js';

const MARKER_SPOTS = {
  meet: (G) => G.city.marina,
  delivery: (G) => G.city.delivery,
  shakedown: (G) => G.city.coral,
  escort: (G) => G.city.heights,
  theft: (G) => G.city.docks,
  chase: (G) => G.city.strip,
  finale: (G) => G.city.neon,
};

function makeBeacon(G, x, z, color = 0xffd23e) {
  const group = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 17;
  group.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.22, 8, 24),
    new THREE.MeshBasicMaterial({ color }),
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
    timeStarted: G.time,
    x: spot.x,
    z: spot.z,
    beacon: makeBeacon(G, spot.x, spot.z),
    choiceMade: null,
  };
  G.missionIndex = index;
  if (def.startStars) {
    G.wanted = def.startStars;
    G.lastCrimeAt = G.time;
    G.lastSeenAt = G.time;
    if (G.audio) G.audio.siren(true);
  }
  if (def.dialogue && G.hud && G.hud.showDialogue) {
    G.hud.showDialogue(def.dialogue);
  }
  if (def.choice && G.hud && G.hud.showChoice) {
    G.hud.showChoice(def.choice.prompt);
    G.mission.awaitingChoice = true;
  }
  if (G.hud) {
    G.hud.toast(`Job: ${def.title} — $${def.reward}${def.timeLimit ? ` — ${def.timeLimit}s` : ''}`);
    G.hud.setObjective(`${def.title} — $${def.reward}`);
  }
  spawnCrewCompanion(G);
}

// The player picks option 1 or 2 for a choice job.
export function makeChoice(G, key) {
  const m = G.mission;
  if (!m || !m.awaitingChoice || !m.def.choice) return false;
  const opt = m.def.choice.options.find((o) => o.key === key);
  if (!opt) return false;
  m.awaitingChoice = false;
  m.choiceMade = opt;
  if (G.hud && G.hud.hideChoice) G.hud.hideChoice();
  if (opt.stars) addWanted(G, opt.stars, 'choice made');
  if (G.hud) G.hud.toast(opt.note);
  // The dock-heist choice changes the finale and unlocks the boat race.
  if (m.def.id === 'theft') {
    if (opt.key === '1') {
      G.stats.boatUnlocked = true;
      G.stats.finaleVariant = 'boat';
    } else {
      G.stats.finaleVariant = 'truck';
    }
  }
  G.stats.choices.push({ job: m.def.id, picked: opt.label });
  return true;
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
  const elapsed = Math.round(G.time - m.timeStarted);
  let reward = applyPayout(G, m.def.reward);
  if (m.choiceMade) reward += m.choiceMade.bonus;
  G.cash += reward;
  G.missionsDone += 1;
  G.stats.jobsDone += 1;
  addRespect(G, 50);
  captureTurf(G, m.x, m.z);
  if (m.def.finale) {
    const variant = G.stats.finaleVariant === 'boat'
      ? 'You came in by water — the harbor is yours, sea and streets.'
      : 'You came in loud — the harbor is yours, every street of it.';
    if (G.hud) G.hud.toast(variant);
  }
  if (G.audio) G.audio.ding();
  if (G.hud) {
    G.hud.setObjective('Job complete! Press T for the next job.');
    if (G.hud.showJobComplete) {
      G.hud.showJobComplete({
        title: m.def.title,
        reward,
        time: elapsed,
        damage: Math.max(0, 100 - Math.round(G.player.health)),
        choice: m.choiceMade ? m.choiceMade.label : null,
        finale: !!m.def.finale,
        variant: m.def.finale ? G.stats.finaleVariant : null,
      });
    }
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
    G.hud.toast(`Job failed — ${why}. Press T to retry.`);
    G.hud.setObjective(`Job failed. Press T to retry: ${m.def.title}`);
    if (G.hud.hideChoice) G.hud.hideChoice();
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
    const choice = m.awaitingChoice ? ' — press 1 or 2 to choose' : '';
    return `${m.def.title}${timer}${choice}`;
  }
  if (G.missionIndex + 1 < MISSIONS.length) return 'Press T to start the next job';
  if (G.missionsDone >= MISSIONS.length) return 'All jobs done — free roam!';
  return 'Press T to start the first job';
}
