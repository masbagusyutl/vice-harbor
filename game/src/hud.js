// Vice Harbor v2.1 — HUD and minimap.
// v2.1: rewritten under the new sealed recording; same HUD as v2.
// DOM readouts (health, cash, wanted stars, objective, speed, current
// district, race standings) plus a live top-down minimap drawn on a
// 2D canvas: roads, the sea, turf colours, the player arrow, cars,
// police, the mission marker, race gates and Harbor Reels. Also the
// dialogue box, the choice prompt, the JOB COMPLETE screen and the
// pause screen's stats (respect rank, % complete, lifetime stats,
// turf list, crew list).

import { MISSIONS, DISTRICTS, districtAt, respectRank } from './config.js';
import { missionObjectiveText } from './missions.js';
import { completionPercent } from './progression.js';

export function initHUD() {
  const $ = (id) => document.getElementById(id);
  const hud = {
    root: $('hud'),
    healthFill: $('health-fill'),
    healthText: $('health-text'),
    cashText: $('cash-text'),
    stars: $('stars'),
    objective: $('objective'),
    speedText: $('speed-text'),
    districtText: $('district-text'),
    raceText: $('race-text'),
    toastEl: $('toast'),
    minimap: $('minimap'),
    damageFlash: $('damage-flash'),
    crosshair: $('crosshair'),
    dialogueBox: $('dialogue'),
    dialogueName: $('dialogue-name'),
    dialogueText: $('dialogue-text'),
    choiceBox: $('choice-box'),
    choiceText: $('choice-text'),
    jobComplete: $('job-complete'),
    jobCompleteBody: $('job-complete-body'),
    toastTimer: 0,
    toastQueue: [],
    dialogueQueue: [],
    dialogueTimer: 0,
    toast(msg) {
      this.toastQueue.push(msg);
    },
    setObjective(text) {
      this.objective.textContent = text;
    },
    setRace(text) {
      if (this.raceText) this.raceText.textContent = text;
    },
    flashDamage() {
      this.damageFlash.style.opacity = '0.55';
      setTimeout(() => { this.damageFlash.style.opacity = '0'; }, 140);
    },
    showDialogue(lines) {
      // Queue lines: each shows for ~3.5 s in the dialogue box.
      for (const [name, text] of lines) this.dialogueQueue.push({ name, text });
    },
    showChoice(prompt) {
      if (!this.choiceBox) return;
      this.choiceText.textContent = prompt;
      this.choiceBox.style.display = 'block';
    },
    hideChoice() {
      if (this.choiceBox) this.choiceBox.style.display = 'none';
    },
    showJobComplete(data) {
      if (!this.jobComplete) return;
      const lines = [
        `<div class="jc-title">JOB COMPLETE — ${data.title}</div>`,
        `<div class="jc-row">Payout: <b>+$${data.reward}</b></div>`,
        `<div class="jc-row">Time: ${data.time}s &nbsp;·&nbsp; Damage taken: ${data.damage}</div>`,
      ];
      if (data.choice) lines.push(`<div class="jc-row">Choice: ${data.choice}</div>`);
      if (data.finale) {
        lines.push(`<div class="jc-row">FINALE — ${data.variant === 'boat' ? 'the water route' : 'the loud route'}: Vice Harbor is yours.</div>`);
      }
      this.jobCompleteBody.innerHTML = lines.join('');
      this.jobComplete.style.display = 'flex';
      setTimeout(() => { this.jobComplete.style.display = 'none'; }, 6000);
    },
  };
  return hud;
}

