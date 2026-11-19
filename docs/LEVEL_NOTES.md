# Level / campaign / boss notes (Level agent)

Owns `src/levels/**`, `src/bosses/**`. Entry points: `levels: LevelModule` (src/levels/index.ts), `bosses: BossFactory`
(src/bosses/index.ts).

## Files

| file | what |
|---|---|
| `src/levels/index.ts` | `levels` (5 chapters, `createRunner`), `CHAPTER_SCRIPTS` |
| `src/levels/chapters/<id>.ts` | one file per chapter: timeline (TL builder), objectives, rewards, medals, palette |
| `src/levels/builders.ts` | `TL` timeline builder, `formationSlot()` geometry, special encounters (`sideAmbush`, `droneMinefield`, `convoy`, `armouredTrain`) |
| `src/levels/runner.ts` | `ChapterRunner` (LevelRunner): events, stagger queue, weather + wind gusts, hints, progress |
| `src/levels/backgrounds/index.ts` | `BiomeBackground` (BackgroundRenderer): tiles/decor/clouds/weather, procedural fallbacks |
| `src/levels/tutorial.ts` | tutorial step ids -> hint text (keyboard / touch wording) |
| `src/levels/sanity.ts` | timeline sanity checks (dev only) |
| `src/bosses/parts.ts` | `BOSS_PART_DEFS` + `registerBossDefs(target)` |
| `src/bosses/framework.ts` | `BossBase`: rig, entry, phases, move scheduler, telegraphs, defeat, HUD |
| `src/bosses/attacks.ts` | boss PatternDefs (`BP`) built from `makeBullet` presets |
| `src/bosses/<boss>.ts` | the 5 boss controllers |

## Verify

- Typecheck: `npx tsc --noEmit 2>&1 | grep -E "^src/(levels|bosses)"` (clean).
- Sanity (dev server console): `(await import("/src/levels/sanity.ts")).checkLevels()` — monotonic t, known enemy/boss/pickup ids,
  tutorial steps, formation x on/near screen, boss at 170–240 s, objective tags actually spawned, ascending medals, max kill score.
- Play: `__sky.goto('game',{chapterId:'pacific',godMode:true})`. Boss directly: in the game scene
  `const w=__sky.game.world; w.cheatKillAll(); w.startBoss(w.chapter.boss)`. (`startAt` > ~150 s currently exhausts the
  enemy pool — Engine fastForward bug, see CONTRACT_REQUESTS.)

## Event semantics (runner)

- Events are sorted by `t` (stable). `spawn`/`formation` with no `y` spawn just above the screen (def half-height + 10).
- `formation`: unit i at `(x,y) + formationSlot(shape,i,n,dx,dy)`, spawned at `t + i*staggerMs`.
  - none: `i*(dx??40, dy??0)` (contract meaning) · `line`: centred row step dx (48) · `column`: step dy (48) upward ·
    `vee`: leader + alternating wings (36, 30) · `arc`: 120° arc of radius dx (110), wings higher.
- TL builder auto-sets `opts.dir=-1` for units entering right of centre (mirrors diagonal/sine/strafe).
- `banner` -> `banner` + `waveStarted` events. `scroll` -> `setScrollSpeed` (Engine eases). `wind` = base wind.
- `weather` sandstorm/blizzard: intensity eases at 0.35/s; gusts added to base wind (sand ±55, snow ±38 units/s² at 1.0);
  `none` fades out. `tutorial` sets `hint` for 7 s (`"clear"` hides). `boss` -> `world.startBoss` once; progress = 1 after.
- Naval units (`gunboat`, `destroyer`) in jungle/arctic are snapped onto the river / open-water lead.
- Background set-pieces (`road`, `rail`, `runway`, `bridge`) are level-internal `features` placed in world space from the
  scroll profile (convoy, armoured train, offshore platforms, airbase).

## Chapters

