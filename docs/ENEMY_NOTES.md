# Enemy & pattern notes (Enemy/AI agent)

Source of truth: `src/enemies/defs.ts` (defs + chapter notes), `src/patterns/library.ts` (patterns).
`describeEnemy(id)` (from `src/enemies`) returns the same info as one line. **Ids are stable.**

## Usage for the Level agent

- Spawn any id below with `{type:"spawn"}` / `{type:"formation"}` events. Air units should spawn just above the
  screen (`y` ≈ -20..-40); ground units at `y` ≈ -30 (they scroll in).
- `opts.dir: -1` mirrors sine/diagonal/strafe/circular direction; `opts.phase` (0..1) offsets sine/circular phase.
- Formations: give wingmen `opts.formation = { leaderId, dx, dy }` **and** use a def whose movement kind is `formation`
  — or simpler: spawn the same sine/straight unit several times with offsets/phase. If a leader dies, wingmen keep
  their momentum then peel off downward (lone-survivor fallback).
- `movement.kind = "scripted"` does nothing — bosses move their parts themselves.
- Air units with `hover`/`strafe` enter to `holdY`, stay `holdTime` s, then leave.
- Ground anchored units only apply their OWN motion; tanks drive *up* the road (angle -90) so they linger on screen.
- Attacks only fire while the unit is on screen within `[minY, maxY]` (default 0..GAME_H-60), after `delay` s of
  visibility, and never while the player is dead. Interval is scaled by difficulty (easy 0.8x rate, hard 1.1x).

### Signature behaviours
| unit | behaviour |
|---|---|
| `drone_kamikaze` | approach → 0.6 s telegraph (ring fx + `lock_on`, nose turns) → fast dive; Engine contact check kills it on impact |
| `missile_carrier`, `missile_launcher`, `sam_site`, `destroyer`, gunships | homing missiles: ≥ 600 ms telegraph + `warning`, Engine emits `missileLaunched` per missile, decoyable, turn ≤ 110°/s |
| `bomber` / `bomber_elite` | carpet bombing: line of telegraphed hazards (≥ 900 ms + 140-180 ms stagger) walking ahead / toward player |
| `helicopter`, `gunship_light` | hover + drift toward player column / horizontal strafe |
| `radar_station` | pulses every 2 s; enemies within 220u fire 35 % faster |
| `shield_drone` | allies within 130u take 50 % damage (refund in `onHit`) |
| `military_base` | launches up to 4 `drone_kamikaze` (every 5 s) while in top 60 % of screen |
| `hangar` | launches 2 `fighter_basic` (every 4 s) while in top half |
| `oil_tank` | death → 40 damage chain blast to ground units within 90u |
| turrets / tanks (`rotatesToPlayer`) | `facing` tracks the player at 140°/s (barrel sprite `enemy_<id>_gun`) |

## Enemy roster

hp/aN = hp / armor. Layer "(drift)" = `anchored:false` naval unit.

