// Vice Harbor — every screen the player sees: the HUD with its live
// minimap, the start / pause / wasted / busted screens, dialogue and choice
// boxes, job-complete cards, the gun shop and the save system. All DOM is
// plain elements styled by style.css; nothing here fetches anything.

window.VH = window.VH || {};
(function () {
  var VH = window.VH;

  var SAVE_KEY = 'vice-harbor-save-v4';

  VH.createUI = function (G) {
    var el = {};
    ['hud', 'healthFill', 'healthNum', 'cashNum', 'wantedStars', 'rankName',
     'objectiveText', 'clockText', 'speedText', 'carText', 'weaponText',
     'minimap', 'toast', 'flash', 'startScreen', 'pauseScreen', 'wastedScreen',
     'bustedScreen', 'dialogueBox', 'dialogueText', 'dialogueName',
     'choiceBox', 'choicePrompt', 'choiceA', 'choiceB',
     'completeScreen', 'completeTitle', 'completeBody',
     'raceScreen', 'raceTitle', 'raceBody', 'shopScreen', 'shopTitle',
     'shopBody', 'standings', 'jobList', 'raceList', 'crewList',
     'statsGrid', 'completeBar', 'completePct', 'saveNote'
    ].forEach(function (id) { el[id] = document.getElementById(id); });

    var ctx = el.minimap.getContext('2d');
    var dialogueCb = null, dialogueLines = [], dialogueIdx = 0;
    var choiceCb = null;
    var toastTimer = null;

    function stars(n) {
      var s = '';
      for (var i = 0; i < 5; i++) s += i < n ? '★' : '☆';
      return s;
    }

    function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

    var ui = {
      // ---------- HUD ----------
      setHUD: function (h) {
        el.healthFill.style.width = Math.max(0, Math.min(100, h.health)) + '%';
        el.healthNum.textContent = Math.round(h.health);
        el.cashNum.textContent = money(h.cash);
        el.wantedStars.textContent = stars(h.wanted);
        el.wantedStars.className = 'stars w' + h.wanted;
        el.rankName.textContent = h.rank;
        el.objectiveText.textContent = h.objective;
        el.clockText.textContent = h.clock;
        el.speedText.textContent = h.inCar ? Math.round(Math.abs(h.speed) * 2.2) + ' km/h' : '';
        el.carText.textContent = h.inCar ? h.carName : 'On foot';
        el.weaponText.textContent = h.weapon + (h.armor > 0 ? ' • Armor ' + Math.round(h.armor) : '');
        if (h.standings) {
          el.standings.style.display = 'block';
          var html = '<b>RACE STANDINGS</b>';
          h.standings.forEach(function (s, i) {
            html += '<div class="' + (s.you ? 'you' : '') + '">' + (i + 1) + '. ' + s.name + '</div>';
          });
          el.standings.innerHTML = html;
        } else {
          el.standings.style.display = 'none';
        }
      },

      // ---------- minimap ----------
      drawMinimap: function (view) {
        var W = el.minimap.width, H = el.minimap.height;
        var scale = W / 1000;
        function mx(x) { return (x + 500) * scale; }
        function mz(z) { return (z + 500) * scale; }
        ctx.clearRect(0, 0, W, H);
        // water
        ctx.fillStyle = '#16405e';
        ctx.fillRect(mx(440), 0, W - mx(440), H);
        // districts
        VH.DISTRICTS.forEach(function (d, i) {
          var owned = view.turf.indexOf(i) !== -1;
          ctx.fillStyle = '#' + d.palette.toString(16).padStart(6, '0');
          ctx.globalAlpha = owned ? 0.95 : 0.55;
          ctx.fillRect(mx(d.cx - 100), mz(d.cz - 100), 200 * scale, 200 * scale);
          if (owned) {
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#ffd24d';
            ctx.lineWidth = 2;
            ctx.strokeRect(mx(d.cx - 100), mz(d.cz - 100), 200 * scale, 200 * scale);
          }
          ctx.globalAlpha = 1;
        });
        // roads
        ctx.strokeStyle = 'rgba(220,220,220,0.5)';
        ctx.lineWidth = 1;
        for (var i = -4; i <= 4; i++) {
          ctx.beginPath(); ctx.moveTo(mx(i * 100), 0); ctx.lineTo(mx(i * 100), H); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, mz(i * 100)); ctx.lineTo(W, mz(i * 100)); ctx.stroke();
        }
        // collectibles still hidden
        ctx.fillStyle = '#ffd24d';
        VH.COLLECTIBLES.forEach(function (c) {
          if (view.found.indexOf(c.id) !== -1) return;
          ctx.beginPath(); ctx.arc(mx(c.x), mz(c.z), 2, 0, Math.PI * 2); ctx.fill();
        });
        // traffic + police dots
        ctx.fillStyle = '#ffffff';
        (view.traffic || []).forEach(function (t) {
          ctx.fillRect(mx(t.x) - 1.5, mz(t.z) - 1.5, 3, 3);
        });
        ctx.fillStyle = '#5aa8ff';
        (view.police || []).forEach(function (t) {
          ctx.beginPath(); ctx.arc(mx(t.x), mz(t.z), 3, 0, Math.PI * 2); ctx.fill();
        });
        // mission marker
        if (view.markerOn) {
          var pulse = 4 + Math.sin(view.time * 5) * 1.5;
          ctx.fillStyle = '#ffe14d';
          ctx.beginPath(); ctx.arc(mx(view.markerX), mz(view.markerZ), pulse, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(mx(view.markerX), mz(view.markerZ), pulse + 4, 0, Math.PI * 2); ctx.stroke();
        }
        // player arrow, always centred on the map edge-safe
        var px = mx(view.x), pz = mz(view.z);
        ctx.save();
        ctx.translate(px, pz);
        ctx.rotate(view.heading);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#111111'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
        // north tick + district label of where the player stands
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = 'bold 10px Arial, sans-serif';
        ctx.fillText('N', 6, 12);
        ctx.fillText(view.districtName || '', 6, H - 6);
      },

      // ---------- toast + damage flash ----------
      toast: function (msg) {
        el.toast.textContent = msg;
        el.toast.style.opacity = '1';
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.toast.style.opacity = '0'; }, 3600);
      },

      flashDamage: function () {
        el.flash.style.opacity = '0.45';
        setTimeout(function () { el.flash.style.opacity = '0'; }, 160);
      },

      // ---------- screens ----------
      show: function (name) {
        ['startScreen', 'pauseScreen', 'wastedScreen', 'bustedScreen',
         'completeScreen', 'raceScreen', 'shopScreen'].forEach(function (k) {
          el[k].style.display = 'none';
        });
        if (name === 'hud') { el.hud.style.display = 'block'; return; }
        if (name) el[name].style.display = 'flex';
        if (name === 'startScreen' || name === 'pauseScreen') el.hud.style.display = 'none';
      },

      hideAllScreens: function () {
        ['startScreen', 'pauseScreen', 'wastedScreen', 'bustedScreen',
         'completeScreen', 'raceScreen', 'shopScreen'].forEach(function (k) {
          el[k].style.display = 'none';
        });
        el.hud.style.display = 'block';
      },

      // ---------- dialogue ----------
      dialogue: function (lines, cb) {
        dialogueLines = lines.slice();
        dialogueIdx = 0;
        dialogueCb = cb || null;
        el.dialogueBox.style.display = 'block';
        showDialogueLine();
      },

      advanceDialogue: function () {
        dialogueIdx++;
        if (dialogueIdx >= dialogueLines.length) {
          el.dialogueBox.style.display = 'none';
          var cb = dialogueCb; dialogueCb = null;
          if (cb) cb();
        } else {
          showDialogueLine();
        }
      },

      dialogueOpen: function () { return el.dialogueBox.style.display === 'block'; },

      // ---------- choice ----------
      choice: function (prompt, a, b, cb) {
        choiceCb = cb;
        el.choicePrompt.textContent = prompt;
        el.choiceA.textContent = '1 — ' + a;
        el.choiceB.textContent = '2 — ' + b;
        el.choiceBox.style.display = 'block';
      },

      pickChoice: function (n) {
        if (!choiceCb) return;
        el.choiceBox.style.display = 'none';
        var cb = choiceCb; choiceCb = null;
        cb(n);
      },

      choiceOpen: function () { return el.choiceBox.style.display === 'block'; },

      // ---------- job / race complete ----------
      jobComplete: function (job, payout, st) {
        el.completeTitle.textContent = 'JOB COMPLETE — ' + job.title;
        el.completeBody.innerHTML =
          '<p>Payout <b>' + money(payout) + '</b> &nbsp;•&nbsp; Jobs done <b>' + st.jobsDone + '/7</b></p>' +
          '<p>Respect <b>' + st.respect + '</b> — rank <b>' + st.rank + '</b> &nbsp;•&nbsp; Turf owned <b>' + st.turf + '/10</b></p>' +
          '<p class="dim">Next job unlocks on the pause menu. Press E to keep playing.</p>';
        el.completeScreen.style.display = 'flex';
      },

      raceComplete: function (race, place, prize) {
        el.raceTitle.textContent = place === 1 ? 'YOU WIN — ' + race.name : 'RACE OVER — P' + place;
        el.raceBody.innerHTML =
          '<p>Finished <b>P' + place + '</b> of 4 &nbsp;•&nbsp; Prize <b>' + money(prize) + '</b></p>' +
          '<p class="dim">Press E to keep playing. The next race waits on the pause menu.</p>';
        el.raceScreen.style.display = 'flex';
      },

      // ---------- shop ----------
      shop: function (kind, cash, owned, onBuy, onClose) {
        el.shopTitle.textContent = kind === 'gun' ? 'HARBOUR ARMS — GUN SHOP' : 'DOCKSIDE RESPRAY';
        var html = '';
        if (kind === 'gun') {
          var items = [
            { id: 'pistol', name: 'Harbor Pistol', price: 300, desc: 'Reliable sidearm. Hits hard up close.' },
            { id: 'smg', name: 'Neon SMG', price: 800, desc: 'Fast fire. Melts police cars and officers.' },
            { id: 'armor', name: 'Kevlar Vest', price: 500, desc: '+50 armor. Soaks bullets before your health.' }
          ];
          items.forEach(function (it) {
            var has = owned.indexOf(it.id) !== -1;
            html += '<button class="shopItem" data-id="' + it.id + '" ' + (has || cash < it.price ? 'disabled' : '') + '>' +
              '<b>' + it.name + '</b> — ' + money(it.price) + '<br><span class="dim">' + it.desc +
              (has ? ' — OWNED' : '') + '</span></button>';
          });
          html += '<p class="dim">Your cash: ' + money(cash) + '. Higher respect unlocks better stock — the SMG needs rank Hustler.</p>';
        } else {
          html = '<p>A fresh coat of paint and a new plate. The law forgets your face.</p>' +
            '<button class="shopItem" data-id="respray" ' + (cash < 200 ? 'disabled' : '') + '><b>Respray — $200</b><br><span class="dim">Clears all wanted stars right now.</span></button>' +
            '<p class="dim">Your cash: ' + money(cash) + '.</p>';
        }
        html += '<button class="shopItem close" data-id="__close">Close</button>';
        el.shopBody.innerHTML = html;
        el.shopScreen.style.display = 'flex';
        el.shopBody.querySelectorAll('.shopItem').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            if (id === '__close') { el.shopScreen.style.display = 'none'; if (onClose) onClose(); return; }
            onBuy(id);
          });
        });
      },

      // ---------- pause menu contents ----------
      renderPause: function (data) {
        el.completeBar.style.width = data.completion + '%';
        el.completePct.textContent = data.completion + '% COMPLETE';
        var st = data.stats;
        el.statsGrid.innerHTML =
          '<div>Cash earned <b>' + money(st.cashEarned) + '</b></div>' +
          '<div>Jobs done <b>' + st.jobsDone + '/7</b></div>' +
          '<div>Races won <b>' + st.racesWon + '/3</b></div>' +
          '<div>Taxi fares <b>' + st.fares + '</b></div>' +
          '<div>Lanterns <b>' + data.found + '/24</b></div>' +
          '<div>Turf owned <b>' + data.turf + '/10</b></div>' +
          '<div>Crew <b>' + data.crew + '/3</b></div>' +
          '<div>Choices made <b>' + st.choices + '</b></div>' +
          '<div>Respect <b>' + st.respect + ' — ' + data.rank + '</b></div>' +
          '<div>Play time <b>' + data.playTime + '</b></div>';
        // crew hiring
        var ch = '';
        VH.CREW.forEach(function (c) {
          var hired = data.crewList.indexOf(c.id) !== -1;
          ch += '<button class="menuBtn" data-crew="' + c.id + '" ' + (hired || data.cash < c.cost ? 'disabled' : '') + '>' +
            c.name + ' — ' + c.role + ' (' + money(c.cost) + ')<br><span class="dim">' + c.bonus + (hired ? ' — HIRED' : '') + '</span></button>';
        });
        el.crewList.innerHTML = ch;
        el.crewList.querySelectorAll('[data-crew]').forEach(function (btn) {
          btn.addEventListener('click', function () { G.hireCrew(btn.getAttribute('data-crew')); });
        });
        // jobs
        var jh = '';
        VH.JOBS.forEach(function (j) {
          var done = j.id < data.nextJob;
          var locked = j.id > data.nextJob;
          jh += '<button class="menuBtn" data-job="' + j.id + '" ' + (done || locked ? 'disabled' : '') + '>' +
            'Job ' + j.id + ' — ' + j.title + (done ? ' — DONE' : locked ? ' — LOCKED' : ' — $' + j.payout) + '</button>';
        });
        el.jobList.innerHTML = jh;
        el.jobList.querySelectorAll('[data-job]').forEach(function (btn) {
          btn.addEventListener('click', function () { G.startJob(parseInt(btn.getAttribute('data-job'), 10)); });
        });
        // races
        var rh = '';
        VH.RACES.forEach(function (r) {
          rh += '<button class="menuBtn" data-race="' + r.id + '">Race — ' + r.name + ' ($' + r.prize + ')</button>';
        });
        el.raceList.innerHTML = rh;
        el.raceList.querySelectorAll('[data-race]').forEach(function (btn) {
          btn.addEventListener('click', function () { G.startRace(parseInt(btn.getAttribute('data-race'), 10)); });
        });
      },

      setSaveNote: function (txt) { el.saveNote.textContent = txt; }
    };

    function showDialogueLine() {
      var line = dialogueLines[dialogueIdx] || '';
      var m = line.match(/^([^:]+):\s*(.*)$/);
      if (m) { el.dialogueName.textContent = m[1]; el.dialogueText.textContent = m[2]; }
      else { el.dialogueName.textContent = ''; el.dialogueText.textContent = line; }
    }

    // Save / load live in the UI because they touch localStorage only.
    ui.saveExists = function () {
      try { return !!window.localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    };
    ui.writeSave = function (data) {
      try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; }
      catch (e) { return false; }
    };
    ui.readSave = function () {
      try {
        var raw = window.localStorage.getItem(SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    };
    ui.clearSave = function () {
      try { window.localStorage.removeItem(SAVE_KEY); } catch (e) {}
    };

    return ui;
  };
})();