export function updateHUD(G, dt) {
  const h = G.hud;
  if (!h) return;
  const hp = Math.max(0, Math.round(G.player.health));
  h.healthFill.style.width = `${hp}%`;
  h.healthFill.style.background = hp > 50 ? '#4be36b' : hp > 25 ? '#ffb13e' : '#ff3e3e';
  h.healthText.textContent = `${hp} / ${G.stats ? G.stats.maxHealth : 100}`;
  h.cashText.textContent = `$${G.cash}`;
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '☆';
  h.stars.textContent = stars;
  h.stars.style.color = G.wanted > 0 ? '#ffd23e' : '#ffffff';
  const speed = G.player.car ? Math.abs(Math.round(G.player.car.speed * 3.6))
    : G.player.boat ? Math.abs(Math.round(G.player.boat.speed * 3.6)) : 0;
  const vehicle = G.player.car ? G.player.car.type.label : G.player.boat ? G.player.boat.type.label : '';
  h.speedText.textContent = (G.player.car || G.player.boat) ? `${speed} km/h — ${vehicle}` : '';
  // Current district + respect rank.
  const p = G.playerPos();
  const d = districtAt(p.x, p.z);
  const owned = G.stats && G.stats.turfOwned.includes(d.id);
  const rank = G.stats ? respectRank(G.stats.respect).name : 'Rookie';
  if (h.districtText) {
    h.districtText.textContent = `${d.name}${owned ? ' ★ YOUR TURF' : ''} · ${rank}`;
  }
  h.objective.textContent = missionObjectiveText(G);
  // Toasts, one at a time.
  if (h.toastTimer > 0) {
    h.toastTimer -= dt;
  } else if (h.toastQueue.length > 0) {
    h.toastEl.textContent = h.toastQueue.shift();
    h.toastEl.style.opacity = '1';
    h.toastTimer = 3;
  } else {
    h.toastEl.style.opacity = '0';
  }
  // Dialogue lines, one at a time.
  if (h.dialogueTimer > 0) {
    h.dialogueTimer -= dt;
    if (h.dialogueTimer <= 0 && h.dialogueBox) h.dialogueBox.style.display = 'none';
  } else if (h.dialogueQueue.length > 0) {
    const line = h.dialogueQueue.shift();
    if (h.dialogueBox && h.dialogueName && h.dialogueText) {
      h.dialogueName.textContent = line.name;
      h.dialogueText.textContent = line.text;
      h.dialogueBox.style.display = 'block';
    }
    h.dialogueTimer = 3.5;
  }
  h.crosshair.style.display = (!G.player.car && !G.player.boat && G.state === 'playing') ? 'block' : 'none';
  drawMinimap(G);
}

