// Vice Harbor v2.1 — shared tuning, constants and helpers.
// v2.1: rewritten under the new sealed recording; same tuning as v2,
// with the REELS list kept fixed by design so collectibles are findable.
// Everything the other modules agree on lives here: world size, car
// handling, the 7-job story, 3 race routes, 10 districts, 24 Harbor
// Reels, crew, respect ranks, shop prices, and a seeded RNG so
// screenshots replay the exact same city every time.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// mulberry32 — a small deterministic RNG. The city, parked cars,
// pedestrians and traffic all draw from one seeded stream, so a
// screenshot taken with seed=1 always shows the same world.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// World layout: a 7x7 grid of intersections, 56 units apart, with a
// beach, boardwalk and sea along the south edge.
export const WORLD = {
  intersections: 7,
  spacing: 56,
  roadHalf: 7,
  bounds: 196,
  beachZ: -196,
  sandDepth: 46,
  seaDepth: 90,
  // The sea the boats drive on: x in [-196, 196], z in [-336, -246].
  sea: { x0: -196, x1: 196, z0: -336, z1: -248 },
};

// Ten named districts, each a rectangle of the city with its own
// accent colour. The HUD shows the district you are standing in;
// captured turf shows in its owner colour on the map and pause screen.
export const DISTRICTS = [
  { id: 'boardwalk', name: 'The Boardwalk', x0: -196, x1: 196, z0: -196, z1: -140, color: 0xff2e88 },
  { id: 'dockside', name: 'Dockside', x0: -196, x1: -56, z0: -140, z1: -28, color: 0x00e5ff },
  { id: 'palmcourt', name: 'Palm Court', x0: -56, x1: 56, z0: -140, z1: -28, color: 0xffd23e },
  { id: 'marina', name: 'Marina Bay', x0: 56, x1: 196, z0: -140, z1: -28, color: 0x7bff5e },
  { id: 'oldtown', name: 'Old Town', x0: -196, x1: -56, z0: -28, z1: 84, color: 0xff7b2e },
  { id: 'neonrow', name: 'Neon Row', x0: -56, x1: 56, z0: -28, z1: 84, color: 0xff2e88 },
  { id: 'coral', name: 'Coral Gardens', x0: 56, x1: 196, z0: -28, z1: 84, color: 0x00e5ff },
  { id: 'foundry', name: 'Foundry District', x0: -196, x1: -56, z0: 84, z1: 196, color: 0x9a8a6b },
  { id: 'strip', name: 'The Strip', x0: -56, x1: 56, z0: 84, z1: 196, color: 0xffd23e },
  { id: 'heights', name: 'Harbor Heights', x0: 56, x1: 196, z0: 84, z1: 196, color: 0x7bff5e },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  }
  return DISTRICTS[0];
}

// Every drivable car type, with its own handling. Names are original.
export const CAR_TYPES = {
  compact: { label: 'Pipit', topSpeed: 27, accel: 16, brake: 30, turn: 2.7, color: 0xffd23e, len: 3.6, h: 1.25, w: 1.8 },
  sedan: { label: 'Meridian', topSpeed: 31, accel: 18, brake: 32, turn: 2.4, color: 0x3e8bff, len: 4.4, h: 1.3, w: 1.9 },
  sports: { label: 'Vortex GT', topSpeed: 44, accel: 27, brake: 38, turn: 3.0, color: 0xff3e6e, len: 4.3, h: 1.1, w: 1.95 },
  muscle: { label: 'Thunderhawk', topSpeed: 40, accel: 24, brake: 34, turn: 2.5, color: 0xff7b2e, len: 4.6, h: 1.25, w: 2.0 },
  van: { label: 'Hauler', topSpeed: 24, accel: 11, brake: 26, turn: 1.9, color: 0xe8e8e8, len: 5.0, h: 2.0, w: 2.1 },
  taxi: { label: 'Harbor Cab', topSpeed: 33, accel: 19, brake: 32, turn: 2.5, color: 0xffc300, len: 4.4, h: 1.35, w: 1.9 },
  police: { label: 'Interceptor', topSpeed: 38, accel: 25, brake: 38, turn: 2.9, color: 0x22345e, len: 4.5, h: 1.3, w: 1.95 },
};

// Boats: one drivable type on the sea along the south edge.
export const BOAT_TYPES = {
  speedboat: { label: 'Wave Runner', topSpeed: 34, accel: 14, brake: 20, turn: 1.8, color: 0x00e5ff, len: 6.0, h: 1.1, w: 2.2 },
};

