# vice-harbor
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/masbagusyutl/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/masbagusyutl/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Vice Harbor** is a 3D open-world crime game that runs entirely in the browser — an original neon-coast city in the spirit of the genre, built with Three.js. Explore on foot or behind the wheel, steal almost any car, outrun the Harbor PD as your wanted stars climb, and run a chain of story jobs for Rico: meet him at the marina, make a timed delivery across town, then pull off a getaway with three stars on your tail.

What is in the game:

- A low-poly neon coastal city at dusk: a 7×7 road grid, towers with lit windows and pulsing neon signs, streetlights, palms, a boardwalk, beach and sea.
- Free roam on foot and by car — five car types with distinct handling (compact, sedan, sports, van, taxi), plus police Interceptors.
- Car theft: take parked cars, or jack a moving one and pull its driver out.
- Traffic AI driving the road grid and pedestrians who flee from gunfire and speeding cars.
- A wanted-star system (0–5): crimes raise stars, police cars and foot cops escalate with them, and lying low cools the heat off.
- Three chained story missions with 3D beacons, minimap blips and cash rewards ($150 / $300 / $500).
- Combat: hitscan shooting and melee, health, damage feedback, WASTED and BUSTED screens.
- HUD with health, cash, wanted stars, objective line and a live minimap; start screen, pause, and save/continue via localStorage.
- Synthesised WebAudio sound (engine hum, sirens, gunshots, cash ding) — no audio files.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — no build step, no network request, everything loads from `game/`.

Built for the make.fun competition [gta6-01](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) — see https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01
