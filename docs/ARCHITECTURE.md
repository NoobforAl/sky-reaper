# SKY REAPER — Architecture & Design Bible

Vertical-scrolling military shmup. KAPLAY (3001.x) + TypeScript + Vite, hosted on Cloudflare Workers Static Assets, optional Hono + D1 leaderboard. MIT licensed.

> **Single source of truth for shared types: `src/contracts/*`.** Owned by the Orchestrator. Agents never edit it; they
> append requests to `docs/CONTRACT_REQUESTS.md` and keep working with the current contract.

## 1. Runtime overview

```
main.ts  ──► kaplay() (canvas #game, 480x854, letterbox, crisp, nearest)
   │         creates Services { k, save, audio, input, sprites }
   ├─ registerUiScenes(svc)   src/ui       menu, chapters, shop, settings, results (+ createHud, pause overlay helpers)
   └─ registerGameScene(svc)  src/core     the 'game' scene: World (sim) + renderer + HUD hook
                                │
              ┌─────────────────┼───────────────────────────────────────────┐
              │ World (src/core) implements WorldAPI                          │
              │  pools: playerBullets, enemyBullets, enemies, fx, pickups,    │
              │         hazards. Fixed-step sim (SIM_DT=1/60), accumulator.   │
              │  calls:  enemySystem.onSpawn/update/onDeath   (src/enemies)   │
              │          patternRunner.start(...)             (src/patterns)  │
              │          levels.createRunner(id).update()     (src/levels)    │
              │          bosses.create(id, world).update()    (src/bosses)    │
              │          input.poll()                         (src/input)     │
              │          hud.draw(HudData)                    (src/ui)        │
              │          audio.playSfx / playMusic            (src/assets)    │
              └───────────────────────────────────────────────────────────────┘
```

Rendering approach: **entities are plain objects in pools** (not KAPLAY game objects) — drawn in a single
`k.onDraw` using `k.drawSprite / drawRect / drawCircle`. KAPLAY provides canvas, scenes, input, asset loading, text and
audio context. All gameplay code uses `world.rng()` (seeded), never `Math.random()`.

Coordinates: game units, origin top-left, **+y is down**; angles in degrees, **0 = right, 90 = down**.
Ground enemies get `+scrollSpeed*dt` on y automatically (unless `def.anchored === false`, e.g. naval units drifting).

## 2. Module ownership (agents write ONLY inside their directories)

| Agent | Owns | Must export (entry points; stubs exist today) |
|---|---|---|
| Orchestrator | `src/contracts/**`, `src/main.ts`, `docs/ARCHITECTURE.md`, root configs, `index.html` | — |
| Engine/Gameplay | `src/core/**`, `src/player/**`, `src/weapons/**` | `registerGameScene(svc)` (core); `PLAYER_WEAPONS`, `UPGRADES`, `AIRCRAFT` (weapons) |
| Enemy/AI | `src/enemies/**`, `src/patterns/**` | `enemySystem: EnemySystem`; `patternRunner: PatternRunner`, `PATTERNS` |
| Level/Campaign | `src/levels/**`, `src/bosses/**` | `levels: LevelModule`; `bosses: BossFactory` |
| Asset | `public/assets/**`, `src/assets/**`, `scripts/art/**`, `assets_original/**`, `ASSET_CREDITS.md`, `docs/ASSET_MANIFEST.md` | `loadAssets(k): Promise<SpriteRegistry>`, `createAudioService(save): AudioService` |
| UI/UX + Mobile | `src/ui/**`, `src/input/**`, `src/save/**` | `registerUiScenes(svc)`, `createHud(svc): HudRenderer`, `createInputService(k, save)`, `createSaveService()` |
| DevOps/Edge | `worker/**`, `wrangler.jsonc`, `migrations/**`, `docs/DEPLOY.md`, `README.md`, `package.json` scripts | — |
| QA | `tests/**`, `playwright.config.ts`, `docs/QA_REPORT.md` | — |