function drawMinimap(G) {
  const canvas = G.hud.minimap;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const B = G.city.bounds + 60;
  const toMap = (x, z) => [((x + B) / (B * 2)) * S, ((z + B) / (B * 2)) * S];
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, S, S);
  // Sea and sand at the south edge.
  const [, seaY] = toMap(0, G.city.beachZ - 30);
  ctx.fillStyle = '#0d4a63';
  ctx.fillRect(0, 0, S, Math.max(0, seaY));
  ctx.fillStyle = '#c9a06b';
  const [, sandY] = toMap(0, G.city.beachZ);
  ctx.fillRect(0, seaY, S, Math.max(0, sandY - seaY));
  // Owned turf tint over its district rectangle.
  if (G.stats) {
    for (const d of DISTRICTS) {
      if (!G.stats.turfOwned.includes(d.id)) continue;
      const [x0, y0] = toMap(d.x0, d.z0);
      const [x1, y1] = toMap(d.x1, d.z1);
      ctx.fillStyle = 'rgba(75, 227, 107, 0.35)';
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
  // Roads.
  ctx.strokeStyle = '#5a606e';
  ctx.lineWidth = 3;
  for (const x of G.city.roadXs) {
    const [mx] = toMap(x, 0);
    ctx.beginPath();
    ctx.moveTo(mx, 0);
    ctx.lineTo(mx, S);
    ctx.stroke();
  }
  for (const z of G.city.roadZs) {
    const [, mz] = toMap(0, z);
    ctx.beginPath();
    ctx.moveTo(0, mz);
    ctx.lineTo(S, mz);
    ctx.stroke();
  }
  // Harbor Reels not yet found.
  ctx.fillStyle = '#00e5ff';
  for (const r of G.reels || []) {
    if (r.found) continue;
    const [mx, my] = toMap(r.x, r.z);
    ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
  }
  // Mission marker.
  if (G.mission) {
    const [mx, my] = toMap(G.mission.x, G.mission.z);
    const pulse = 5 + Math.sin(G.time * 4) * 2;
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.moveTo(mx, my - pulse);
    ctx.lineTo(mx + pulse, my);
    ctx.lineTo(mx, my + pulse);
    ctx.lineTo(mx - pulse, my);
    ctx.closePath();
    ctx.fill();
  }
  // Race gate.
  if (G.race) {
    const cp = G.race.def.checkpoints[G.race.checkpoint];
    const [mx, my] = toMap(cp.x, cp.z);
    ctx.fillStyle = '#7bff5e';
    ctx.beginPath();
    ctx.arc(mx, my, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Taxi fare marker.
  if (G.fare) {
    const t = G.fare.stage === 'pickup' ? { x: G.fare.pickX, z: G.fare.pickZ } : { x: G.fare.dropX, z: G.fare.dropZ };
    const [mx, my] = toMap(t.x, t.z);
    ctx.fillStyle = '#ffc300';
    ctx.beginPath();
    ctx.arc(mx, my, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Traffic cars.
  ctx.fillStyle = '#e8e8e8';
  for (const car of G.traffic) {
    if (!car.traffic) continue;
    const [mx, my] = toMap(car.mesh.position.x, car.mesh.position.z);
    ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
  }
  // Police (flashing).
  ctx.fillStyle = Math.floor(G.time * 4) % 2 === 0 ? '#ff4040' : '#4080ff';
  for (const car of G.policeCars) {
    const [mx, my] = toMap(car.mesh.position.x, car.mesh.position.z);
    ctx.beginPath();
    ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const cop of G.footCops) {
    const [mx, my] = toMap(cop.mesh.position.x, cop.mesh.position.z);
    ctx.fillRect(mx - 2, my - 2, 4, 4);
  }
  // Player arrow (boat or car or on foot).
  const pp = G.playerPos();
  const [px, py] = toMap(pp.x, pp.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.PI - (G.player.car ? G.player.car.heading : G.player.boat ? G.player.boat.heading : G.player.heading));
  ctx.fillStyle = '#4be36b';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Border.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, S - 2, S - 2);
}

// Fill the pause screen with the full career picture. Called when the
// game is paused (and by the stats screenshot staging).
export function fillPauseStats(G) {
  const el = document.getElementById('pause-stats');
  if (!el || !G.stats) return;
  const s = G.stats;
  const rank = respectRank(s.respect);
  const turfNames = s.turfOwned.length
    ? s.turfOwned.map((id) => DISTRICTS.find((d) => d.id === id)?.name || id).join(', ')
    : 'none yet — finish jobs to claim turf';
  const crewNames = s.crew.length ? s.crew.join(', ') : 'none yet — hire from this screen';
  const hours = Math.floor(s.timePlayed / 3600);
  const mins = Math.floor((s.timePlayed % 3600) / 60);
  el.innerHTML = [
    `<div class="ps-big">${completionPercent(G)}% COMPLETE</div>`,
    `<div class="ps-row">Respect: <b>${s.respect}</b> — ${rank.name} (next: ${rank.at >= 1000 ? 'max rank' : 'keep earning'})</div>`,
    `<div class="ps-row">Jobs: ${s.jobsDone}/7 &nbsp;·&nbsp; Races won: ${s.racesWon} &nbsp;·&nbsp; Fares: ${s.faresDone} ($${s.faresEarned})</div>`,
    `<div class="ps-row">Harbor Reels: ${s.reelsFound}/24 &nbsp;·&nbsp; Cops escaped: ${s.copsEscaped}</div>`,
    `<div class="ps-row">Distance driven: ${(s.distanceDriven / 1000).toFixed(1)} km &nbsp;·&nbsp; Time played: ${hours}h ${mins}m</div>`,
    `<div class="ps-row">Turf owned (${s.turfOwned.length}/10): ${turfNames}</div>`,
    `<div class="ps-row">Crew: ${crewNames}</div>`,
    `<div class="ps-row">Gear: ${s.hasPistol ? 'Heavy Pistol ✓' : 'Heavy Pistol — $250 at Iron & Ink'} · ${s.hasArmor ? 'Body Armor ✓' : 'Body Armor — $200 at Iron & Ink'}</div>`,
  ].join('');
}