| id | layer | vuln | hp | size | movement | attacks | tags | chapters | notes |
|---|---|---|---|---|---|---|---|---|---|
| `fighter_basic` | air | air | 12 | 20x20 | sine 105 | aimed_slow@2.4s | fighter | 1-5 | Fodder. Weaves down, single slow aimed shot. Use formation/vee events. |
| `interceptor` | air | air | 10 | 16x24 | diagonal 210 | aimed_needle@1.8s | fighter fast | 1-5 | Fast diagonal fly-through (dir:-1 mirrors), bounces off walls, one needle shot. |
| `fighter_heavy` | air | air | 70/a1 | 32x32 | hover 85 | fan5@2.6s, burst3_aimed@3.3s | fighter heavy | 1-5 (1 rare) | Enters, hovers ~5s firing fan5 + aimed bursts, then leaves. |
| `bomber` | air | air | 120/a1 | 40x32 | straight 45 | carpet_bomb@4.2s, aimed_slow@2.2s | bomber heavy | 1-5 | Slow straight pass. Carpet-bombs a walking line of telegraphed ground hazards ahead of itself. |
| `helicopter` | air | air | 55 | 32x32 | hover 95 | burst3_aimed@2.5s, fan3_slow@3.6s | helicopter | 2-5 (jungle focus) | Hover + drifts toward player column; leaves after holdTime. |
| `drone_kamikaze` | air | air | 4 | 12x12 | dive 95 | - | drone kamikaze | 1-5 | Approach, 0.6s telegraph, dive. Self-destructs on contact. |
| `missile_carrier` | air | air | 140/a1 | 40x40 | hover 60 | homing_single@4.6s, fan3_slow@3s | missile heavy | 1 (one, teaching flares) - 5 | Hovers high, decoyable homing missiles. |
| `tank_light` | ground | ground | 30 | 16x16 | straight 16 (up) | tank_shell@3s | vehicle tank | 1-4 | Crawls up against scroll, turret tracks player. Bombs only. |
| `tank_heavy` | ground | ground | 100/a3 | 24x24 | straight 10 (up) | fan3_aimed@2.8s, big_orb_slow@5.5s | vehicle tank heavy | 2-5 | Needs 2-3 bombs. |
| `aa_turret` | ground | both | 26 | 16x16 | stationary | flak_burst@2.3s | aa turret structure | 1-5 | Guns or bombs. Shootable flak. |
| `missile_launcher` | ground | ground | 45/a1 | 20x20 | stationary | homing_single@5s | missile launcher structure | 1-5 | One homing missile every 5s. Bombs only. |
| `radar_station` | ground | ground | 50 | 24x24 | stationary | - | radar structure | 1-5 (objective target) | Fire-rate buff aura 220u. Bombs only. |
| `military_base` | ground | ground | 260/a2 | 48x48 | stationary | ring8_slow@4.2s | base structure | 2-5 | Launches drones. Bombs only. |
| `armored_vehicle` | ground | both | 34/a2 | 16x24 | diagonal 28 | twin_down@2.6s | vehicle | 1-5 | Zig-zags; guns chip it, bombs better. |
| `gunboat` | ground (drift) | ground | 60 | 16x32 | sine 46 | aimed_slow@2.2s, fan3_slow@4s | naval vehicle | 1 (pacific), 2 (rivers) | Moves itself ~46u/s screen speed, weaving. |
| `destroyer` | ground (drift) | ground | 220/a2 | 24x64 | straight 30 | twin_aimed@2s, sweep_turret@4.5s, homing_single@7.5s | naval heavy | 1 (late), 2 | Big naval unit. |
| `oil_tank` | ground | both | 30 | 28x28 | stationary | - | structure fuel | 1-4 | Chain explosion on death. |
| `hangar` | ground | ground | 160/a1 | 48x32 | stationary | - | structure base | 2-5 | Launches 2 fighters. Bombs only. |
| `ice_turret` | ground | both | 40/a1 | 16x16 | stationary | burst3_aimed@2.6s, ring8_slow@5s | turret aa structure | 4 (arctic) | Rotating gun. |
| `citadel_turret` | ground | both | 70/a2 | 20x20 | stationary | fan5_aimed@2.6s, spiral_slow@6s | turret structure | 5 (citadel) | Rotating gun. |
| `sam_site` | ground | ground | 55/a1 | 20x20 | stationary | homing_pair@6s | missile aa sam structure | 3-5 | Paired missiles (800ms warning). Bombs only. |
| `mine_layer` | air | air | 40 | 28x28 | strafe 70 | mine_drop@1.1s | mine support | 2-5 | Strafes the top dropping slow shootable mines. |
| `sand_crawler` | ground | both | 40/a1 | 20x24 | sine -12 (up) | fan3_aimed@3s | vehicle desert | 3 (desert) | Weaving buggy. |
| `ice_walker` | ground | both | 60/a2 | 24x24 | straight 12 (up) | burst3_aimed@3s, mortar_blast@6.5s | vehicle mech arctic | 4 (arctic) | Mortar hazard on the player's spot. |
| `shield_drone` | air | air | 30 | 16x16 | hover 70 | - | drone support | 3-5 | Damage-halving aura 130u. Priority target. |
| `gunship_light` | air | air | 80/a1 | 28x32 | strafe 90 | sweep_turret@3s, homing_single@6.5s | helicopter | 2-5 | Horizontal strafe sweeping the player. |
| `fighter_basic_elite` | air | air | 26 | 20x20 | sine 115 | burst_fan3@2.8s | fighter elite | 3-5 | Reuses `enemy_fighter_basic` sprite. |
| `interceptor_elite` | air | air | 20 | 16x24 | diagonal 230 | needle_lead@1.6s | fighter fast elite | 4-5 | Leads its shots. |
| `fighter_heavy_elite` | air | air | 140/a2 | 32x32 | hover 85 | fan7_aimed@2.8s, spiral_double@7s | fighter heavy elite | 4-5 | Mid-boss feel. |
| `helicopter_elite` | air | air | 110/a1 | 32x32 | hover 95 | burst5_aimed@2.6s, homing_single@6s | helicopter elite | 2-5 | Bursts + missiles. |
| `tank_heavy_elite` | ground | ground | 180/a4 | 24x24 | straight 10 (up) | fan5_aimed@2.6s, artillery_triple@6.5s | vehicle tank heavy elite | 4-5 | Artillery on the player. |
| `missile_carrier_elite` | air | air | 240/a2 | 40x40 | hover 60 | homing_salvo4@6.5s, fan5@3s | missile heavy elite | 4-5 | 2x2 missile salvos. |
| `bomber_elite` | air | air | 220/a2 | 40x32 | straight 42 | carpet_heavy@4.5s, fan3_aimed@2.4s | bomber heavy elite | 3-5 | 7-blast carpet aimed at player. |

## Patterns (`PATTERNS`, `src/patterns`)