Cross-agent communication: contracts + `docs/*.md` only.
- `docs/ASSET_REQUESTS.md` — anyone needing a new sprite/sfx appends a line: `key | native size | frames | description`.
- `docs/CONTRACT_REQUESTS.md` — requested contract changes.
- `docs/QA_REPORT.md` — QA findings, grouped by owning agent.

Agents run concurrently in ONE working tree with disjoint directories (git worktrees add no safety when directory ownership is
disjoint). While others are mid-edit, `tsc` may report errors in files you do not own — typecheck with
`npx tsc --noEmit 2>&1 | grep "^src/<your dir>"` and fix only yours. Never touch another agent's files; never run `git` commands that
modify the tree (the Orchestrator commits).

## 3. Gameplay design bible (all agents follow this)

### 3.1 Dual attack system (core identity)
- **Primary / air-to-air (Space, J; hold):** 4 weapons, cycle with Q/E. Levels 1–5 via `power` pickups (die ⇒ −1 level).
  | id | feel | notes |
  |---|---|---|
  | `vulcan` | rapid straight twin stream (owned) | 12 shots/s L1, widens to 4 barrels at L5 |
  | `spread` | 3→7-way fan, short-ish range | unlock in shop |
  | `homing` | slow missiles that steer to nearest air/ground-vulnerable-to-air target | unlock |
  | `laser` | continuous piercing beam, tick damage, narrow | unlock |
- **Secondary / air-to-ground (K; hold = repeat with cooldown):** consumes **bombs** (ordnance stock, max 5 + upgrades; +1 per
  `bomb` pickup; slow passive regen of 1 per 25 s). Cycle with R.
  | id | feel |
  |---|---|
  | `bomb` | lobbed ~220u ahead, 0.6 s fall, area blast r≈44, ground-only (owned) |
  | `rocket` | 2 fast straight rockets, ground+air small blast (unlock) |
  | `pmissile` | locks nearest ground target, curving precision missile, high damage (unlock) |
  | `heavy` | slow huge delayed blast r≈90, cost 2 bombs (unlock) |
- **Special / countermeasure (Shift):** *Flares* — radius-120 burst: destroys/diverts every `decoyable` enemy missile, clears
  small bullets in radius, 0.4 s i-frames. Cooldown 12 s (upgradable down to 7 s). Never consumes bombs.
- **Shield:** blue pool that absorbs damage first, regenerates after 3 s without being hit (rate upgradable). Pickup refills.
- **Hull (HP):** base 100 (×aircraft ×upgrades). Taking a hit grants 1.2 s i-frames (flicker). 3 lives per run; death ⇒ explosion,
  1.5 s, respawn with full shield + 3 s i-frames, power −1, bombs reset to at least 2. 0 lives ⇒ chapter failed (results screen,
  keep credits earned, no chapter completion).
- **Hit radius:** player hitbox radius 4 (visible hit-dot shown when focusing/at all times subtle). Contact with enemy bodies deals
  `def.contactDamage` (plus bounces nothing; enemy not destroyed except kamikaze).
- **Temporary pickups:** `rapid` (+40 % fire rate 10 s), `overdrive` (×2 damage 10 s), `magnet` (pull radius 160 for 12 s).

### 3.2 Vulnerability model (air vs ground)
`EnemyDef.layer` = where it lives; `EnemyDef.vulnerableTo` = which weapon *classes* hurt it:
- Air units: usually `"air"` (bombs pass under them) — but `rocket` and `heavy` blasts have `hitsAir`.
- Ground units: `"ground"` (needs bombs/rockets: tanks, bases, launchers, ships, radar), or `"both"` (soft targets: AA turrets,
  armored vehicles, oil tanks — machine guns work, bombs work better via `armor`).
- **Communicating it:** every enemy gets a **vulnerability marker** drawn by the renderer — thin corner brackets around the sprite:
  `ground`-only = orange brackets + tiny bomb glyph; `both` = green brackets; `air` = none (air enemies are obviously shootable).
  When a bullet of the wrong class hits an immune target the renderer shows a grey "ping" spark + `hit_metal` sfx + `enemyImmune`
  event (HUD can flash a tooltip). Chapter 1 has a scripted tutorial (LevelEvent `tutorial`) that explains the legend.

