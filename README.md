# vice-harbor
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/masbagusyutl/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/masbagusyutl/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Vice Harbor** is a 3D open-world crime game that runs entirely in the browser — an original neon-coast city in the spirit of the genre, built with Three.js. You arrive with $100 and a name nobody knows. By the end you can own all ten districts, run a crew, and take the Crown vault in Neon Row.

## The story

Rico Marlowe, a fixer who runs the harbor from a marina booth, gives you your first job: a handshake, a package, a debt to collect. From there the work grows — escort Mara Voss, the fastest wheel on the coast, through Harbor Heights; steal a prize from Dana Quick's docks; catch a runner who skipped town with crew money; and finally take the Crown vault. Two jobs make you choose: lean on Vera Solano or take her word at the Coral Tab, and steal the Wave Runner boat or the Hauler truck at the docks. Your choices change the payout, the heat, and which finale you play.

The cast: **Rico Marlowe** (fixer), **Mara Voss** (getaway driver), **Dana Quick** (dock boss), **Vera Solano** (runs the Coral Tab), plus a crew for hire — **Lena Cross** (lookout, heat cools faster), **Milo Vance** (driver, +25% payouts), **Big Sal** (muscle, you take 25% less damage).

## The city — 10 districts

The Boardwalk, Dockside, Palm Court, Marina Bay, Old Town, Neon Row, Coral Gardens, Foundry District, The Strip, Harbor Heights. Each has its own sign and palette, and the HUD always shows where you are. Finish jobs and win races in a district to claim it as turf: captured turf pays $25 a minute, shows green on the map and pause screen, and the heat barely sticks there.

A day-night cycle runs over the city: dusk slides into night and back to dawn, the sky and fog shift, streetlights and neon take over after dark.

## What is in the game

- **7 story jobs** with dialogue, beacons, timers, a JOB COMPLETE screen (payout, time, damage, your choice), and two branching choices that change the finale.
- **3 street races** with named rivals (Juno Pike, Kip Darrow, Sana Reyes), checkpoint gates, live place standings, and cash prizes — including the Harbor Regatta, a boat race on the sea.
- **Taxi fares**: flag a fare with Y, pick up the passenger, drop them off for cash and respect.
- **24 hidden Harbor Reels** scattered across the districts — find them all for cash and respect.
- **Respect ranks**: Rookie → Runner → Hustler → Made → Harbor Boss, earned from jobs, races, fares and reels.
- **Turf control**: 10 districts to capture; owned turf pays income and cools heat faster.
- **Crew**: hire up to 3 members from the pause screen; each brings a real bonus and one rides along on jobs.
- **Cash economy**: Iron & Ink sells a Heavy Pistol ($250, double damage) and Body Armor ($200, +50 max health); Fresh Coat resprays your car and clears all heat ($150).
- **8 vehicle types**: Pipit, Meridian, Vortex GT, Thunderhawk muscle car, Hauler, Harbor Cab, police Interceptor — plus the drivable Wave Runner speedboat on the sea.
- **Wanted system (0–5)**: crimes raise stars; police cars and foot cops escalate, roadblocks appear at 3 stars, a police helicopter with a searchlight circles at 4+ stars. Break line of sight and lie low to cool off — faster on your own turf.
- **Free roam** on foot and by car or boat: carjacking, traffic AI, pedestrians (and boardwalk tourists) who flee gunfire, hitscan shooting and melee, health, WASTED and BUSTED screens.
- **HUD** with health, cash, wanted stars, current district, objective, live race standings and a live minimap (roads, sea, turf, mission marker, race gates, reels, police).
- **Pause screen** (Esc/P) with % complete, lifetime stats, turf and crew lists, and shop/crew buttons. Save/continue via localStorage (v2 save format).
- **Synthesised WebAudio** sound (engine hum, sirens, gunshots, cash ding, boat splash) — no audio files, no network requests at runtime.

## Controls

| Key | Action |
|-----|--------|
| W A S D | Walk / drive / sail · Shift: run |
| Mouse | Drag to look around |
| E | Enter a car or boat — or jack a moving car |
| Click | Shoot · F: punch |
| T | Start / retry a story job |
| R | Start the nearest race |
| Y | Take a taxi fare |
| G | Shop near Iron & Ink / Fresh Coat |
| 1 / 2 | Answer a story choice (or buy in the shop) |
| P / Esc | Pause — stats, turf, crew, shop (Esc closes an open shop first) |
| M | Mute |

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — no build step, no network request, everything loads from `game/`.

## Self-checks

The game verifies itself headlessly (real Chrome, real play):

```sh
tools/check3d.sh   # serves the game, runs simCheck + missionCheck, takes the screenshots
```

- `tools/simCheck.mjs` — loads the game, plays the first story job to completion and one race to completion headlessly, asserts no console errors, job completes, race completes, save writes.
- `tools/missionCheck.mjs` — plays all 7 jobs, a taxi fare, a collectible pickup and a boat boarding headlessly and asserts each completes with no console errors.
- `tools/check3d.sh` — runs both checks and renders the 4 screenshots into `screenshots/`.

## Screenshots

Real headless-Chromium renders of the running game (1280×720): the title screen, a story job at the marina, the Harbor Regatta boat race with live standings, and the pause screen with career stats and % complete. v2.1 re-renders all four from the rewritten build.

Built for the make.fun competition [gta6-01](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) — see https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01
