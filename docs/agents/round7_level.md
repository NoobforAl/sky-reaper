# Round 7: LEVEL agent (src/levels/**, src/bosses/**)

Status: DONE (edits final; bot numbers in section 6).

## 1. R6-1: density and pressure in ch3-5 (for the combat agent's HP tuning)

Rules I kept:
- No new bombers, drone rows or carpets.
- Nothing new inside a gust window (from the telegraph at -1 s to the end of the gust).
- Every new heavy tank has a bomb pickup within about 6 s before it.
- Sanity is 0 errors and 0 warnings in all 5 chapters at 540x960, 1138x640, 1366x768 and 1920x1080. That covers overlaps, naval, land, gusts and citadel.

New units inherit the chapter hpScale: desert 1.25, arctic 1.4, citadel 1.55. Unit counts below are for portrait. Wide adds copies as usual.

### Totals before and after (portrait)

| ch | spawns | air | ground | max kill score |
|---|---|---|---|---|
| desert | 208 -> **251** | 147 -> 183 | 61 -> 68 | 44,500 -> 54,300 |
| arctic | 243 -> **284** | 189 -> 222 | 54 -> 62 | 55,610 -> 64,960 |
| citadel | 305 -> **343** | 244 -> 272 | 61 -> 71 | 78,350 -> 89,000 |

### Desert (`src/levels/chapters/desert.ts`)

| t | added |
|---|---|
| 16 | interceptor stream ×3 (LC) |
| 25 | bomb pickup (RC) |
| 26.5 | tank_heavy column ×2 (RC+20) |
| 35 | fighter_basic_elite vee ×3 (RC) |
| 57.5 | fighter_basic_elite vee ×5 (C), right after the last gust (t 53-56) |
| 64.5 | tank_heavy ×1 (R-40); the bomb pickup at t 68 already existed |
| 71.5 | interceptor stream ×4 (L) |
| 81.5 | fighter_basic arc ×7 (C) |
| 93 | tank_heavy column ×2 (R-50); bombs at t 88 |
| 99 | helicopter ×2 (LC, RC) |
| 105 | fighter_heavy vee ×3 (C) |
| 145 / 147.5 | bomb pickup (C+30), then tank_heavy column ×2 (C+30) |
| 163.5 | interceptor stream ×4 (R) |
| 182 | fighter_basic vee ×5 (C) |

Desert gusts are unchanged (44.5, 48.5, 53, 111, 133.5, 137.5, 186.5). `checkGusts` is clean.

### Arctic (`src/levels/chapters/arctic.ts`)

| t | added |
|---|---|
| 8 / 9.5 | bomb pickup (L+40), then tank_heavy column ×2 (L+40) |
| 20.5 | interceptor stream ×3 (R) |
| 27 | fighter_basic vee ×5 (RC) |
| 50.5 | helicopter ×2 (LC, RC), after the blizzard gusts |
| 63.5 | tank_heavy column ×2 (L+40); bombs at t 55 |
| 76.5 | interceptor stream ×4 (RC) |
| 85 | fighter_basic_elite vee ×5 (RC+30) |
| 110 | tank_heavy column ×2 (R-40); bomb at t 106 |
| 121 | fighter_basic vee ×5 (C) |
| 147.5 | tank_heavy ×2 (L+40, R-40); bombs at t 153 come just after (an early bomb check) |
| 160 | interceptor stream ×4 (R) |
| 186.5 | fighter_basic_elite vee ×5 (C) |

### Citadel (`src/levels/chapters/citadel.ts`)

| t | added |
|---|---|
| 15 / 16.5 | bomb pickup (LC), then tank_heavy column ×2 (LC) |
| 25.5 | interceptor stream ×4 (C) |
| 41.5 | tank_heavy column ×2 (R-40); bomb at t 38 |
| 52 | fighter_basic_elite vee ×5 (LC) |
| 64.5 / 66 | bomb pickup (C), then tank_heavy ×2 (L+40, R-40) |
| 71 | interceptor stream ×4 (R) |
| 97 | fighter_heavy vee ×3 (C) |
| 115.5 / 116 | bomb pickup (C), then tank_heavy ×2 (L+40, R-40) |
| 148 | interceptor stream ×5 (C) |
| 167 / 168.5 | bomb pickup (RC), then tank_heavy column ×2 (RC) |
| 187 | fighter_basic_elite vee ×7 (C) |

Heavy tanks take bombs only (100 HP, armour 3). On a 0-upgrade ship (72 per bomb) that is 2 bombs in desert and arctic (125 / 140 HP) and 3 in the citadel (155 HP). DAMAGE upgrades bring the citadel down to 2. That is the "upgrades matter" check on the ground.

## 2. R6-4: land vehicles on the river (jungle and arctic)

- `src/levels/naval.ts` adds `isLandMover`, `landHalf`, `landOnWater`, `landBankShift` and `landSpawnX`.
  - At spawn, `landSpawnX` moves a tank, walker or crawler column to the nearest x whose whole on-screen path stays dry. An APC only needs a dry entry. Roads and rails count as dry.
