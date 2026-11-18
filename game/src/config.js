// Vice Harbor — shared tuning and content tables.
// All names, places and characters are original. No Rockstar / GTA material.
export const SAVE_KEY = 'viceHarborSaveV1';

export const CITY = {
  pitch: 58, // distance between road centrelines
  roadHalf: 7, // half width of a road
  roads: 7, // roads per axis, indices -3..3
  block: 44, // building block size
  extent: 3 * 58 + 7, // half-extent of the road grid
  beachX: 196, // east of this is sand, then water
  waterX: 232,
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 11,
  radius: 0.55,
  maxHealth: 100,
};

export const CAR_TYPES = {
  sedan: { name: 'Harbor Sedan', accel: 14, topSpeed: 26, turn: 1.9, brake: 30, color: 0x3f6fb5, length: 4.4 },
  sport: { name: 'Neon Comet', accel: 22, topSpeed: 38, turn: 2.4, brake: 38, color: 0xd23b8e, length: 4.2 },
  taxi: { name: 'Vice Cab', accel: 12, topSpeed: 23, turn: 1.8, brake: 28, color: 0xf2c230, length: 4.4 },
  van: { name: 'Dock Van', accel: 10, topSpeed: 20, turn: 1.5, brake: 24, color: 0x7d8a99, length: 5.2 },
  police: { name: 'VHPD Interceptor', accel: 20, topSpeed: 34, turn: 2.3, brake: 36, color: 0x1c2733, length: 4.4 },
};

// Chained story missions. Positions are filled in by missions.js from the city.
export const MISSIONS = [
  {
    id: 'meet-rico',
    contact: 'Rico',
    title: 'Meet Rico at the Marina',
    text: 'Drive or walk to the marina and meet Rico. He has work for you.',
    reward: 150,
  },
  {
    id: 'timed-delivery',
    contact: 'Rico',
    title: 'Sunset Run — timed delivery',
    text: 'Get the package to the Sunset Motel before the clock runs out. 75 seconds.',
    reward: 300,
    timeLimit: 75,
  },
  {
    id: 'getaway',
    contact: 'Lena',
    title: 'Getaway — lose the heat',
    text: 'The heat is on: 3 stars. Reach the safehouse on the west edge, then lie low until the stars clear.',
    reward: 500,
  },
];

export const WANTED = {
  maxStars: 5,
  decayDelay: 9, // seconds out of sight before a star drops
  copShootStars: 3,
};

export const PALETTE = {
  sky: 0x2b1d4e,
  fog: 0x2b1d4e,
  sun: 0xffb36b,
  hemiSky: 0x8a7bd8,
  hemiGround: 0x2a1f2e,
  asphalt: 0x2f3038,
  sidewalk: 0x3a3b44,
  sand: 0xc9a86a,
  water: 0x1d6f8e,
  building: [0x5a5f7a, 0x7a5a6e, 0x4a6a7a, 0x6e5a4a, 0x8a7a5a, 0x3f4a6e, 0x6a4a5a],
  neon: [0xff2e88, 0x00e5ff, 0xffe14d, 0x7cff4d, 0xff6b35],
};
