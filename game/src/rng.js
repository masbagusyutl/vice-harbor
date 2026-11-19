// Seeded random helpers for Vice Harbor.
// Every random choice in the world build draws from one seeded stream, so the
// city is identical on every load with the same seed. Nothing here touches the
// network or the DOM; it is pure arithmetic.

export function makeSeededRandom(seed) {
  let state = (seed >>> 0) || 1;
  // mulberry32: small, fast, deterministic across engines.
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickFrom(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

export function range(rand, low, high) {
  return low + rand() * (high - low);
}

export function rangeInt(rand, low, high) {
  return low + Math.floor(rand() * (high - low + 1));
}

export function chance(rand, probability) {
  return rand() < probability;
}

// Deterministic shuffle: returns a new array, leaves the input alone.
export function shuffled(rand, list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

// A tiny hash of a string into a 32-bit seed, used to seed per-district detail
// without disturbing the main stream.
export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
