# SKY REAPER: QA playtest and balance report

Date: 2026-11-19 · Build: private snapshot (`vite build` into a scratch dir, served by `vite preview --port 5282`), taken at the start of the session while other agents were still editing. Difficulty **normal (1.0)**, fresh save (un-upgraded Falcon, vulcan + bomb only), **no godMode** except for the boss time-to-kill pass.

All numbers below come from the scripts in `tests/qa/`. Raw data and screenshots are in `test-results/qa/`. `npx playwright test` empties `test-results/` when it starts, so if the folder is missing, re-run the scripts (commands at the end).

## How it was measured

- **Bot** (`tests/qa/bot.js`, injected into the page). It replaces `InputService.poll()` and reads the world through `window.__sky`. It holds fire the whole time and drops a bomb when a ground target will be under the bomb's landing point (220u ahead, adjusted for scroll). It fires flares when a missile is homing within 200u, or when every move would be hit within 0.16 s. It also chases air targets, ground targets and pickups. To dodge, it scores 33 straight-line moves (16 directions × 2 speeds + stay) against extrapolated bullets, hazards and air bodies over 0.08–0.7 s.
- **Four pilot profiles**, so the verdict does not rest on one superhuman bot:
  | profile | movement re-plan | perception | look-ahead | panic flares |
  |---|---|---|---|---|
  | expert | every frame | 330u | 0.7 s | yes |
  | human | every 200 ms | 330u | 0.7 s | yes |
  | novice | every 300 ms | 150u | 0.25 s | no |
  | no-dodge | never dodges (only chases targets) | – | – | yes |
- **Runs:** 5 chapters × 2 layouts (`?layout=wide` 1920×1080, `?layout=portrait` 540×960). Expert, human and novice ran seeds 1 and 2; no-dodge ran seed 1. That is 70 full playthroughs. They ran in turbo (extra fixed `SIM_DT` steps per frame, same sim logic).
- **Fairness / escape area:** every sim step, a move counts as "safe" if its straight path stays collision-free for 0.35 s at full speed. **Zero-escape** means none of the 33 moves is safe while the player is vulnerable. Each hit is tagged "unavoidable" if a zero-escape sample came in the 0.5 s before it.
- **FPS:** a separate real-time pass in Edge with the GPU (Intel UHD, D3D11), 35 s of early waves plus 35 s of boss, per chapter and layout. The display is 75 Hz, so 75 is the cap.
- **Boss time-to-kill:** godMode, `startAt` = boss time − 2, power as it builds up during the fight.

## Summary per chapter (averaged over the human and novice profiles, 4 runs per cell)

| ch | layout | result | deaths | dmg taken (novice) | air / ground kills | spawned / kill-rate | score (final) | medal (ace =) | credits | boss TTK in run | max / avg enemy bullets | FPS min / avg |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 pacific | wide | 4/4 win | 0 | 41 | 187 / 19 | 326 / 0.63 | 58k | ACE (42k) | 1560 | 17 s | 148 / 38 | 52 / 73 |
| 1 pacific | portrait | 4/4 win | 0 | 16 | 157 / 14 | 186 / 0.92 | 47k | ACE (42k) | 1460 | 10 s | 43 / 10 | 46 / 74 |
| 2 jungle | wide | 4/4 win | 0 | 60 | 154 / 28 | 377 / 0.48 | 66k | ACE (53k) | 1630 | 36 s | 132 / 39 | 65 / 75 |
| 2 jungle | portrait | 4/4 win | 0 | 24 | 164 / 28 | 223 / 0.86 | 63k | ACE (53k) | 1880 | 18 s | 39 / 11 | 50 / 74 |
| 3 desert | wide | 4/4 win | 0 | 57 | 152 / 52 | 371 / 0.55 | 69k | ACE (51.5k) | 2400 | 18 s | 182 / 37 | 1* / 66 |
| 3 desert | portrait | 4/4 win | 0 | 4 | 153 / 42 | 216 / 0.90 | 63k | ACE (51.5k) | 2125 | 11 s | 55 / 9 | 75 / 75 |
| 4 arctic | wide | 4/4 win | 0 | 55 | 175 / 24 | 410 / 0.49 | 65k | ACE (62k) | 2120 | 36 s | 204 / 60 | 65 / 75 |
| 4 arctic | portrait | 4/4 win | 0 | 27 | 194 / 30 | 245 / 0.91 | 77k | ACE (62k) | 2410 | 20 s | 75 / 16 | 75 / 75 |
| 5 citadel | wide | 4/4 win | 0 | 76 | 236 / 22 | 548 / 0.47 | 102k | ACE (85k) | 3660 | 32 s | 643 / 104 | 75 / 75 |
| 5 citadel | portrait | 4/4 win | 0 | 29 | 235 / 32 | 318 / 0.84 | 111k | ACE (85k) | 3970 | 25 s | 155 / 22 | 75 / 75 |

