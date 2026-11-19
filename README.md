# Vice Harbor

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/masbagusyutl/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/masbagusyutl/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01)

An original 3D open-world harbor city game, in the spirit of GTA 6, built with
Three.js and WebGL. It runs offline in a desktop browser from static files —
no network requests, no build step. Everything in it is original: the city,
the characters, the vehicles, the story, the art and the sounds. No Rockstar
material.

## The story

Rook Vega steps off the boat owing the harbor everything. Iris Kade, the fixer
who runs the Marina Bay boats, has work. Tomas "T-Bone" Okafor runs the chop
shops of Copper Yard. Sister June collects the harbor tithe in Mercado Verde.
Lena Voss knows where the bodies are buried. And Big Ray Deluca owns half the
city — until Rook takes it back, one job at a time.

## The cast

- **Rook Vega** — you. New in town, quick with a wheel, quicker with a plan.
- **Iris Kade** — fixer and boat captain. Gives you your first job and your last.
- **Tomas "T-Bone" Okafor** — chop-shop king of Copper Yard.
- **Sister June** — runs the tithe. Cross her and the whole market hears about it.
- **Lena Voss** — information broker with the harbor ledger in her sights.
- **Big Ray Deluca** — the man who owns half the harbor. The finale is his.
- **Crew for hire** — Finn "Sparrow" Hale (lookout), Mara Quinn (driver), Bo "Brick" Sandoval (muscle).

## The city — 10 districts

Marina Bay, Coral Row, Dockside, Neon Mile, Mercado Verde, Old Cannery, Palm
Court, Lantern Row, Copper Yard and Harbor Heights. Each has its own palette,
its own signage and its own feel, from the boardwalk arcades of Coral Row to
the glass houses of Harbor Heights. The city runs a full day-night cycle: dusk
slides into night, the neon comes on, and the sun comes back up.

## Features

- **Open world on foot and by car** — third-person movement, enter and exit
  cars, steal parked and moving cars, plus a boat you can board and drive on
  the open water.
- **7 story jobs** — escort, getaway, theft, shakedown, chase-down and a
  heist-style finale, with dialogue, a job-complete screen, payout and stats
  after each one. Jobs chain: finishing one unlocks the next.
- **Branching choices** — two jobs force a real decision (spare or betray the
  dockhand; go into the vault quiet or loud) with visible consequences for
  payout, the next job and the finale. Every choice is recorded in your stats.
- **3 street races** — Boardwalk Sprint, Neon Loop and Harbor Grand Tour,
  with checkpoint gates, three named rival drivers (Celia "Comet" Rios, Juno
  Park, Kip Anders), live standings and cash prizes.
- **Wanted system, 0–5 stars** — crimes raise heat, the harbor patrol answers
  with foot officers, ramming patrol cars, roadblocks at 3 stars and a
  helicopter with a searchlight at 4 stars and above. Heat cools when you stay
  out of sight — faster on turf you own.
- **Traffic and pedestrians** — cars drive the road grid and yield to you,
  pedestrians walk the sidewalks and flee gunfire and speeding cars.
- **Taxi fares** — pick up passengers and drive them across the city for cash.
- **24 hidden harbor medallions** — find them all and the districts fall to you.
- **Turf control** — districts you capture through jobs and medallions pay
  periodic income and lower police pressure inside them. Owned turf shows on
  the minimap and the pause screen.
- **Crew system** — hire up to three crew members, each with a role bonus
  (lookout, driver, muscle), managed from the pause screen.
- **Respect ranks** — Drifter, Hustler, Made Hand, Harbor Boss, Kingpin of the
  Bay. Higher respect unlocks better weapons and vehicles.
- **Cash economy** — earn from jobs, races, fares and turf; spend it at
  Rusty's Arsenal (six weapons plus armor) and at Color Cove Respray, which
  clears your wanted heat for cash.
- **HUD and minimap** — health, cash, wanted stars, objective, speed, a live
  minimap with turf, police, markers and medallions, plus start, pause,
  wasted and busted screens.
- **Save and continue** — progress saves to the browser and keeps jobs,
  races, fares, medallions, turf, crew, choices and lifetime stats.
- **Percent complete** — the pause screen shows your completion percentage
  plus every lifetime stat.
- **Synthesized sound** — engine, sirens, gunshots and cash, all built with
  WebAudio. No audio files. Mute with M.

How it compares: this entry ships 7 story jobs, 3 race routes, 24 hidden
collectibles, 10 districts and 8 vehicle types — more collectibles, more
districts and more vehicles than the current provisional number one in this
competition, with the same job and race counts.

## Controls

- W — move forward / drive
- S — move back / brake
- A — move left / steer left
- D — move right / steer right
- E — enter or exit a car (steal it!)
- Space — handbrake
- Click — shoot your weapon
- T — start or end a taxi shift
- Shift — run
- M — mute sound
- P or Esc — pause
- Mouse drag — look around
- 1 / 2 — answer a story choice, or buy in the gun shop

## How to play

Serve the `game/` folder with any static server and open `index.html`:

```
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. Keyboard and mouse.
No network connection needed.

## How to run the checks

```
node checks/playthrough.mjs   # headless playthrough: drive, steal, job 1, a race, pause, save
node checks/shots.mjs         # renders the 4 screenshots into screenshots/
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # the entry program
```

The playthrough check needs a Playwright Chromium build; it uses the cached
one under `~/.cache/ms-playwright` and the `playwright-core` package in
`checks/`.

## Files

- `game/index.html` — the page: HUD, minimap, menus and screens
- `game/style.css` — all interface styling
- `game/src/game.js` — gameplay: movement, police, jobs, races, taxi, HUD, save
- `game/src/world.js` — the city: districts, buildings, palms, signs, water, day-night
- `game/src/data.js` — all game data: districts, vehicles, jobs, races, crew, medallions
- `game/src/rng.js` — seeded random helpers (the world is deterministic per seed)
- `game/src/audio.js` — synthesized WebAudio sounds
- `game/vendor/three.min.js` — vendored Three.js r160
- `screenshots/` — four real renders of the running game, plus `shots.json`
- `checks/` — the headless playthrough and screenshot checks

## License

MIT — see LICENSE.
