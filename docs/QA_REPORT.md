# SKY REAPER: QA playtest and balance report

## Round 7 verification (HP gate, damage cap, gust arrow, desert paint, land-locked vehicles, citadel walls, boss lengths, jungle objective)

Date: 2026-11-19 · Build: a fresh `vite build` of the current working tree (round-7 edits, uncommitted) into `%TEMP%\sr-qa-r7\dist`, served by `vite preview --port 5610` (stopped afterwards). Normal difficulty. 70 bot runs, a 10-cell godMode boss pass, a real-time GPU FPS pass (4 cells, Intel UHD, 75 Hz cap) and 20 screenshots (the ones cited below were read). Raw JSON: `%TEMP%\sr-qa-r7\out\`, screenshots: `%TEMP%\sr-qa-r7\shots\`. No test or bot changes this round.

**Gates:**
- `npx tsc --noEmit`: clean. `npm run typecheck:worker`: clean.
- `node tests/i18n/check.mjs`: PASS (502 en / 502 fa, 36 signed numbers bidi-checked). No new strings this round.
- Level sanity (`checkLevels` via Vite SSR, now including `checkLand`) at 540×960, 1138×640, 1366×768, 1920×1080: **0 errors, 0 warnings** in all 5 chapters. `checkCitadel`: 38 structures, 0 failures (max delay 4.84 s portrait, 1.57 s wide).
- `npx playwright test` (temp config, port 5610): **13/13 passed** first run. `perf.spec`: 74.9 fps, worst frame 40.2 ms, 12 hazards at peak.
- 0 page or console errors in every bot, boss, FPS and screenshot run.

### Headline

**Partly. The hard wall for a 0-upgrade player is ch4, not ch3. Upgraded players finish.**
- 0-upgrade novice: ch1–2 8/8 wins with 0 deaths. **Ch3 fails 4/12** (seeds 1–6, both layouts). The 8 wins are grinds: 1–2 deaths, and the boss takes 71–138 s at escalation 3 (budget novice: 75–84 s, expert budget: 37–58 s). **Ch4 4/4 fail** (t 161–181), **ch5 4/4 fail** (t 97–182).
- Budget novice (BALANCE_SPEC reference loadout): ch3 4/4, ch4 4/4, ch5 3/4 wins. Expert: 24/24 wins.
- So someone who skips the shop clears ch3 about two times in three and then cannot pass ch4. Someone who buys the reference upgrades wins with about one death per chapter. Upgrades clearly matter from ch3 on.

### Targets

| # | setup | target | round 7 result | verdict |
|---|---|---|---|---|
| A1 | no-dodge, 0 upg, ch1 | ≥ 1 death | 2/2 wins, **0 deaths** (dmg 230 / 291) | miss (unchanged since R5) |
| A1 | no-dodge, 0 upg, ch2 | game over 2/2 | 2/2 wins with **2 deaths** (dmg 502–507) | miss (R6: 1 of 2) |
| A1 | (info) no-dodge ch3 | – | game over 2/2 at **t 52** (R6: t 43 / 56) | – |
| A2 | novice, 0 upg, ch1 / ch2 | wins, 0–2 deaths | 8/8 wins, 0 deaths (dmg 14–79) | met |
| A2 | novice, 0 upg, **ch3** | fails ≥ 3/4 | seeds 1–2: **1/4** (portrait s2 t 183). Seeds 3–6: **3/8** (portrait s4 t 191, portrait s5 t 161, wide s3 t 332 in the boss). Total **4/12**. Average deaths, with a fail counted as 3: **2.1** (budget: 1.0) | **miss** (soft wall) |
| A2+ | novice, 0 upg, ch4 | fail | **4/4** (t 161–181, power 1–2) | met |
| A2+ | novice, 0 upg, ch5 | fail | **4/4** (t 97–182, power 1–3) | met |
| A3 | novice `--budget` ch3 / ch4 / ch5 | ≥ 3/4 wins, avg 1–3 deaths | ch3 4/4, avg **1.0** · ch4 4/4, avg **1.5** · ch5 3/4 (citadel wide s1 failed t 198), avg **1.5** | met |
| A4 | expert, 0 upg, ch3–5 | wins, 0–1 deaths | 12/12 wins. 3 runs with 1 death (citadel ×3), the rest 0 | met |
| A4b | expert `--budget` ch3–5 | – | 12/12 wins. 1 death in 1 run (desert wide s2) | met |
| A5 | boss pass, godMode, power 4, `--budget` | phases ≥ 10 s, total 40–60 s, escalation ≤ 1 | totals **40.7–65.8 s**. Every phase ≥ 10 s. Out of range: **arctic wide 65.8 s** (P3 32.4 s, escalation 2); level agent measured 57.9 / 58.8 s. Pacific is in range now (43.9 / 44.9; R6 39.5). Jungle portrait P1 escalation 2 (26.5 s) | 9/10 |
| A5g | phase gate | < 3 s per phase | max **2.97 s** (pacific wide P1); desert wide P1 0.68 s (R6 5.65 s) | 10/10 |
| A6 | unavoidable hits (`minSafe ≤ 0`) | none for expert | expert 0 upg: 1 (citadel portrait s1) of 80 hits · expert budget: 0 of 49 · novice 0–3 per run | as round 6 |

### Per-hit damage (bot hit logs; 0 upgrades = 100 hull + 40 shield = 140)

| chapter | chapterDmg | average hit (novice 0 upg, per run) | max hit |
|---|---|---|---|
| pacific / jungle | 0.9 / 1.3 | 7–16 | 7–26 |
| desert | 2.9 | 27.6–38.9 | **63** |
| arctic | 3.2 | 29.4–34.3 | 63 |
| citadel | 3.1 | 28.8–32.7 | 63 |

- **R6-2 (cap / curve): resolved.** No 0-upgrade hit exceeded **63 = 45 % of 140**; 63 is the cap and is reached in every hard chapter. Two hits always leave the ship alive. Budget runs top out at 74.3 (desert, larger life pool), so the cap scales as intended.
- The curve is flat across ch3–5 (about 30 per hit), not inverted as in round 6 (desert 40–75). The no-dodge bot still dies early in desert (t 52), but by volume of hits (15–16), not by 92–110 one-shots.

### Wide vs portrait (R5-2)

**Resolved.** End-of-run power, 0-upgrade novice desert: wide 2 / 3 / 1 / 3 / 3 / 3, portrait 3 / 1 / 4 / 1 / 1 / 2. Expert 0 upg, ch3–5: wide 3–5, portrait 3–5. In round 6, wide ended at 1–3 while portrait ended at 3–5. Fail rates no longer favour portrait: ch3 0-upgrade fails are 3 portrait, 1 wide.

### Visual checks (screenshots read)

- **Gust arrow (R6-6): resolved.** Desert t 44 (telegraph 0.25 s) and t 46 (push 0.55), wide and portrait. The arrow sits on the upwind (left) edge at about 46 % height and points downwind. It is clear of the top entry band and the HUD. In portrait it sits next to a fighter column at the left edge but does not hide it.
- **Desert helicopters (R6-3): resolved.** Desert wide t 58: the two helicopters and the fighter vee are dark olive with a light rim and read clearly on sand and on rock patches.
- **Arctic vehicles on the river (R6-4): resolved.** Arctic portrait t 96–108 and wide t 98–104: tanks and APCs stay on both banks, and only the destroyer is on the water. `checkLand` 0 errors at all widths.
- **Citadel walls (R6-5): resolved.** Citadel wide t 40: the inner compound walls now run from the avenue kerb toward the runway, with an end cap at the runway, so they read as a gated wall. The outer segments run from the perimeter and stop about 110 px before the avenue, which reads as a gate opening rather than a floating bar. Cosmetic only.
- **Jungle objective (R5-7): resolved.** "Destroy 2 bases or hangars" met in **6/6** jungle runs (0-upgrade novice 2–4 bases, no-dodge 3 / 3). Round 6: 0/4.

### FPS (real time, Edge GPU, 75 Hz cap)

- Citadel wide and arctic wide, early waves (t 60–95) and boss: average 75, minimum 1-s bucket 75, worst frame 14 ms (arctic boss 40 ms).
- Late waves (godMode, t 110–185, wide): citadel 75.0 average / minimum 75 / worst 14 ms with 496 bullets; arctic 75.0 / 73 / 40 ms with 672 bullets.
- The turbo bot saw up to **868** bullets at once in citadel wide (expert budget). The real-time run peaked lower, so this is not measured at its worst. No frame-rate problem was found.

### Medals (level agent's open item)

Victory scores against `medalScores` (wide uses the chapter's wide factor):
- desert: 0-upgrade novice portrait 34–37 k (none; bronze 39 k), wide 26–33 k (bronze). Budget novice portrait bronze, wide silver. Expert budget portrait gold / silver, wide **ace** / silver.
- arctic: budget novice silver; expert budget ace / gold.
- citadel: budget novice silver–gold; expert budget gold.
- Verdict: tiers separate skill and upgrades sensibly, so no change is needed. Desert wide (factor 0.65) runs about one tier more generous than portrait.

### Round 6 and carried issues

| # | status |
|---|---|
| R6-1 0-upgrade gate at ch3 | **partly resolved**: ch3 fails 4/12 (soft wall, long grind), ch4 and ch5 4/4 (hard wall). Budget 11/12 wins |
| R6-2 damage curve / per-hit spikes | **resolved** (cap 45 %, ch3 ≈ ch4 ≈ ch5) |
| R6-3 desert helicopter contrast | **resolved** |
| R6-4 vehicles on the river | **resolved** |
| R6-5 citadel wall bars | **resolved** |
| R6-6 gust arrow placement | **resolved** |
| R6-7 boss lengths | **mostly resolved**: 9/10 in 40–60 s; arctic wide 65.8 s on seed 1 |
| R5-2 wide power | **resolved** |
| R5-6 expert unavoidable hit | 1 sample (citadel portrait s1, 0-upgrade expert); 0 with budget |
| R5-7 jungle objective | **resolved** (6/6) |

### Round 7 issues

**R7-1. Ch3 is a soft wall, not a hard one (owner: engine `WORLD_TUNING`). Severity: medium.**
- **Evidence:** 4/12 0-upgrade fails. The 8 wins end on 1–2 deaths, and the boss runs 71–138 s at escalation 3.
- **Options:**
  - Accept it. ch4 stops every 0-upgrade run (8/8 across ch4–5), and a ch3 win at 0 upgrades still costs most of the lives.
  - Or raise ch3 `chapterDmg` 2.9 → 3.0–3.1 (the combat agent's next knob), then re-run with ≥ 8 seeds. Budget ch3 is at 1.0 deaths, so there is room.

**R7-2. Arctic wide boss 65.8 s on seed 1 (owner: bosses `ice_dreadnought.ts`). Severity: low.**
- **Evidence:** P3 32.4 s at escalation 2. Level agent measured 57.9 / 58.8 s on two seeds, so this is near the top edge with noise.
- **Suggestion:** HP ×2.1 → 2.0, or phaseAt P3 0.25 → 0.22.

**R7-3. A1 no-dodge targets still missed in ch1–2 (owner: engine). Severity: low.**
- ch1: 0 deaths. ch2: survives on its last life.
- This has been carried since round 5. Only change it if the "a player who never dodges loses in ch2" goal still stands.

**R7-4 (info). The expert budget bot reaches 868 bullets on screen in citadel wide.** The real-time FPS check held 75 at 496–672 bullets. If the 0-upgrade or budget peak (746–815) shows up on low-end mobile, it is the first place to trim.

## Round 6 verification (citadel redesign, river boats, biome enemy colours, desert gusts, R5 balance, Farsi signs)

Date: 2026-11-19 · Build: a fresh `vite build` of the current working tree (round-6 edits, uncommitted) into `%TEMP%\sr-qa-r6\dist`, served by `vite preview --port 5510` (stopped afterwards). Normal difficulty. About 70 bot runs, a 10-cell godMode boss pass, a real-time GPU FPS pass (8 cells, Intel UHD, 75 Hz cap) and about 60 screenshots, all read. Raw JSON and screenshots: `%TEMP%\sr-qa-r6\out\` and `%TEMP%\sr-qa-r6\shots\`.

**Gates:**
- `npx tsc --noEmit`: clean. `npm run typecheck:worker`: clean.
- `node tests/i18n/check.mjs`: PASS (502 en / 502 fa, 36 signed numbers bidi-checked).
- Level sanity (`src/levels/sanity.ts` via Vite SSR) at 540×960 portrait and 1138 / 1366 / 1920 wide: **0 errors, 0 warnings** in all 5 chapters. `checkCitadel`: 38 structures, 0 failures (max added delay 4.84 s portrait, 1.57 s wide). `checkNaval` / `checkGusts`: clean.
- `npx playwright test`: **13/13 passed** after one test fix (below). First run: 12/13. `perf.spec.ts` failed with "0 hazards on screen", because the level agent moved the desert bomber pair from t 123 to t 118.
- 0 page or console errors in every bot, boss, FPS and screenshot run.

**Harness changes (tests only):**
- `tests/e2e/perf.spec.ts`: the scenario now starts at **t 116** (was 121), so the moved bomber pair is in frame. The checks are unchanged. Result: 75.1 fps average, worst frame 13.6 ms, **19 hazards** at peak (average 10.8). Floor 50, stall < 150 ms.
- `tests/qa/bot.js` `evalCand`: the bot now adds the wind drift (`world.windInfo.push × speed × H_SPEED_MUL`, the same formula as `src/player`) to its predicted position. Without this, during a gust every dodge candidate was off by up to 0.6 × speed × t. The bot was flying blind, while a human sees the arrow and counter-steers. This does not weaken any check. It changes the desert verdict (see A2), so both numbers are given below.

### Headline

**No: a 0-upgrade novice does not reliably fail by ch3.**
- With the original bot, 2/4 ch3 runs fail, matching the engine report. Both failures are on wide.
- With the wind-aware bot, **0/4 fail** in desert (1–2 deaths each). Half of the earlier "failures" came from the bot not seeing the wind, not from damage.
- The 0-upgrade wall is now at **ch4** (2/4 fail with the wind-aware bot) and **ch5** (4/4 game over at t 124–162).
- Budget novices win everything. Experts hold ≤ 1 death.

The other round-6 items check out: citadel layout, boats on the river, per-chapter colours (one contrast issue), gusts, and Farsi signs. Per-hit damage in ch3 is now the highest in the game (see R6-2).

### Targets

| # | setup | target | result (round 6) | verdict |
|---|---|---|---|---|
| A1 | no-dodge, 0 upg, ch1 | ≥ 1 death | 2/2 wins, **0 deaths** (dmg 229 / 330) | miss (unchanged) |
| A1 | no-dodge, 0 upg, ch2 | game over 2/2 | wide: game over t 117 · portrait: win, 1 death | 1 of 2 (unchanged) |
| A1 | (info) no-dodge ch3 | – | game over 2/2 at **t 43 / 56** (round 5: t 127 / 142) | – |
| A2 | novice, 0 upg, ch1 / ch2 | wins, 0–2 deaths | 8/8 wins, 0 deaths (dmg 14–87) | met |
| A2 | novice, 0 upg, **ch3** | fails ≥ 3/4 | original bot: **2/4** (wide s1 t 131, wide s2 t 185; portrait wins with 2 / 1 deaths) · wind-aware bot: **0/4** (wins with 1 / 1 / 2 / 2 deaths, dmg 409–570) | **miss** |
| A2+ | novice, 0 upg, ch4 | (implied: fail) | original: 2/4 (both wide) · wind-aware: 2/4 (s1 both layouts, t 171 / 192; s2 wins with 2 deaths) | partial |
| A2+ | novice, 0 upg, ch5 | (implied: fail) | **4/4 game over** (t 124–162), power 1–2 | met |
| A3 | novice `--budget` ch3 / ch4 / ch5 | ≥ 3/4 wins, avg 1–3 deaths | 12/12 wins. Original: avg deaths 0.75 / 1.0 / 1.75 · wind-aware: desert **0.5**, arctic **0.75** | ch5 met; ch3–4 slightly **too easy** |
| A4 | expert, 0 upg, ch3–5 | wins, 0–1 deaths | 12/12 wins. Deaths ≤ 1: three runs with 1 (desert wide s1 died inside the t 133.5 gust; citadel portrait s1; citadel wide s2). Wind-aware desert: 4/4 with 0 deaths (dmg 0–101) | met |
| A5 | boss pass, godMode, power 4, `--budget` | phases ≥ 10 s, total 40–60 s, escalation ≤ 1 | total **39.5–61.8 s**. Pacific portrait 39.5 (just under); **arctic wide 61.8** (P3 36.6 s at escalation 2); **jungle wide 83.5 → 59.4**; jungle portrait 51.4 (P1 escalation 2). Every phase ≥ 10.0 s | 8/10 in range, close miss on 2 |
| A5g | phase gate | < 3 s per phase | 0–2.6 s except **desert wide P1 5.65 s** | 9/10 |
| A6 | unavoidable hits (`minSafe ≤ 0`) | none for expert | expert 1 (citadel wide s2) out of 57 hits · novice 0–2 per run | as round 5 |

### Per-hit damage (bot hit logs; effective life = 100 hull + 40 shield)

| chapter | chapterDmg | average hit | max hit |
|---|---|---|---|
| pacific / jungle | 0.9 / 1.3 | 7–15 | 18–39 |
| **desert** | **4.6** | **40–75** | **92 (heavy-tank shell), 110** |
| arctic | 3.1 | 26–37 | 62–93 |
| citadel | 3.3 | 29–39 | 46–73 |

Two desert hits cost a life. The no-dodge bot lost its first life at **t 15.8 s** in desert portrait. Ch3 now hurts more per hit than ch4–5.

### Visual checks (screenshots read)

- **Citadel (item 11): met.** Wide and portrait at t 12 / 40 / 72 / 88 / 131 / 165 and during the boss.
  - The layout is a coherent base: perimeter walls with pipe runs, a central runway that stays clear, avenues on wide, cross roads through gates, plots with concrete or steel floors, and helipads.
  - Every turret, radar, AA site, hangar and base sits on a foundation pad.
  - Convoy and train run down the runway (t 88 / 131).
  - No floating or overlapping set pieces. The boss ring reads well over the runway.
  - Cosmetic: on wide, the short compound-wall segments between the avenue and the runway read as free-standing bars (R6-5).
- **River boats (item 12): met.** Jungle wide and portrait at t 29–60 and 121–126, and arctic t 98–104: gunboats and destroyers stay on the water and follow the bends.
  - Side finding: in arctic portrait at t 104, two armoured vehicles drive on the river edge and their wrecks lie on the water (R6-4).
- **Enemy colours per chapter (item 13): met with one contrast issue.**
  - Runtime check: every on-screen air enemy in all 5 chapters used its `K__<biome>` key (`__ocean`, `__jungle`, `__desert`, `__arctic`, `__citadel`). Ground units and bosses keep their base keys.
  - Readable:
    - pacific: light grey-blue on navy;
    - jungle: olive/tan over trees;
    - arctic: white with a dark outline and a drop shadow, low but acceptable contrast on snow;
    - citadel: steel with red tips on a dark floor.
  - **Desert helicopters (sand/tan) blend into the sand** (desert wide t 58, R6-3).
- **Desert gusts (item 14): met.** Hands-off test at desert t 42–50 with godMode:
  - The telegraph starts **0.95–0.97 s** before each gust and shows the right direction.
  - `push` peaks at **0.595**.
  - With no input, the ship was carried **≈ 250 u in 1.7 s** (portrait 213 → 462, where it is clamped at the edge) and 518 u across two gusts on wide.
  - The screenshots show the top-centre arrow (blinking in the telegraph), the moving streaks and a light sand veil.
  - **Fairness:**
    - 0 of 48 desert hits inside a gust window were unavoidable (`minSafe` 0.24–0.91).
    - Hits still cluster in gusts: with the original bot, 45 % of desert hits landed in gust windows that cover ~13 % of the time. With the wind-aware bot this fell to 31 % (23 of 75).
    - The t 48.5–56 and t 133.5–137.5 gusts overlap dense waves (fighter_basic_elite, sand crawlers, heavy tanks). They are hard but escapable.
  - The arrow at y 92 sits in the enemy entry band and overlaps tanks and pickups there (R6-6, cosmetic).
- **Farsi signed numbers (R5-5): fixed.** Checked on the Shop screen with the Tehran-time Farsi default, zoomed 8×: "+10%" and "-0.8" have the sign on the left. A canvas pixel-diff test confirms that the LRM puts the sign before the digits in an RTL paragraph, and without the LRM after them. Final wording sign-off is still with a native reader.

### FPS (real time, Edge GPU, 75 Hz cap; 35 s early waves + 35 s boss per cell)

- Desert, citadel, jungle and arctic, both layouts: **average 75 in every cell**, minimum 1-s bucket 75, worst frame 14 ms.
- Exceptions:
  - arctic wide boss: minimum 64, one 160 ms frame;
  - desert portrait boss: worst frame 27 ms.
- The citadel background (60–150 sprites) and the wind streaks / veil cost nothing measurable.
- `perf.spec` bomber wave: 75.1 fps, 19 hazards.

### Round 5 issues

| # | status |
|---|---|
| R5-1 0-upgrade clears the campaign | **partly resolved**: ch5 is a wall (4/4), ch4 2/4, **ch3 0/4** with a wind-aware bot (R6-1) |
| R5-2 low power on wide | **improved**, but wide is still much harder: in ch3 wide, 0-upgrade runs fail with the original bot while portrait wins; end-of-run power on wide is 1–3 (portrait 3–5) |
| R5-3 boss totals | **mostly resolved**: jungle wide 83.5 → 59.4; still out of range: arctic wide 61.8 (P3 36.6 s), pacific portrait 39.5 |
| R5-4 medals | not re-verified this round (no medal changes reported) |
| R5-5 Farsi signs | **resolved** (pixel-verified) |
| R5-6 expert unavoidable hit | 1 expert sample again (citadel wide s2); unchanged |
| R5-7 jungle "2 bases or hangars" | **still 0/4** novice jungle runs (`tagKills.base` 0); only the no-dodge portrait run got 2 |

### Round 6 issues

**R6-1. The ch3 (desert) 0-upgrade target is still missed (owner: engine `src/core/world.ts`, with level `desert.ts`). Severity: high (the user's complaint).**
- **Evidence:** with the wind-aware bot, novice 0-upgrade wins 4/4 in desert (1–2 deaths, 409–570 damage), and budget novices average 0.5 deaths. The engine's 2/4 included the bot being wind-blind.
- **Why raising damage further is the wrong lever:** chapterDmg 4.6 already makes desert hits 40–110, more than ch4–5. As the engine noted, 0-upgrade and budget novices take nearly the same damage.
- **Suggestions:**
  - Separate them on DPS and time pressure instead: more HP on desert mid-wave ground and armour, so 0-upgrade DPS cannot clear lanes and the screen fills up. Keep the current damage, or drop it to ~3.0 so the damage curve is monotonic (ch3 ≤ ch4).
  - Or accept ch4 as the 0-upgrade wall and re-state the target.

**R6-2. Non-monotonic damage curve: ch3 hurts more than ch4–5 (owner: engine `chapterDmg`). Severity: medium (feel).**
- **Evidence:** average hit 40–75 in desert vs 26–39 in arctic and citadel. One heavy-tank shell is 92 out of an effective life of 140. The no-dodge bot dies at t 15.8.
- **Suggestion:** chapterDmg about [0.9, 1.3, 2.8, 3.1, 3.3], and move the ch3 difficulty to enemy HP and density (R6-1).

**R6-3. Desert helicopters are camouflaged against the sand (owner: assets `scripts/art/gen_biome.mjs` desert palette). Severity: low–medium (readability).**
- **Evidence:** in `desert_wide_t58.png`, the tan `helicopter__desert` is hard to pick out on the dunes.
- **Suggestion:** darken the desert airframe (brown or olive-drab) or brighten the outline. Planes are fine because their banded wings contrast.

**R6-4. Arctic ground vehicles drive onto the river (owner: level `arctic.ts` / runner). Severity: low.**
- **Evidence:** arctic portrait t ≈ 104: two armoured vehicles on the right river edge, and their wrecks lie on the water.
- **Suggestion:** `checkNaval` only warns about stationary structures. Extend it to moving ground units, then nudge their lanes.

**R6-5. Citadel wide: free-standing compound-wall bars (owner: level backgrounds `citadel.ts`). Severity: cosmetic.**
- **Evidence:** the short wall segments between avenue and runway (e.g. `citadel_wide_t40.png`, y ≈ 350) are not joined to anything.
- **Suggestion:** join them to the avenue with a T-joint, or drop them.

**R6-6. The gust arrow overlaps the enemy entry band (owner: engine `src/core/render.ts` `drawWindHud`). Severity: cosmetic.**
- **Evidence:** the arrow at y 92 draws over tanks and pickups entering the screen.
- **Suggestion:** move it to the HUD bar edge, or fade it over sprites as it already does over the player.

**R6-7. Arctic wide boss length and desert wide phase gate (owner: bosses). Severity: low.**
- arctic wide 61.8 s, with P3 at 36.6 s and escalation 2;
- desert wide P1 gated 5.65 s.

**Not covered this round:** tutorial and UI screens apart from the Farsi Shop, and medal thresholds (R5-4).

## Round 5 verification (popups, separation, BALANCE_SPEC, bomber perf, enemy animations, Farsi)

Date: 2026-11-19 · Build: a fresh `vite build` of the committed tree (`0eba70b`, unchanged in the working tree) into a scratch folder, served by `vite preview --port 5410`. The bots ran on normal difficulty, in both layouts, with the seeds listed in BALANCE_SPEC §11. That is 66 bot runs plus a 14-run godMode boss pass, followed by a real-time GPU FPS pass (20 cells) and a screenshot pass (gameplay in 5 chapters × 2 layouts, bomber wave, popups on and off, and 10 UI screens × 2 languages × 2 layouts).

**Gates:**
- `npx tsc --noEmit`: clean.
- `npm run typecheck:worker`: clean.
- `node tests/i18n/check.mjs`: PASS (501 en / 501 fa).
- `npx playwright test`: **13/13 passed**, including the new `perf.spec.ts`.
- 0 page or console errors in every bot, boss, FPS and screenshot run.
- No harness changes were needed this round. `tests/qa/bot.js` and the e2e specs are unchanged.

### Headline

The user's complaint is **not fixed**. A 0-upgrade novice bot clears **every** chapter: ch3 4/4 wins with 0 deaths, ch4 2/2 wins, ch5 2/2 wins with 1–2 deaths. Pressure did go up compared with round 4: novice damage in ch3 is 125–293, up from 21–107. The gap to a game over is still about 3×.

Everything else in round 5 checks out: popups, separation, the bomber fix, animations, Farsi, the economy, and the expert/human targets.

### §11 targets

| # | setup | target | result (round 5) | verdict |
|---|---|---|---|---|
| A1 | no-dodge, 0 upg, ch1 | ≥ 1 death in 2/2 layouts | wins with 0 deaths in both (dmg 251 / 269) | **miss** |
| A1 | no-dodge, 0 upg, **ch2** | game over in 2/2 | wide: game over at t 99 · portrait: **wins** with 2 deaths (dmg 577) | **1 of 2** |
| A1 | (info) no-dodge ch3 | – | game over in 2/2 (t 127 / 142) | – |
| A2 | novice, 0 upg, ch1 / ch2 | wins, 0–2 deaths | 8/8 wins, 0 deaths (dmg 15–134) | met |
| A2 | novice, 0 upg, **ch3** | fails in ≥ 3/4 | **4/4 wins, 0 deaths** (dmg 151 / 283 / 125 / 293) | **miss** |
| A2+ | (info) novice, 0 upg, ch4 / ch5 (s1) | (implied: should fail) | arctic 2/2 wins (0 / 1 deaths) · citadel 2/2 wins (2 / 1 deaths) | **miss** |
| A3 | novice `--budget`, ch3 / ch4 / ch5 | ≥ 3/4 wins, **1–3 deaths** on average | 12/12 wins; average deaths 0 / 0 / 0.25 (dmg desert 35–251, arctic 129–209, citadel 312–627) | **miss** (too easy) |
| A4 | expert, 0 upg, ch1–3 | wins, 0–1 deaths | 12/12 wins, 0 deaths (dmg 0–88) | met |
| A4 | expert `--budget`, ch4 / ch5 | wins, 0–1 deaths | 8/8 wins, 0 deaths (dmg 11–149) | met |
| A5 | boss pass, godMode, power 4, `--budget` | every phase ≥ 10 s; total 40–60 s; escalation ≤ 1 | phases: all ≥ 10.0 s · total 36.7–83.5 s (pacific portrait 37.3, desert portrait 36.7, arctic wide 61.8, **jungle wide 83.5**) · escalation 2–3 in jungle wide, jungle portrait (P1 stage 3) and arctic wide (P3 stage 2) | phases met · total and escalation **partial** (7/10 cells) |
| A5b | boss pass, 0 upg, ch4 / ch5 | escalation ≥ 1 in ≥ 2 phases | 4/4 cells (arctic portrait 1/1/1, arctic wide 0/2/3, citadel wide 0/2/1, citadel portrait 1/2/1); total 72–90 s | met |
| A6 | expert, all | 0 zero-escape, 0 unavoidable | 0-upg: 0 / 0 in ~207k samples · budget: **1 zero-escape sample and 1 unavoidable hit** (citadel portrait s2, out of ~128k samples) | **met with one exception** (see R5-6) |
| A7 | human, ch5 | median THREAT ≥ 2 | threatMax 3 / 3 / 3 / 3 | met |
| A8 | economy (human + novice JSON) | cumulative credits at start of ch2–5 between 1.1× and 3.0× the budget cost | 1396 / 2996 / 4842 / 6988 vs 470 / 1432 / 3099 / 5388 = **2.97× / 2.09× / 1.56× / 1.30×** | met (ch2 is at the top edge) |

### Other checks

- **Boss fights in real runs, new long tail on wide.**
  - Portrait: median ≈ 47 s (36–69 s at power 4–5).
  - Wide: median ≈ **110 s** (37–168 s), most of them at escalation stage 3 in every phase. Even ch1 runs long: expert pacific wide s1 took 107 s.
  - Power at the end of the run on wide is mostly 1–3 (portrait: 3–5). With P4/P5 (fewer power drops) and the 1520u-wide field, the bot collects far fewer P pickups. In boss mode (forced power 4) the wide times are normal (40–62 s), so low power is the cause. See R5-2.
- **Phase gate (R4-2):** gated time per phase in the budget boss pass is 0–2.8 s in 8/10 cells. Pacific wide P1 is 4.1 s and desert wide P1 is 3.8 s. Target < 3 s: **mostly met**.
- **THREAT:** dodging profiles reach rank 2–3 in almost every run. No-dodge stays at 0–1, because every hit empties the meter. Banners and HUD pips appear in screenshots. Works as specified.
- **Missiles (R4-6):** dodging profiles took 0–3 hits per run (e.g. expert: 1 hit / 1,036 launched). Still not a real threat; unchanged as recommended.
- **Medals (M1, ×1.25 starting guess):**
  - **ACE is still reached** on portrait ch1–2 and by budget experts in ch4–5:
    - pacific portrait: expert 64.0k / 69.5k, human 65.4k vs 63k
    - pacific wide: novice 70.1k, expert 71.5k, human 73.5k vs 68.0k
    - jungle portrait: novice 83.3k, expert 81.9k / 81.3k, human 80.4k vs 80k
    - arctic portrait: expert-budget 108.8k / 126.5k vs 107.5k
    - citadel portrait: expert-budget 164.1k vs 162.5k
  - **ACE is unreachable on wide** in ch2–5: jungle wide best 81.4k vs 88k; desert wide 56.3k vs 83.6k; arctic wide 71.6k vs 75.3k; citadel wide 90.6k vs 154.4k.
  - No-dodge pacific portrait scored 54.3k, which is **GOLD** (54k).
  - Measured wide/portrait median score ratios: pacific 1.09 (factor 1.08), jungle 0.91 (factor 1.1), desert 0.61 (0.88), arctic 0.76 (0.7), citadel 0.56 (0.95). See R5-4.
- **Enemy overlap (round3 #7):** a sampler checked non-boss on-screen pairs in the same layer whose boxes overlap by more than 50 %, every 0.25 s, with godMode and seed 1 (≈ 2,300 samples).
  - 0 overlapping samples in pacific, jungle and desert portrait, and in pacific and desert wide.
  - Remaining overlaps:
    - kamikaze drones in their dive (exempt by design; arctic and citadel wide)
    - `bomber_elite|interceptor` in citadel portrait (4 samples ≈ 1 s)
    - `armored_vehicle|destroyer` in arctic portrait (5 samples, closest 17u)
    - one `gunship_light` pair in jungle wide
  - Screenshots: the desert and citadel tank columns drive with bumper gaps, fighter flights are spread out, and helicopters are distinct. **Met.**
- **Score popups (round3 #6):**
  - Small outlined "+N" above the kill, tinted with the combo, and clearly readable in portrait.
  - Small on wide (1600×900) but readable.
  - 4–8 on screen at most (average under 1).
  - With the setting off, 0 popups were spawned.
  - A popup near the top edge draws under the HUD top bar. That is acceptable.
  - **Met.**
- **Enemy animations (round3 #9):** checked in screenshots:
  - helicopter rotor discs (citadel)
  - burning ground wrecks with smoke (arctic, desert)
  - plane spin-out with the damaged sprite (desert crop)
  - debris chunks
  - damage smoke on hurt units
  - Tread scroll and turret recoil cannot be judged from stills; not verified.
- **Bomber wave (round3 #10):** in desert @121 wide, the carpet-bomb discs and warnings stay clean and readable, with up to 19 hazards live. `perf.spec.ts` measured **74.9 fps average, worst frame 26.5 ms**. **Met.**
- **Farsi (step B):**
  - The menu, chapters, shop (all 4 tabs), settings (GAME tab with the language and score-popup rows), boss HUD and results screens in 540×960 and 1600×900 are all readable. Nothing overflows or is clipped, and no overflow warnings appeared.
  - `settings.language` and `<html lang>` both switch to `fa`.
  - Only cosmetic finding (R5-5): signed numbers are reordered by bidi. "+15" shows as "15+" and "-0.8" as "0.8-" (shop descriptions, chapter rewards).

### FPS (real time, Edge GPU Intel UHD / D3D11, 75 Hz display cap, godMode, 12 s per cell after a 1.5 s settle)

| layout | cells | avg fps | min 1-s bucket | worst frame | frames > 20 ms |
|---|---|---|---|---|---|
| portrait 540×960 | 5 chapters × (early waves @30 s, boss spawn) | 75.0–75.1 | 75 | 13.9 ms | 0 |
| wide 1600×900 | 5 chapters × (early waves @30 s, boss spawn) | 75.0–75.1 | 75 | 14.2 ms | 0 |
| bomber wave (perf.spec, desert @121 wide) | 1 | 74.9 | – | 26.5 ms | – |

This machine was idle during the pass. The animation agent's 68 fps came from a loaded host.

### Issues (round 5)

**R5-1. A 0-upgrade player can still clear the whole campaign (owners: engine `src/core/world.ts`, enemy `src/patterns/tiers.ts`, level `src/levels/chapters/*`). Severity: high. This is the user's complaint.**
- **Evidence:** the novice bot with 0 upgrades won 12/12 runs in ch1–3 with 0 deaths, and 4/4 in ch4–5 with 0–2 deaths. Its damage in ch3 is about 125–293 (median ≈ 220). It has 3 lives × (100 hull + 40 shield + regen), and repair drops on top, so a game over needs roughly 3× that damage.
- **Why the knobs fall short:**
  - The §11 knob path (T1 ch3 fireRate 1.45 → 1.55, D1 ch3 1.4, regen 3 → 2.5) is worth maybe +20–30 % damage, not 3×.
  - The budget novice also sits at 0–0.25 deaths, so the whole curve from ch3 on is about 2× too soft for the novice profile, not just the 0-upgrade case.
- **Suggestion:** pick one structural lever instead of more small multipliers, then re-run A2/A3 only:
  - (a) Lose 1 weapon power level per death and halve repair drops from ch3 on (`sustainDropMul` [1, 1, 0.5, 0.4, 0.35]).
  - (b) Make the player's hit cost scale with the chapter: `chapterDmg` [0.9, 1.3, 1.8, 2.0, 2.2]. Expert takes 0–149 damage in ch4–5 with budget, so there is room for it.
  - (c) Gate on DPS: raise E1 HP so a 0-upgrade ship cannot kill fast enough, which raises screen density. Ch3 1.25 → 1.5 and up.
  - A short human playtest of ch3 at 0 upgrades is still the real judge. The novice bot has perfect perception within 150u.

**R5-2. Low weapon power on wide makes boss fights 2–3× too long (owners: engine `src/core/world.ts` `powerDropMul`/`dropMul`, level wide copies and pickups). Severity: medium.**
- **Evidence:** dodging profiles end wide runs at power 1–3 (13 of 24 wide runs ≤ 2). Portrait runs end at 3–5. Real-run boss times on wide are 37–168 s (median ≈ 110), mostly at escalation stage 3, against a target of 40–70 s.
- **Suggestion:**
  - On wide layouts, either scale power drops up (×1.3) or place P pickups in the centre band.
  - Or make bosses read the player's power level, for example drain or gate scaling when power is ≤ 2.

**R5-3. The boss-pass total is out of range in 3 of 10 cells (owner: level/bosses `src/bosses/*`). Severity: low.**
- **Evidence:** pacific portrait 37.3 s and desert portrait 36.7 s are under 40 s. Jungle wide 83.5 s (escalation 2/2/1, P1 26 s) and arctic wide 61.8 s are over. Jungle portrait P1 lasted 30 s at escalation stage 3, so the gunship's P1 pods are slow to kill at power 4 (`shieldTimeout` 30 s ends it).
- **Suggestion:**
  - gunship hpMul 1.7 → 1.55, or a shorter `shieldTimeout`.
  - carrier and fortress portrait: +0.1 hpMul each.

**R5-4. Medal thresholds need re-deriving from the round-5 medians (owner: level `src/levels/chapters/*` `medalScores`). Severity: low.**
- Measured dodging-run score medians, portrait / wide:

  | chapter | portrait | wide |
  |---|---|---|
  | pacific | 64k | 70k |
  | jungle | 81k | 74k |
  | desert | 82k | 50k |
  | arctic | 87k | 66.5k |
  | citadel | 127k | 71k |

- **Suggested wide factors:** jungle 1.1 → 0.95, desert 0.88 → 0.65, citadel 0.95 → 0.6. Keep pacific (1.08) and arctic (0.7).
- **ACE:** raise it about 10 % on pacific and jungle portrait (69k / 88k) so that the novice and human profiles do not reach it.
- **GOLD:** pacific GOLD 54k is reached by no-dodge (54.3k). Raise it to about 57k.

**R5-5. Bidi of signed numbers in Farsi (owner: i18n `src/i18n/locales/fa.ts`, or UI/TextService). Severity: cosmetic.**
- **Affected strings:** "+{n} سکه" (`common.plusCredits`, `chapters.clearBonus`, objective rewards), `upgrade.*.desc` ("+15 بدنه…") and the flare desc ("-0.8 ثانیه…").
- **Symptom:** they render as "15+" / "150+" / "0.8-", with the sign on the far side of the number.
- **Fix:** prefix the signed number with U+200E (LRM), or isolate it with LRI/PDI in the text service. Leave the final call to the native reviewer.

**R5-6. One unavoidable hit for the expert at THREAT 3 with budget (owner: enemy `src/patterns`). Severity: low.**
- **Evidence:** citadel portrait s2 `--budget` had 1 zero-escape sample out of ≈ 14k, followed by 1 hit. Before this round there were 0. The novice also logged more zero-escape samples than in round 4 (0–25 per run, mostly desert portrait s2 and citadel portrait), which fits the THREAT bullet-speed and fire-rate increases.
- **Suggestion:** if it recurs, apply the A4 knob (THREAT `bulletSpeedPerLevel` 0.08 → 0.06).

**R5-7. Jungle objective "destroy 2 bases or hangars" (R4-4) is still 0/12 (owner: level). Severity: low.**
- **Evidence:** only 2 novice runs destroyed 1 base. The bot does not prioritise bases, so a manual check is still needed before you lower the goal to 1.

### Round 4 issues

| # | status |
|---|---|
| R4-1 novice never dies | **open**, superseded by R5-1 (more damage, still no deaths) |
| R4-2 phase gate waits | **mostly resolved**: gate 0–2.8 s in 8/10 cells, worst 4.1 s |
| R4-3 ACE too easy (jungle wide, citadel) | **overshot on wide** (unreachable); portrait ch1–2 now the easy ACE (R5-4) |
| R4-4 jungle bases | open (R5-7) |
| R4-5 wide copies counted | **resolved** (`world.ts:716`; killRate stays ≤ 1, spawned excludes copies) |
| R4-6 missiles harmless | unchanged (informational) |

Raw data is in the QA scratch folder: `out/*.json` (bot runs), `fps.json` and `shots/` (screenshots). `tests/qa/economy.mjs` was run on `play-human.json`, `play-novice.json` and `play-novice-late.json`.

## Round 4 re-verification (after the engine / enemy / level / ui / devops / audio-assets fix round)

Date: 2026-11-19 · Build: fresh `vite build` of the current tree into a scratch dir, served by `vite preview --port 5310`. Same method, profiles, seeds and difficulty (normal) as the original report below: no-dodge s1, novice s1+s2, human s1+s2, expert s1 (70 runs), godMode boss pass (10 runs), and a real-time GPU FPS pass (10 chapter/layout cells). Raw JSON: `test-results/qa-round4/` (copied out so `playwright test` cannot wipe it). The "before" numbers are re-computed from the original round's JSON.

**Gates:** `npx tsc --noEmit` clean · `npm run typecheck:worker` clean · `npx playwright test` **12/12 passed** (1.9 min) · 0 page/console errors in all 90 QA runs.

**QA harness fix (tests/qa/bot.js):** round 3 made ordnance fire once per *press* (`bombPressed` only, no hold-repeat). The bot only produced a press on the rising edge of "target under the drop point", so a target that stayed there (boss treads, slow structures) got one bomb. The bot now re-taps every 20 sim steps (0.33 s) while the target stays under the drop point, like a player tapping the button. This change only affects the bot, not the game, and it doesn't weaken any check.

### Before / after (normal difficulty)

| metric | before (round 1) | after (round 4) | target | verdict |
|---|---|---|---|---|
| no-dodge bot | 10/10 wins, 3 deaths total | ch1–2 win (1 death, jungle wide); **ch3–5 game over 6/6** (t 76–183 s, 2–3 deaths each) | fails by ch2–3 | **met** (fails from ch3) |
| novice bot (300 ms, 150u vision) | 20/20 wins, 0 deaths; damage ch3–5 0–90 | 20/20 wins, **1 death in 20 runs** (citadel wide s1); damage ch3–5 21–402 (median ≈ 100); hits taken 70 → 129 | loses 1–3 lives in ch3–5, usually clears | **not met** (clears, but almost never dies) |
| human bot (200 ms) | 20/20, 0 deaths, damage ≤ 40 | 20/20, 0 deaths, damage ≤ 112 (hits 11 → 47) | – | pressure up ~4×, still 0 deaths |
| expert bot | 20/20, 0 deaths | 10/10, 0 deaths, damage ≤ 88 | 0–1 deaths | **met** |
| ACE medal | reached by **every** profile in every run (incl. no-dodge) | expert: 0/10 ACE (best is GOLD); ACE in 4 of 50 dodging wins, all novice: jungle wide ×2 (66.5k / 62.9k vs 61k), citadel wide s2 (116k vs 103.5k), citadel portrait s1 (125k vs 122k) | needs near-perfect play | **mostly met**; jungle-wide and citadel ACE still reachable by the novice bot |
| boss time in real runs | 10–36 s (P3 often < 2 s) | **39–54 s** in most runs; long tail 71–81 s on wide when power is low (novice arctic wide 81 s at power 1, desert wide 71 s at power 2; expert arctic wide 72 s at power 2; human citadel wide 72 s at power 3) | 40–70 s | **met**, with a wide long tail |
| boss pass (godMode) | 14–131 s; P3 0.6–1.9 s on portrait | **39–70 s** (portrait 39–47, wide 40–70); every phase ≥ 11.0 s | 40–70 s, phases ≥ 10 s | **met** |
| unavoidable hits (dodging profiles) | 1 of 87 hits | 3 of 190 hits (all novice: desert ×2, arctic portrait ×1); expert 0 zero-escape samples in 144k | no unavoidable moments | **met** for expert/human; the novice "unavoidable" hits are the bot's 0.25 s look-ahead getting cornered, not provably unfair patterns |
| chapter 1 (pacific) | novice dmg 8–57 | novice dmg 0–26, 0 deaths in every profile; no-dodge wins with 155–218 dmg | gentle | **met** |
| enemy bullets max / avg (citadel wide) | 643 / 94–112 | 455–597 / 107–140 | – | denser, pool (1400) fine |
| missiles | 2284 launched, 20 hits (0.9 %), max 150 u/s everywhere | max speed 150 (ch1) / 189 (desert) / 200 (ch4–5); dodging bots 5 hits / 2138 launched (0.2 %); no-dodge 23 / 265 (8.7 %) | scale by chapter, outrunnable | scaling **met**; still not a real threat to dodging players (bots have perfect bullet info + flares) |
| power 5 at end of run | 60/60 dodging runs | 39/50 dodging runs; lower-power runs are the ones with long boss fights | power should matter | **improved** |
| wide spawns (pacific / citadel) | 325 / 548 (≈1.7× portrait) | 247 / 420–426 (≈1.3×) | layout-independent objectives | **improved**; wide kill rate still 0.34–0.79 vs portrait 0.68–0.96 |
| FPS (real time, Edge GPU, 75 Hz cap) | avg 66–75; one 1013 ms stall (desert wide boss) | avg **65–75** in every cell; min 1-s bucket 49 (arctic wide boss), worst frame 80 ms; desert-wide stall gone (75/75) | fine | **met** |

### Issues from the original report

| # | issue | status |
|---|---|---|
| 1 | no lethality | **partly resolved**: no-dodge now dies from ch3, but the novice target is not met (see R4-1) |
| 2 | medals below a non-dodging score | **resolved** for no-dodge and expert; small residue in jungle wide and citadel (R4-3) |
| 3 | bosses too short / phase 3 under 2 s | **resolved** (39–70 s boss pass, phases ≥ 11 s); new side-effect R4-2 |
| 4 | wide over-spawn | **mostly resolved** (1.7× → 1.3×); copies are still counted in `spawned` / `killRate` (R4-5) |
| 5 | unreachable objectives | pacific naval 4: met 6/10 dodging runs (was 0/12). desert ground 35: met 7/10. arctic vehicles 7: met 9/10. citadel structures 10: met 8/10. jungle killRate 0.6: portrait 5/5, wide 2/5. **jungle "2 bases or hangars": still 0/10 dodging jungle runs** (R4-4). arctic "≤ 3 flares": 0/10 (bot uses flares freely, accepted as before) |
| 6 | tutorial bombs while empty | **resolved in data** (bomb pickups at 32.5 / 37 s, `immune` hint moved to 40.5 s); I didn't re-shoot the tutorial screenshots this round |
| 7 | wide hint panel covers the enemy entry band | fixed per the UI report (bottom-centre plus fade); not re-screenshotted by QA |
| 8 | portrait score/combo overlap | fixed per the UI report; not re-screenshotted by QA |
| 9 | missiles don't scale | **resolved** (150 → 189 → 200 u/s by chapter, turn ≤ 110 °/s, decoyable) |
| 10 | power maxes every run | **improved** (39/50 runs) |
| 11 | economy | **resolved in data**: `creditScoreDivisorWin` 200, replay pays 25 % of the reward; laser 2600 / heavy 3000 / seeker 2000. First-clear credits per win: pacific ≈ 1.2–1.4k, citadel ≈ 3.1–3.5k |
| 12 | pinch points | `HAZARD_LOCKOUT` 1.1 s added; expert and human saw 0 unavoidable hits |
| 13 | performance | **resolved** (no stall) |

### Remaining issues (round 4)

**R4-1. The novice still almost never dies in ch3–5 (owner: engine, with enemy). Severity: medium (main balance gap).**
- **Evidence:** 1 death in 12 novice runs of ch3–5. Novice damage per run is 21–107 in desert, 78–198 in arctic and 86–402 in citadel, against an effective life of 140 (100 hull + 40 shield) plus shield regen (4/s after 4 s).
- **The gap is in the middle of the curve:** no-dodge takes 450–670 damage and dies, while novice takes ~100.
- **Suggestion:** about 1.8–2× the damage a novice takes in ch3–5, without touching ch1–2:
  - `src/core/world.ts` `WORLD_TUNING.chapterDmg` `[0.8, 1.05, 1.15, 1.25, 1.35]` → **`[0.8, 1.05, 1.4, 1.65, 1.9]`**.
  - Optionally `BASE_SHIELD_REGEN` 4 → 3.
  - Re-run `play --seeds=1,2 --replan=18 --novice` and stop once ch3–5 average 1–2 deaths.
  - Don't overshoot: the bot sees every bullet in its 150u radius perfectly, so real novices will take more damage than it does. A short human playtest of ch4 is worth doing before going further.

**R4-2. The boss phase gate makes phase 2 a wait (owner: level/bosses). Severity: low–medium (feel).**
- **Evidence:** phase 2 lasts exactly 11.0 s in 43 of 50 dodging runs and 7 of 10 boss-pass runs. Phase 1 is often exactly 15.0 / 15.5 s.
- **Cause:** the HP threshold is reached early, and the rig then sits invulnerable (pulsing rings) until `minPhaseSec`. With `phaseAt` [0.70, 0.45], phase 2 holds only 25 % of HP. At power 5 that is gone in a few seconds, so the player spends a large part of phase 2 shooting an immune rig.
- **Suggestion** in `src/bosses/framework.ts`:
  - Give phase 2 more HP: `phaseAt` → **[0.75, 0.42]**, or raise `hpSlope` slightly.
  - Lower `minPhaseSec` to ~9.
  - Log time spent gated per phase (an event or a counter on `hud()`) so QA can measure it. The target is under ~3 s of gate per phase.

**R4-3. ACE can still be reached by the novice bot in jungle wide and citadel (owner: level). Severity: low.**
- **Evidence:** novice jungle wide 66.5k / 62.9k against ACE 61k (while the expert scored 50.3k), citadel wide 116k against 103.5k, citadel portrait 125k against 122k.
- **Cause:** score variance between seeds is ±20 %. The novice wins on score by surviving into more kills and combos.
- **Suggestion** in `src/levels/chapters/*.ts`:
  - jungle wide factor 0.95 → **1.1** (ACE ≈ 70k).
  - citadel portrait ACE 122000 → **130000**, wide factor 0.85 → **0.95**.
  - Alternatively, tie ACE to "0 deaths and score ≥ X" if medals should mean skill rather than score.

**R4-4. Jungle objective "Destroy 2 bases or hangars" is still 0/10 (owner: level, enemy). Severity: low.**
- **Evidence:** across all 70 runs (including citadel, which has 3 bases), `tagKills.base` is 0 everywhere except one no-dodge jungle run.
- **The targets can be destroyed:** `tests/qa/probe-base.mjs` on this build shows hangar and military_base die to 3 bomb hits (160 / 180 hp).
- **Why it fails:** the jungle bases sit at the lanes' edges (L+50 / R−60 at t 46 and 120). That matches the old "ordnance is the limit" finding, and the bot doesn't prioritise them.
- **Suggestion:** move one jungle base or hangar pair toward LC/RC in `src/levels/chapters/jungle.ts` and add a `pickup("bomb")` 2 s before each pair. Or lower the goal to 1. Confirm with a manual run, since this bot doesn't lead or prioritise targets.

**R4-5. Wide copies still count in `spawned` / `killRate` (owner: engine). Severity: low.**
- **Status:** the level request in `docs/CONTRACT_REQUESTS.md` (`data.wideCopy`) is not implemented in `World.spawnEnemy`.
- **Effect:** wide kill rate is 0.34–0.79 against 0.68–0.96 on portrait, and `jun_rate` 0.6 passes 2/5 on wide versus 5/5 on portrait.
- **Fix:** add `&& o.data?.wideCopy !== true` to the `counted` condition, as requested.

**R4-6. Missiles are still harmless to a dodging player (owner: enemy). Severity: low / informational.**
- **Evidence:** 5 hits from 2138 missiles across the expert, human and novice profiles. The bot flares on every lock.
- **Recommendation:** leave this as is until R4-1 is tuned, because missile damage scales with `chapterDmg` too. If more threat is wanted, use flare scarcity (flare cooldown) rather than missile speed, so the outrun guarantee holds.

**Not re-verified by QA this round:** the tutorial, hint-panel and HUD screenshots (R6–R8; the UI fixer verified them with screenshots), and the worker/CORS changes (typecheck only; not exercised end to end).

---

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