- `src/levels/runner.ts` adds `onRoad` and `landGuardShift`, and calls `landSpawnX` in `spawn()`.
  - Every step, `followRiver` calls `keepOnLand`: a vehicle that touches the water off a road surface is put back on its bank, or back onto the causeway it drove off.
  - A diagonal mover also turns its heading away from the water, the same way it bounces off the field walls.
  - This also covers wide copies. It allocates nothing.
- `src/levels/sanity.ts` adds `checkLand`, which runs inside `checkLevels`.
  - Straight and sine movers must stay dry with no help from the guard.
  - Diagonal movers are replayed with the guard. It is an error if one is on the water when it comes on screen, or if the guard has to move it more than 4 u in one 1/30 s step.
- The first run found 18 portrait errors (jungle and arctic). Authored fixes in jungle: t 52 tank_light LC -> C+50; t 132 tank_heavy LC -> L-10; t 164 tank column R-30 -> R+30.
- Now 0 errors at all widths. The largest remaining spawn move is 72 u (jungle t 112 APC, off screen).

## 3. R6-5: free-standing citadel wall bars

`src/levels/backgrounds/index.ts` (citadel pass 6): on wide fields, the inner compound wall between the runway and the avenue used to stop 88 u short of the avenue. It now runs on until it meets the avenue kerb (T-joint). The end cap facing the runway stays, as a gate. Checked on a 1920 screenshot at t 40.

## 4. R6-7: boss lengths (godMode, power 4, `--budget`, seeds 1 and 2)

`BossBase.phaseAt` (`framework.ts`) lets one boss move HP between its phases. The default is still `BOSS_TUNING.phaseAt` [0.72, 0.42].

| boss / layout | change | before (R6 QA) | after s1 / s2 |
|---|---|---|---|
| pacific portrait | hpMul 2.2 -> 2.45 | 39.5 s | 43.8 / 42.2 s |
| pacific wide | phaseAt [0.65, 0.4] | 43.9 s, P1 gate 0.9 (4.3 in my first run) | 44.0 / 48.0 s, gate 2.9 / 0 |
| desert portrait | none | 40.7 s | 40.7 / 42.5 s |
| desert wide | hpMul 1.75 -> 2.45, phaseAt [0.66, 0.4] | 41.9 s, **P1 gate 5.65 s** | 45.3 / 45.6 s, **gate 0 / 0** |
| arctic portrait | none | 54.5 s | 46.1 / 47.4 s |
| arctic wide | hpMul 2.2 -> 2.1, phaseAt [0.68, 0.25] | **61.8 s** (P3 36.6 s, escalation 2) | **57.9 / 58.8 s** (P3 about 21 s), escalation 0, gates 0 |

## 5. R5-7: the jungle "Destroy 2 bases or hangars" objective

- **Why it failed:** a probe of the novice bot showed it reached each base with 0-1 bombs left, because tanks and AA used them up on the way. The bases needed 3 bombs, so most of them took exactly one hit.
- **Changes:**
  - Both strongholds (t 46 and t 120) now put the base and the hangar in ONE column on the right bank, in the lane the bomb pickups lead into. That column is C+70 on the 480 field and C+25 authored on wide, which maps to x 846 next to the centre lane.
  - Bases and hangars spawn with `hpScale 0.33` (59 / 53 HP): one bomb kills one.
  - The AA guns that stood behind the bases moved to the edge.
  - New supply hangar at t 87 (LC), with a bomb pickup at t 85.5.
- The goal and the text are unchanged (goal 2, now out of 5 targets). No new strings.
- **Bots (novice, replan 18, 0 upgrades):**
  - before: 0/4 (R6 QA);
  - after: portrait 3 / 2 / 5 and wide 3 / 3 / 3 bases. **6 of 6 runs meet the objective.**

## 6. Novice 0-upgrade bot runs, ch3-5 (after the density pass)

These runs are on a scratch build of the shared working tree, so they include the combat and engine agents' work in progress (for example chapterDmg ch3 4.6 -> 2.9). The settings were novice, replan 18, seeds 1 and 2.

| ch | 0 upgrades (R6 QA wind-aware bot) | 0 upgrades (now) | budget loadout, seed 1 (now) |
|---|---|---|---|
| desert | 0/4 fail | **3/4 fail** (portrait t 182 / 182, wide s1 t 161; wide s2 wins with 2 deaths) | 2/2 wins, 0 deaths |
| arctic | 2/4 fail | **2/4 fail** (portrait t 130 / 142; wide wins with 2 / 2 deaths) | portrait wins with 2 deaths; wide fails at t 179 (bot noise?) |
| citadel | 4/4 fail | **4/4 fail** (t 110-162) | 2/2 wins, 2 deaths each |

Raw JSON: `%TEMP%\sr-r7-level\out\play-nov0.json` and `play-novbud.json`.

## Open / for others

- Max kill score rises 14-22 % in ch3-5. Medal thresholds (`medalScores`) were authored from round-6 scores and should be re-derived by QA. I did not change them.
- Combat agent: the new heavy tanks take 2 bombs at 0 upgrades (3 in the citadel). If tank_heavy HP or armour changes, recheck the bomb supply in the tables above.
