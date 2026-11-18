// Vice Harbor — HUD: health bar, cash, wanted stars, objective line, and a live
// top-down minimap drawn on a 2D canvas. Menus are DOM overlays in index.html.
import { CITY } from './config.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const healthFill = el('health-fill');
  const healthText = el('health-text');
  const cashText = el('cash');
  const starsEl = el('stars');
  const objectiveEl = el('objective');
  const timerEl = el('timer');
  const speedEl = el('speed');
  const carEl = el('car-name');
  const flashEl = el('flash');
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');

  let flashTimer = 0;

  function showFlash(text, seconds) {
    flashEl.textContent = text;
    flashEl.style.opacity = '1';
    flashTimer = seconds || 3;
  }

  function drawMinimap(game) {
    const W = minimap.width;
    const H = minimap.height;
    const ext = CITY.extent + 40;
    const toMap = (x, z) => [W / 2 + (x / ext) * (W / 2), H / 2 + (z / ext) * (H / 2)];
    mctx.fillStyle = '#101018';
    mctx.fillRect(0, 0, W, H);
    // Beach + water on the east edge.
    const [bx] = toMap(CITY.beachX, 0);
    mctx.fillStyle = '#c9a86a';
    mctx.fillRect(bx, 0, W - bx, H);
    mctx.fillStyle = '#1d6f8e';
    const [wx] = toMap(CITY.waterX, 0);
    mctx.fillRect(wx, 0, W - wx, H);
    // Roads.
    mctx.strokeStyle = '#4a4b55';
    mctx.lineWidth = 4;
    for (const r of game.city.roads) {
      const [x1, y1] = toMap(r, -ext);
      const [x2, y2] = toMap(r, ext);
      mctx.beginPath(); mctx.moveTo(x1, y1); mctx.lineTo(x2, y2); mctx.stroke();
      const [x3, y3] = toMap(-ext, r);
      const [x4, y4] = toMap(ext, r);
      mctx.beginPath(); mctx.moveTo(x3, y3); mctx.lineTo(x4, y4); mctx.stroke();
    }
    // Buildings.
    mctx.fillStyle = '#6a6f85';
    for (const b of game.city.colliders) {
      const [x1, y1] = toMap(b.x0, b.z0);
      const [x2, y2] = toMap(b.x1, b.z1);
      mctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    }
    // Mission marker.
    const target = game.missions.targetPos();
    if (target && !game.missions.completed) {
      const [mx, my] = toMap(target.x, target.z);
      mctx.fillStyle = '#ffe14d';
      mctx.beginPath();
      mctx.arc(mx, my, 5, 0, Math.PI * 2);
      mctx.fill();
      mctx.strokeStyle = '#ffe14d';
      mctx.beginPath();
      mctx.arc(mx, my, 9 + 2 * Math.sin(game.time * 4), 0, Math.PI * 2);
      mctx.stroke();
    }
    // Traffic dots, police dots, player arrow.
    mctx.fillStyle = '#9fb3d8';
    for (const c of game.traffic.cars) {
      const [cx, cy] = toMap(c.x, c.z);
      mctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    mctx.fillStyle = '#ff2e2e';
    for (const c of game.police.policeCars) {
      const [cx, cy] = toMap(c.x, c.z);
      mctx.beginPath(); mctx.arc(cx, cy, 3, 0, Math.PI * 2); mctx.fill();
    }
    const [px, py] = toMap(game.player.x, game.player.z);
    mctx.save();
    mctx.translate(px, py);
    mctx.rotate(Math.atan2(Math.sin(game.player.heading), Math.cos(game.player.heading)) + Math.PI);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(-5, 6); mctx.closePath();
    mctx.fill();
    mctx.restore();
  }

  function update(game, dt) {
    const hp = Math.max(0, Math.round(game.player.health));
    healthFill.style.width = `${hp}%`;
    healthFill.style.background = hp > 50 ? '#4caf50' : hp > 25 ? '#ff9800' : '#f44336';
    healthText.textContent = `${hp}`;
    cashText.textContent = `$${game.player.cash.toLocaleString('en-US')}`;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < game.wanted ? '★' : '☆';
    starsEl.textContent = stars;
    starsEl.style.color = game.wanted > 0 ? '#ff5252' : '#8b93a3';
    objectiveEl.textContent = game.missions.objectiveText();
    const tl = game.missions.timeLeft;
    timerEl.textContent = game.missions.timerRunning ? `⏱ ${Math.ceil(tl)}s` : '';
    speedEl.textContent = game.player.car
      ? `${Math.round(Math.abs(game.player.car.speed) * 3.6)} km/h`
      : '';
    carEl.textContent = game.player.car ? game.player.car.def.name : 'On foot';
    if (flashTimer > 0) {
      flashTimer -= dt;
      if (flashTimer <= 0) flashEl.style.opacity = '0';
    }
    drawMinimap(game);
  }

  return { update, showFlash };
}