\* one 1013 ms stall in the desert-wide boss window. It happened once in one run, so it is probably host contention from other agents' builds. Re-check it (issue 10).

**No-dodge bot** (stands in the fire, only chases targets): it **won all 10 runs**. 3 lives were lost in total: desert-wide 1, citadel-wide 2. Damage taken per chapter: wide 340 / 356 / 564 / 427 / 656, portrait 152 / 283 / 194 / 322 / 249.
**Expert / human / novice:** 60 runs, 60 wins, **0 deaths**, 0 game-over. Boss reached and beaten in 70 of 70 runs. No console or page errors in any run.

## Difficulty curve verdict

**Too easy across the board on normal, and the curve is shallow.** A bot that never dodges clears chapter 5. A novice-level bot (300 ms reactions, 150u vision) takes at most 76 damage in a whole chapter. On wide, damage pressure (no-dodge damage, bullet density) rises about 2× from chapter 1 to 5, which is the intended direction but from far too low a base. On portrait the curve is **not monotonic**: no-dodge damage goes ch2 283 > ch3 194 < ch4 322 > ch5 249, and average bullets stay at 8–22 on screen. Bosses last 10–36 s in real runs, against a design target of 40–60 s. Every run reaches max weapon power 5 before the boss. Medals are meaningless: every bot profile, including no-dodge, scores above the **ACE** threshold in every chapter.

The game is **fair**: across 60 dodging runs there were 0 unavoidable hits, and the expert bot never saw a zero-escape moment (0 of about 270k samples). The gap is challenge, not fairness, so there is room to raise pressure safely.

## Top issues (most severe first)

### 1. Normal difficulty has almost no lethality (owner: engine, enemy)
Evidence: the no-dodge bot wins 10/10 with 3 total deaths. Dodging bots: 0 deaths in 60 runs (`test-results/qa/play-nododge.json`, `play-novice.json`). The no-dodge bot takes 150–650 damage per chapter and still survives. The main reasons are the 40 shield regenerating at 10/s after only 3 s, 1.2 s i-frames per hit, and only 8–22 enemy bullets on screen on average in portrait.
Suggested tuning (aim: the novice profile loses about 1 life in ch3–5, no-dodge fails ch4–5):
- `src/weapons/index.ts` `BASE_SHIELD_REGEN` 10 → **5**, `BASE_SHIELD_DELAY` 3 → **4**.
- `src/player/index.ts` `PLAYER_TUNING.hitIframes` 1.2 → **0.9**.
- `src/core/world.ts` `WORLD_TUNING.dmgBase` 0.5 / `dmgSlope` 0.5 → keep normal = 1.0 but per chapter. Either scale attack intervals by chapter index, or (enemy agent) cut `AttackDef.interval` by about 15 % for ch3, 25 % for ch4 and 35 % for ch5 units.
- Then re-run `node tests/qa/playtest.mjs play --replan=18 --novice` and `--nododge` to check.

### 2. Medal thresholds are below what a non-dodging player scores (owner: level, engine)
Evidence: final scores are 1.1–1.8× the ACE threshold in every chapter for every profile, including no-dodge. Chapter 1 portrait scored 44.9k against ACE 42k without dodging. Score per kill is high and the combo reaches ×2 easily.
Suggested tuning: in `src/levels/chapters/*.ts` `medalScores`, set ACE to about the expert-bot score ×1.0 and BRONZE to about novice ×0.55:
pacific `[26000, 38000, 50000, 62000]`, jungle `[34000, 48000, 62000, 75000]`, desert `[35000, 50000, 63000, 75000]`, arctic `[38000, 54000, 68000, 82000]`, citadel `[55000, 80000, 100000, 120000]`. Or slow the combo: `+0.1 per kill` → `+0.05` in the engine combo code (§3.7). If you do that, re-derive the thresholds.

### 3. Bosses die in 10–36 s; phase 3 sometimes lasts under 2 s (owner: level/bosses)
Evidence: boss TTK in the real runs above. The godMode boss pass (`test-results/qa/boss.json`) splits it by phase, P1 / P2 / P3 in seconds:

| boss | maxHp | portrait P1/P2/P3 = total | wide P1/P2/P3 = total |
|---|---|---|---|
| carrier | 1710 | 9.5 / 3.0 / **1.2** = 13.7 | 20.9 / 34.0 / **0.6** = 55.4 |
| heli_gunship | 2040 | 19.2 / 4.7 / **1.9** = 25.8 | 27.6 / 12.0 / 9.5 = 49.1 |
| land_fortress | 2580 | 9.1 / 3.2 / **1.7** = 14.0 | 13.0 / 18.4 / 10.7 = 42.0 |
| ice_dreadnought | 2780 | 11.0 / 4.3 / 5.8 = 21.1 | 16.3 / 31.2 / 83.7 = 131.1 |
| citadel_core | 3900 | 12.8 / 9.5 / 6.3 = 28.6 | 18.1 / 13.2 / 11.7 = 42.9 |

Portrait bosses take about 30–50 % as long as wide ones. A narrower field puts several parts inside one vulcan stream at power 5. The final phase, the one with the signature attacks, often ends before its first big telegraphed attack (900 ms telegraph plus 1.6 s `phaseBreather`). Ice dreadnought wide P3 at 84 s is the opposite problem (the bot struggles to reach the parts) and is worth a manual look.
Suggested tuning in `src/bosses/framework.ts` `BOSS_TUNING`: `hpBase` 0.85 → **1.9**, `hpSlope` 0.15 → **0.3** (normal goes from ×1.0 to ×2.2). `phaseAt` [0.68, 0.36] → **[0.70, 0.45]** so phase 3 holds 45 % of HP. Also either raise core/bridge HP in `src/bosses/parts.ts` (carrier `bridge` 700 → 1100, fortress `core` 900 → 1400) or make the core invulnerable until phase 3 starts. On wide, consider dividing the HP scale by `sqrt(X_SCALE)` clamped to 0.75 so the two layouts finish closer together.

### 4. Wide layout spawns ~1.7× the enemies, which breaks the kill-rate objective and halves kill rate (owner: level)
Evidence: spawned pacific 326 vs 186, citadel 548 vs 318. Kill rate is 0.47–0.63 on wide vs 0.84–0.92 on portrait. The jungle objective **"Destroy 70% of enemies"** was met **0/6 on wide** (0.42–0.52) vs 6/6 on portrait. Wide also has 4–5× the average bullets (citadel wide peaked at **643** enemy bullets). Wide side lanes spawn units the player cannot reach in time with a 480u-wide vulcan stream.
Suggestion: in `src/levels/runner.ts`, when lanes are scaled by `X_SCALE`, either do not multiply formation counts, or exclude units spawned beyond 480·X_SCALE·0.8 from `stats.spawned`. Or change `jun_rate` to `goal: 0.45` on wide. Objectives should not depend on layout.

### 5. Several objectives are effectively unreachable (owner: level, enemy)
Completion over 12 human/expert/novice runs per chapter (6 wide + 6 portrait):

| objective | met | observed range |
|---|---|---|
| pacific "Sink 6 ships" (`tag:naval ≥ 6`) | **0/12** | 1–4 |
| jungle "Destroy 3 bases or hangars" (`tag:base ≥ 3`) | **0/12** | 0 |
| jungle "Destroy 70% of enemies" | 6/12 (portrait only) | 0.42–0.88 |
| desert "Destroy 45 ground targets" | 6/12 (wide only) | 40–53 |
| arctic "Destroy 9 armoured vehicles" (`tag:vehicle`) | **2/12** | 3–9 |
| arctic "3 flares or fewer" | **0/12** | 4–11 (the bot uses flares freely, so this is probably fine for humans) |
| citadel "14 structures" | 9/12 | 10–26 |

`tests/qa/probe-base.mjs` confirmed that bases and hangars **can** be destroyed: hangar 3 bombs, military_base 4 bombs (armor 2), destroyer 4 bombs. The limit is **ordnance**. The bot used 13–22 bombs per chapter in total (5 at start, 1 regenerated every 25 s, plus pickups), and naval units weave at 46u/s, so 0.6 s bomb drops miss. A bot that does not lead moving targets understates this, but 0/12 for two objectives means they are tuned too tight.
Suggested tuning: `src/enemies/defs.ts` `military_base` hp 260 → **180** (3 bombs), `armor` 2 → 1. `src/player/index.ts` `PLAYER_TUNING.bombRegenSec` 25 → **15**. Pacific `pac_naval` goal 6 → **4**, jungle `jun_struct` goal 3 → **2**. Arctic `arc_vehicle` 9 → **6**, or add 4 more armoured vehicles to the arctic timeline.

