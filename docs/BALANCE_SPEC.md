# SKY REAPER: balance spec (round 5)

Status: spec only. No source was edited. Plan: `docs/BALANCE_RESEARCH.md`. Date: 2026-11-19.
Author: balance agent (round 4 window). Round 5 applies it.

**Line numbers** are as of this writing. Round 4 agents were editing these files at the same time, so before you edit, find each line by the quoted anchor text, not by line number alone. Values marked "(round 4)" were already changed by round 4. They are listed as the **current** value.

Every change below has an ID (E1, P2, B3...). Apply them in the order of section 9.

---

## 0. Evidence used

- **Source tables.** I bundled `src/levels/chapters/*`, `src/enemies/defs.ts`, `src/bosses/parts.ts` and `src/weapons/index.ts` with esbuild and counted every spawn, drop and pickup. The script is `<scratch>/balance/analyze.mjs` and its output is `census.json`. The numeric model is `model.mjs` and its output is `model.out`. The scratch dir is `C:\Users\noobf\AppData\Local\Temp\claude\a91a28e87aad4ff7\dfbf98d8-fb72-4316-ad30-477a519fb2a9\scratchpad\balance\`.
- **Latest QA bot runs** on the round-4 build (`<scratch>/qa-out/play-{expert,human,novice,nododge}.json`, about 70 runs). These are newer than `docs/QA_REPORT.md`.
  - Expert, human and novice bots with **0 upgrades won every run of ch1 to ch5**. They had **0 deaths**, except one novice death in citadel-wide.
  - Novice damage taken per chapter: 0 to 140 on most runs, 402 at most (citadel wide).
  - The **no-dodge** bot wins ch1 and ch2: 155 to 434 damage, at most 1 death. It fails ch3, ch4 and ch5 (2 to 3 deaths, game over around t = 70 to 180 s). Round 4's lethality changes worked for no-dodge but not for anyone who dodges.
  - Weapon power is 5 at the boss in about 90 % of runs.
  - Bosses now end at the phase-gate floor (`minPhaseSec` 11): phases come out at 15 / 26 / 39 s after spawn. That means boss length no longer depends on DPS at all.
- **The core structural finding: in-run power dwarfs meta upgrades.** Vulcan DPS goes from 72 at power 1 to 323 at power 5 (×4.5), and power 5 is reached by about a third of the way into every chapter. All 8 levels of DAMAGE (+8 %) and FIRE RATE (+6 %) together give only ×1.88. So today upgrades barely matter and the player never needs them. This spec:
  1. makes upgrades stronger per level,
  2. makes in-run power scarcer, so a novice reaches the boss at power 3 to 4,
  3. sizes bosses for DPS, with a soft timer that punishes low DPS,
  4. raises bullet pressure and cuts durability.

---

## 1. Current-state numbers

### 1.1 Chapters (portrait counts; wide adds flank duplicates)

| ch | id | units | regular HP pool | base kill score | expected coins | power: scripted + expected drops | shield / repair scripted | reward | objectives (sum) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | pacific | 186 | 5,105 | 33,250 | 118 | 3 + 3.1 | 2 / 1 | 500 | 550 |
| 2 | jungle | 215 | 6,764 | 43,050 | 146 | **4** + 4.0 | 2 / 1 | 700 | 650 |
| 3 | desert | 208 | 6,792 | 44,500 | 152 | 3 + 3.6 | 2 / 1 | 900 | 750 |
| 4 | arctic | 243 | 8,858 | 55,610 | 188 | 3 + 6.0 | 2 / 1 | 1100 | 850 |
| 5 | citadel | 305 | 12,824 | 78,350 | 268 | 3 + 8.4 | 2 / **2** | 1500 | 1200 |

It takes 4 power pickups to go from power 1 to power 5. Every chapter offers 6 to 11.

### 1.2 Credits per first clear (QA bots, 0 upgrades, fresh save)

Credits = coins + objectives met + `reward` (full on the first clear, 25 % on a replay) + score / 200.

| ch | average run | good run | cumulative average at chapter start | cumulative good at chapter start |
|---|---|---|---|---|
| 1 | 1300 | 1450 | 0 | 0 |
| 2 | 1550 | 1850 | 1300 | 1450 |
| 3 | 1950 | 2300 | 2850 | 3300 |
| 4 | 2050 | 2300 | 4800 | 5600 |
| 5 | 3300 | 4000 | 6850 | 7900 |

Wide runs earn about 15 % less, because they collect fewer coins.

### 1.3 Upgrade levels affordable at the start of each chapter (current prices)

Current price is `round(base × (lvl+1)^1.4)`, with bases damage 90, fireRate 100, hull 70, shield 80, bombs 120, speed 60, flares 60.

| chapter start | plan budget (levels) | cost of budget path* (current) | greedy, any upgrade | greedy, damage/fireRate/hull/shield only |
|---|---|---|---|---|
| ch2 | 3 | 260 | **11** | 8 |
| ch3 | 6 | 842 | **16** | 12 |
| ch4 | 9 | 1912 | **21** | 15 |
| ch5 | 12 | 3446 | **25** | 18 |

\* The budget path is the reference loadout used throughout this spec:

| chapter | damage | fireRate | hull | shield | levels |
|---|---|---|---|---|---|
| ch2 | 1 | 1 | 1 | – | 3 |
| ch3 | 2 | 2 | 1 | 1 | 6 |
| ch4 | 3 | 3 | 2 | 1 | 9 |
| ch5 | 4 | 4 | 2 | 2 | 12 |

Upgrades are priced at roughly **one fifth** of income. That is fine for a store where nothing matters, but not once upgrades are expected to carry the player.

### 1.4 Player DPS (vulcan, big single target, wing guns 50 % on target)

| power | 0 upg | ch2 budget (current / new) | ch3 budget (current / new) | ch4 budget (current / new) | ch5 budget (current / new) |
|---|---|---|---|---|---|
| 1 | 72 | 82 / 85 | 94 / 98 | 105 / 113 | 118 / 129 |
| 2 | 88 | 101 / 104 | 115 / 121 | 129 / 139 | 145 / 158 |
| 3 | 151 | 173 / 178 | 196 / 207 | 221 / 238 | 247 / 271 |
| 4 | 228 | 261 / 268 | 296 / 312 | 334 / 359 | 373 / 409 |
| 5 | 323 | 369 / 380 | 419 / 441 | 472 / 507 | 528 / 578 |

Budget DPS multiplier, ch1 to ch5:
- current per-level values: ×1.00 / 1.145 / 1.299 / 1.463 / 1.637;
- **new** per-level values (U1): ×1.00 / 1.177 / 1.368 / 1.573 / **1.792**.

With the new values, a 0-upgrade ship in ch5 does 1/1.792 = **56 %** of the budgeted DPS, about 44 % less. That matches the plan's "about 40 % less".

Armour widens the gap. Enemy armour is subtracted per bullet, and vulcan does 3 to 4.2 per bullet. Against armour 2 at power 1, 0 upgrades deal 1.0 per bullet, while the ch5 budget deals 2.2 (×2.2).

### 1.5 Time to kill: regular air enemies (s, vulcan, focused)

These use the new chapter HP scale (E1) in the hardest chapter where each unit appears.

| enemy | hp / armour | chapter | 0 upg P1 | 0 upg P3 | 0 upg P5 | budget P1 | budget P3 | budget P5 |
|---|---|---|---|---|---|---|---|---|
| fighter_basic | 12 / 0 | ch5 ×1.55 | 0.3 | 0.1 | 0.1 | 0.1 | 0.1 | 0.0 |
| interceptor | 10 / 0 | ch5 | 0.2 | 0.1 | 0.1 | 0.1 | 0.1 | 0.0 |
| fighter_heavy | 70 / 1 | ch5 | 2.3 | 1.0 | 0.5 | 1.1 | 0.5 | 0.3 |
| helicopter | 55 / 0 | ch4 ×1.4 | 1.1 | 0.5 | 0.3 | 0.7 | 0.3 | 0.2 |
| bomber | 120 / 1 | ch5 | 3.9 | 1.7 | 0.9 | 1.9 | 0.9 | 0.5 |
| missile_carrier | 140 / 1 | ch5 | 4.5 | 2.0 | 1.1 | 2.2 | 1.0 | 0.5 |
| gunship_light | 80 / 1 | ch2 ×1.1 | 1.8 | 0.8 | 0.4 | 1.5 | 0.7 | 0.4 |
| fighter_basic_elite | 26 / 0 | ch5 | 0.6 | 0.3 | 0.1 | 0.3 | 0.1 | 0.1 |
| fighter_heavy_elite | 140 / 2 | ch5 | 9.0 | 3.2 | 1.5 | 3.2 | 1.3 | 0.7 |
| helicopter_elite | 110 / 1 | ch5 | 3.6 | 1.6 | 0.8 | 1.7 | 0.8 | 0.4 |
| missile_carrier_elite | 240 / 2 | ch5 | 15.5 | 5.5 | 2.6 | 5.5 | 2.3 | 1.2 |
| bomber_elite | 220 / 2 | ch5 | 14.2 | 5.1 | 2.4 | 5.0 | 2.1 | 1.1 |
| citadel_turret | 70 / 2 | ch5 | 4.5 | 1.6 | 0.8 | 1.6 | 0.7 | 0.3 |
| ice_walker | 60 / 2 | ch4 | 3.5 | 1.2 | 0.6 | 1.5 | 0.6 | 0.3 |

Today, with chapter scale 1.0 to 1.2, every fodder unit dies in 0.1 to 0.4 s at power 3 or more. **HP is not the pressure lever for regular waves.** The levers are bullet density and speed, durability, and how much power the player has. Regular-enemy HP scaling (E1) is kept moderate, so the real difference shows on armoured elites and bosses.

### 1.6 Bombs to kill: ground enemies (bomb 75 × damageMult − armour)

| enemy | hp / armour | hardest chapter | today | new HP, 0 upg | new HP, budget |
|---|---|---|---|---|---|
| tank_heavy | 100 / 3 | ch5 | 2 | 3 | 2 |
| tank_heavy_elite | 180 / 4 | ch5 | 4 | 4 | 3 |
| military_base | 180 / 1 | ch5 | 3 | 4 | 3 |
| hangar | 160 / 1 | ch5 | 3 | 4 | 3 |
| destroyer | 220 / 2 | ch4 | 4 | 5 | 4 |
| gunboat / radar / sam / ice_walker | 50–60 | ch4–5 | 1 | 2 | 1 |

The DAMAGE upgrade now saves ordnance, which is the second reason to buy it.

### 1.7 Bosses: HP and phase time to kill (portrait, normal difficulty)

Model assumptions:
- vulcan DPS × 0.75 hit efficiency;
- ground bosses (carrier, fortress) also take about 16 DPS from bombs;
- phases hold 30 / 25 / 45 % of HP (`phaseAt` [0.7, 0.45]).

"Current" means today's HP with no gate. In practice the 11 s gate stretches every phase to 11 s or more.

| ch | boss | HP now (×2.2 × hpMul) | HP new (B1) | power | now, 0 upg P1/P2/P3 | new, 0 upg P1/P2/P3 (total) | new, budget P1/P2/P3 (total) |
|---|---|---|---|---|---|---|---|
| 1 | carrier | 3198 | 6019 | P4 | 5.1 / 4.3 / 7.7 | 9.6 / 8.0 / 14.5 (32) | same (no budget in ch1) |
| 1 | carrier | | | P3 | 7.4 / 6.2 / 11.1 | 13.9 / 11.6 / 20.9 (46) | same |
| 2 | heli_gunship | 4488 | 8303 | P4 | 7.9 / 6.6 / 11.8 | 14.6 / 12.1 / 21.8 (49) | 12.4 / 10.3 / 18.6 (41) |
| 2 | heli_gunship | | | P3 | 11.9 / 9.9 / 17.8 | 22.0 / 18.3 / 32.9 (73) | 18.7 / 15.6 / 28.0 (62) |
| 3 | land_fortress | 5676 | 9933 | P4 | 9.1 / 7.6 / 13.6 | 15.9 / 13.3 / 23.9 (53) | 11.8 / 9.8 / 17.6 (39) |
| 3 | land_fortress | | | P3 | 13.1 / 10.9 / 19.7 | 23.0 / 19.2 / 34.5 (77) | 17.1 / 14.2 / 25.6 (57) |
| 4 | ice_dreadnought | 4825 | 12487 | P4 | 8.5 / 7.1 / 12.7 | 21.9 / 18.3 / 32.9 (73) | 13.9 / 11.6 / 20.9 (46) |
| 4 | ice_dreadnought | | | P3 | 12.8 / 10.6 / 19.1 | 33.0 / 27.5 / 49.6 (110) | 21.0 / 17.5 / 31.5 (70) |
| 5 | citadel_core | 7920 | 14256 | P4 | 13.9 / 11.6 / 20.8 | 25.0 / 20.8 / 37.5 (83) | 14.0 / 11.6 / 20.9 (47) |
| 5 | citadel_core | | | P5 | 9.8 / 8.2 / 14.7 | 17.7 / 14.7 / 26.5 (59) | 9.9 / 8.2 / 14.8 (33) |

With the B2 soft timers (18 / 16 / 26 s), a budgeted player at power 4 never triggers escalation. A 0-upgrade player at power 4 triggers it in ch4 and ch5, and at power 3 from ch2 on. Phases shorter than 11 s are still held by the existing gate (`minPhaseSec` 11), so **every phase lasts at least 11 s**.

---

## 2. Upgrades and economy

| ID | file:line (anchor) | current | new |
|---|---|---|---|
| U1 | `src/weapons/index.ts:32` `{ id: "damage"` | `baseCost: 90, perLevel: 0.08`, desc "+8% weapon damage per level" | `baseCost: 170, perLevel: 0.10`, desc "+10% weapon damage per level" |
| U1 | `src/weapons/index.ts:33` `{ id: "fireRate"` | `baseCost: 100, perLevel: 0.06`, "+6%" | `baseCost: 180, perLevel: 0.07`, "+7% fire rate per level" |
| U1 | `src/weapons/index.ts:34` `{ id: "hull"` | `baseCost: 70, perLevel: 10`, "+10 hull HP" | `baseCost: 120, perLevel: 15`, "+15 hull HP per level" |
| U1 | `src/weapons/index.ts:35` `{ id: "shield"` | `baseCost: 80, perLevel: 8` | `baseCost: 130, perLevel: 10`, "+10 shield and faster regeneration per level" |
| U1 | `src/weapons/index.ts:36` `{ id: "bombs"` | `baseCost: 120` | `baseCost: 170` |
| U1 | `src/weapons/index.ts:37` `{ id: "speed"` | `baseCost: 60` | `baseCost: 100` |
| U1 | `src/weapons/index.ts:38` `{ id: "flares"` | `baseCost: 60` | `baseCost: 100` |
| U2 | `src/weapons/index.ts:90` `Math.pow(level + 1, 1.4)` | exponent 1.4 | exponent **1.25** |
| U3 | `tests/qa/economy.mjs:31` `Math.pow(lvl + 1, 1.4)` | 1.4 | **1.25**. It re-implements `shopCost` and must stay in sync. |
| R1 | `src/levels/chapters/jungle.ts:124` `reward: 700` | 700 | **750** |
| R1 | `src/levels/chapters/desert.ts:122` `reward: 900` | 900 | **1000** |
| R1 | `src/levels/chapters/arctic.ts:121` `reward: 1100` | 1100 | **1300** |
| R1 | `src/levels/chapters/citadel.ts:119` `reward: 1500` | 1500 | **1600** |
| R1 | `src/levels/chapters/pacific.ts:125` `reward: 500` | 500 | 500 (unchanged) |
| R2 | `src/core/results.ts:11` `replayRewardFrac: 0.25` | 0.25 | **0.35**. A replay should close a budget gap, not farm. |
| R3 | `src/core/results.ts:9` `creditScoreDivisorWin: 200` | 200 | 200 (keep). The THREAT score multiplier (section 7) already adds credits for strong play. |

New price table (`round(base × (lvl+1)^1.25)`):

| upgrade | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | total |
|---|---|---|---|---|---|---|---|---|---|
| damage | 170 | 404 | 671 | 962 | 1271 | 1596 | 1936 | 2287 | 9297 |
| fireRate | 180 | 428 | 711 | 1018 | 1346 | 1690 | 2049 | 2422 | 9844 |
| hull | 120 | 285 | 474 | 679 | 897 | 1127 | 1366 | 1615 | 6563 |
| shield | 130 | 309 | 513 | 735 | 972 | 1221 | 1480 | 1749 | 7109 |
| bombs | 170 | 404 | 671 | 962 | 1271 | 1596 | 1936 | 2287 | 9297 |
| speed / flares | 100 | 238 | 395 | 566 | 748 | 939 | 1139 | 1345 | 5470 |

Projected income assumes about 10 % less score and objectives under the harder rules, plus the R1 rewards:

| chapter start | budget levels | budget path cost (new) | projected cumulative average | share of income | greedy, any upgrade (new) |
|---|---|---|---|---|---|
| ch2 | 3 | 470 | 1220 | 0.39 | 8 |
| ch3 | 6 | 1432 | 2735 | 0.52 | 12 |
| ch4 | 9 | 3099 | 4680 | 0.66 | 17 |
| ch5 | 12 | 5388 | 6835 | 0.79 | 20 |

- A player who spends only on combat upgrades always reaches the budget without a replay.
- A player who also buys spread and rocket (1000), or one aircraft, needs **about 1 replay** before ch4 or ch5. A replay is worth about 1200 to 1400 with R2. This matches plan item 1.
- Weapon, aircraft and skin prices stay as they are.

---

## 3. Enemy scaling per chapter

| ID | file:line (anchor) | current | new |
|---|---|---|---|
| E1 | `src/levels/chapters/jungle.ts:11` after `const tl = new TL();` | none (×1.0) | add `tl.setDefaults({ hpScale: 1.1 });` |
| E1 | `src/levels/chapters/desert.ts:13` `tl.setDefaults({ hpScale: 1.05 })` | 1.05 | **1.25** |
| E1 | `src/levels/chapters/arctic.ts:12` `hpScale: 1.1` | 1.1 | **1.4** |
| E1 | `src/levels/chapters/citadel.ts:12` `hpScale: 1.2` | 1.2 | **1.55** |
| E1 | pacific | 1.0 | 1.0 |

The chapter HP scale works out to 1 + 0.7 × (budget DPS multiplier − 1). A budgeted ship kills slightly *faster* than in ch1, and a 0-upgrade ship about 30 to 35 % slower.

| ID | file:line (anchor) | current | new |
|---|---|---|---|
| T1 | `src/patterns/tiers.ts:27` (index 0) | `fireRate: 1.0, bulletSpeed: 1.0` | `fireRate: 1.0, bulletSpeed: 1.0` |
| T1 | `src/patterns/tiers.ts:28` (index 1) | `1.2, 1.04` | `fireRate: 1.25, bulletSpeed: 1.06` |
| T1 | `src/patterns/tiers.ts:29` (index 2) | `1.38, 1.08` | `fireRate: 1.45, bulletSpeed: 1.12` |
| T1 | `src/patterns/tiers.ts:30` (index 3) | `1.5, 1.12` | `fireRate: 1.65, bulletSpeed: 1.18` |
| T1 | `src/patterns/tiers.ts:31` (index 4) | `1.62, 1.16` | `fireRate: 1.85, bulletSpeed: 1.24` |
| T1 | missileSpeed / missileTurn | 1.0 / 1.05 / 1.18 / 1.25 / 1.32 and 0 / 0 / 8 / 12 / 16 | unchanged (missiles must stay outrunnable) |
| D1 | `src/core/world.ts:59` `chapterDmg: [0.8, 1.05, 1.15, 1.25, 1.35]` | as shown | **[0.9, 1.2, 1.3, 1.4, 1.5]** |

Notes:
- Bullet speed after T1 stays under the runner caps (`MAX_BULLET_SPEED` 260, aimed single 340, `src/patterns/runner.ts:15-16`). For example, `small` 170 → 211 and `needle` 240 → capped at 260.
- Bullet-pool check: the peak on citadel wide was 643. With T1 (×1.14) and THREAT 3 (×1.3) the expected peak is about 950, still under the pool of 1400 (`world.ts:47`).

---

## 4. Player durability, pickups and power supply

| ID | file:line (anchor) | current | new |
|---|---|---|---|
| P1 | `src/player/index.ts:38` `hitIframes: 0.9` | 0.9 (round 4; was 1.2) | **0.7** |
| P1 | `src/player/index.ts:40` `shieldOnlyIframes: 0.5` | 0.5 | **0.35** |
| P1 | `src/player/index.ts:44` `respawnIframes: 3` | 3 | 3 (keep: relief after a death) |
| P2 | `src/weapons/index.ts:81` `BASE_SHIELD_REGEN = 4` | 4 (round 4; was 10) | **3** |
| P2 | `src/weapons/index.ts:83` `BASE_SHIELD_DELAY = 4` | 4 | **5** |
| P2 | `src/weapons/index.ts:119` `BASE_SHIELD_REGEN + lShield * 1.5` | +1.5/s per level | keep +1.5. With P2, shield level 2 gives 6/s, double the base, so SHIELD is worth buying. |
| P3 | `src/player/index.ts:55` `repairFrac: 0.35` | 0.35 | **0.30** |
| P4 | `src/core/world.ts` `WORLD_TUNING` (add after `chapterDmg`, line 59) | – | `powerDropMul: [1, 0.7, 0.55, 0.45, 0.4],` and `sustainDropMul: [1, 1, 0.7, 0.6, 0.5],` |
| P4 | `src/core/world.ts:874` in `dropsFor`: `if (this.rngFn() > d.chance) continue;` | raw chance | `const ci = this.chapterIndex; const mul = d.kind === "power" ? WORLD_TUNING.powerDropMul[ci] ?? 1 : d.kind === "repair" \|\| d.kind === "shield" ? WORLD_TUNING.sustainDropMul[ci] ?? 1 : 1; if (this.rngFn() > d.chance * mul) continue;` |
| P5 | `src/levels/chapters/jungle.ts:81` `tl.at(137).pickup("power", C)` | 4 scripted power | **delete** this line's power pickup (leaves 3) |
| P5 | `src/levels/chapters/desert.ts:67` `tl.at(105).pickup("power", C)` | 3 | delete (leaves 2: t 33 and t 184) |
| P5 | `src/levels/chapters/arctic.ts:64` `tl.at(106).pickup("bomb", C).pickup("power", LC)` | 3 | remove `.pickup("power", LC)` (leaves 2) |
| P5 | `src/levels/chapters/citadel.ts:57` `...spawns("missile_launcher", [L + 30]).pickup("power", C)` | 3 | remove `.pickup("power", C)` (leaves 2) |
| P6 | `src/levels/chapters/desert.ts:42` `tl.at(57).pickup("shield", C)` | 2 scripted shields | delete (ch3+ keeps only the pre-boss shield) |
| P6 | `src/levels/chapters/arctic.ts:53` `tl.at(86).pickup("shield", C)` | 2 | delete |
| P6 | `src/levels/chapters/citadel.ts:42` `...spawns("aa_turret", [LC, RC]).pickup("shield", C)` | 2 | remove `.pickup("shield", C)` |
| P6 | `src/levels/chapters/citadel.ts:66` `tl.at(117).pickup("repair", C)` | 2 repairs | delete (leaves the pre-boss repair) |
| P7 | `src/core/world.ts:1199` in `deployFlare`: `} else if (inside && b.hp <= 0 && b.radius <= 9) {` | flares clear all small bullets within 120u, boss fights included | while `this.boss` is active, clear non-missile bullets only within **60u** (`radius * 0.5`). Missiles are still destroyed or diverted. Add `const bulletR2 = this.boss ? r2 * 0.25 : r2;` and test `dx*dx+dy*dy <= bulletR2`. (The plan says "bombs"; in this game it is flares that clear bullets. Bombs never do.) |
| P8 | `src/player/index.ts:347` `p.power = Math.max(1, p.power - 1)` | −1 power on death | keep −1 (relief) |

Expected power pickups after P4 and P5, if everything is killed:

| ch | scripted + expected drops | total |
|---|---|---|
| 1 | 3 + 3.1 | 6.1 |
| 2 | 3 + 2.8 | 5.8 |
| 3 | 2 + 2.0 | 4.0 |
| 4 | 2 + 2.7 | 4.7 |
| 5 | 2 + 3.4 | 5.4 |

Portrait kill rate is about 0.85 and wide about 0.5. So the expert bot reaches power 5 late in the chapter, and a novice reaches the boss at **power 3 to 4**, which is the power level the boss table assumes.

Effective durability at 0 upgrades:
- one life: 100 hull + 40 shield;
- shield refill after a hit: 5 s delay + 13.3 s regen = 18.3 s (today: 4 + 10 = 14 s);
- i-frame windows 22 % shorter, so dense patterns land about 25 % more hits.

---

## 5. Bosses: DPS gate instead of HP sponge

| ID | file:line (anchor) | current | new |
|---|---|---|---|
| B1 | `src/bosses/carrier.ts:16` `super("carrier", world, 0.85)` | hpMul 0.85 (HP 3198) | **1.6** (6019) |
| B1 | `src/bosses/heli_gunship.ts:21` `super("heli_gunship", world)` | 1 (4488) | **1.85** (8303) |
| B1 | `src/bosses/land_fortress.ts:19` `super("land_fortress", world)` | 1 (5676) | **1.75** (9933) |
| B1 | `src/bosses/ice_dreadnought.ts:18` `super("ice_dreadnought", world, 0.85)` | 0.85 (4825) | **2.2** (12487) |
| B1 | `src/bosses/citadel_core.ts:23` `super("citadel_core", world)` | 1 (7920) | **1.8** (14256) |
| B1 | `src/bosses/framework.ts:51-52` `hpBase: 1.1, hpSlope: 1.1` | ×2.2 on normal | keep |
| B1 | `src/bosses/framework.ts:54` `wideHpMin: 0.6` | | keep |
| B1 | `src/bosses/framework.ts:31` `phaseAt: [0.7, 0.45]` | | keep |
| B1 | `src/bosses/framework.ts:35` `minPhaseSec: 11` | 11 | keep (the guarantee that every phase lasts 10 s or more) |
| B2 | `src/bosses/framework.ts:29` `BOSS_TUNING` | – | add `softSec: [18, 16, 26] as const`, `escalateEvery: 6`, `escalateMax: 3`, `escalateCd: 0.12`, `escalateSpeed: 0.06` |
| B2 | `src/bosses/framework.ts:458` `const speed = this.phase === 3 ? 0.8 : this.phase === 2 ? 0.9 : 1;` | phase factor only | `const speed = (phase factor as now) * (1 - BOSS_TUNING.escalateCd * this.escalation) / (1 + 0.10 * threatLevel);` where `threatLevel` comes from section 7 (0 if missing) |
| B2 | `src/bosses/framework.ts` in `update` after the `drain` check (line 398) | – | `const soft = BOSS_TUNING.softSec[this.phase - 1]; const esc = this.phaseT < soft ? 0 : Math.min(BOSS_TUNING.escalateMax, 1 + Math.floor((this.phaseT - soft) / BOSS_TUNING.escalateEvery));`. When `esc > this.escalation`, set it and emit a banner: stage 1 `"BOSS ENRAGED"`, stage 2 `"ENRAGED II"`, stage 3 `"ENRAGED III"` (`ms: 1200`), and `playSfx("warning")`. In `setPhase`, reset `this.escalation = 0`. |
| B2 | `src/bosses/framework.ts:246` `fire(pattern, from, facing)` | – | when `this.escalation > 0` (or THREAT > 0), start a copy of `pattern` with `bullet.speed × (1 + escalateSpeed × escalation) × (1 + 0.08 × threat)`, cached per (pattern, stage), skipping missile and hazard patterns (same rule as `tieredPattern`). Telegraph times are unchanged. |
| B3 | `src/bosses/framework.ts:37` `maxPhaseSec: 24` | 24 s (drain starts, which *helps* weak players and cancels the DPS gate) | **50** |
| B3 | `src/bosses/framework.ts:39` `drainPerSec: 0.05` | 0.05 | **0.03**. Hard anti-softlock only: by 50 s the boss is at ENRAGED III. |
| B4 | `src/bosses/framework.ts:43` `shieldTimeout: 45` | 45 | keep |

Escalation timeline, as seconds past the soft timer:

| seconds past soft timer | stage | move cooldowns | boss bullet speed |
|---|---|---|---|
| 0 | 1 | ×0.88 | ×1.06 |
| 6 | 2 | ×0.76 | ×1.12 |
| 12 | 3 | ×0.64 | ×1.18 |

**Stage 3 (ENRAGED III)** also adds a "punish" move. When `escalation === 3`, fire `BP.burst3` from the core every 2.5 s. Use the existing move entry shape with `phases: [1, 2, 3]`, gated in its `fire` by `b.escalation === 3`. Add it once in the framework, not per boss.

The HUD boss bar should pulse red while `escalation > 0`. That needs `BossHudInfo` to expose `escalation`; this is a contract request (see section 10).

---

## 6. Combo (unchanged)

The combo stays as it is: `comboWindow` 2, `comboStep` 0.1, `comboMax` 2 (`world.ts:63-65`). THREAT now provides the score pressure. If medals inflate after section 7, see M1.

---

## 7. THREAT rank (light, visible, 0 to 3)

**State** (engine; `RunStatsRT` in `src/core/world.ts` around line 100, next to `combo`):

```ts
threat: number;       // 0..3, HUD reads it like combo
threatMeter: number;  // 0..100
```

Add to `WORLD_TUNING`:

```ts
threat: { max: 3, perLevel: 100, noHitPerSec: 2, perKillAtCombo: 1, comboGate: 1.5,
          bulletSpeedPerLevel: 0.08, fireRatePerLevel: 0.10, scorePerLevel: 0.25 }
```

**Triggers** (in the world `step`, next to the combo window at line 409):
- The meter gains `noHitPerSec × dt` while the player is alive and has not taken damage.
- Each kill by the player while `combo >= comboGate` adds `perKillAtCombo`. Do this in `killEnemy` (line 840), right after the combo update.
- When `threatMeter >= perLevel` and `threat < max`: `threat++`, `threatMeter = 0`. Emit `banner { text: "THREAT " + "I".repeat(threat), ms: 1200 }` and `playSfx("warning", { volume: 0.5 })`.
- Pace check: an expert (no hits, about 0.9 kills/s at combo) gains about 2.9 points/s, so one level per 35 s and THREAT 3 around t ≈ 105 s. A novice who is hit every 20 to 30 s rarely reaches 1.

**Reset:**
- Any damage that lands (shield or hull, through `onPlayerHit`, `world.ts:1104`) sets `threatMeter = 0`. The level is kept.
- Death (`playerDied`, or `pc.die`) sets `threat = 0` and `threatMeter = 0`.
- A new chapter starts at 0.

**Effects** at level L:

| effect | where | value |
|---|---|---|
| enemy bullet speed (non-missile, non-hazard) | `world.ts:892`: `b.speed = spec.speed * this.spdScale` → `* (b.isMissile ? 1 : 1 + 0.08 * L)` | +8 % per level (max +24 %); runner caps still apply |
| enemy fire rate | `src/enemies/index.ts:172` `let rate = difficultyFireRate(...) * CHAPTER_TIERS[st.tier]!.fireRate` → `* (1 + 0.10 * threatOf(world))` | +10 % per level (max +30 %) |
| boss move rate | B2 formula | same +10 % per level |
| kill score | `world.ts:843` `score = Math.round(def.score * st.combo)` → `* (1 + 0.25 * L)` | ×1.0 / 1.25 / 1.5 / 1.75. Credits follow through score / 200. |

`threatOf(world)` reads `(world as { threat?: number }).threat ?? 0`, through a getter `get threat()` on `World`, the same pattern as `chapterIndex` at `world.ts:333`.

**HUD** (`src/ui/hud.ts:66`, next to the combo read): draw `THREAT` with 3 pips under the combo label.
- Pip colours: 1 amber, 2 orange, 3 red with a pulse.
- Hidden at 0, so the screen stays quiet for players who struggle.
- Wide and portrait use the same anchor as the combo, right-aligned (QA #8 layout).

**Fairness:**
- Hazard telegraphs are untouched.
- Missiles never speed up from THREAT.
- The zero-escape check in `tests/qa/bot.js` must still show 0 samples for the expert at THREAT 3 (acceptance A6).

---

## 8. Medals (follow-up to THREAT)

M1. THREAT pushes expert scores up by about 30 to 45 %. After round 5 QA, re-derive `medalScores` at `src/levels/chapters/*.ts` (`pacific.ts:126`, `jungle.ts:125`, `desert.ts:123`, `arctic.ts:122`, `citadel.ts:120`):
- ACE = median expert final score;
- GOLD = median human score;
- BRONZE = 0.55 × median novice score.

Starting guess if there is no time for a re-derive: multiply the 4th and 3rd thresholds by 1.25 and leave the 1st and 2nd as they are.

---

## 9. Order of application (round 5)

1. U1, U2, U3, R1, R2 (economy). Run `node tests/qa/economy.mjs` and check that the table in section 2 is reproduced.
2. P1, P2, P3, D1 (durability).
3. T1, E1 (enemy pressure).
4. P4, P5, P6 (power and pickup supply).
5. B1, B3, then B2 (boss gate).
6. P7 (flares in boss fights).
7. Section 7 THREAT (world, enemies, bosses, HUD).
8. QA (section 11). Then M1.
9. If a target is missed, use the knobs in section 11.

---

## 10. Contract requests (append to docs/CONTRACT_REQUESTS.md; work with casts meanwhile)

- `WorldAPI.threat?: number` (read-only, 0 to 3). Today it is read through a cast like `chapterIndex`.
- `BossHudInfo.escalation?: number` (0 to 3), so the HUD can pulse the boss bar.
- `RunStats.threatMax?: number`, optional, for the results screen ("MAX THREAT II").

---

## 11. QA acceptance targets

The bots are `tests/qa/playtest.mjs`, normal difficulty, both layouts, seeds 1 and 2.

**Prerequisite:** add a `--budget` flag to `playtest.mjs`. Before `startChapter`, it writes the section 1.3 reference loadout for that chapter into `window.__sky.services.save.data.upgrades`:

| chapter | upgrades |
|---|---|
| ch1 | `{}` |
| ch2 | `{damage:1, fireRate:1, hull:1}` |
| ch3 | `{damage:2, fireRate:2, hull:1, shield:1}` |
| ch4 | `{damage:3, fireRate:3, hull:2, shield:1}` |
| ch5 | `{damage:4, fireRate:4, hull:2, shield:2}` |

Without the flag, runs use 0 upgrades.

| # | bot / setup | chapters | target | today (round-4 build) |
|---|---|---|---|---|
| A1 | `--nododge`, 0 upg | ch1 | may win; at least 1 death in 2 of 2 layouts | wins, 0 deaths |
| A1 | `--nododge`, 0 upg | **ch2** | **fails** (game over) in 2 of 2 layouts | wins (0 to 1 deaths) |
| A2 | `--replan=18 --novice`, 0 upg | ch1, ch2 | wins, 0 to 2 deaths | wins, 0 deaths |
| A2 | `--replan=18 --novice`, 0 upg | **ch3** | **fails** in at least 3 of 4 runs (2 seeds × 2 layouts) | wins, 0 deaths |
| A3 | `--replan=18 --novice --budget` | ch3, ch4, ch5 | wins in at least 3 of 4 runs per chapter, **1 to 3 deaths** on average | n/a |
| A4 | expert (default), 0 upg | ch1 to ch3 | wins, 0 to 1 deaths | wins, 0 |
| A4 | expert (default), `--budget` | ch4, ch5 | wins, **0 to 1 deaths** | n/a |
| A5 | `boss` mode (godMode) at power 4, with `--budget` | all | every phase lasts **10 s or more**; total 40 to 60 s; escalation stage 0 to 1 at most | phases 15 / 26 / 39 s after spawn (gate floor) |
| A5b | `boss` mode at power 4, 0 upg | ch4, ch5 | escalation reaches stage 1 or more in at least 2 phases | n/a |
| A6 | expert | all | 0 zero-escape samples, 0 unavoidable hits (fairness kept at THREAT 3) | 0 / 0 |
| A7 | human (`--replan=12`) | ch5 | median THREAT reached is 2 or more | n/a |
| A8 | `economy.mjs` on human + novice JSON | – | cumulative average credits at the start of ch2 / ch3 / ch4 / ch5 ≥ 1.1 × budget cost (470 / 1432 / 3099 / 5388), and ≤ 3.0 × | 5× to 2× today |

**Tuning knobs if a target misses.** Apply one step at a time and re-run only the failing cell.

| miss | first knob | second knob |
|---|---|---|
| A1 (no-dodge still wins ch2) | D1 ch2 1.2 → 1.3 | T1 ch2 fireRate 1.25 → 1.35 |
| A2 (novice wins ch3) | T1 ch3 fireRate 1.45 → 1.55 | D1 ch3 1.3 → 1.4, then P2 regen 3 → 2.5 |
| A3 (budget novice dies more than 3 times) | U1 hull perLevel 15 → 20 | E1 one step down (−0.05) in that chapter, then softSec +3 s |
| A3 (budget novice 0 deaths) | as A2 | – |
| A4 (expert dies more than once) | THREAT `bulletSpeedPerLevel` 0.08 → 0.06 | `fireRatePerLevel` 0.10 → 0.08 |
| A5 (a phase under 10 s) | the gate already prevents it. If it is reported, check `minPhaseSec`. | – |
| A5 (total over 60 s with budget) | that boss's B1 hpMul −0.15 | – |

Run commands (scratch build, never port 5173):

```
npx vite build --outDir %TEMP%\<scratch>\bal-dist --emptyOutDir
npx vite preview --outDir %TEMP%\<scratch>\bal-dist --port 43xx --strictPort
set QA_URL=http://localhost:43xx & set QA_OUT=<scratch>\bal-qa
node tests/qa/playtest.mjs play --nododge --chapters=pacific,jungle --suffix=nododge
node tests/qa/playtest.mjs play --seeds=1,2 --replan=18 --novice --chapters=pacific,jungle,desert --suffix=novice
node tests/qa/playtest.mjs play --seeds=1,2 --replan=18 --novice --budget --chapters=desert,arctic,citadel --suffix=novice-budget
node tests/qa/playtest.mjs play --seeds=1,2 --budget --suffix=expert-budget
node tests/qa/playtest.mjs boss --budget
node tests/qa/economy.mjs <QA_OUT>/play-human.json <QA_OUT>/play-novice.json
```

---

## 12. Risks and caveats

- **The numbers are modelled, not playtested.** The DPS, TTK and economy figures are exact arithmetic on the current tables. The survival targets (A1 to A4) depend on bot behaviour and will need one or two knob passes (section 11).
- **Wide layout.** Wide spawns about 1.5× the units and has boss HP × `BOSS_LAYOUT_HP` (≥ 0.6). Its bullet density is much higher, so failure targets may be met on wide before portrait. Judge A1 to A3 per layout. If wide is much harsher, scale `chapterDmg` on wide by 0.9 rather than weakening portrait.
- **Novice-bot ceiling.** The bots have perfect bullet knowledge. Real players will take more hits than the novice bot, so err toward the easy edge of each target band.
- **Score and medals.** THREAT and the combo multiply each other, up to ×3.5 per kill. Re-derive medals (M1) or ACE becomes trivial for experts and unreachable for everyone else.
- **Round 4 drift.** Round 4 may have changed some of these values again since this was written. Re-grep the anchors, and if a value already differs from both "current" and "new", keep the "new" value in this spec and note it in the round-5 report.