### 3.3 Enemies & AI
Data-driven `EnemyDef` (see `contracts/enemies.ts`). Movement kinds: straight, sine, diagonal, circular, follow, formation,
strafe, stationary, dive, hover, scripted. Attacks reference `PatternDef`s (never hard-coded per enemy). Required roster +
announced extras live in `contracts/consts.ts` (`REQUIRED_*`, `EXTRA_ENEMIES`).

Roster native sprite sizes (px; draw at PIXEL_SCALE=2):

| id | layer | size | frames | id | layer | size | frames |
|---|---|---|---|---|---|---|---|
| fighter_basic | air | 20x20 | 2 | tank_light | ground | 16x16 | 2 (tracks) |
| interceptor | air | 16x24 | 2 | tank_heavy | ground | 24x24 | 2 |
| fighter_heavy | air | 32x32 | 2 | aa_turret | ground | 16x16 base + `_gun` 16x16 (rotates) | 1 |
| bomber | air | 40x32 | 2 | missile_launcher | ground | 20x20 | 1 |
| helicopter | air | 32x32 | 4 (rotor) | radar_station | ground | 24x24 | 4 (dish) |
| drone_kamikaze | air | 12x12 | 2 | military_base | ground | 48x48 | 1 |
| missile_carrier | air | 40x40 | 2 | armored_vehicle | ground | 16x24 | 2 |
| gunboat | ground | 16x32 | 2 | destroyer | ground | 24x64 | 2 |
| oil_tank | ground | 28x28 | 1 | hangar | ground | 48x32 | 1 |
| ice_turret | ground | 16x16 (+`_gun`) | 1 | citadel_turret | ground | 20x20 (+`_gun`) | 1 |

Ground units are drawn top-down; air units top-down with a drop-shadow offset (renderer draws a dark ellipse/sprite shadow).
Enemy agents may add more; announce in `docs/ASSET_REQUESTS.md` (Asset agent has fallbacks for unknown ids: they render
as colored rects, never crash).

### 3.4 Bullet patterns & missiles
`PatternDef` kinds: straight, aimed, spread, circular, spiral, burst, multi, homing, delayedBlast, areaStrike, sweep.
**Fairness rules:** every pattern must be survivable (gaps ≥ 28u between bullet columns at base difficulty), strong attacks need
`telegraphMs ≥ 600` (visual: warning glyph / charging glow; engine draws `fx_warning` above owner), bullet speed ≤ 260 u/s
for normal bullets (≤ 340 for aimed singles). **Missiles** (`isMissile`): launch warning (HUD arrow + `warning` sfx), `turnRate` ≤ 110 deg/s,
`armDelay` 0.5 s, life ≤ 6 s, trail, blast radius, `decoyable` — flares destroy them. Lock-on indicator drawn on the player while a missile
tracks them.

### 3.5 Campaign (5 chapters) — see contracts/levels.ts
`pacific` (ocean, carriers; boss `carrier`) · `jungle` (rivers, hidden bases; boss `heli_gunship`) · `desert` (sandstorms with
wind + reduced visibility; boss `land_fortress`) · `arctic` (blizzards; boss `ice_dreadnought`) · `citadel` (industrial / futuristic;
final boss `citadel_core`). Each ≈ 3–4 minutes of timeline + 40–60 s boss. Difficulty curve: ch1 forgiving (teaches), ch5 intense.
Every chapter: 3 objectives (rewards), chapter reward, medals by score [bronze, silver, gold, ace].

Boss parts (native px) — **Level agent implements the controllers; Asset agent draws sprites `boss_<id>_<part>`**:

