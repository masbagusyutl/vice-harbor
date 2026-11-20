# VICE HARBOR

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/masbagusyutl/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/masbagusyutl/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01)

**VICE HARBOR** is an original 3D open-world crime game in the spirit of GTA 6,
built with Three.js and WebGL. It runs offline in a desktop browser from its
own static files — no network requests, no build step. Open `game/index.html`
or serve the `game/` folder with any static server and play.

## The story

Jules “Jet” Marlow steps off the ferry into Vice Harbor with nothing but a
fast pair of hands and a debt to pay. Marisol Vega, the fixer who runs the
harbor, has seven jobs with his name on them. Between the jobs there is a
whole city to take: ten districts, three rival racers who never lose, a crew
to build, turf to capture, and a police force that escalates from a foot
patrol to a helicopter with a searchlight.

### The cast

- **Jules “Jet” Marlow** — you. A wheelman fresh off the ferry.
- **Marisol Vega** — the harbor fixer who runs the jobs board.
- **Captain Hana Osei** — a smuggler who knows every inlet and breakwater.
- **Kip Dalton** — a debt-runner who owes Marisol a fortune and runs fast.
- **Vex Okafor** — Neon Row street-race champion.
- **Tally Quinn** — Sunset Strip drifter, never lost a sprint.
- **Rook Anders** — Marina Bay grand-tour veteran.
- **Eddie Fenn** — taxi dispatcher with a long memory.
- **Pip Sorren, Juno Hale, Brick Anselm** — the crew you can hire: a lookout,
  a driver and muscle, each with a role bonus that changes how you play.

## The city — ten districts

Marina Bay, Old Cannery, Neon Row, Palm Court, Dockside, Copper Hill,
Sunset Strip, Coral Beach, Junction Yard and Harbor Heights. Every district
has its own color palette, its own glowing neon signage and its own streets
to learn. The default light is golden hour — a low warm sun, long shadows,
wet streets that catch the neon — and the day rolls on into dusk and night,
when the windows light up and the helicopter searchlight cuts through the
haze.

## What is in the game

- **A complete open world** — explore on foot or by car across a coastal
  harbor city with a beach, a boardwalk, a marina and open water.
- **7 chained story jobs** — escort, getaway drive, theft, shakedown,
  chase-down and a golden-hour heist finale, each with dialogue and a
  JOB COMPLETE screen showing payout and stats. Two jobs offer a real
  branching choice (smooth talk vs. loud, spare vs. betray) with visible
  consequences for payout, heat and the crew's memory.
- **3 street races** on three routes with checkpoint gates, three named
  rivals, live standings and cash prizes.
- **8 car types** with different handling, plus police interceptors and a
  drivable boat on the water. Steal any car — including moving traffic.
- **Traffic and pedestrians** — traffic drives the road grid and yields to
  your car; pedestrians walk the sidewalks and flee gunfire and speeding cars.
- **Wanted system 0–5 stars** — crimes raise heat; police answer with foot
  officers, patrol cars that pursue and ram, roadblocks at 3 stars and a
  helicopter with a searchlight at 4 stars and above. Heat cools when you
  stay out of sight.
- **Combat** — shooting and melee, health and armor, WASTED and BUSTED
  screens with consequences.
- **Side work** — taxi fares, 24 hidden harbor lanterns, turf capture that
  pays periodic income and lowers police pressure, a gun shop and a respray
  that clears your heat for cash.
- **Progression** — respect levels with named ranks (Nobody to Legend of
  the Bay), a crew of up to three with role bonuses, and a cash economy.
- **HUD with a live minimap** — health, cash, wanted stars, current
  objective, race standings, a clock and the district you are standing in,
  plus a minimap that tracks you, traffic, police, markers, turf and
  collectibles.
- **Start, pause, wasted and busted screens** — the pause screen shows
  percent-complete and lifetime stats, and manages jobs, races and crew.
- **Save and continue** — progress is saved to the browser and can be
  continued from the start screen.
- **Synthesized sound** — engine, sirens, gunshots and cash, all made with
  WebAudio. No audio files. Mute with M.
- **Golden-hour visual layer** — warm low sun and long shadows by default,
  rain-slick reflective roads, glowing neon, lit windows, fog and haze depth,
  and a richer color grade so the city reads cinematic at thumbnail size.

Where this entry goes further than the field's typical depth: seven full
story jobs instead of one or two, three race routes with live standings,
twenty-four collectibles, ten districts, eight-plus vehicle types including
boats, and turf, crew, branching choices and a save system wired together
in one game.

## Controls

| Key | Action |
| --- | ------ |
| W A S D | Walk / drive |
| Shift | Run on foot |
| E | Enter / steal car, exit car, continue |
| F / click | Shoot |
| V | Melee |
| T | Hail a taxi fare |
| B | Gun shop (near Harbour Arms, Neon Row) |
| R | Respray (near Dockside, clears heat for $200) |
| P / Esc | Pause — jobs, races, crew, stats |
| M | Mute sound |

Mouse: click the game to lock the pointer and look around while driving.

## How to play

Serve the game folder and open it in a desktop browser:

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` directly from any static file server. The game
needs no network connection: every script, style and library file lives
under `game/`.

## How the checks run

Headless playthrough and screenshot checks live in `tools/` and run with
the cached Playwright Chromium build:

```sh
node tools/check-playthrough.mjs   # scripted playthrough: first job + one race
node tools/take-shots.mjs          # renders the 4 staged screenshots
```

The entry program is `main.ts` (Node 22, standard library only). It copies
`game/` and `screenshots/` to the output folder and writes the dossier:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Run it twice into two different folders and the outputs are byte-identical.

## Shots

`screenshots/` holds four real renders of the running game (1280×720):
the golden-hour title screen, a sunset job on a rain-slick neon street, a
night race under the police helicopter searchlight, and the pause screen
with percent-complete and stats. `shots.json` lists each shot's scene and
seed so the renders are reproducible.

## License

MIT. All city, characters, vehicles, names, story, art and sounds are
original work made for this game.