### 6. Tutorial asks for bombs while the player has none (owner: level, ui)
Evidence: `test-results/qa/tutorial-wide-fixed-t40.png` and `tutorial-portrait-fixed-t36.png` show the HUD bomb slot at **"EMPTY"** while the hint says "ORANGE BRACKETS = BOMBS ONLY" (t 33) and then "GREY SPARK = WRONG WEAPON. SWITCH TO BOMBS (K)" (t 38). The 5 starting bombs plus the t 26 pickup are spent on the two gunboats (t 26/29). The legend hint also stays up only **5 s** (33 → 38), less than `HINT_SECONDS` 7. The hint order itself is good (move 0 s → guns 7 s → bombs 25 s → legend 33 s → immune 38 s → pickups 48 s → flares 65.5 s → weapon swap 80 s), and there are no overlaps with banners except t 0 and t 25, which are fine.
Suggested fix in `src/levels/chapters/pacific.ts`: add `.pickup("bomb", C)` at `tl.at(32.5)` and `tl.at(37)`, and move `tutorial("immune")` from 38 → **40.5** so the legend is readable for 7 s. Optionally make bombs free while a ground-tutorial hint is active.

### 7. Wide layout: the hint panel covers the band where ground targets and missile carriers enter (owner: ui)
Evidence: `tutorial-wide-hint-t25.png`, `tutorial-wide-immune-t30.png` and `tutorial-wide-fixed-t40.png` show the hint box (about 810×65 at y≈30–95) on top of gunboats, the runway AA/radar and fighters as they enter. `tutorial-portrait-fixed-t67.png` shows "MISSILE LOCK!" covering the missile carrier it refers to. The vulnerability brackets themselves are readable in both layouts: orange corner brackets on gunboats, radar and destroyers, green on AA (`tutorial-*-fixed-t36.png`).
Suggestion: `src/ui/hud.ts`: draw the hint above the bottom HUD bar (y ≈ GAME_H − 150) or at 55 % alpha, and make it semi-transparent whenever an enemy is under it. The portrait hint also wraps mid-phrase ("GREEN = GUNS OR / BOMBS"). Shorten it to "ORANGE = BOMBS ONLY · GREEN = GUNS OR BOMBS".

### 8. Portrait HUD: score digits run into the combo multiplier (owner: ui)
Evidence: `tutorial-portrait-fixed-t36.png` shows "4,101x1.4" overlapping at the top-left. With 5-digit scores (all chapters end at 45k–115k) it will overlap for the whole run. Suggestion: `src/ui/hud.ts` portrait layout, right-align the combo at a fixed x (score box right edge) or move it under the score.

### 9. Missiles are not a threat in any chapter, and do not scale (owner: enemy)
Evidence: 2284 enemy missiles launched over all runs and **20 hits (0.9 %)**. Every missile kind tops out at 140–150 u/s with a turn rate of 75–85°/s and 5.5 s life. The player moves 270 u/s (up to 432 u/s horizontally on wide). **No missile was impossible to outrun**, which is good for fairness. But chapter 5 missiles (`sam_site`, `missile_carrier_elite`) are no stronger than chapter 1 ones.
Suggested tuning in `src/patterns/presets.ts` `missile`: keep it for ch1–2. For ch3+ elites and `sam_site`, use `speed` **190**, `turnRate` **95**, `armDelay` 0.5. That is still below player speed and inside the §3.4 limit of ≤ 110°/s.

### 10. Weapon power maxes out every run (owner: enemy/level drops)
Evidence: final `power` = **5** in 60 of 60 dodging runs. Even the godMode boss pass, which skips straight to the boss, reaches power 4–5 from boss-fight drops. Power-ups stop mattering after about the first third of a chapter. Losing a power level on death (§3.1) is also irrelevant, since nobody dies.
Suggestion: `src/enemies/defs.ts` `military_base` `drop("power", 1)` → 0.5, `destroyer` `drop("power", 0.5)` → 0.3. Have the level timelines place at most 3 scripted power pickups per chapter.

### 11. Economy: one clear of chapter 1 buys a weapon; one campaign buys almost every unlock (owner: engine)
Credits per win (`test-results/qa/economy.json`, 14 wins per chapter): pacific **1486**, jungle **1747**, desert **2186**, arctic **2251**, citadel **3723**. A first campaign clear earns **11,393**.