| # | id | scroll | boss @ | spawns (air/ground) | max kill score | medals B/S/G/A |
|---|---|---|---|---|---|---|
| 1 | pacific | 60 | 197 s | 186 (161/25) | 33 250 | 18k / 26k / 34k / 42k |
| 2 | jungle | 62 | 200 s | 215 (156/59) | 43 050 | 23k / 33k / 43k / 53k |
| 3 | desert | 66 | 193 s | 210 (149/61) | 40 500 | 22.5k / 32k / 42k / 51.5k |
| 4 | arctic | 70 (hp ×1.1) | 197 s | 240 (191/49) | 49 910 | 27k / 39k / 50.5k / 62k |
| 5 | citadel | 75 (hp ×1.2) | 198 s | 309 (248/61) | 68 430 | 37k / 53k / 69k / 85k |

Medals ≈ 35/50/65/80 % of (max kill score × 1.3 combo + boss part scores + 5000 bonuses). Re-run sanity after roster changes.

### 1 PACIFIC — Operation Tidebreak (teaching)
0 move hint · 4–21 fighter line/vees/streams, guns hint (7) · 25 SURFACE CONTACTS: bombs hint, gunboats + bomb pickup ·
33 legend hint + offshore platform (runway feature): AA (green), radar (orange), oil tanks · 38 immune-ping hint · 48 WAVE 2:
pickups hint, helicopters, streams · 64 first missile_carrier + flares hint (65.5) · 73 destroyer · 80 weapons hint, 82/86
interceptor side ambush · 90 WAVE 3 bomber run · 100 gunboats · 121 WAVE 4 interceptors, 128 second platform (launcher) ·
146 helicopters · 155 double side ambush · 162 CARRIER GROUP: destroyers, bombers, missile carrier · 194 scroll 26 · 196 boss hint · 197 **carrier**.
Objectives: sink 6 ships (`tag:naval`, 150) · 10 ground kills (150) · no deaths (250). Reward 500.

### 2 JUNGLE — Operation Green Hell
Mixed air + ground from the start; river gunboats; 25 helicopter AMBUSH from both flanks; 45 HIDDEN BASE (base + hangar + AA);
66 CONVOY on a road (tank_light column + armoured outriders + heavy tank); 91 bomber formation; 119 JUNGLE STRONGHOLD;
141 missile carrier + mine layer; 146 gunship escort double ambush; 175 heavy fighters; 197 scroll 30; 200 **heli_gunship**.
Objectives: 3 bases/hangars (`tag:base`, 200) · 8 AA (`tag:aa`, 200) · kill rate ≥ 70 % (250). Reward 700.

### 3 DESERT — Operation Dust Devil
Tank columns · 18 OIL FIELD (oil_tank chain blasts, SAM) · 37 first SANDSTORM 0.55 (wind hint) · 60 ARMOURED CONVOY ·
84 FORWARD AIRBASE (runway, 2 hangars, base, radar) · 110 **SANDSTORM RAID** 0.95 + base wind 18: interceptor ambush both
sides, drone minefield, heavy tanks, bomber_elite, elite fighters · 143 sand crawler screen, shield drone · 186 light sand ·
190 scroll 24 · 193 **land_fortress**. Objectives: 45 ground kills (250) · 5 oil tanks (`tag:fuel`, 200) · damage ≤ 150 (300). Reward 900.

### 4 ARCTIC — Operation White Fang (enemy hp ×1.1)
Ice turrets on floes, destroyers in the lead · 29 BLIZZARD 0.6 · 53 **ARMOURED TRAIN** on a rail (7 cars + engine) ·
79 **DRONE MINEFIELD** 4×6 · 99 ICEBREAKER GROUP · 123 WHITEOUT blizzard 1.0 + wind −14, elite missile carrier, second minefield ·
150 POLAR OUTPOST · elites (interceptor/fighter_heavy/bomber) · 194 scroll 28 · 197 **ice_dreadnought**.
Objectives: 90 air kills (300) · 9 vehicles (`tag:vehicle`, 250) · ≤ 3 flares (300). Reward 1100.

