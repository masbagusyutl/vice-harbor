// Vice Harbor — the city itself: ground, water, roads, buildings, neon,
// streetlights, palms, marina and the golden-hour lighting rig.
// The visual layer lives here: warm low sun, wet reflective roads, glowing
// neon, lit windows and warm haze.

window.VH = window.VH || {};
(function () {
  var VH = window.VH;
  var THREE = window.THREE;

  // --- procedural textures (drawn once, reused everywhere) ---
  function windowTexture(baseColor, litColor, rng) {
    var c = document.createElement('canvas'); c.width = 128; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = baseColor; g.fillRect(0, 0, 128, 256);
    for (var y = 8; y < 248; y += 16) {
      for (var x = 8; x < 120; x += 14) {
        if (rng() < 0.55) {
          g.fillStyle = rng() < 0.8 ? litColor : '#ffe9b0';
          g.globalAlpha = 0.55 + rng() * 0.45;
          g.fillRect(x, y, 9, 11);
        }
      }
    }
    g.globalAlpha = 1;
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function glowTexture(color) {
    var c = document.createElement('canvas'); c.width = 128; c.height = 128;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, color);
    grad.addColorStop(0.4, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function signTexture(text, color) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64;
    var g = c.getContext('2d');
    g.fillStyle = '#0a0a12'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = color; g.font = 'bold 34px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 18;
    g.fillText(text, 128, 34);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // --- time-of-day presets: the golden-hour look is the default ---
  VH.TIME_PRESETS = {
    golden: { sunPos: [-260, 90, 180], sunColor: 0xffb066, sunI: 2.6,
      sky: 0xff9a52, fog: 0xf2a35e, fogNear: 260, fogFar: 1150,
      amb: 0xffc890, ambI: 0.55, hemiSky: 0xffd9a0, hemiGround: 0x5a3a28,
      lampGlow: 0.35, windowGlow: 0.9, water: 0x2a6a8a },
    dusk:   { sunPos: [-320, 45, 120], sunColor: 0xff7a3d, sunI: 1.7,
      sky: 0x7a3a5e, fog: 0x8a4a5a, fogNear: 220, fogFar: 1000,
      amb: 0x8a5a7a, ambI: 0.45, hemiSky: 0x9a6a8a, hemiGround: 0x2a1a24,
      lampGlow: 0.85, windowGlow: 1.3, water: 0x1a3a5a },
    night:  { sunPos: [-200, 140, -80], sunColor: 0x8aa8ff, sunI: 0.7,
      sky: 0x0a1024, fog: 0x141a30, fogNear: 180, fogFar: 850,
      amb: 0x33406a, ambI: 0.5, hemiSky: 0x2a3a6a, hemiGround: 0x0a0a14,
      lampGlow: 1.6, windowGlow: 1.8, water: 0x0a1a2a }
  };

  var sun, hemi, amb, lampMats = [], windowMats = [], neonMats = [], waterMat, sunSprite;

  VH.setTimeOfDay = function (scene, presetName) {
    var p = VH.TIME_PRESETS[presetName] || VH.TIME_PRESETS.golden;
    VH.currentPreset = presetName;
    scene.background = new THREE.Color(p.sky);
    scene.fog = new THREE.Fog(p.fog, p.fogNear, p.fogFar);
    if (sun) {
      sun.position.set(p.sunPos[0], p.sunPos[1], p.sunPos[2]);
      sun.color.setHex(p.sunColor); sun.intensity = p.sunI;
    }
    if (hemi) { hemi.color.setHex(p.hemiSky); hemi.groundColor.setHex(p.hemiGround); hemi.intensity = 0.7; }
    if (amb) { amb.color.setHex(p.amb); amb.intensity = p.ambI; }
    if (waterMat) waterMat.color.setHex(p.water);
    lampMats.forEach(function (m) { m.emissiveIntensity = p.lampGlow; });
    windowMats.forEach(function (m) { m.emissiveIntensity = p.windowGlow; });
    neonMats.forEach(function (m) { m.emissiveIntensity = 1.2 + p.lampGlow; });
    if (sunSprite) {
      sunSprite.position.set(p.sunPos[0] * 2.4, p.sunPos[1] * 1.6 + 30, p.sunPos[2] * 2.4);
      sunSprite.material.opacity = presetName === 'night' ? 0.25 : 0.9;
    }
  };

  VH.buildCity = function (scene) {
    var rng = VH.makeRng(20261120);
    var city = { orbs: [], markers: {}, roadblocks: [], neonSigns: [] };

    // renderer colour grade: richer contrast and saturation
    VH.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    VH.renderer.toneMappingExposure = 1.35;
    VH.renderer.shadowMap.enabled = true;
    VH.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // --- lights ---
    sun = new THREE.DirectionalLight(0xffb066, 2.6);
    sun.position.set(-260, 90, 180);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -560; sun.shadow.camera.right = 560;
    sun.shadow.camera.top = 560; sun.shadow.camera.bottom = -560;
    sun.shadow.camera.far = 1600; sun.shadow.bias = -0.0004;
    scene.add(sun);
    hemi = new THREE.HemisphereLight(0xffd9a0, 0x5a3a28, 0.7); scene.add(hemi);
    amb = new THREE.AmbientLight(0xffc890, 0.55); scene.add(amb);

    // low sun disc on the horizon for the golden-hour grade
    var sunTex = glowTexture('#ffcf7a');
    sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, opacity: 0.9, depthWrite: false }));
    sunSprite.scale.set(320, 320, 1);
    sunSprite.position.set(-624, 174, 432);
    scene.add(sunSprite);

    // --- ground, beach, water ---
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 1100),
      new THREE.MeshStandardMaterial({ color: 0x6a6a58, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);

    var sand = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 90),
      new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 1 }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.05, 505); sand.receiveShadow = true;
    scene.add(sand);

    waterMat = new THREE.MeshPhongMaterial({ color: 0x2a6a8a, shininess: 160, specular: 0xffc890, transparent: true, opacity: 0.92 });
    var water = new THREE.Mesh(new THREE.PlaneGeometry(240, 1100), waterMat);
    water.rotation.x = -Math.PI / 2; water.position.set(560, 0.08, 0);
    scene.add(water);
    var waterSouth = new THREE.Mesh(new THREE.PlaneGeometry(1100, 120), waterMat.clone());
    waterSouth.rotation.x = -Math.PI / 2; waterSouth.position.set(0, 0.08, 600);
    scene.add(waterSouth);

    // --- wet roads: dark asphalt with a strong warm specular sheen ---
    var roadMat = new THREE.MeshPhongMaterial({ color: 0x1c1c22, shininess: 110, specular: 0xffb070 });
    var roadGeo = new THREE.PlaneGeometry(920, 15);
    var i, j;
    for (i = -4; i <= 4; i++) {
      var r1 = new THREE.Mesh(roadGeo, roadMat);
      r1.rotation.x = -Math.PI / 2; r1.position.set(0, 0.1, i * 100); r1.receiveShadow = true;
      scene.add(r1);
      var r2 = new THREE.Mesh(roadGeo, roadMat);
      r2.rotation.x = -Math.PI / 2; r2.rotation.z = Math.PI / 2; r2.position.set(i * 100, 0.1, 0); r2.receiveShadow = true;
      scene.add(r2);
    }
    // centre dashes
    var dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c86a });
    var dashGeo = new THREE.BoxGeometry(6, 0.06, 0.7);
    for (i = -4; i <= 4; i++) for (j = -4; j <= 4; j++) {
      var d = new THREE.Mesh(dashGeo, dashMat);
      d.position.set(j * 100 + 50, 0.16, i * 100); scene.add(d);
    }
    // rain-slick puddles: mirror-like patches that catch the sun and neon
    var puddleMat = new THREE.MeshPhongMaterial({ color: 0x3a4a5a, shininess: 200, specular: 0xffffff, transparent: true, opacity: 0.55 });
    for (i = 0; i < 26; i++) {
      var px = VH.rand(rng, -420, 420), pz = VH.rand(rng, -420, 420);
      var pud = new THREE.Mesh(new THREE.CircleGeometry(VH.rand(rng, 4, 11), 18), puddleMat);
      pud.rotation.x = -Math.PI / 2; pud.position.set(px, 0.18, pz);
      scene.add(pud);
    }

    // --- buildings: one or two per block, district palette + lit windows ---
    var winTexA = windowTexture('#2a2a33', '#ffd27a', VH.makeRng(11));
    var winTexB = windowTexture('#33242a', '#ff9a6a', VH.makeRng(22));
    VH.DISTRICTS.forEach(function (dist, di) {
      var tex = di % 2 === 0 ? winTexA : winTexB;
      var mat = new THREE.MeshStandardMaterial({ color: dist.palette, map: tex, emissive: 0xffc27a, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.85 });
      windowMats.push(mat);
      var bx, bz;
      for (bx = -4; bx <= 4; bx++) for (bz = -4; bz <= 4; bz++) {
        var cx = bx * 100 + 50, cz = bz * 100 + 50;
        if (VH.dist2d(cx, cz, dist.cx, dist.cz) > 130) continue;
        if (cx > 430 || cz > 430) continue;
        var w = VH.rand(rng, 34, 58), d = VH.rand(rng, 34, 58);
        var h = VH.rand(rng, 14, dist.name === 'Harbor Heights' ? 95 : 55);
        var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(cx + VH.rand(rng, -8, 8), h / 2, cz + VH.rand(rng, -8, 8));
        b.castShadow = true; b.receiveShadow = true;
        scene.add(b);
        // rooftop trim in the district accent colour
        var trim = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.2, d + 1),
          new THREE.MeshStandardMaterial({ color: dist.accent, emissive: dist.accent, emissiveIntensity: 0.5 }));
        trim.position.set(b.position.x, h + 0.6, b.position.z);
        scene.add(trim);
      }
      // glowing neon district sign on a tall pylon
      var signMat = new THREE.MeshBasicMaterial({ map: signTexture(dist.signText, '#' + dist.sign.toString(16).padStart(6, '0')) });
      var sign = new THREE.Mesh(new THREE.PlaneGeometry(46, 11.5), signMat);
      sign.position.set(dist.cx, 52, dist.cz - 60);
      scene.add(sign);
      var glowMat = new THREE.SpriteMaterial({ map: glowTexture('#' + dist.sign.toString(16).padStart(6, '0')), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
      var glow = new THREE.Sprite(glowMat);
      glow.scale.set(90, 30, 1); glow.position.copy(sign.position);
      scene.add(glow);
      city.neonSigns.push(sign);
      // neon shopfront strips along the district's main road
      for (var s = 0; s < 5; s++) {
        var strip = new THREE.Mesh(new THREE.BoxGeometry(14, 1.4, 0.6),
          new THREE.MeshStandardMaterial({ color: dist.sign, emissive: dist.sign, emissiveIntensity: 2.2 }));
        neonMats.push(strip.material);
        strip.position.set(dist.cx + VH.rand(rng, -70, 70), 6 + VH.rand(rng, 0, 14), dist.cz + 46);
        scene.add(strip);
      }
    });

    // --- streetlights ---
    var poleMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.6 });
    var lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffc27a, emissiveIntensity: 0.35 });
    lampMats.push(lampMat);
    for (i = -4; i <= 4; i++) for (j = -4; j <= 4; j++) {
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 9, 6), poleMat);
      pole.position.set(i * 100 + 9, 4.5, j * 100 + 9); scene.add(pole);
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), lampMat);
      lamp.position.set(i * 100 + 9, 9.2, j * 100 + 9); scene.add(lamp);
    }

    // --- palms along the beach and boardwalk ---
    var trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
    var leafMat = new THREE.MeshStandardMaterial({ color: 0x2a7a3a, roughness: 0.9 });
    for (i = 0; i < 40; i++) {
      var tx = VH.rand(rng, -430, 430), tz = VH.rand(rng, 430, 470);
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 11, 6), trunkMat);
      trunk.position.set(tx, 5.5, tz); trunk.castShadow = true; scene.add(trunk);
      for (var l = 0; l < 5; l++) {
        var leaf = new THREE.Mesh(new THREE.ConeGeometry(1.6, 6, 5), leafMat);
        leaf.position.set(tx + Math.cos(l * 1.26) * 2.2, 11.5, tz + Math.sin(l * 1.26) * 2.2);
        leaf.rotation.z = Math.cos(l * 1.26) * 0.9; leaf.rotation.x = -Math.sin(l * 1.26) * 0.9;
        scene.add(leaf);
      }
    }
    // boardwalk planks
    var walk = new THREE.Mesh(new THREE.BoxGeometry(900, 1, 14),
      new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9 }));
    walk.position.set(0, 0.5, 452); walk.receiveShadow = true; scene.add(walk);

    // --- marina: docks and moored boats ---
    var dockMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
    for (i = 0; i < 4; i++) {
      var dock = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 8), dockMat);
      dock.position.set(470, 0.6, -300 + i * 180); scene.add(dock);
    }

    // --- police roadblocks (hidden until 3 stars) ---
    var blockMat = new THREE.MeshStandardMaterial({ color: 0xff5a2a, emissive: 0xff3a1a, emissiveIntensity: 0.4 });
    [[-100, 0], [100, 200], [0, -200]].forEach(function (p) {
      var g = new THREE.Group();
      var bar = new THREE.Mesh(new THREE.BoxGeometry(16, 1.2, 1), blockMat);
      bar.position.y = 1; g.add(bar);
      var leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.6), poleMat);
      leg1.position.set(-7, 0.5, 0); g.add(leg1);
      var leg2 = leg1.clone(); leg2.position.x = 7; g.add(leg2);
      g.position.set(p[0], 0, p[1]);
      g.visible = false;
      scene.add(g);
      city.roadblocks.push(g);
    });

    // --- collectible lanterns ---
    var orbMat = new THREE.MeshStandardMaterial({ color: 0xffd24d, emissive: 0xffb81a, emissiveIntensity: 2.4 });
    var orbGlowTex = glowTexture('#ffd24d');
    VH.COLLECTIBLES.forEach(function (c) {
      var orb = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10), orbMat);
      orb.position.set(c.x, 3, c.z);
      scene.add(orb);
      var gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: orbGlowTex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      gl.scale.set(10, 10, 1); gl.position.copy(orb.position);
      scene.add(gl);
      city.orbs.push({ def: c, mesh: orb, glow: gl });
    });

    // --- mission marker: glowing ring + floating arrow ---
    var markMat = new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.85 });
    var ring = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.4, 24), markMat);
    ring.position.set(0, 0.3, 0); ring.visible = false; scene.add(ring);
    var arrow = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    arrow.rotation.x = Math.PI; arrow.position.set(0, 9, 0); arrow.visible = false; scene.add(arrow);
    city.markers.ring = ring; city.markers.arrow = arrow;

    VH.setTimeOfDay(scene, 'golden');
    return city;
  };
})();