// The cast. All names, lines and characters are original.
export const CAST = {
  rico: 'Rico Marlowe — fixer, runs the harbor from a marina booth',
  mara: 'Mara Voss — getaway driver, fastest wheel on the coast',
  dana: 'Dana Quick — dock boss, owns the cranes and the crews',
  sal: 'Big Sal — muscle, collects what people owe',
  lena: 'Lena Cross — lookout, sees the PD coming before they do',
  milo: 'Milo Vance — wheelman for hire, never lost a tail',
  vera: 'Vera Solano — runs the Coral Tab, pays on time, remembers debts',
};

// The story chain: seven jobs, each unlocked by the last. `spot` is a
// key into the city locations; `choice` offers a real fork (keys 1/2).
export const MISSIONS = [
  {
    id: 'meet', title: 'First Handshake', reward: 150, timeLimit: 0, spot: 'marina',
    text: 'Rico Marlowe is waiting at the marina boardwalk. Go meet him.',
    dialogue: [
      ['Rico Marlowe', 'You came. Good. The harbor eats people who hesitate.'],
      ['Rico Marlowe', 'Do jobs for me, earn respect, and one day this whole coast is yours.'],
    ],
  },
  {
    id: 'delivery', title: 'Sunset Delivery', reward: 300, timeLimit: 75, spot: 'delivery',
    text: 'Take the package to the north-west tower. 75 seconds — do not be late.',
    dialogue: [
      ['Rico Marlowe', 'A package for the Foundry tower. Seventy-five seconds. The buyer does not wait.'],
    ],
  },
  {
    id: 'shakedown', title: 'The Coral Tab', reward: 250, timeLimit: 120, spot: 'coral',
    text: 'Vera Solano owes the crew. Collect at the Coral Gardens — your way.',
    dialogue: [
      ['Vera Solano', 'I pay on time, Rico knows that. Tell him the tab is good.'],
      ['Rico Marlowe', 'Your call: lean on her, or take her word. Both pay — one pays louder.'],
    ],
    choice: {
      prompt: 'How do you collect from Vera?  [1] Lean on her — loud, +$150, +1 star   [2] Take her word — quiet, +$50',
      options: [
        { key: '1', label: 'Lean on her', bonus: 150, stars: 1, note: 'You leaned on Vera. Loud. The PD heard it.' },
        { key: '2', label: 'Take her word', bonus: 50, stars: 0, note: 'Vera pays quietly. No heat, smaller cut.' },
      ],
    },
  },
  {
    id: 'escort', title: 'Escort Mara', reward: 450, timeLimit: 120, spot: 'heights',
    text: 'Mara Voss needs a quiet escort to Harbor Heights. Keep her moving — 120 seconds.',
    dialogue: [
      ['Mara Voss', 'Drive like the road owes you money. Harbor Heights, two minutes.'],
      ['Mara Voss', 'If the PD shows, do not stop. I do not get out of cars for cops.'],
    ],
  },
  {
    id: 'theft', title: 'The Dock Heist', reward: 500, timeLimit: 150, spot: 'docks',
    text: 'Dana Quick wants a prize from the docks. Boat or truck — pick your prize.',
    dialogue: [
      ['Dana Quick', 'Two prizes on my dock: a Wave Runner and a Hauler full of cargo.'],
      ['Dana Quick', 'Take one. The boat opens the water for us; the truck opens the roads.'],
    ],
    choice: {
      prompt: 'What do you steal from the docks?  [1] The Wave Runner boat — unlocks the harbor race   [2] The Hauler truck — +$200 cash now',
      options: [
        { key: '1', label: 'Steal the boat', bonus: 0, stars: 0, note: 'The boat is yours. The harbor race is open.' },
        { key: '2', label: 'Steal the truck', bonus: 200, stars: 1, note: 'Truck taken. Cash now, heat now.' },
      ],
    },
  },
  {
    id: 'chase', title: 'Catch the Runner', reward: 550, timeLimit: 150, spot: 'strip',
    text: 'A runner skipped town with crew money. 2 stars on your tail — catch him at The Strip.',
    dialogue: [
      ['Rico Marlowe', 'A runner took crew money north. Two stars will follow you — outrun them, catch him.'],
    ],
    startStars: 2,
  },
  {
    id: 'finale', title: 'Harbor Crown', reward: 1000, timeLimit: 180, spot: 'neon',
    text: 'The finale: take the Crown vault in Neon Row. 180 seconds. This is the job that makes you.',
    dialogue: [
      ['Rico Marlowe', 'The Crown vault, Neon Row. Three minutes. Do this and the harbor is yours.'],
      ['Mara Voss', 'I am driving the getaway. Do not make me wait.'],
    ],
    finale: true,
  },
];