### 5 CITADEL — Operation Last Light (enemy hp ×1.2)
Dense mixed waves from t=3 · 30 MISSILE GAUNTLET (SAMs, launchers, radar) · 54 DRONE SWARM 5×6 · 73 FACTORY DISTRICT (2 bases,
hangar, oil, convoy) · 100 heavy elites · 118 double interceptor ambush · 128 ARMOURED TRAIN · 150 CITADEL WALLS · minefields +
mine layer · 194 scroll 20 · 198 **citadel_core**. Objectives: 220 kills (400) · 14 structures (`tag:structure`, 300) · ≤ 1 death (500). Reward 1500.

## Bosses

Common (framework.ts): parts spawn above the screen invulnerable and glide in (3–4.5 s). Phase = live part HP / initial:
P2 at ≤ 68 %, P3 at ≤ 36 %. Core is shielded (invuln, pulsing ring fx) in P1 (anti-stall: drops after 45 s in P1) →
banner CORE EXPOSED. Phase change: `bossPhase` + clearEnemyBullets + shake/flash, running patterns cancelled, 1.6 s breather,
power (P2) / shield (P3) pickup. Bomb pickup every 14 s while bomb-only parts live and the player has < 3 bombs. Part destroyed:
explosion + 50 % coin/bomb drop + boss-specific attack change. Core destroyed: `bossDefeated`, bullets cleared, 10 coins + repair,
2.4 s chain explosions killing remaining parts → `done` → Engine bonus + `completeChapter()`. HP: part hp × (0.85 + 0.15 × difficulty).
`hud()` = sum of live destructible part HP vs initial. Big attacks telegraph ≥ 900 ms (pattern `telegraphMs` or `telegraph()` ring+warning).

Scenery bodies (`destructible:false`, 2×2 hitbox, drawn first) never soak bullets: carrier hull, fortress body, dreadnought hull,
heli rotor / citadel ring (spawned after the vulnerable part they cover, so that part is hit first).

### carrier — CARRIER LEVIATHAN (ground/naval, total 1710 HP)
Parts: hull · launcher ×2 (bombs only, 150) · turret ×4 (both, 150) · aa (both, 110) · **bridge** core (both, 700).
| phase | attacks |
|---|---|
| P1 | turret aimed 3-bursts 1.4 s · AA flak 3 s · launcher single missile 7 s (flares) |
| P2 | bridge telegraphed 12-ring 4 s · turret 3-fans ×2 · missile pairs 7.5 s · deck launches 2 fighters 10 s |
| P3 | bridge spiral 6.5 s · BROADSIDE: every turret telegraphs 1 s then 5-fan down · 2×2 missile salvo · wider swings |
No launchers → no missiles; no turrets → bridge fires aimed needles.

### heli_gunship — GUNSHIP HORNET KING (air, 2040 HP)
Parts: **body** core (1000, contact 25) · tail (240) · gunpod ×2 (220) · missilepod ×2 (180) · rotor (scenery).
| P1 | gunpod 3-bursts · single missiles 6 s |
| P2 | telegraphed rocket 5-fan · gunpod sweeps · missile pairs · 2 kamikaze drones / 12 s |
| P3 | spiral · STRAFING RUN (banner + 1 s telegraph, dives 200u and ring-fires) |
Gunpods gone → chin needles; missilepods gone → heavy orbs; tail gone → wobble + rotating cross.

### land_fortress — LAND FORTRESS SAND TYRANT (ground, 2580 HP)
Parts: tread ×2 (bombs only, 240) · body (scenery) · turret_big (both, 520) · turret_small ×4 (both, 170) · **core** (both, 900).
| P1 | small-turret 3-fans · big turret telegraphed heavy orbs |
| P2 | core 12-ring · artillery (1.1 s ground markers) · sweeps · 2 light tanks / 12 s |
| P3 | core 4-arm spiral · carpet bomb walk · RAM (banner, crush-zone markers 1.9 s, 1 s telegraph, lurches 230u) |
Both treads gone → immobile, no ram; big turret gone → core artillery; small turrets gone → core bursts.

