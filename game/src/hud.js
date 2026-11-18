// Vice Harbor — HUD and minimap.
// DOM readouts (health, cash, wanted stars, objective, speed) plus a
// live top-down minimap drawn on a 2D canvas: roads, the sea, the
// player arrow, cars, police and the mission marker.

import { MISSIONS } from './config.js';
import { missionObjectiveText } from './missions.js';

export function initHUD() {
  const $ = (id) => document.getElementById(id);
  return {
    root: $('hud'),
    healthFill: $('health-fill'),
    healthText: $('health-text'),
    cashText: $('cash-text'),
    stars: $('stars'),
    objective: $('objective'),
    speedText: $('speed-text'),
    toastEl: $('toast'),
    minimap: $('minimap'),
    damageFlash: $('damage-flash'),
    crosshair: $('crosshair'),
    toastTimer: 0,
    toastQueue: [],
    toast(msg) {
      this.toastQueue.push(msg);
    },
    setObjective(text) {
      this.objective.textContent = text;
    },
    flashDamage() {
      this.damageFlash.style.opacity = '0.55';
      setTimeout(() => { this.damageFlash.style.opacity = '0'; }, 140);
    },
  };
}

export function updateHUD(G, dt) {
  const h = G.hud;
  if (!h) return;
  const hp = Math.max(0, Math.round(G.player.health));
  h.healthFill.style.width = `${hp}%`;
  h.healthFill.style.background = hp > 50 ? '#4be36b' : hp > 25 ? '#ffb13e' : '#ff3e3e';
  h.healthText.textContent = `${hp}`;
  h.cashText.textContent = `$${G.cash}`;
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '☆';
  h.stars.textContent = stars;
  h.stars.style.color = G.wanted > 0 ? '#ffd23e' : '#ffffff';
  const speed = G.player.car ? Math.abs(Math.round(G.player.car.speed * 3.6)) : 0;
  h.speedText.textContent = G.player.car ? `${speed} km/h — ${G.player.car.type.label}` : '';
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
  h.crosshair.style.display = (!G.player.car && G.state === 'playing') ? 'block' : 'none';
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
  // Player arrow.
  const [px, py] = toMap(G.player.mesh.position.x, G.player.mesh.position.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.PI - G.player.heading);
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