| boss | parts (key suffix: size) |
|---|---|
| carrier | `hull` 96x240 (invulnerable body), `turret` 24x24 (x4, rotates), `bridge` 32x40 (core weak point), `launcher` 24x24 (x2), `aa` 16x16 |
| heli_gunship | `body` 64x72 (air), `rotor` 96x96 4f, `tail` 16x40, `gunpod` 20x28 (x2), `missilepod` 20x20 (x2) |
| land_fortress | `body` 128x160 (ground), `turret_big` 40x40, `turret_small` 20x20 (x4), `core` 32x32, `tread` 20x160 (x2) |
| ice_dreadnought | `hull` 96x180 (air-ship), `cannon` 32x32 (x2), `engine` 24x24 (x2), `core` 28x28, `drill` 24x40 |
| citadel_core | `core` 48x48, `ring` 160x160 (rotating), `cannon` 32x32 (x2), `shieldgen` 24x24 (x2), `emitter` 40x40 |

Boss rules: ≥ 3 phases (hp thresholds), telegraphs (≥ 800 ms for big attacks), destructible parts that change the attack set,
`bossPhase` events (engine clears bullets + screen flash), boss HP bar via `BossController.hud()`.

### 3.6 Progression
Credits (`coin` pickups + kills 1 per 100 score on chapter end + objectives + chapter reward). Shop between missions:
- Upgrades (`UpgradeId`): damage (+8 %/lvl), fireRate (+6 %/lvl), hull (+10 HP/lvl), shield (+8/lvl & regen), bombs (+1 cap/lvl),
  speed (+4 %/lvl), flares (−0.8 s cooldown/lvl); max level 8; cost = `round(baseCost * (lvl+1)^1.4)`.
- Weapon unlocks (see 3.1 table `unlockCost`), aircraft variants: **Falcon** (balanced, free), **Raptor** (speed ×1.25, hp ×0.75, fire rate ×1.1,
  hit radius 3.5), **Bulwark** (speed ×0.85, hp ×1.5, shield ×1.4, bombs +2).
- The game must be fun without upgrades; upgrades broaden, not gate (chapter difficulty tuned for an un-upgraded Falcon on normal).

### 3.7 Scoring & medals
Score = enemy score + boss bonus + 500 per life remaining + objective bonus; combo multiplier (×1.0 → ×2.0, +0.1 per kill within 2 s chain,
resets on hit) — engine owns. Medals from `ChapterDef.medalScores`.

### 3.8 Art & audio direction
Retro military 16-bit pixel art, one visual family; per-chapter palette; bullets are bright (white/yellow/magenta/cyan cores with dark
outline) and ALWAYS contrast with the background. Hit feedback: white flash 60 ms, spark particles, smoke trail below 50 % hp, fire below 25 %.
Audio: all music + sfx **open licensed or original (CC0)**; runtime chiptune synth (WebAudio on KAPLAY's audio context) is acceptable and preferred
for small size. `AudioService` handles autoplay unlock, volumes, mute.

## 4. Asset pipeline
`assets_original/` — untouched downloads and generator sources. `scripts/art/*.mjs` — programmatic pixel-art generator (palette +
ASCII pixel grids + procedural shading/outline/biome noise) that writes PNG strips into `public/assets/sprites` and
`public/assets/manifest.json`. `ASSET_CREDITS.md` lists every pack/file with author, URL, license. Placeholders must be flagged
(`SpriteInfo.placeholder = true`) and listed in credits. NOTE: kenney.nl blocks scripted downloads (HTTP 403) — do not try to bypass it;
if Kenney art is wanted the user drops the zip into `assets_original/` by hand; otherwise draw originals.

## 5. Build / deploy
`npm run dev | build | preview | deploy`. Worker (`worker/index.ts`, Hono) serves `dist/` through the `ASSETS` binding with
cache headers (immutable for hashed files, `no-cache` for html), SPA fallback and `/api/leaderboard` + `/api/score` backed by D1.
The game works with the API absent.

## 6. Quality gates
`npx tsc --noEmit` clean · `npm run build` clean · Playwright: boots, no console errors, can start chapter 1 and finish it (via
`window.__sky.game.cheatWin()` for speed + a real playthrough bot), FPS ≥ 55 on desktop viewport, mobile viewport 390x844 with touch.
`window.__sky` (see `SkyDebug` contract) is the QA hook; Engine fills `__sky.game` in the game scene.
