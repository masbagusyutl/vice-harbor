// Vice Harbor — all authored content: districts, vehicles, cast, jobs,
// races, crew, collectibles. Every name, line of dialogue and place here is
// original, invented for this game.

window.VH = window.VH || {};
(function () {
  var VH = window.VH;

  VH.DISTRICTS = [
    { name: 'Marina Bay',     cx: 350,  cz: -350, palette: 0x2e6f8e, accent: 0x7fd4e8, sign: 0x35e0ff, signText: 'MARINA' },
    { name: 'Old Cannery',    cx: -350, cz: -350, palette: 0x8a4a2a, accent: 0xff9a4d, sign: 0xff7a1a, signText: 'CANNERY' },
    { name: 'Neon Row',       cx: -150, cz: -150, palette: 0x5a2a72, accent: 0xff4fd8, sign: 0xff2fd6, signText: 'NEON ROW' },
    { name: 'Palm Court',     cx: 150,  cz: -150, palette: 0x3d6b34, accent: 0xa8e063, sign: 0x9dff57, signText: 'PALM CT' },
    { name: 'Dockside',       cx: -350, cz: 150,  palette: 0x3a4a5a, accent: 0x8fb8d8, sign: 0x4dc3ff, signText: 'DOCKS' },
    { name: 'Copper Hill',    cx: -150, cz: 350,  palette: 0x7a5230, accent: 0xffc46b, sign: 0xffb347, signText: 'COPPER' },
    { name: 'Sunset Strip',   cx: 150,  cz: 150,  palette: 0x8e3a4d, accent: 0xff7a8a, sign: 0xff5e78, signText: 'SUNSET' },
    { name: 'Coral Beach',    cx: 350,  cz: 150,  palette: 0xc98a5a, accent: 0xffd9a0, sign: 0xff9e7a, signText: 'CORAL' },
    { name: 'Junction Yard',  cx: -150, cz: -350, palette: 0x5a5a3a, accent: 0xffe14d, sign: 0xffe14d, signText: 'JUNCTION' },
    { name: 'Harbor Heights', cx: 350,  cz: 350,  palette: 0x4a3a6e, accent: 0xb79cff, sign: 0xa78bfa, signText: 'HEIGHTS' }
  ];

  VH.CAR_TYPES = [
    { id: 'coupe',   name: 'Copper Coupe',   color: 0xc96a2a, top: 34, accel: 22, grip: 2.6, desc: 'Two-door sprinter' },
    { id: 'sedan',   name: 'Sunset Sedan',   color: 0x8e2f4d, top: 28, accel: 17, grip: 2.2, desc: 'Everyday four-door' },
    { id: 'hauler',  name: 'Harbor Hauler',  color: 0x3a5a3a, top: 22, accel: 12, grip: 1.8, desc: 'Heavy flatbed truck' },
    { id: 'runner',  name: 'Neon Runner',    color: 0xff2fd6, top: 40, accel: 26, grip: 3.0, desc: 'Street-race rocket' },
    { id: 'buggy',   name: 'Boardwalk Buggy', color: 0xffd24d, top: 26, accel: 15, grip: 2.0, desc: 'Open-top beach car' },
    { id: 'van',     name: 'Dock Van',       color: 0x4a6a8a, top: 24, accel: 13, grip: 1.9, desc: 'Boxy work van' },
    { id: 'muscle',  name: 'Marina Muscle',  color: 0x1a5abf, top: 36, accel: 24, grip: 2.4, desc: 'V8 harbour bruiser' },
    { id: 'taxi',    name: 'Tide Taxi',      color: 0xffc21a, top: 27, accel: 16, grip: 2.1, desc: 'Metered city cab' }
  ];
  VH.POLICE_CAR = { id: 'police', name: 'Harbor Interceptor', color: 0x101418, top: 37, accel: 25, grip: 3.0 };
  VH.BOAT = { id: 'boat', name: 'Harbor Skiff', color: 0xe8e8e8, top: 30, accel: 18, grip: 2.0 };

  VH.CAST = {
    player: { name: "Jules 'Jet' Marlow", role: 'wheelman fresh off the ferry' },
    fixer:  { name: 'Marisol Vega', role: 'harbor fixer who runs the jobs board' },
    rival1: { name: 'Vex Okafor', role: 'Neon Row street-race champion' },
    rival2: { name: 'Tally Quinn', role: 'Sunset Strip drifter, never lost a sprint' },
    rival3: { name: 'Rook Anders', role: 'Marina Bay grand-tour veteran' },
    mark:   { name: 'Kip Dalton', role: 'debt-runner who owes Marisol a fortune' },
    captain:{ name: 'Captain Hana Osei', role: 'smuggler who knows every inlet' },
    boss:   { name: 'Eddie Fenn', role: 'taxi dispatcher with a long memory' }
  };

  VH.CREW = [
    { id: 'pip',   name: 'Pip Sorren',  role: 'Lookout', bonus: 'Wanted heat grows 25% slower', cost: 500 },
    { id: 'juno',  name: 'Juno Hale',   role: 'Driver',  bonus: '+15% top speed in any car',   cost: 800 },
    { id: 'brick', name: 'Brick Anselm', role: 'Muscle', bonus: 'Enemies go down twice as fast', cost: 1000 }
  ];

  VH.RESPECT_RANKS = [
    { at: 0,   name: 'Nobody' },
    { at: 5,   name: 'Street Kid' },
    { at: 15,  name: 'Hustler' },
    { at: 30,  name: 'Wheelman' },
    { at: 55,  name: 'Harbor King' },
    { at: 90,  name: 'Legend of the Bay' }
  ];

  // Seven chained story jobs. Steps are waypoints the player must reach in
  // order; `choice` jobs pause for a 1 / 2 decision that changes the payout.
  VH.JOBS = [
    { id: 1, title: 'First Fare', giver: 'Marisol Vega',
      brief: ["Marisol Vega: 'Jet. You want work in this harbor, you drive. Take my client to Palm Court. No detours, no drama.'"],
      steps: [
        { kind: 'goto', x: -300, z: -300, text: 'Pick up the client at Old Cannery' },
        { kind: 'goto', x: 150, z: -150, text: 'Drop the client at Palm Court' }
      ], payout: 400, respect: 5, district: 3 },
    { id: 2, title: 'The Cannery Lift', giver: 'Marisol Vega',
      brief: ["Marisol Vega: 'A Copper Coupe sits unlocked behind the cannery. Bring it to the garage on Neon Row. The owner will not miss it. Probably.'"],
      steps: [
        { kind: 'steal', x: -350, z: -300, text: 'Steal the Copper Coupe at Old Cannery' },
        { kind: 'goto', x: -150, z: -150, text: 'Deliver the car to the Neon Row garage' }
      ], payout: 650, respect: 6, district: 1 },
    { id: 3, title: 'Shakedown on Neon Row', giver: 'Marisol Vega',
      brief: ["Marisol Vega: 'Three shops on Neon Row owe the harbor its cut. Collect it. How you ask is your call, Jet.'"],
      steps: [
        { kind: 'collect', x: -200, z: -100, text: 'Collect from the first shop' },
        { kind: 'collect', x: -100, z: -200, text: 'Collect from the second shop' },
        { kind: 'collect', x: -150, z: -100, text: 'Collect from the third shop' }
      ],
      choice: { prompt: 'How do you collect the cut?',
        opt1: 'SMOOTH TALK — no heat, smaller take',
        opt2: 'LOUD — smash the till, +$300, +2 wanted',
        payout1: 700, payout2: 1000, heat2: 2 },
      payout: 700, respect: 8, district: 2 },
    { id: 4, title: 'Getaway Driver', giver: 'Marisol Vega',
      brief: ["Marisol Vega: 'My crew is lifting the Junction Yard depot. You are the wheel. Pick them up, lose the law, bring them to the safehouse.'"],
      steps: [
        { kind: 'goto', x: -150, z: -350, text: 'Pick up the crew at Junction Yard' },
        { kind: 'escape', x: 350, z: -350, text: 'Escape to the Marina Bay safehouse — shake the heat first' }
      ], payout: 1200, respect: 10, district: 8 },
    { id: 5, title: 'Chase Down Kip', giver: 'Marisol Vega',
      brief: ["Kip Dalton: 'You will never catch me, Jet! I owe Marisol nothing!'",
              "Marisol Vega: 'Ram his car until it stops. He owes me a fortune.'"],
      steps: [
        { kind: 'chase', x: 0, z: 0, text: 'Chase Kip Dalton — ram his car until it stalls' }
      ], payout: 900, respect: 9, district: 6 },
    { id: 6, title: "The Smuggler's Run", giver: 'Captain Hana Osei',
      brief: ["Captain Hana Osei: 'Crates are waiting offshore, past the breakwater. Take the skiff, fetch them, bring them to the marina. And Jet — the coast-guard informant saw us.'"],
      steps: [
        { kind: 'boat', x: 480, z: 250, text: 'Take the skiff and reach the offshore crates' },
        { kind: 'goto', x: 400, z: -300, text: 'Deliver the crates to the Marina Bay dock' }
      ],
      choice: { prompt: 'The informant is watching from the pier. What do you do?',
        opt1: 'SPARE him — lose $200, no extra heat',
        opt2: 'BETRAY him — +$500, +2 wanted, the crew remembers',
        payout1: 1200, payout2: 1900, heat2: 2 },
      payout: 1400, respect: 11, district: 0 },
    { id: 7, title: 'The Golden Hour Heist', giver: 'Marisol Vega',
      brief: ["Marisol Vega: 'One last job, Jet. The Harbor Heights vault, at golden hour, while the whole city watches the sunset. Get in, get out, and the harbor is yours.'"],
      steps: [
        { kind: 'goto', x: 350, z: 350, text: 'Reach the Harbor Heights vault' },
        { kind: 'collect', x: 350, z: 300, text: 'Crack the vault and grab the gold' },
        { kind: 'escape', x: -350, z: 350, text: 'Escape to Copper Hill — lose the helicopter' }
      ], payout: 3000, respect: 20, district: 9 }
  ];

  VH.RACES = [
    { id: 0, name: 'Sunset Strip Sprint', prize: 800,
      route: [[100, 100], [300, 100], [300, 300], [100, 300]] },
    { id: 1, name: 'Neon Row Circuit', prize: 1200,
      route: [[-200, -100], [-100, -200], [-100, -100], [-200, -200]] },
    { id: 2, name: 'Marina Bay Grand Tour', prize: 2000,
      route: [[300, -300], [400, -100], [400, 100], [300, 300], [100, 300], [100, -300]] }
  ];
  VH.RIVAL_NAMES = ['Vex Okafor', 'Tally Quinn', 'Rook Anders'];

  // 24 hidden harbor lanterns, spread deterministically across the districts.
  VH.COLLECTIBLES = (function () {
    var rng = VH.makeRng(4242), out = [], i;
    for (i = 0; i < 24; i++) {
      var d = VH.DISTRICTS[i % 10];
      out.push({
        id: i,
        x: d.cx + Math.round(VH.rand(rng, -70, 70)),
        z: d.cz + Math.round(VH.rand(rng, -70, 70)),
        found: false
      });
    }
    return out;
  })();

  VH.TAXI_FARE = 150;
  VH.TURF_INCOME = 50; // per owned district, per minute
})();
