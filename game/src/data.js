// Vice Harbor — all game data in one place: districts, vehicles, story jobs,
// street races, crew, collectibles, respect ranks and shops. Pure data, no
// rendering and no logic. Every name, place and line of dialogue is original.

export const WORLD = {
  seed: 1337,
  halfSize: 380,
  block: 74,
  road: 16,
  waterLine: -330,
  beachLine: -300,
};

export const DISTRICTS = [
  { id: 'marina', name: 'Marina Bay', color: 0x2e86ab, sign: 'MARINA BAY', signColor: '#7fd4ff', x0: -380, z0: -380, x1: -120, z1: -200, blurb: 'Yachts, bait shops and the smell of diesel.' },
  { id: 'coral', name: 'Coral Row', color: 0xf4a261, sign: 'CORAL ROW', signColor: '#ffd9a0', x0: -120, z0: -380, x1: 140, z1: -200, blurb: 'Boardwalk arcades and salt-air motels.' },
  { id: 'dockside', name: 'Dockside', color: 0x8d99ae, sign: 'DOCKSIDE', signColor: '#cdd7e4', x0: 140, z0: -380, x1: 380, z1: -200, blurb: 'Cranes, containers and night-shift forklifts.' },
  { id: 'neon', name: 'Neon Mile', color: 0xe71d73, sign: 'NEON MILE', signColor: '#ff7fc0', x0: -380, z0: -200, x1: -120, z1: 40, blurb: 'Clubs, casinos and signs that never sleep.' },
  { id: 'mercado', name: 'Mercado Verde', color: 0x80b918, sign: 'MERCADO VERDE', signColor: '#d4f7a0', x0: -120, z0: -200, x1: 140, z1: 40, blurb: 'Fruit stalls, food trucks and loud radios.' },
  { id: 'cannery', name: 'Old Cannery', color: 0x9c6644, sign: 'OLD CANNERY', signColor: '#e8b98a', x0: 140, z0: -200, x1: 380, z1: 40, blurb: 'Brick warehouses and rusted water towers.' },
  { id: 'palm', name: 'Palm Court', color: 0x2a9d8f, sign: 'PALM COURT', signColor: '#a8e6cf', x0: -380, z0: 40, x1: -120, z1: 260, blurb: 'Bungalows, laundromats and porch lights.' },
  { id: 'lantern', name: 'Lantern Row', color: 0xffb703, sign: 'LANTERN ROW', signColor: '#ffe08a', x0: -120, z0: 40, x1: 140, z1: 260, blurb: 'Noodle bars and paper lanterns on every wire.' },
  { id: 'copper', name: 'Copper Yard', color: 0x6c757d, sign: 'COPPER YARD', signColor: '#d8d8d8', x0: 140, z0: 40, x1: 380, z1: 260, blurb: 'Scrap yards, garages and chop shops.' },
  { id: 'heights', name: 'Harbor Heights', color: 0x7b2cbf, sign: 'HARBOR HEIGHTS', signColor: '#d0a2f7', x0: -380, z0: 260, x1: 380, z1: 380, blurb: 'Glass houses on the hill, guards at the gate.' },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  }
  return DISTRICTS[0];
}

export const VEHICLES = [
  { id: 'albatross', name: 'Albatross GT', kind: 'sports', topSpeed: 46, accel: 26, grip: 3.4, color: 0xd90429, price: 9000, respect: 3 },
  { id: 'cormorant', name: 'Cormorant Sedan', kind: 'sedan', topSpeed: 34, accel: 18, grip: 2.8, color: 0x4361ee, price: 2500, respect: 0 },
  { id: 'sardine', name: 'Sardine Compact', kind: 'compact', topSpeed: 30, accel: 16, grip: 3.0, color: 0xffd60a, price: 1200, respect: 0 },
  { id: 'pelican', name: 'Pelican Van', kind: 'van', topSpeed: 28, accel: 13, grip: 2.2, color: 0x8d99ae, price: 3200, respect: 1 },
  { id: 'tiderunner', name: 'Tide Runner', kind: 'pickup', topSpeed: 36, accel: 19, grip: 2.6, color: 0xef476f, price: 4800, respect: 1 },
  { id: 'dory', name: 'Dory Cab', kind: 'taxi', topSpeed: 33, accel: 17, grip: 2.8, color: 0xf4d35e, price: 0, respect: 0 },
  { id: 'mako', name: 'Mako Interceptor', kind: 'police', topSpeed: 44, accel: 25, grip: 3.2, color: 0x0b0b0b, price: 0, respect: 0 },
  { id: 'marlin', name: 'Marlin Skiff', kind: 'boat', topSpeed: 38, accel: 20, grip: 2.0, color: 0xffffff, price: 6500, respect: 2 },
];