| item | cost | runs of ch1 | runs of ch5 | campaign clears |
|---|---|---|---|---|
| spread / rocket | 400 / 600 | 0.3 / 0.4 | 0.1 / 0.2 | 0.04 / 0.05 |
| laser / heavy | 1500 / 1800 | 1.0 / 1.2 | 0.4 / 0.5 | 0.13 / 0.16 |
| Raptor / Bulwark | 2500 / 3500 | 1.7 / 2.4 | 0.7 / 0.9 | 0.22 / 0.31 |
| all upgrades to level 4 | 8851 | 6.0 | 2.4 | 0.78 |
| all upgrades maxed | 41001 | 27.6 | 11.0 | 3.6 |
| whole shop | 59851 | 40 | 16 | 5.3 |

All 6 weapon unlocks plus both aircraft cost 12,400 in total, which is roughly one campaign. Upgrades are the long tail. Score/100 makes up the biggest share of credits (500–1100 per win), so the score inflation in issue 2 feeds the economy too. `finishRun` pays `chapter.reward` on every victory, not only the first, so replaying ch5 farms 3.7k per run.
Suggestions: `src/core/results.ts` `RESULTS_TUNING.creditScoreDivisorWin` 100 → **200**. Pay `chapter.reward` only on the first clear (check `save.data.chapters[id]?.completed` before adding it). Raise weapon `unlockCost` in `src/weapons/index.ts` so laser/heavy cost about 2 chapter wins (laser 1500 → **2800**, heavy 1800 → **3200**, pmissile 1200 → **2200**), keeping spread and rocket cheap as early rewards.

### 12. Fairness: no unavoidable patterns found; a few pinch points (owner: enemy), low severity
Evidence: expert and human profiles had **0** zero-escape samples over about 530k steps and 0 unavoidable hits. Novice and no-dodge got pinned 1–37 times per run. Most pinches involve telegraphed hazards (bomber carpet `areaStrike` / ground artillery) plus aimed fire. Recurring spots: arctic t≈29–31 (destroyer + ice_walker + missile_carrier together, `play-nododge.json` arctic both layouts), citadel t≈108–112 (`bomber_elite` carpet strikes), and jungle/desert t≈100–127 (`tank_heavy` + hazards). These spots are avoidable with good positioning and fit "ch4–5 intense". If issue 1 makes damage more punishing, give `bomber_elite` areaStrike hazards `telegraphMs` ≥ 900 (currently the bot sees them armed within 0.12 s of the player's path).

### 13. Performance: fine (owner: engine), informational
Real-time GPU pass (`test-results/qa/fps.json`): average 66–75 FPS (75 Hz cap) in every chapter, layout and boss. The minimum 1-second bucket was ≥ 46 FPS everywhere except one **1013 ms stall** in desert-wide during the boss. It was not reproduced elsewhere and may be host contention, so re-test it alone with `node tests/qa/playtest.mjs fps --chapters=desert --layouts=wide`. Peak simultaneous enemy bullets: 643 (citadel wide, normal play), well inside the 1400 pool.

## Caveats

- The bots have perfect information about bullet positions. The human and novice profiles only add reaction delay and shorter vision, not misreads, panic or overlapping HUD. Real players will take more damage than the novice bot, but the gap to "no-dodge still wins" is large enough that issue 1 stands.
- The bombing logic does not lead moving targets, so ground-kill and naval numbers are a lower bound (issue 5).
- Runs used a snapshot taken at the start of this session. Code other agents have changed since is not covered.

## Reproduce

```
npx vite build --outDir <scratch>/qa-dist --emptyOutDir
npx vite preview --outDir <scratch>/qa-dist --port 5282 --strictPort
node tests/qa/playtest.mjs play --seeds=1,2                    # expert
node tests/qa/playtest.mjs play --seeds=1,2 --replan=12 --suffix=human
node tests/qa/playtest.mjs play --seeds=1,2 --replan=18 --novice --suffix=novice
node tests/qa/playtest.mjs play --nododge --suffix=nododge
node tests/qa/playtest.mjs boss
node tests/qa/playtest.mjs fps          # real time, run alone
node tests/qa/playtest.mjs tutorial     # screenshots
node tests/qa/economy.mjs test-results/qa/play-human.json test-results/qa/play-novice.json
node tests/qa/probe-base.mjs
```
Set `QA_OUT=<dir>` to write somewhere `playwright test` cannot wipe.
