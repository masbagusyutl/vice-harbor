// Vice Harbor — seeded randomness and small math helpers.
// Every random choice in the world build draws from one fixed seed so the
// city is identical on every load. Gameplay jitter uses a separate stream.

window.VH = window.VH || {};
(function () {
  var VH = window.VH;

  // mulberry32: a tiny deterministic PRNG.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  VH.makeRng = mulberry32;
  VH.worldRng = mulberry32(20261120); // fixed world seed
  VH.fxRng = mulberry32(777001);      // cosmetic jitter stream

  VH.rand = function (rng, lo, hi) { return lo + rng() * (hi - lo); };
  VH.randInt = function (rng, lo, hi) { return Math.floor(VH.rand(rng, lo, hi + 1)); };
  VH.pick = function (rng, arr) { return arr[Math.floor(rng() * arr.length)]; };
  VH.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  VH.lerp = function (a, b, t) { return a + (b - a) * t; };
  VH.angleLerp = function (a, b, t) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };
  VH.dist2d = function (ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  };
  // Snap a world coordinate to the nearest road centre line.
  VH.nearestRoad = function (v) { return Math.round(v / 100) * 100; };
})();