export const RESPECT_RANKS = [
  { level: 0, name: 'Drifter', need: 0 },
  { level: 1, name: 'Hustler', need: 150 },
  { level: 2, name: 'Made Hand', need: 400 },
  { level: 3, name: 'Harbor Boss', need: 800 },
  { level: 4, name: 'Kingpin of the Bay', need: 1400 },
];

export const WEAPONS = [
  { id: 'fists', name: 'Fists', price: 0, damage: 12, range: 2.2, respect: 0 },
  { id: 'bat', name: 'Harbor Bat', price: 150, damage: 26, range: 2.8, respect: 0 },
  { id: 'pistol', name: 'Seagull Pistol', price: 600, damage: 34, range: 55, respect: 1 },
  { id: 'shotgun', name: 'Breakwater Shotgun', price: 1500, damage: 70, range: 26, respect: 2 },
  { id: 'smg', name: 'Tidepool SMG', price: 3200, damage: 24, range: 48, respect: 3 },
  { id: 'rifle', name: 'Lighthouse Rifle', price: 6500, damage: 95, range: 90, respect: 4 },
];

export const CREW = [
  { id: 'finn', name: "Finn 'Sparrow' Hale", role: 'Lookout', hire: 800, bonus: 'Wanted heat builds 30% slower', blurb: 'Sees the harbor patrol before it sees you.' },
  { id: 'mara', name: "Mara Quinn", role: 'Driver', hire: 1200, bonus: 'Every car you drive is 15% faster', blurb: 'Won the Neon Loop twice. Never lost a tail.' },
  { id: 'bo', name: "Bo 'Brick' Sandoval", role: 'Muscle', hire: 1000, bonus: 'Your shots hit 40% harder', blurb: 'Carries the heavy end of every plan.' },
];

export const RIVAL_DRIVERS = [
  { id: 'celia', name: "Celia 'Comet' Rios", color: 0xff006e, skill: 0.94 },
  { id: 'juno', name: 'Juno Park', color: 0x00b4d8, skill: 0.88 },
  { id: 'kip', name: 'Kip Anders', color: 0x80b918, skill: 0.82 },
];

export const RACES = [
  {
    id: 'boardwalk', name: 'Boardwalk Sprint', prize: 1200, entry: 100,
    blurb: 'Flat out along Coral Row, past the arcades and the pier.',
    checkpoints: [[-74, -296], [74, -296], [222, -296], [222, -148], [74, -148], [-74, -148], [-74, -296]],
  },
  {
    id: 'neonloop', name: 'Neon Loop', prize: 2500, entry: 250,
    blurb: 'Three laps of the Neon Mile under the signs.',
    checkpoints: [[-296, -148], [-296, 0], [-148, 0], [-148, -148], [-296, -148]],
  },
  {
    id: 'grandtour', name: 'Harbor Grand Tour', prize: 5000, entry: 500,
    blurb: 'The whole city, end to end. Only the stubborn finish.',
    checkpoints: [[-296, 296], [-296, 148], [-74, 148], [-74, -296], [296, -296], [296, 148], [296, 296], [-296, 296]],
  },
];

