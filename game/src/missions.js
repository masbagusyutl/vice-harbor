// Vice Harbor — missions: story jobs, street races, taxi fares, turf,
// crew and collectibles. One manager, driven every frame by the game loop
// through a small bridge object G the game supplies (player position, cash,
// wanted level, markers, dialogue and spawning). All story content here is
// original, written for this game.

window.VH = window.VH || {};
(function () {
  var VH = window.VH;

  // How close the player must be to count as "arrived" at a step target.
  var ARRIVE = 9;
  var COLLECT_R = 7;
  var CHECKPOINT_R = 13;
  var CHASE_HITS = 5;

  VH.createMissionManager = function (G) {
    var S = G.state; // the save state: stats, turf, crew, choices, cash
    var m = {
      job: null,        // { def, step, timer, kip, kipHits, lastRam, parked, done }
      race: null,       // { def, cp, rivals, finished, startTime }
      taxi: null,       // { phase, px, pz, dx, dz, rider }
      turfClock: 0,
      fareCooldown: 0
    };

    // ---------- helpers ----------

    function pos() { return G.pos(); }
    function inCar() { return G.inCar(); }

    function respectRankName() {
      var name = 'Nobody';
      VH.RESPECT_RANKS.forEach(function (r) {
        if (S.stats.respect >= r.at) name = r.name;
      });
      return name;
    }

    function crewHas(id) {
      return S.crew.indexOf(id) !== -1;
    }

    function wantedGain(n) {
      // Pip the lookout slows heat growth.
      if (crewHas('pip')) n = Math.max(0, Math.round(n * 0.75));
      G.addWanted(n);
    }

    function currentStep() {
      if (!m.job) return null;
      return m.job.def.steps[m.job.step] || null;
    }

    function describeStep(step) {
      return step ? step.text : '';
    }

    function setMarkerForStep(step) {
      if (!step) { G.setMarker(0, 0, false); return; }
      if (step.kind === 'chase' && m.job.kip) {
        G.setMarker(m.job.kip.x, m.job.kip.z, true);
      } else {
        G.setMarker(step.x, step.z, true);
      }
    }

    function advanceStep() {
      m.job.step++;
      var next = currentStep();
      if (!next) { finishJob(); return; }
      beginStep(next);
      G.setObjective(describeStep(next));
      setMarkerForStep(next);
    }

    function beginStep(step) {
      if (step.kind === 'steal') {
        // Park the mark's car at the step location so it can be taken.
        m.job.parked = G.spawnParkedCar('coupe', step.x, step.z);
        G.toast('That car is unlocked. Take it.');
      } else if (step.kind === 'chase') {
        m.job.kip = G.spawnChaseCar(step.x, step.z);
        m.job.kipHits = 0;
        m.job.lastRam = 0;
        G.toast("Kip Dalton is running! Ram his car until it stalls.");
      } else if (step.kind === 'boat') {
        G.ensureBoat();
        G.toast('Take the skiff out to the crates.');
      }
    }

    function finishJob() {
      var def = m.job.def;
      var choiceMade = m.job.choiceMade || null;
      m.job = null;
      G.setMarker(0, 0, false);
      G.setObjective('See Marisol Vega for the next job.');
      var payout = def.payout;
      if (choiceMade === 2 && def.choice) payout = def.choice.payout2;
      if (choiceMade === 1 && def.choice) payout = def.choice.payout1;
      G.addCash(payout);
      G.addRespect(def.respect);
      S.stats.jobsDone++;
      S.stats.cashEarned += payout;
      S.jobIndex = Math.max(S.jobIndex, def.id + 1);
      // Capturing turf: finishing a job takes its district for the crew.
      if (S.turf.indexOf(def.district) === -1) {
        S.turf.push(def.district);
        G.toast(VH.DISTRICTS[def.district].name + ' is yours now. Turf pays every minute.');
      }
      G.sfx('jobDone');
      G.jobComplete(def, payout, {
        jobsDone: S.stats.jobsDone,
        respect: S.stats.respect,
        rank: respectRankName(),
        turf: S.turf.length
      });
      G.saveGame();
    }

    // ---------- story jobs ----------

    m.startJob = function (id) {
      var def = null;
      VH.JOBS.forEach(function (j) { if (j.id === id) def = j; });
      if (!def) return false;
      if (m.job || m.race) { G.toast('Finish what you started first.'); return false; }
      m.job = { def: def, step: 0, timer: 0, kip: null, kipHits: 0, lastRam: 0, parked: null, choiceMade: null };
      G.setObjective(describeStep(def.steps[0]));
      G.dialogue(def.brief.slice(), function () {
        beginStep(def.steps[0]);
        setMarkerForStep(def.steps[0]);
      });
      return true;
    };

    m.abortJob = function () {
      if (!m.job) return;
      if (m.job.kip) G.removeCar(m.job.kip);
      m.job = null;
      G.setMarker(0, 0, false);
      G.setObjective('Free roam — start a job from the pause menu.');
    };

    m.updateJob = function (dt, time) {
      if (!m.job) return;
      var step = currentStep();
      if (!step) return;
      var p = pos();

      if (step.kind === 'chase' && m.job.kip) {
        var kip = m.job.kip;
        // Kip flees away from the player, weaving along the roads.
        var away = Math.atan2(kip.x - p.x, kip.z - p.z);
        kip.heading = VH.angleLerp(kip.heading, away + Math.sin(time * 0.7) * 0.35,
          Math.min(1, dt * 1.6));
        kip.speed = VH.lerp(kip.speed, 21, Math.min(1, dt));
        kip.x += Math.sin(kip.heading) * kip.speed * dt;
        kip.z += Math.cos(kip.heading) * kip.speed * dt;
        kip.x = VH.clamp(kip.x, -440, 440);
        kip.z = VH.clamp(kip.z, -440, 440);
        kip.mesh.position.set(kip.x, 0, kip.z);
        kip.mesh.rotation.y = kip.heading;
        G.setMarker(kip.x, kip.z, true);
        var d = VH.dist2d(p.x, p.z, kip.x, kip.z);
        if (inCar() && d < 6.5 && time - m.job.lastRam > 1.0) {
          m.job.lastRam = time;
          var hits = crewHas('brick') ? 2 : 1;
          m.job.kipHits += hits;
          G.sfx('crash');
          G.flashDamage();
          G.toast('Hit! ' + Math.min(m.job.kipHits, CHASE_HITS) + '/' + CHASE_HITS + ' — keep ramming him.');
          if (m.job.kipHits >= CHASE_HITS) {
            G.stallCar(kip);
            G.toast("Kip's car is dead. He is going nowhere.");
            advanceStep();
          }
        }
        return;
      }

      if (step.kind === 'escape') {
        // Must be clean AND at the safehouse.
        if (G.wanted() > 0) {
          G.setObjective(step.text + ' — lose the heat first! (' + G.wanted() + '★)');
          return;
        }
        if (VH.dist2d(p.x, p.z, step.x, step.z) < ARRIVE) advanceStep();
        return;
      }

      if (step.kind === 'boat') {
        if (!G.inBoat()) {
          G.setObjective('Board the skiff at the marina dock first.');
          return;
        }
        if (VH.dist2d(p.x, p.z, step.x, step.z) < 16) advanceStep();
        return;
      }

      if (step.kind === 'steal') {
        if (VH.dist2d(p.x, p.z, step.x, step.z) < COLLECT_R) {
          wantedGain(1);
          G.sfx('pickup');
          G.toast('Car lifted. The law noticed — +1★.');
          advanceStep();
        }
        return;
      }

      if (step.kind === 'collect') {
        if (VH.dist2d(p.x, p.z, step.x, step.z) < COLLECT_R) {
          m.job.timer += dt;
          if (m.job.timer > 0.6) {
            m.job.timer = 0;
            G.sfx('pickup');
            advanceStep();
          }
        } else {
          m.job.timer = 0;
        }
        return;
      }

      // plain goto
      if (VH.dist2d(p.x, p.z, step.x, step.z) < ARRIVE) {
        G.sfx('pickup');
        // Choice jobs ask the question when the last step lands.
        if (m.job.step === m.job.def.steps.length - 1 && m.job.def.choice) {
          askChoice(m.job.def);
          return;
        }
        advanceStep();
      }
    };

    function askChoice(def) {
      var c = def.choice;
      m.job.step++; // past the last step so updateJob stops checking it
      G.choice(c.prompt, c.opt1, c.opt2, function (picked) {
        m.job.choiceMade = picked;
        S.stats.choices++;
        S.choices[def.id] = picked;
        if (picked === 2 && c.heat2) wantedGain(c.heat2);
        G.toast(picked === 1 ? 'Smooth. The crew respects that.' : 'Loud. The crew will remember that.');
        finishJob();
      });
    }

    // ---------- street races ----------

    m.startRace = function (id) {
      var def = null;
      VH.RACES.forEach(function (r) { if (r.id === id) def = r; });
      if (!def) return false;
      if (m.race || m.job) { G.toast('Finish what you started first.'); return false; }
      if (!inCar()) { G.toast('You need a car to race. Steal one first.'); return false; }
      var rivals = [];
      for (var i = 0; i < 3; i++) {
        rivals.push({
          name: VH.RIVAL_NAMES[i],
          cp: 0,
          frac: 0,
          pace: 0.9 + i * 0.06 + Math.random() * 0.08
        });
      }
      m.race = { def: def, cp: 0, rivals: rivals, finished: false, elapsed: 0 };
      G.setObjective('Race: ' + def.name + ' — hit every checkpoint!');
      G.setMarker(def.route[0][0], def.route[0][1], true);
      G.toast('Race started! Beat ' + VH.RIVAL_NAMES.join(', ') + ' to the line.');
      G.sfx('engineStart');
      return true;
    };

    m.updateRace = function (dt) {
      if (!m.race || m.race.finished) return;
      var r = m.race;
      r.elapsed += dt;
      var p = pos();
      var route = r.def.route;
      // Player progress through the checkpoints, in order.
      var next = route[r.cp];
      if (next && VH.dist2d(p.x, p.z, next[0], next[1]) < CHECKPOINT_R) {
        r.cp++;
        G.sfx('pickup');
        if (r.cp < route.length) {
          G.setMarker(route[r.cp][0], route[r.cp][1], true);
          G.toast('Checkpoint ' + r.cp + '/' + route.length);
        }
      }
      // Rivals cruise the route at their own pace (in checkpoint units).
      var totalLen = route.length;
      r.rivals.forEach(function (rv) {
        rv.frac += dt * rv.pace / 55;
        if (rv.frac >= 1) { rv.frac = 0; rv.cp++; }
        if (rv.cp > totalLen) rv.cp = totalLen;
      });
      var playerProg = r.cp + (next ? (1 - VH.clamp(VH.dist2d(p.x, p.z, next[0], next[1]) / 120, 0, 1)) * 0.5 : 0);
      // Live standings for the HUD.
      var board = [{ name: 'YOU', prog: playerProg, you: true }];
      r.rivals.forEach(function (rv) {
        board.push({ name: rv.name, prog: rv.cp + rv.frac, you: false });
      });
      board.sort(function (a, b) { return b.prog - a.prog; });
      G.setRaceStandings(board);
      // Finish: player crosses the last gate, or a rival does first.
      var playerDone = r.cp >= totalLen;
      var rivalDone = r.rivals.some(function (rv) { return rv.cp >= totalLen; });
      if (playerDone || rivalDone) {
        r.finished = true;
        var place = 1;
        board.forEach(function (b, i) { if (b.you) place = i + 1; });
        var prize = place === 1 ? r.def.prize : (place === 2 ? Math.round(r.def.prize / 2) : 100);
        G.addCash(prize);
        S.stats.cashEarned += prize;
        if (place === 1) { S.stats.racesWon++; G.addRespect(6); }
        G.addRespect(2);
        G.setMarker(0, 0, false);
        G.setRaceStandings(null);
        G.setObjective(place === 1 ? 'You won ' + r.def.name + '!' : 'Finished P' + place + ' in ' + r.def.name);
        G.raceComplete(r.def, place, prize);
        G.sfx(place === 1 ? 'jobDone' : 'cash');
        m.race = null;
        G.saveGame();
      }
    };

    // ---------- taxi fares ----------

    m.beginTaxi = function () {
      if (m.taxi || m.job || m.race) { G.toast('Finish what you started first.'); return false; }
      if (inCar()) { G.toast('Taxi work starts on foot — hail a fare first.'); return false; }
      var p = pos();
      var rng = VH.makeRng((Math.random() * 1e9) | 0);
      var px = VH.nearestRoad(p.x + VH.rand(rng, -60, 60));
      var pz = VH.nearestRoad(p.z + VH.rand(rng, -60, 60));
      var dest = VH.DISTRICTS[Math.floor(Math.random() * VH.DISTRICTS.length)];
      m.taxi = { phase: 'pickup', px: px, pz: pz, dx: dest.cx, dz: dest.cz, rider: null };
      m.taxi.rider = G.spawnPassenger(px, pz);
      G.setMarker(px, pz, true);
      G.setObjective('Taxi: pick up the fare, then drive them to ' + dest.name + '.');
      G.dialogue(["Eddie Fenn: 'Fare waiting nearby, Jet. Grab them, then get them to " + dest.name + ". The meter is running.'"], null);
      return true;
    };

    m.updateTaxi = function (dt) {
      if (!m.taxi) return;
      var t = m.taxi;
      var p = pos();
      if (t.phase === 'pickup') {
        if (VH.dist2d(p.x, p.z, t.px, t.pz) < 6) {
          if (!inCar()) {
            G.toast('You need a car to carry a fare.');
            return;
          }
          t.phase = 'dropoff';
          if (t.rider) { G.removePassenger(t.rider); t.rider = null; }
          G.setMarker(t.dx, t.dz, true);
          G.setObjective('Taxi: drive the fare to their stop.');
          G.sfx('pickup');
        }
        return;
      }
      if (VH.dist2d(p.x, p.z, t.dx, t.dz) < ARRIVE) {
        G.addCash(VH.TAXI_FARE);
        S.stats.cashEarned += VH.TAXI_FARE;
        S.stats.fares++;
        G.addRespect(1);
        G.sfx('cash');
        G.toast('Fare paid: $' + VH.TAXI_FARE + '. Nice driving.');
        G.setMarker(0, 0, false);
        G.setObjective('Free roam — press T for another fare.');
        m.taxi = null;
        G.saveGame();
      }
    };

    m.cancelTaxi = function () {
      if (!m.taxi) return;
      if (m.taxi.rider) G.removePassenger(m.taxi.rider);
      m.taxi = null;
      G.setMarker(0, 0, false);
      G.setObjective('Free roam.');
    };

    // ---------- collectibles, turf income, crew ----------

    m.checkCollectibles = function (px, pz) {
      VH.COLLECTIBLES.forEach(function (c) {
        if (c.found || S.collectibles.indexOf(c.id) !== -1) return;
        if (VH.dist2d(px, pz, c.x, c.z) < 5) {
          c.found = true;
          S.collectibles.push(c.id);
          S.stats.collectibles = S.collectibles.length;
          G.addCash(100);
          S.stats.cashEarned += 100;
          G.sfx('pickup');
          G.hideOrb(c.id);
          G.toast('Harbor lantern ' + S.collectibles.length + '/24 — +$100.');
          G.saveGame();
        }
      });
    };

    m.updateTurfIncome = function (dt) {
      if (S.turf.length === 0) return;
      m.turfClock += dt;
      if (m.turfClock >= 60) {
        m.turfClock = 0;
        var pay = VH.TURF_INCOME * S.turf.length;
        G.addCash(pay);
        S.stats.cashEarned += pay;
        G.toast('Turf income: +$' + pay + ' from ' + S.turf.length + ' district' + (S.turf.length > 1 ? 's' : '') + '.');
      }
    };

    m.hireCrew = function (id) {
      var def = null;
      VH.CREW.forEach(function (c) { if (c.id === id) def = c; });
      if (!def) return false;
      if (S.crew.indexOf(id) !== -1) { G.toast(def.name + ' is already on your crew.'); return false; }
      if (S.crew.length >= 3) { G.toast('Your crew is full — three is the max.'); return false; }
      if (S.cash < def.cost) { G.toast('You need $' + def.cost + ' to hire ' + def.name + '.'); return false; }
      G.addCash(-def.cost);
      S.crew.push(id);
      S.stats.crew = S.crew.length;
      G.sfx('jobDone');
      G.toast(def.name + ' joined the crew — ' + def.role + ': ' + def.bonus + '.');
      G.saveGame();
      return true;
    };

    m.crewHas = crewHas;
    m.respectRank = respectRankName;

    m.completionPct = function () {
      var st = S.stats;
      var pct = 0;
      pct += (st.jobsDone / 7) * 40;
      pct += (st.racesWon / 3) * 15;
      pct += (S.collectibles.length / 24) * 15;
      pct += (S.turf.length / 10) * 10;
      pct += (Math.min(st.fares, 10) / 10) * 5;
      pct += (S.crew.length / 3) * 5;
      pct += (Math.min(st.respect, 90) / 90) * 10;
      return Math.min(100, Math.round(pct));
    };

    m.currentObjective = function () {
      if (m.job) {
        var step = currentStep();
        return step ? 'JOB ' + m.job.def.id + ' — ' + m.job.def.title + ': ' + step.text : '';
      }
      if (m.race) return 'RACE — ' + m.race.def.name + ': checkpoint ' + (m.race.cp + 1) + '/' + m.race.def.route.length;
      if (m.taxi) return 'TAXI — ' + (m.taxi.phase === 'pickup' ? 'pick up the fare' : 'drive the fare to their stop');
      return 'Free roam — start job ' + Math.min(S.jobIndex, 7) + ' from the pause menu.';
    };

    m.update = function (dt, time) {
      m.updateJob(dt, time);
      m.updateRace(dt);
      m.updateTaxi(dt);
      m.updateTurfIncome(dt);
      var p = pos();
      m.checkCollectibles(p.x, p.z);
      if (m.fareCooldown > 0) m.fareCooldown -= dt;
    };

    return m;
  };
})();