// Street races: 3 routes. Road races use road checkpoints; the harbor
// race is a boat race on the sea. Rivals are simulated; beat them.
export const RACES = [
  {
    id: 'sprint', name: 'Boardwalk Sprint', kind: 'car', prize: 250, rivalPrize: 0,
    rivals: ['Juno Pike', 'Kip Darrow', 'Sana Reyes'],
    checkpoints: [{ x: -140, z: -168 }, { x: 0, z: -168 }, { x: 140, z: -168 }, { x: 140, z: -56 }, { x: 0, z: -56 }, { x: -140, z: -56 }],
    start: { x: -168, z: -168, heading: Math.PI / 2 },
  },
  {
    id: 'neonloop', name: 'Neon Loop', kind: 'car', prize: 400,
    rivals: ['Juno Pike', 'Kip Darrow', 'Sana Reyes'],
    checkpoints: [{ x: -112, z: -112 }, { x: 112, z: -112 }, { x: 112, z: 112 }, { x: -112, z: 112 }],
    start: { x: -140, z: -112, heading: Math.PI / 2 },
  },
  {
    id: 'regatta', name: 'Harbor Regatta', kind: 'boat', prize: 500,
    rivals: ['Juno Pike', 'Kip Darrow', 'Sana Reyes'],
    checkpoints: [{ x: -150, z: -290 }, { x: 0, z: -300 }, { x: 150, z: -290 }, { x: 0, z: -270 }],
    start: { x: -170, z: -280, heading: Math.PI / 2 },
  },
];

// 24 hidden collectibles — "Harbor Reels" — scattered across districts.
// Fixed positions so they are findable and deterministic.
export const REELS = [
  [-168, -182], [-84, -182], [28, -182], [112, -182], [168, -182],
  [-168, -112], [-28, -112], [84, -112], [168, -112],
  [-168, -28], [-28, -28], [140, -28],
  [-112, 28], [28, 28], [168, 28],
  [-168, 84], [-28, 84], [112, 84],
  [-168, 168], [-84, 168], [28, 168], [112, 168], [168, 168],
  [0, -196],
];

// Crew for hire. Each has a role bonus that actually applies.
export const CREW = [
  { id: 'lena', name: 'Lena Cross', role: 'Lookout', cost: 300, bonus: 'Heat cools 30% faster' },
  { id: 'milo', name: 'Milo Vance', role: 'Driver', cost: 400, bonus: 'Race & job payouts +25%' },
  { id: 'sal', name: 'Big Sal', role: 'Muscle', cost: 500, bonus: 'You take 25% less damage' },
];

// Respect ranks. Respect comes from jobs (+50), races won (+40),
// fares (+10) and reels (+5 each).
export const RESPECT_RANKS = [
  { at: 0, name: 'Rookie' },
  { at: 100, name: 'Runner' },
  { at: 300, name: 'Hustler' },
  { at: 600, name: 'Made' },
  { at: 1000, name: 'Harbor Boss' },
];

export function respectRank(respect) {
  let rank = RESPECT_RANKS[0];
  for (const r of RESPECT_RANKS) if (respect >= r.at) rank = r;
  return rank;
}

// Shop: Iron & Ink (guns) and Fresh Coat (respray, clears heat).
export const SHOP = {
  pistol: { name: 'Heavy Pistol', cost: 250, desc: 'Double damage, faster fire' },
  armor: { name: 'Body Armor', cost: 200, desc: '+50 max health, refills health' },
  respray: { name: 'Fresh Coat respray', cost: 150, desc: 'Clears all wanted stars' },
};

export const TURF_INCOME = 25; // $ per owned district, every 60 s.
export const SAVE_KEY = 'vice-harbor-save-v2';

// Dusk palette for the neon coastal city.
export const PALETTE = {
  sky: 0x2b1e4a,
  fog: 0x3a2a55,
  ground: 0x2c313c,
  road: 0x232830,
  sidewalk: 0x565c68,
  sand: 0xc9a06b,
  sea: 0x0d4a63,
  building: [0x5a6b8a, 0x8a6b5a, 0x6b8a7a, 0x7a5a8a, 0x9a8a6b, 0x4a5a7a, 0xb08a5a],
  neon: [0xff2e88, 0x00e5ff, 0xffd23e, 0x7bff5e, 0xff7b2e],
  windowLit: 0xffd98a,
  windowDark: 0x2a3550,
};
