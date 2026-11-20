// Vice Harbor — the game itself: renderer, third-person camera, on-foot
// and driving controls, wanted heat and police escalation, combat, the
// day-night cycle, shops, save / continue, and the staged scenes used for
// screenshots. It wires the world (city), the vehicles, the people, the
// missions and the UI together. Everything here is original work for this
// game: its own city, cast, cars and story.

window.VH = window.VH || {};
(function () {
  var VH = window.VH;
  var THREE = window.THREE;

  var SAVE_VERSION = 4;
  var GUN_SHOP = { x: -120, z: -150, name: 'Harbour Arms' };
  var RESPRAY = { x: -350, z: 100, name: 'Dockside Respray' };
  var HOSPITAL = { x: 150, z: -150 };
  var POLICE_STATION = { x: -350, z: 150 };
  var MARINA_DOCK = { x: 455, z: -100 };

  function freshState() {
    return {
      version: SAVE_VERSION,
      cash: 200,
      health: 100,
      armor: 0,
      wanted: 0,
      respect: 0,
      weapon: 'pistol',
      weapons: ['pistol'],
      jobIndex: 1,
      turf: [],
      crew: [],
      choices: {},
      collectibles: [],
      stats: { jobsDone: 0, racesWon: 0, fares: 0, collectibles: 0,
               crew: 0, choices: 0, cashEarned: 0, respect: 0 },
      playerX: 0, playerZ: 0, heading: 0,
      hour: 17.5, // golden hour by default: low warm sun over the harbor
      playSeconds: 0
    };
  }

  function makePlayerMesh() {
    var g = new THREE.Group();
    var jacket = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.85 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.5, 0.55), jacket);
    body.position.y = 1.15; body.castShadow = true; g.add(body);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xd8a878, roughness: 0.8 }));
    head.position.y = 2.15; head.castShadow = true; g.add(head);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.22, 12),
      new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.7 }));
    cap.position.y = 2.45; g.add(cap);
    var legs = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x223044, roughness: 0.9 }));
    legs.position.y = 0.45; legs.castShadow = true; g.add(legs);
    return g;
  }

  function districtNameAt(x, z) {
    var best = null, bd = 1e9;
    VH.DISTRICTS.forEach(function (d) {
      var dd = VH.dist2d(x, z, d.cx, d.cz);
      if (dd < bd) { bd = dd; best = d; }
    });
    return best ? best.name : '';
  }

  function clockLabel(hour) {
    var h = Math.floor(hour) % 24;
    var m = Math.floor((hour % 1) * 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function presetForHour(hour) {
    if (hour >= 21 || hour < 5.5) return 'night';
    if (hour >= 18.5) return 'dusk';
    return 'golden';
  }

  // ---------------- game ----------------

  function createGame() {
    var container = document.getElementById('game');
    var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    VH.renderer = renderer;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.set(120, 60, 260);

    var city = VH.buildCity(scene);

    // Lift the grade a touch beyond the city's own rig: a soft warm fill
    // from the opposite side so shadowed streets and night roads stay
    // readable, and a slightly hotter exposure for the golden-hour look.
    var fillLight = new THREE.DirectionalLight(0xffc890, 0.55);
    fillLight.position.set(300, 220, -260);
    scene.add(fillLight);
    renderer.toneMappingExposure = 1.5;

    // A warm light that rides with the player, like headlights: it keeps
    // the road under the car readable at night without washing out the day.
    var headlight = new THREE.PointLight(0xffd9a0, 50, 60, 1.8);
    headlight.position.set(0, 7, 0);
    scene.add(headlight);

    var traffic = VH.spawnTraffic(scene, 14);
    var peds = VH.spawnPedestrians(scene, 26);

    var state = freshState();
    var playerMesh = makePlayerMesh();
    scene.add(playerMesh);

    // A few parked, stealable cars tucked at district edges, off the main
    // roads so they never block a staged view.
    var parkedCars = [];
    [['sedan', -280, -320], ['coupe', 280, -280], ['buggy', 320, 180],
     ['van', -320, 120], ['muscle', 120, 320]].forEach(function (p) {
      var type = null;
      VH.CAR_TYPES.forEach(function (t) { if (t.id === p[0]) type = t; });
      var c = VH.makeCar(scene, type, p[1], p[2], Math.PI / 2);
      parkedCars.push(c);
    });

    // The skiff, moored at the marina dock.
    var boat = VH.makeCar(scene, VH.BOAT, MARINA_DOCK.x + 25, MARINA_DOCK.z, Math.PI / 2);

    var player = { x: 0, z: 0, heading: 0, walkSpeed: 0 };
    var currentCar = null;   // the car the player is driving (or null)
    var screen = 'start';    // start | playing | paused | wasted | busted
    var time = 0;
    var lastPreset = '';
    var heatClock = 0;       // time since the player was last seen by police
    var sirenClock = 0;
    var gunfireAt = null;
    var marker = { x: 0, z: 0, on: false };
    var raceStandings = null;
    var objective = 'Press ENTER to start.';
    var shootCooldown = 0;
    var meleeCooldown = 0;
    var shopNear = null;     // 'gun' | 'respray' | null
    var pausedFrom = null;
    var camYaw = 0, camPitch = 0.32;
    var stageCam = null; // staged screenshots use a closer/wider framing

    // ---- the bridge the missions manager and the UI call through ----
    var G = {
      state: state,
      pos: function () {
        if (currentCar) return { x: currentCar.x, z: currentCar.z };
        return { x: player.x, z: player.z };
      },
      inCar: function () { return !!currentCar; },
      inBoat: function () { return !!currentCar && currentCar.type.id === 'boat'; },
      addCash: function (n) { state.cash = Math.max(0, state.cash + n); },
      addWanted: function (n) {
        state.wanted = VH.clamp(state.wanted + n, 0, 5);
        if (state.wanted >= 3) city.roadblocks.forEach(function (r) { r.visible = true; });
        if (state.wanted === 0) city.roadblocks.forEach(function (r) { r.visible = false; });
      },
      setWanted: function (n) { G.addWanted(n - state.wanted); },
      wanted: function () { return state.wanted; },
      addRespect: function (n) { state.stats.respect = (state.stats.respect || 0) + n; },
      addHealth: function (n) { state.health = VH.clamp(state.health + n, 0, 100); },
      setMarker: function (x, z, on) {
        marker.x = x; marker.z = z; marker.on = !!on;
        city.markers.ring.visible = !!on;
        city.markers.arrow.visible = !!on;
        if (on) { city.markers.ring.position.set(x, 0.3, z); city.markers.arrow.position.set(x, 9, z); }
      },
      setObjective: function (t) { objective = t; },
      setRaceStandings: function (b) { raceStandings = b; },
      toast: function (m) { ui.toast(m); },
      sfx: function (n) { if (VH.audio[n]) VH.audio[n](); },
      flashDamage: function () { ui.flashDamage(); },
      dialogue: function (lines, cb) { ui.dialogue(lines, cb); },
      choice: function (prompt, a, b, cb) { ui.choice(prompt, a, b, cb); },
      jobComplete: function (job, payout, st) {
        screen = 'complete';
        ui.jobComplete(job, payout, st);
      },
      raceComplete: function (race, place, prize) {
        screen = 'race';
        ui.raceComplete(race, place, prize);
      },
      spawnParkedCar: function (typeId, x, z) {
        var type = null;
        VH.CAR_TYPES.forEach(function (t) { if (t.id === typeId) type = t; });
        var c = VH.makeCar(scene, type || VH.CAR_TYPES[0], x, z, 0);
        parkedCars.push(c);
        return c;
      },
      spawnChaseCar: function (x, z) {
        var c = VH.makeCar(scene, VH.CAR_TYPES[0], x, z, 0);
        parkedCars.push(c);
        return c;
      },
      stallCar: function (car) { car.speed = 0; car.health = 0; },
      removeCar: function (car) {
        scene.remove(car.mesh);
        var i = parkedCars.indexOf(car);
        if (i !== -1) parkedCars.splice(i, 1);
      },
      ensureBoat: function () {
        if (!boat.mesh.parent) scene.add(boat.mesh);
        G.toast('The skiff is moored at the marina dock — press E beside it.');
      },
      spawnPassenger: function (x, z) {
        var m = makePlayerMesh();
        m.position.set(x, 0, z);
        scene.add(m);
        var ped = { mesh: m, x: x, z: z };
        peds.push(ped);
        return ped;
      },
      removePassenger: function (ped) {
        scene.remove(ped.mesh);
        var i = peds.indexOf(ped);
        if (i !== -1) peds.splice(i, 1);
      },
      hideOrb: function (id) {
        var orb = city.orbs[id];
        if (orb) { orb.mesh.visible = false; orb.glow.visible = false; }
      },
      hireCrew: function (id) { missions.hireCrew(id); ui.renderPause(pauseData()); },
      startJob: function (id) {
        ui.hideAllScreens();
        screen = 'playing';
        missions.startJob(id);
      },
      startRace: function (id) {
        ui.hideAllScreens();
        screen = 'playing';
        if (!missions.startRace(id)) ui.show('pauseScreen');
      },
      saveGame: function () { saveGame(); }
    };

    var ui = VH.createUI(G);
    var missions = VH.createMissionManager(G);

    // ---------------- save / load ----------------

    function saveGame() {
      state.playerX = player.x; state.playerZ = player.z; state.heading = player.heading;
      var ok = ui.writeSave(state);
      ui.setSaveNote(ok ? 'Saved just now.' : 'Save failed — browser storage is off.');
      return ok;
    }

    function loadSave() {
      var s = ui.readSave();
      if (!s || s.version !== SAVE_VERSION) return false;
      state = s;
      G.state = state;
      player.x = s.playerX; player.z = s.playerZ; player.heading = s.heading;
      // Restore found lanterns as hidden.
      s.collectibles.forEach(function (id) {
        var orb = city.orbs[id];
        if (orb) { orb.mesh.visible = false; orb.glow.visible = false; }
      });
      VH.COLLECTIBLES.forEach(function (c) { c.found = s.collectibles.indexOf(c.id) !== -1; });
      return true;
    }

    // ---------------- combat ----------------

    function forwardVec() {
      var a = currentCar ? currentCar.heading : player.heading;
      return { x: Math.sin(a), z: Math.cos(a) };
    }

    function shoot() {
      if (shootCooldown > 0) return;
      shootCooldown = state.weapon === 'smg' ? 0.16 : 0.5;
      VH.audio.gunshot();
      var f = forwardVec();
      var p = G.pos();
      gunfireAt = { x: p.x, z: p.z };
      var dmg = state.weapon === 'smg' ? 40 : 25;
      // Hit the nearest officer in front of the player.
      var best = null, bd = 50;
      VH.police.officers.forEach(function (o) {
        var dx = o.x - p.x, dz = o.z - p.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        var dot = (dx * f.x + dz * f.z) / (d || 1);
        if (d < bd && dot > 0.6) { bd = d; best = o; }
      });
      if (best) {
        scene.remove(best.mesh);
        VH.police.officers.splice(VH.police.officers.indexOf(best), 1);
        G.addWanted(1);
        G.addRespect(1);
        ui.toast('Officer down. The harbor will remember that. +1★');
        return;
      }
      // Otherwise damage the nearest police car in front.
      var bestCar = null; bd = 55;
      VH.police.cars.forEach(function (c) {
        var dx = c.x - p.x, dz = c.z - p.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        var dot = (dx * f.x + dz * f.z) / (d || 1);
        if (d < bd && dot > 0.5) { bd = d; bestCar = c; }
      });
      if (bestCar) {
        bestCar.health -= dmg;
        VH.audio.crash();
        if (bestCar.health <= 0) {
          scene.remove(bestCar.mesh);
          VH.police.cars.splice(VH.police.cars.indexOf(bestCar), 1);
          G.addWanted(1);
          ui.toast('Police car disabled. +1★');
        }
      }
    }

    function melee() {
      if (meleeCooldown > 0) return;
      meleeCooldown = 0.6;
      var p = G.pos();
      var best = null, bd = 3;
      VH.police.officers.forEach(function (o) {
        var d = VH.dist2d(o.x, o.z, p.x, p.z);
        if (d < bd) { bd = d; best = o; }
      });
      if (best) {
        scene.remove(best.mesh);
        VH.police.officers.splice(VH.police.officers.indexOf(best), 1);
        G.addWanted(1);
        VH.audio.crash();
        ui.toast('You dropped an officer. +1★');
      } else {
        VH.audio.click();
      }
    }

    function onDamage(n) {
      if (screen !== 'playing') return;
      if (missions.crewHas('brick')) n = Math.round(n / 2);
      if (state.armor > 0) {
        var soaked = Math.min(state.armor, n);
        state.armor -= soaked;
        n -= soaked;
      }
      state.health -= n;
      ui.flashDamage();
      if (state.health <= 0) wasted();
    }

    function wasted() {
      state.health = 100;
      state.armor = 0;
      state.cash = Math.round(state.cash * 0.9);
      G.setWanted(0);
      player.x = HOSPITAL.x; player.z = HOSPITAL.z;
      if (currentCar) { currentCar.isPlayer = false; currentCar = null; VH.audio.engineStop(); }
      screen = 'wasted';
      ui.show('wastedScreen');
      VH.audio.crash();
    }

    function busted() {
      state.cash = Math.round(state.cash * 0.9);
      G.setWanted(0);
      player.x = POLICE_STATION.x; player.z = POLICE_STATION.z;
      if (currentCar) { currentCar.isPlayer = false; currentCar = null; VH.audio.engineStop(); }
      screen = 'busted';
      ui.show('bustedScreen');
    }

    // ---------------- entering / exiting cars ----------------

    function nearestEnterable(maxD) {
      var p = { x: player.x, z: player.z };
      var best = null, bd = maxD;
      var all = parkedCars.concat(traffic).concat([boat]);
      all.forEach(function (c) {
        var d = VH.dist2d(p.x, p.z, c.x, c.z);
        if (d < bd) { bd = d; best = c; }
      });
      return best;
    }

    function enterCar(car) {
      if (car.isTraffic) {
        traffic.splice(traffic.indexOf(car), 1);
        car.isTraffic = false;
        parkedCars.push(car);
        G.addWanted(1);
        ui.toast('Car stolen! The owner is shouting. +1★');
        VH.audio.siren();
      }
      currentCar = car;
      car.isPlayer = true;
      car.speed = 0;
      VH.audio.engineStart();
      if (car.type.id === 'boat') ui.toast('Skiff — W/S to throttle, A/D to steer.');
    }

    function exitCar() {
      if (!currentCar) return;
      var car = currentCar;
      car.isPlayer = false;
      car.speed = 0;
      if (car.type.id === 'boat') {
        // Step off onto the nearest dock edge.
        player.x = 435; player.z = car.z;
        player.heading = Math.PI / 2;
      } else {
        player.x = car.x + Math.cos(car.heading) * 3;
        player.z = car.z - Math.sin(car.heading) * 3;
        player.heading = car.heading;
      }
      currentCar = null;
      VH.audio.engineStop();
    }

    // ---------------- shops ----------------

    function openGunShop() {
      screen = 'shop';
      ui.shop('gun', state.cash, state.weapons, function (id) {
        var price = { pistol: 300, smg: 800, armor: 500 }[id];
        if (id === 'smg' && missions.respectRank() === 'Nobody') {
          ui.toast('The SMG needs rank Hustler or better. Earn respect first.');
          return;
        }
        if (state.cash < price) { ui.toast('Not enough cash.'); return; }
        G.addCash(-price);
        if (id === 'armor') { state.armor += 50; }
        else {
          state.weapon = id;
          if (state.weapons.indexOf(id) === -1) state.weapons.push(id);
        }
        VH.audio.cash();
        ui.toast(id === 'armor' ? 'Vest fitted. +50 armor.' : 'Bought: ' + id + '.');
        openGunShop();
      }, function () { screen = 'playing'; });
    }

    function openRespray() {
      screen = 'shop';
      ui.shop('respray', state.cash, [], function (id) {
        if (id !== 'respray') return;
        if (state.cash < 200) { ui.toast('Not enough cash.'); return; }
        G.addCash(-200);
        G.setWanted(0);
        VH.audio.cash();
        ui.toast('Fresh paint, clean plate. The heat is gone.');
        ui.show('hud');
        screen = 'playing';
      }, function () { screen = 'playing'; });
    }

    // ---------------- pause data ----------------

    function pauseData() {
      var mins = Math.floor(state.playSeconds / 60);
      return {
        completion: missions.completionPct(),
        stats: state.stats,
        found: state.collectibles.length,
        turf: state.turf.length,
        crew: state.crew.length,
        crewList: state.crew,
        cash: state.cash,
        rank: missions.respectRank(),
        nextJob: Math.min(state.jobIndex, 7),
        playTime: mins + ' min'
      };
    }

    function openPause() {
      pausedFrom = screen;
      screen = 'paused';
      ui.renderPause(pauseData());
      ui.show('pauseScreen');
    }

    // ---------------- input ----------------

    var keys = {};
    var mouseDown = false;

    function isTyping() { return false; }

    document.addEventListener('keydown', function (e) {
      if (isTyping()) return;
      keys[e.code] = true;
      if (e.code === 'KeyM') {
        var muted = VH.audio.toggleMute();
        ui.toast(muted ? 'Sound muted (M to unmute).' : 'Sound on.');
      }
      if (screen === 'start' && (e.code === 'Enter' || e.code === 'Space')) { startGame(false); return; }
      if (screen === 'complete' || screen === 'race') {
        if (e.code === 'KeyE' || e.code === 'Enter') { ui.hideAllScreens(); screen = 'playing'; }
        return;
      }
      if (screen === 'wasted' || screen === 'busted') {
        if (e.code === 'Enter') { ui.hideAllScreens(); screen = 'playing'; }
        return;
      }
      if (screen !== 'playing') return;
      // Pause always works, even while a dialogue or choice box is open.
      if (e.code === 'KeyP' || e.code === 'Escape') { openPause(); return; }
      if (ui.dialogueOpen()) {
        if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') ui.advanceDialogue();
        return;
      }
      if (ui.choiceOpen()) {
        if (e.code === 'Digit1') ui.pickChoice(1);
        if (e.code === 'Digit2') ui.pickChoice(2);
        return;
      }
      if (e.code === 'KeyE') {
        if (currentCar) exitCar();
        else {
          var car = nearestEnterable(5);
          if (car) enterCar(car);
        }
      }
      if (e.code === 'KeyF') shoot();
      if (e.code === 'KeyV') melee();
      if (e.code === 'KeyT') missions.beginTaxi();
      if (e.code === 'KeyB' && shopNear === 'gun') openGunShop();
      if (e.code === 'KeyR' && shopNear === 'respray') openRespray();
    });
    document.addEventListener('keyup', function (e) { keys[e.code] = false; });
    document.addEventListener('mousedown', function (e) {
      if (e.target && e.target.closest && e.target.closest('button, .screen, #dialogueBox, #choiceBox')) return;
      mouseDown = true;
      if (screen === 'playing' && !ui.dialogueOpen() && !ui.choiceOpen()) shoot();
    });
    document.addEventListener('mouseup', function () { mouseDown = false; });
    document.addEventListener('mousemove', function (e) {
      if (screen === 'playing' && document.pointerLockElement) {
        camYaw -= e.movementX * 0.002;
        camPitch = VH.clamp(camPitch + e.movementY * 0.002, 0.05, 0.9);
      }
    });
    renderer.domElement.addEventListener('click', function () {
      if (screen === 'playing') renderer.domElement.requestPointerLock();
    });
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Buttons on the start / pause / end screens.
    function wire(id, fn) {
      var b = document.getElementById(id);
      if (b) b.addEventListener('click', fn);
    }
    wire('startBtn', function () { startGame(false); });
    wire('continueBtn', function () { startGame(true); });
    wire('resumeBtn', function () { ui.hideAllScreens(); screen = 'playing'; });
    wire('saveBtn', function () { saveGame(); ui.toast('Game saved.'); });
    wire('quitBtn', function () { saveGame(); location.reload(); });
    wire('wastedBtn', function () { ui.hideAllScreens(); screen = 'playing'; });
    wire('bustedBtn', function () { ui.hideAllScreens(); screen = 'playing'; });
    wire('dialogueBox', function () { ui.advanceDialogue(); });
    wire('choiceA', function () { ui.pickChoice(1); });
    wire('choiceB', function () { ui.pickChoice(2); });

    function startGame(fromSave) {
      if (fromSave) {
        if (!loadSave()) { ui.toast('No save found — starting fresh.'); }
      }
      ui.hideAllScreens();
      screen = 'playing';
      objective = missions.currentObjective();
      VH.audio.unlock();
      if (state.jobIndex <= 7 && state.stats.jobsDone === 0) {
        ui.toast('Welcome to Vice Harbor, Jet. Press P for jobs, races and crew.');
      }
    }

    // ---------------- staged scenes (screenshots + tests) ----------------

    var params = new URLSearchParams(window.location.search);
    var sceneParam = params.get('scene') || '';
    var autoStart = params.get('autostart') === '1';

    function stageScene(name) {
      if (name === 'golden') {
        // Title shot: stay on the start screen over the golden city, with
        // the low sun in frame behind the menu.
        menuAngle = -0.6;
        return;
      }
      startGame(false);
      if (name === 'chase') {
        // Sunset job in progress on a rain-slick neon street.
        state.hour = 18.6;
        VH.setTimeOfDay(scene, 'dusk');
        stageCam = { dist: 9, h: 4.2 };
        var runner = null;
        VH.CAR_TYPES.forEach(function (t) { if (t.id === 'runner') runner = t; });
        var car = VH.makeCar(scene, runner, 150, 120, Math.PI);
        parkedCars.push(car);
        player.x = 150; player.z = 120;
        enterCar(car);
        car.speed = 14;
        G.setWanted(2);
        missions.startJob(4);
      } else if (name === 'night') {
        // Night race with the helicopter searchlight overhead.
        state.hour = 22.2;
        VH.setTimeOfDay(scene, 'night');
        stageCam = { dist: 13, h: 6.5, lookUp: 3.5 };
        var muscle = null;
        VH.CAR_TYPES.forEach(function (t) { if (t.id === 'muscle') muscle = t; });
        var car2 = VH.makeCar(scene, muscle, 300, -300, 0);
        parkedCars.push(car2);
        player.x = 300; player.z = -300;
        enterCar(car2);
        car2.speed = 18;
        G.setWanted(4);
        missions.startRace(2);
      } else if (name === 'pause') {
        // Dusk city behind a pause screen full of progress.
        state.hour = 19.4;
        VH.setTimeOfDay(scene, 'dusk');
        state.cash = 2450;
        state.stats.jobsDone = 2;
        state.stats.racesWon = 1;
        state.stats.fares = 3;
        state.stats.collectibles = 6;
        state.stats.respect = 18;
        state.stats.cashEarned = 3150;
        state.collectibles = [0, 1, 2, 3, 4, 5];
        state.turf = [2, 6];
        state.crew = ['pip'];
        state.jobIndex = 3;
        state.playSeconds = 1540;
        player.x = -150; player.z = -150;
        openPause();
      }
      // 'golden' needs no staging: the start screen over the golden city.
    }

    // ---------------- main loop ----------------

    var lastT = performance.now();
    var menuAngle = 0.6;

    function animate(now) {
      requestAnimationFrame(animate);
      var dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      time += dt;

      if (screen === 'playing') {
        state.playSeconds += dt;
        state.hour = (state.hour + dt / 120) % 24; // one game day per 2h play
        var preset = presetForHour(state.hour);
        if (preset !== lastPreset) { VH.setTimeOfDay(scene, preset); lastPreset = preset; }

        // --- movement ---
        var input = {
          forward: !!(keys.KeyW || keys.ArrowUp),
          back: !!(keys.KeyS || keys.ArrowDown),
          left: !!(keys.KeyA || keys.ArrowLeft),
          right: !!(keys.KeyD || keys.ArrowRight)
        };
        if (currentCar) {
          var boost = missions.crewHas('juno') ? 1.15 : 1;
          VH.driveCar(currentCar, input, dt, boost);
          VH.audio.engineSet(Math.abs(currentCar.speed) / currentCar.type.top);
          if (mouseDown) shoot();
        } else {
          var run = keys.ShiftLeft || keys.ShiftRight;
          var sp = run ? 9 : 5;
          var mx = 0, mz = 0;
          if (input.forward) { mz += 1; }
          if (input.back) { mz -= 1; }
          if (input.left) { mx -= 1; }
          if (input.right) { mx += 1; }
          if (mx || mz) {
            var len = Math.sqrt(mx * mx + mz * mz);
            player.heading = Math.atan2(mx / len, mz / len);
            player.x += Math.sin(player.heading) * sp * dt;
            player.z += Math.cos(player.heading) * sp * dt;
            player.x = VH.clamp(player.x, -455, 455);
            player.z = VH.clamp(player.z, -455, 455);
            player.walkSpeed = sp;
          } else {
            player.walkSpeed = 0;
          }
          playerMesh.position.set(player.x, 0, player.z);
          playerMesh.rotation.y = player.heading;
          // walk bob
          playerMesh.position.y = player.walkSpeed > 0 ? Math.abs(Math.sin(time * 9)) * 0.12 : 0;
        }

        // --- world life ---
        VH.updateTraffic(traffic, currentCar, dt, time);
        VH.updatePedestrians(peds, player, currentCar, gunfireAt, dt, time);
        VH.updatePolice(scene, player, currentCar, state.wanted, dt, time, onDamage, busted);
        missions.update(dt, time);

        // --- wanted heat cools when the player is out of police sight ---
        var nearestCop = 1e9;
        VH.police.cars.forEach(function (c) {
          var d = VH.dist2d(c.x, c.z, G.pos().x, G.pos().z);
          if (d < nearestCop) nearestCop = d;
        });
        VH.police.officers.forEach(function (o) {
          var d = VH.dist2d(o.x, o.z, G.pos().x, G.pos().z);
          if (d < nearestCop) nearestCop = d;
        });
        if (state.wanted > 0 && nearestCop > 55) {
          heatClock += dt;
          if (heatClock > 8) { heatClock = 0; G.addWanted(-1); ui.toast('Heat cooling… ' + state.wanted + '★'); }
        } else {
          heatClock = 0;
        }
        // occasional siren wail while wanted
        if (state.wanted > 0) {
          sirenClock += dt;
          if (sirenClock > 6) { sirenClock = 0; VH.audio.siren(); }
        }
        // slow health regen while clean
        if (state.wanted === 0 && state.health < 100) state.health = Math.min(100, state.health + dt * 1.5);

        // --- shop proximity hints ---
        var pp = G.pos();
        var nearGun = VH.dist2d(pp.x, pp.z, GUN_SHOP.x, GUN_SHOP.z) < 10;
        var nearRespray = VH.dist2d(pp.x, pp.z, RESPRAY.x, RESPRAY.z) < 10;
        shopNear = nearGun ? 'gun' : (nearRespray ? 'respray' : null);
        if (nearGun && !ui.dialogueOpen()) objective = missions.currentObjective() + '  [B — Harbour Arms gun shop]';
        if (nearRespray && !ui.dialogueOpen()) objective = missions.currentObjective() + '  [R — Dockside Respray $200]';

        // --- markers bob, orbs spin ---
        city.markers.arrow.position.y = 9 + Math.sin(time * 3) * 0.8;
        city.orbs.forEach(function (o, i) {
          if (o.mesh.visible) o.mesh.position.y = 3 + Math.sin(time * 2 + i) * 0.5;
        });

        if (shootCooldown > 0) shootCooldown -= dt;
        if (meleeCooldown > 0) meleeCooldown -= dt;
        if (gunfireAt && time % 1 < dt) gunfireAt = null;

        // --- HUD + minimap ---
        var carName = currentCar ? currentCar.type.name : '';
        ui.setHUD({
          health: state.health,
          cash: state.cash,
          wanted: state.wanted,
          rank: missions.respectRank(),
          objective: objective,
          clock: clockLabel(state.hour) + ' • ' + districtNameAt(pp.x, pp.z),
          speed: currentCar ? currentCar.speed : 0,
          inCar: !!currentCar,
          carName: carName,
          weapon: state.weapon === 'pistol' ? 'Harbor Pistol' : 'Neon SMG',
          armor: state.armor,
          standings: raceStandings
        });
        ui.drawMinimap({
          x: pp.x, z: pp.z,
          heading: currentCar ? currentCar.heading : player.heading,
          time: time,
          turf: state.turf,
          found: state.collectibles,
          traffic: traffic,
          police: VH.police.cars,
          markerOn: marker.on, markerX: marker.x, markerZ: marker.z,
          districtName: districtNameAt(pp.x, pp.z)
        });

        // --- chase camera: behind the player, police visible over the shoulder ---
        var focus = currentCar || player;
        var fx = focus.x, fz = focus.z;
        var fh = currentCar ? currentCar.heading : player.heading;
        var camDist = currentCar ? 11 : 8;
        var camH = currentCar ? 4.6 : 3.6;
        var lookY = currentCar ? 1.6 : 1.8;
        var lookDist = 6;
        if (stageCam) {
          camDist = stageCam.dist;
          camH = stageCam.h;
          if (stageCam.lookUp) lookY = stageCam.lookUp;
          if (stageCam.lookDist) lookDist = stageCam.lookDist;
        }
        var backX = fx - Math.sin(fh) * camDist;
        var backZ = fz - Math.cos(fh) * camDist;
        // blend in the mouse orbit offset while driving
        var ox = Math.sin(fh + camYaw) * 0;
        if (sceneParam === 'night') {
          // Staged night shot: a fixed three-quarter view that holds the
          // car, the road ahead and the helicopter in one frame, so the
          // render is the same every time.
          camera.position.set(
            fx - Math.sin(fh) * 14 - Math.cos(fh) * 6,
            8,
            fz - Math.cos(fh) * 14 + Math.sin(fh) * 6);
          camera.lookAt(fx + Math.sin(fh) * 10, 5, fz + Math.cos(fh) * 10);
        } else {
          camera.position.x = VH.lerp(camera.position.x, backX + ox, Math.min(1, dt * 5));
          camera.position.y = VH.lerp(camera.position.y, camH, Math.min(1, dt * 5));
          camera.position.z = VH.lerp(camera.position.z, backZ, Math.min(1, dt * 5));
          camera.lookAt(fx + Math.sin(fh) * lookDist, lookY, fz + Math.cos(fh) * lookDist);
        }
        // Staged night shot: hold the police helicopter ahead of the car so
        // its searchlight shaft reads in frame.
        if (sceneParam === 'night' && VH.police.heli) {
          var hp = G.pos();
          VH.police.heli.mesh.position.set(hp.x + 12, 22, hp.z + 32);
          VH.police.heli.mesh.rotation.y = Math.atan2(hp.x - (hp.x + 12), hp.z - (hp.z + 32));
        }
        // The riding light follows the player or the car.
        headlight.position.set(fx, 7, fz);
      } else if (screen === 'start') {
        // slow cinematic orbit over the golden-hour city behind the title
        menuAngle += dt * 0.03;
        camera.position.set(Math.cos(menuAngle) * 300, 85, Math.sin(menuAngle) * 300);
        camera.lookAt(0, 12, 0);
        city.orbs.forEach(function (o, i) {
          if (o.mesh.visible) o.mesh.position.y = 3 + Math.sin(time * 2 + i) * 0.5;
        });
      } else if (screen === 'paused' || screen === 'complete' || screen === 'race' || screen === 'shop') {
        // hold the last gameplay camera so the menu sits over the city
      }

      renderer.render(scene, camera);
    }

    // Continue button only shows when a save exists.
    var contBtn = document.getElementById('continueBtn');
    if (contBtn) contBtn.style.display = ui.saveExists() ? 'inline-block' : 'none';

    lastPreset = presetForHour(state.hour);
    VH.setTimeOfDay(scene, lastPreset);
    ui.show('startScreen');
    requestAnimationFrame(animate);

    if (sceneParam) stageScene(sceneParam);
    else if (autoStart) startGame(false);

    // ---- test hooks for the headless playthrough check ----
    window.VHGame = {
      ready: true,
      state: state,
      missions: missions,
      ui: ui,
      screen: function () { return screen; },
      player: player,
      car: function () { return currentCar; },
      startGame: startGame,
      startJob: function (id) { screen = 'playing'; ui.hideAllScreens(); return missions.startJob(id); },
      startRace: function (id) { screen = 'playing'; ui.hideAllScreens(); return missions.startRace(id); },
      teleport: function (x, z) {
        if (currentCar) { currentCar.x = x; currentCar.z = z; }
        else { player.x = x; player.z = z; }
      },
      giveCar: function (typeId) {
        var type = null;
        VH.CAR_TYPES.forEach(function (t) { if (t.id === typeId) type = t; });
        var c = VH.makeCar(scene, type || VH.CAR_TYPES[0], player.x + 3, player.z, 0);
        parkedCars.push(c);
        enterCar(c);
        return c;
      },
      setWanted: function (n) { G.setWanted(n); },
      setHour: function (h) { state.hour = h; VH.setTimeOfDay(scene, presetForHour(h)); },
      objective: function () { return objective; },
      job: function () { return missions.job; },
      race: function () { return missions.race; },
      trafficCount: function () { return traffic.length; },
      pedCount: function () { return peds.length; }
    };
    window.__VH_READY = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createGame);
  } else {
    createGame();
  }
})();