### ice_dreadnought — ICE DREADNOUGHT WINTER'S MAW (air ship, 2780 HP)
Parts: hull (scenery) · engine ×2 (280) · cannon ×2 (400) · **core** (1100) · drill (320, contact 30).
| P1 | cannon heavy orbs · engine ice mines (shootable) · DRILL CHARGE (lane markers + 1 s telegraph) / 10 s · bursts |
| P2 | core double cyan ring · wide sweeps · 2 interceptors / 13 s |
| P3 | core 8-way rotating cross · frost carpet · cannon 7-fans · faster |
Engines gone → slower, no mines; drill gone → no charge, core needles.

### citadel_core — CITADEL CORE (air, final, 3900 HP)
Parts: emitter (600) · **core** (1700, contact 30) · ring (scenery, rotates 22/36/54 °/s) · shieldgen ×2 (360) and cannon ×2
(440) mounted on the ring (radius 128, orbiting). Core shielded while any shieldgen lives (overload after 90 s) as well as in P1.
| P1 | orbiting cannon 5-fans · core rotating cross · BEAM: column of markers at player x (1.15 s) / 8 s |
| P2 | core 4-arm spiral · cannon 5-bursts · double beam · 3 drones / 10 s |
| P3 | core 8-cross / 16-ring alternating · SWEEPING BEAM (4 columns walking across) · missile pairs |
Emitter gone → core double rings; cannons gone → core bursts.

## Wide (desktop) playfield (round 2)
Chapters are still authored in 480-wide `DESIGN_W` space (`LANES`, `pincer`, `sideAmbush`, `droneMinefield` and `sanity.ts` use DESIGN_W). The runner maps them:
- `mapX(x)`: identity on 480; on wide fields lanes spread across the full width, x within 30 of an edge (or beyond it) keeps its distance to the
  REAL edge, so side ambushes enter from the screen edges. Pickups use mapX too.
- Formation offsets x `FORMATION_SPREAD = clamp(sqrt(X_SCALE), 1, 1.6)`; y offsets unchanged.
- Roads/rails/runways map as a whole; ground units within 100 design units of an active feature keep their exact offset to it (convoys stay on the road).
- **Density:** `clamp((X_SCALE-1)*0.4, 0, 0.75)` copies per enemy event (deterministic accumulator, 0.75 at 16:9). The copy is mirrored across the
  centre (offsets mirrored, `dir` flipped) or, when the original is near the centre, flanks at +-34 % of GAME_W on alternating sides, 0.45 s later.
  Features are mirrored too (when far enough from the centre) and their tied ground units are always copied onto the twin. No copies for river boats
  (jungle/arctic), indestructible units, or while >= 100 enemies are alive. Knobs: `RUNNER_TUNING.dup*`, `edgeMargin`, `featureSnap`.
- Backgrounds scale static prop counts by X_SCALE (dunes, decor, pipes, cloud/shadow bands, sand streaks, snow) but animated water glints only by
  sqrt(X_SCALE) (see "Calm backgrounds"); the river swings wider (amp 100 + 12 % of the extra width).
- Bosses: rigs centre on GAME_W/2 and their idle sweep amplitude gets `+ (GAME_W-480)*0.3` (`roam()` in bosses/framework.ts); the heli dash crosses the
  full width with its ease rate divided by sqrt(X_SCALE).

## Calm backgrounds (round 3)

User feedback: the full-screen ocean animation was tiring. Rendering rules now (src/levels/backgrounds):
- **One global frame clock** for every animated tile (ocean/jungle_b/citadel_b): frame = floor(time / 0.6 s) (~1.7 fps),
  the last 55 % of each frame eased-cross-fades into the next frame. No per-tile offsets, so neighbours always agree.
- Ocean: base-colour veil (0.2) right over the tiles (lower shimmer contrast); glints are stratified, fewer, breathe slowly
  (0.7 rad/s, opacity 0.13 +- 0.06) with no lateral jitter. River glints flow at 14 u/s (was 26) and fade over their cycle.
  Citadel status lights breathe slowly. Animated decor at 1.5 fps.
- **Wide fields:** `CALM = 1/sqrt(X_SCALE)` (1 on 480, ~0.56 at 1520). Moving/flickering element counts scale by
  `sqrt(X_SCALE)` instead of `X_SCALE`; cloud and cloud-shadow parallax over the ground scale by CALM (1.7 -> ~1.39,
  1.25 -> ~1.14 at 1520); high clouds slightly fainter.
