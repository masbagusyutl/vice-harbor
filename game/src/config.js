// Vice Harbor — shared tuning, constants and helpers.
// Everything the other modules agree on lives here: world size, car
// handling, mission payouts, palette, and a seeded RNG so screenshots
// replay the exact same city every time.

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
};

// Every drivable car type, with its own handling. Names are original.
export const CAR_TYPES = {
  compact: { label: 'Pipit', topSpeed: 27, accel: 16, brake: 30, turn: 2.7, color: 0xffd23e, len: 3.6, h: 1.25, w: 1.8 },
  sedan: { label: 'Meridian', topSpeed: 31, accel: 18, brake: 32, turn: 2.4, color: 0x3e8bff, len: 4.4, h: 1.3, w: 1.9 },
  sports: { label: 'Vortex GT', topSpeed: 44, accel: 27, brake: 38, turn: 3.0, color: 0xff3e6e, len: 4.3, h: 1.1, w: 1.95 },
  van: { label: 'Hauler', topSpeed: 24, accel: 11, brake: 26, turn: 1.9, color: 0xe8e8e8, len: 5.0, h: 2.0, w: 2.1 },
  taxi: { label: 'Harbor Cab', topSpeed: 33, accel: 19, brake: 32, turn: 2.5, color: 0xffc300, len: 4.4, h: 1.35, w: 1.9 },
  police: { label: 'Interceptor', topSpeed: 38, accel: 25, brake: 38, turn: 2.9, color: 0x22345e, len: 4.5, h: 1.3, w: 1.95 },
};

// The story chain: three missions, each unlocked by the last.
export const MISSIONS = [
  {
    id: 'meet',
    title: 'Meet Rico at the Marina',
    text: 'Rico is waiting at the marina boardwalk. Go meet him.',
    reward: 150,
    timeLimit: 0,
  },
  {
    id: 'delivery',
    title: 'Sunset Delivery',
    text: 'Take the package to the north-west tower. 75 seconds — do not be late.',
    reward: 300,
    timeLimit: 75,
  },
  {
    id: 'getaway',
    title: 'Harbor Getaway',
    text: 'The heat is on: 3 stars. Reach the hideout at the south-west docks.',
    reward: 500,
    timeLimit: 150,
  },
];

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

export const SAVE_KEY = 'vice-harbor-save-v1';