Angle convention: final heading = base + (`bullet.angle` − 90) + `angleOffset` (+ per-kind offsets). base = angle to
(predicted) player for `aim: "player" | "lead"`, else owner `facing` (90 = down). So author `bullet.angle: 90` = forward.
Default aim: `player` for aimed/burst/sweep/homing/delayedBlast/areaStrike, `none` otherwise. `muzzles` = one volley per
offset; owner x/y/facing are re-read every volley. Caps enforced by the runner: speed ≤ 260 (≤ 340 aimed singles),
missiles turn ≤ 110°/s, arm ≥ 0.5 s, life ≤ 6 s, always ≥ 600 ms telegraph; hazards always ≥ 600 ms telegraph.
Difficulty speed/damage scaling is applied by the Engine in `spawnBullet`; `missileLaunched` + launch sfx are also emitted
by the Engine for every `isMissile` bullet (the runner only telegraphs: ring/spark fx + `warning` sfx for telegraph ≥ 600 ms).

For bosses: `import { PATTERNS, patternRunner, makeBullet, bulletPresets } from "../patterns"`. Presets:
`small, small_red, orb, orb_cyan, needle, big, missile, bomb, flak, mine`. `makeBullet("orb", { speed: 140 })` copies a
preset with overrides; spread a PATTERNS entry to tweak it: `{ ...PATTERNS.ring16, id: "boss_ring", count: 20 }`.

| id | kind | count(xshots) | spreadDeg | speed | aim | telegraph ms | tier |
|---|---|---|---|---|---|---|---|
| `single_down` | straight | 1 | - | 150 | none | 0 | 1 |
| `twin_down` | straight | 2 | - | 160 | none | 0 | 1 |
| `aimed_slow` | aimed | 1 | - | 140 | player | 0 | 1 |
| `aimed_needle` | aimed | 1 | - | 230 | player | 0 | 1 |
| `fan3_slow` | spread | 3 | 36 | 130 | none | 0 | 1 |
| `fan3_aimed` | aimed | 3 | 30 | 150 | player | 0 | 1 |
| `ring8_slow` | circular | 8 | - | 100 | none | 400 | 1 |
| `tank_shell` | aimed | 1 | - | 130 | player | 300 | 1 |
| `fan5` | spread | 5 | 60 | 150 | none | 0 | 2 |
| `fan5_aimed` | aimed | 5 | 56 | 160 | player | 0 | 2 |
| `burst3_aimed` | burst | 1x3 | - | 220 | player | 0 | 2 |
| `burst3_lead` | burst | 1x3 | - | 220 | lead | 0 | 2 |
| `ring12` | circular | 12 | - | 115 | none | 500 | 2 |
| `spiral_slow` | spiral | 2x12 | - | 110 | none | 400 | 2 |
| `cross4` | multi | 1 (4 emitters) | - | 120 | none | 0 | 2 |
| `cross4_rotating` | multi | 1x6 | - | 120 | none | 0 | 2 |
| `sweep_down` | sweep | 1x9 | 100 | 170 | none | 0 | 2 |
| `flak_burst` | aimed | 3 | 28 | 170 | player | 250 | 2 |
| `homing_single` | homing | 1 | - | 140 | player | 700 | 2 |
| `mortar_blast` | delayedBlast | 1 (r40) | - | - | player | hazard 1000 | 2 |
| `carpet_bomb` | areaStrike | 5 blasts | - | - | none (forward) | hazard 900 | 2 |
| `mine_drop` | straight | 1 | - | 40 | none | 0 | 2 |
| `sweep_turret` | sweep | 1x6 | 50 | 160 | player | 0 | 2 |
| `twin_aimed` | aimed | 2 (2 muzzles) | 14 | 170 | player | 0 | 2 |
| `fan7_aimed` | aimed | 7 | 84 | 170 | player | 300 | 3 |
| `ring16` | circular | 16 | - | 125 | none | 650 | 3 |
| `ring_double` | burst | 12x2 | 330 | 120 | none | 650 | 3 |
| `spiral_double` | spiral | 4x18 | - | 125 | none | 650 | 3 |
| `burst5_aimed` | burst | 1x5 | - | 240 | player | 300 | 3 |
| `burst_fan3` | burst | 3x3 | 30 | 180 | player | 0 | 3 |
| `needle_lead` | aimed | 1 | - | 300 | lead | 250 | 3 |
| `big_orb_slow` | aimed | 3 | 40 | 95 | player | 600 | 3 |
| `homing_pair` | homing | 2 | 70 | 145 | player | 800 | 3 |
| `homing_salvo4` | homing | 2x2 | 80 | 150 | player | 900 | 3 |
| `sweep_wide` | sweep | 2x10 | 120 | 180 | player | 300 | 3 |
| `artillery_triple` | delayedBlast | 3 (r38) | - | - | player | hazard 1100 | 3 |
| `carpet_heavy` | areaStrike | 7 blasts | - | - | player | hazard 1000 | 3 |
| `flak_wall` | straight | 5 (44u apart) | - | 120 | none | 600 | 3 |
| `aa_flak_volley` | burst | 2x3 | 18 | 180 | player | 0 | 3 |
| `xcross8` | multi | 1x4 (8 emitters) | - | 130 | none | 650 | 3 |

Unknown pattern ids resolve to `single_down` with a console warning (never crash).