- **Grid breaking:** hashed `_b` tiles (see tuning) + large world-anchored soft light/dark patches (`drawPatches`) that
  drift in brightness over ~30 s (per-biome strength, ocean strongest).
- **Shake:** the dim veil, sand/snow overlays, citadel lines/pipes and the river strips overdraw `shakeMargin` (32) past
  every edge. (Fixes the 1-2 px light line at the top-left during strong shake on arctic: the 0.4 dim veil used to move
  with the shake and expose un-dimmed snow tiles.)

### Reduced motion hook
`setReducedMotion(v: boolean)` / `isReducedMotion()` (exported from src/levels/backgrounds and src/levels). Defaults to
the OS `prefers-reduced-motion`; settings-independent, the UI may call it. When on: tiles freeze on frame 0 (no fade),
water/river glints and status lights are static, decor animation stops, clouds/shadows nearly follow the ground
(parallax extra x0.15), weather particle counts x0.35, menu backdrop scroll x0.25.

### Menu backdrop API
```ts
import { createMenuBackdrop } from "../levels";
const bd = createMenuBackdrop("arctic", { dim: 0.5, speed: 18, clouds: true }); // all opts optional
k.onDraw(() => bd.draw(k, k.time()));   // draw FIRST in the menu scene, UI on top
bd.dim = 0.6;                            // mutable veil opacity / speed
```
Uses the biome's chapter palette + the real `BiomeBackground` (tiles, decor, clouds; no set-piece features, no weather)
scrolling at `speed` u/s, under a dark navy veil (`dim`, default 0.5) covering max(GAME_W, k.width()) x max(GAME_H, k.height()).
Cheap: one BiomeBackground per backdrop — create it once per scene (or cache per biome), not per frame.

## Tuning knobs

- `RUNNER_TUNING` (runner.ts): weatherEase, sandGust, snowGust, spawnMargin.
- `BG_TUNING` / `BIOME_DIM` (backgrounds): tile size, `tileBChance` 0.28 + `tileBChanceBy` per biome (ocean 0.08 because
  ocean_b is an island; hashed, never two _b tiles side by side or stacked), `tileFramePeriod` / `tileFade` (water clock),
  `waterVeil` (ocean 0.2), `patch*` (grid-breaking patches), decor density per chunk, cloud parallax (shadows 1.25,
  high clouds 1.7 — before the wide calm factor), max sand/snow overlay, flake/streak counts, sprite recheck interval,
  `shakeMargin` (32: full-screen overlays overdraw every edge), per-biome darkening veil over bright tile art.
- `BOSS_TUNING` (framework.ts): phaseAt, phaseBreather, shieldTimeout, defeatSec, bombDropEvery, hp scaling.
- Chapter difficulty: `tl.setDefaults({hpScale})`, wave density, `scroll` events; medal thresholds per chapter file.
- Per-boss: part hp in parts.ts, move `cd`/`first`/`big` in each boss file, patterns in attacks.ts.

## Sprite keys used

Backgrounds: `bgtile_<biome>_a|b` (animated if multi-frame), `bgdeco_<biome>_1..8`, `bgcloud_1..3` — all optional; missing
keys fall back to palette-coloured procedural drawing (checked via `k.getSprite(key).data`, rechecked every 1.5 s).
Bosses: `boss_carrier_{hull,turret,launcher,aa,bridge}`, `boss_heli_gunship_{body,rotor,tail,gunpod,missilepod}`,
`boss_land_fortress_{tread,body,turret_big,turret_small,core}`, `boss_ice_dreadnought_{hull,engine,cannon,drill,core}`,
`boss_citadel_core_{emitter,core,ring,shieldgen,cannon}`; optional `_gun` overlays for rotating turrets (ASSET_REQUESTS).
Enemies spawned: the full ENEMY_NOTES roster, including elites, sam_site, sand_crawler, ice_walker, shield_drone,
gunship_light and mine_layer.