// Story jobs. Each job is a chain of steps; a step is one objective.
// Step types: goto (reach a marker), escort (bring a person with you),
// pickup (collect a thing), deliver (take it somewhere), chase (catch a
// moving target), survive (stay alive until the timer ends), choice (pick
// one of two paths with keys 1 / 2).
export const JOBS = [
  {
    id: 'first-light', num: 1, name: 'First Light', district: 'marina', payout: 800,
    giver: "Iris Kade", intro: "Rook. You just got off the boat and already owe the harbor. Drive my courier to the cannery, and we call it even.",
    steps: [
      { type: 'goto', label: 'Meet the courier at Marina Bay', x: -222, z: -296 },
      { type: 'escort', label: 'Escort the courier to Old Cannery', x: 222, z: -148 },
    ],
    outro: "Clean run. Iris remembers people who deliver.",
  },
  {
    id: 'hot-wheels', num: 2, name: 'Hot Wheels', district: 'copper', payout: 1200,
    giver: "Tomas 'T-Bone' Okafor", intro: "Copper Yard has a Tide Runner with my name on the papers. Go take it. Loud is fine. Loud is fun.",
    steps: [
      { type: 'goto', label: 'Reach the chop shop in Copper Yard', x: 222, z: 148 },
      { type: 'pickup', label: 'Steal the Tide Runner', x: 222, z: 148, needCar: 'tiderunner' },
      { type: 'deliver', label: 'Deliver the Tide Runner to the lockup', x: -74, z: 148 },
    ],
    outro: "T-Bone slaps the hood twice. 'She purrs. You are hired.'",
  },
  {
    id: 'the-shakedown', num: 3, name: 'The Shakedown', district: 'mercado', payout: 1500,
    giver: "Sister June", intro: "Three stalls in Mercado Verde stopped paying the harbor tithe. Remind them, gently. Or not gently.",
    steps: [
      { type: 'pickup', label: 'Collect from the fruit stall', x: -74, z: -148 },
      { type: 'pickup', label: 'Collect from the food truck', x: 74, z: -74 },
      { type: 'pickup', label: 'Collect from the radio shop', x: 0, z: 0 },
      { type: 'deliver', label: 'Bring the tithe to Sister June', x: -74, z: -74 },
    ],
    outro: "June counts the cash twice and smiles. 'The harbor provides.'",
  },
  {
    id: 'harbor-run', num: 4, name: 'Harbor Run', district: 'dockside', payout: 2200,
    giver: "Iris Kade", intro: "A dockhand saw too much and the harbor patrol wants him quiet. Get him out of Dockside alive. Then decide what he is worth to you.",
    steps: [
      { type: 'goto', label: 'Reach the dockhand at the cranes', x: 296, z: -296 },
      { type: 'choice', label: 'The dockhand begs: SPARE him (1) or BETRAY him to the patrol (2)?', x: 296, z: -296,
        options: [
          { key: '1', label: 'Spare him', effect: 'He joins your crew as a lookout for the finale.' },
          { key: '2', label: 'Betray him', effect: 'The patrol pays you double, but no one trusts you after.' },
        ] },
      { type: 'escort', label: 'Escort the dockhand to Palm Court', x: -222, z: 148 },
    ],
    outro: "The choice follows you. In this city, it always does.",
    branch: 'dockhand',
  },
  {
    id: 'tail-the-tail', num: 5, name: 'Tail the Tail', district: 'neon', payout: 2600,
    giver: "Lena Voss", intro: "A runner for Big Ray is carrying the harbor ledger through Neon Mile. Run him down and take it. Do not let him reach the Heights.",
    steps: [
      { type: 'chase', label: 'Chase down the runner', x: -222, z: -74 },
      { type: 'pickup', label: 'Grab the harbor ledger', x: -222, z: -74 },
      { type: 'deliver', label: 'Deliver the ledger to Lena Voss', x: -148, z: 222 },
    ],
    outro: "Lena flips through the ledger and whistles. 'Big Ray owns half the harbor. Now we know which half.'",
  },
  {
    id: 'quiet-or-loud', num: 6, name: 'Quiet or Loud', district: 'heights', payout: 3200,
    giver: "Tomas 'T-Bone' Okafor", intro: "The Heights vault holds Big Ray's cash. We go in tonight. Quiet through the garden, or loud through the front gate? Your call, Rook.",
    steps: [
      { type: 'choice', label: 'The vault job: go in QUIET (1) or LOUD (2)?', x: -148, z: 296,
        options: [
          { key: '1', label: 'Quiet', effect: 'No wanted stars, but the take is smaller.' },
          { key: '2', label: 'Loud', effect: 'Triple payout, but the whole harbor wakes up.' },
        ] },
      { type: 'pickup', label: 'Crack the vault and take the cash', x: -148, z: 296 },
      { type: 'deliver', label: 'Get the cash to the Marina Bay boat', x: -222, z: -296 },
    ],
    outro: "The vault is empty and the harbor is buzzing. One job left.",
    branch: 'vault',
  },
  {
    id: 'the-last-tide', num: 7, name: 'The Last Tide', district: 'coral', payout: 8000,
    giver: "Iris Kade", intro: "Big Ray is leaving on the tide from Coral Row, with everything he stole from this harbor. Stop him. The finale is yours, Rook.",
    steps: [
      { type: 'chase', label: 'Chase Big Ray along the boardwalk', x: 74, z: -296 },
      { type: 'survive', label: 'Hold the pier against his crew', x: 74, z: -296, seconds: 25 },
      { type: 'pickup', label: 'Take the harbor keys from Big Ray', x: 74, z: -296 },
    ],
    outro: "The tide goes out and Vice Harbor is yours. The city remembers who took it back.",
  },
];

// 24 hidden harbor medallions, seeded across the districts.
export const COLLECTIBLE_SPOTS = [
  [-350, -350], [-200, -340], [-40, -330], [120, -350], [300, -330],
  [-340, -160], [-222, -74], [74, -222], [222, -148], [330, -60],
  [-340, 0], [-160, 20], [0, -20], [148, 0], [300, 10],
  [-296, 222], [-200, 220], [-74, 148], [80, 200], [296, 222],
  [-300, 320], [-148, 296], [60, 320], [222, 296],
];

export const SHOPS = {
  gun: { name: "Rusty's Arsenal", x: -148, z: -74, blurb: 'Guns, armor, no questions.' },
  respray: { name: 'Color Cove Respray', x: 222, z: 74, blurb: 'New paint, clean slate. $400 clears your heat.' },
  marina: { name: 'Marina Bay Boats', x: -260, z: -330, blurb: 'The Marlin Skiff is moored here. Hop in.' },
};

export const TAXI_FARE = 180;
export const RESPRAY_COST = 400;
export const TURF_INCOME = 120;
export const TURF_INTERVAL = 60;
