# Contract change requests

Agents append requests here (`## <agent> — <title>` + what/why). The Orchestrator applies or rejects them between rounds.


> Orchestrator: the three enemy requests below are APPLIED (documented in contracts/enemies.ts EnemySystem comment).

> Orchestrator (round 3): render density request APPLIED in src/main.ts renderDensity() (>= 1x on desktop, game
> resolution on phones). CODE_REVIEW #10 (__sky.fps frozen) fixed in main.ts. i18n contract proposal
> (docs/I18N_STATUS.md) is PENDING until the user approves Farsi integration.

## enemy — clarify enemy position integration (no change needed if Engine agrees)
`enemySystem.update()` integrates the unit's OWN motion directly into `e.x/e.y` and writes `e.vx/e.vy` as informational
velocity. The Engine must NOT additionally integrate `vx/vy` for enemies; it only adds `scrollSpeed*dt` to anchored ground units.
Please note this in ARCHITECTURE §3.3 / contracts/enemies.ts doc comment.

## enemy — missileLaunched ownership (FYI)
Brief says the pattern runner emits `missileLaunched`; the Engine's `spawnBullet` already emits it (with bullet id) for every
`isMissile` bullet, so the runner does NOT emit it (would double HUD arrows). `setEmitMissileEvents(true)` in src/patterns
re-enables runner emission if the Engine drops it. Same for difficulty speed scaling (Engine `spdScale`).

## enemy — EnemySystem.onHit timing
The `shield_drone` support effect refunds 50% of damage in `onHit`, so it assumes `onHit` is called AFTER hp is reduced and
only while the enemy is still alive. Please document that order in contracts/enemies.ts.

## engine — combo multiplier in RunStats / HudData (low priority)
The engine tracks the score combo (x1.0..x2.0, +0.1 per kill within 2 s, reset on hit). It is exposed today as extra runtime
fields `combo` and `comboTimer` on the object passed as `HudData.stats` (the world's `RunStatsRT`). Please add
`combo?: number; comboTimer?: number` to `RunStats` so the HUD can read them without a cast.

## engine — document spawnFx `delay` unit and boss part naming
- `spawnFx(..., { delay })` is interpreted as SECONDS (values > 10 are treated as milliseconds).
- When a boss part Enemy dies the engine calls `BossController.onPartDestroyed(partName)` with
  `e.data.part ?? e.opts.data.part ?? e.def.id`. Boss controllers should set `data.part` (or pass `opts.data.part`) on spawn.
- `EnemySystem.onDeath` is ALSO called (without explosion/score/drops) when an enemy is culled off-screen; `e.hp > 0` then.
- Engine writes `window.__sky.scene = "results"` before leaving the game scene (main.ts only updates it in `goto`).

## UI/UX — HudData.combo
Add `combo: number` (current multiplier 1.0–2.0) to `HudData` (or `RunStats`). HUD already reads `stats.combo ?? data.combo` when present.

## UI/UX — player position for touch relative-drag
Touch drag needs the player position at touch start. Currently read from `window.__sky.game.world.player` (falls back to finger-offset mode). Proposal: `InputService.setPlayerRef(fn: () => {x:number;y:number} | null)` called by the game scene.

## UI/UX — HUD access to events
`HudRenderer.draw(data)` cannot see `enemyImmune` / `pickup` events. Proposal: `HudData.toasts: Array<{text, x, y, age}>` filled by the engine, or `createHud(svc, events)`.

## UI/UX — Settings.difficulty semantics
Comment says "0 easy .. 1 normal .. 1.5 hard" but WorldAPI.difficulty is a multiplier. UI writes 0.7 / 1 / 1.5. Please confirm or define discrete values.

## asset — `_gun` overlay orientation (clarification)
docs/ASSET_REQUESTS.md (enemy) says `_gun` barrels point RIGHT at 0deg, but `src/core/render.ts` draws the overlay at `angleToPlayer - 90`,
i.e. art must point DOWN at 0deg. Asset agent follows the renderer: every `*_gun` (enemy turrets, tank_light/heavy, ice_walker,
boss_carrier_turret/aa, boss_land_fortress_turret_big/small) points DOWN, pivot = sprite centre. Please state this in contracts/assets.ts.
Also: boss rotating turrets now ship as static mount `boss_<id>_<part>` + rotating `boss_<id>_<part>_gun` (renderer already supports it via rotatesToPlayer).

## level — Engine: `World.fastForward` exhausts the enemy pool (bug, affects `startAt` QA hook)
`fastForward` removes skipped enemies with `removeEnemySilent` (pushes them to `graveyard`) but never runs `cleanupEnemies`, so the
graveyard is never recycled. Skipping ~160 spawns (any `startAt` > ~150 s) exhausts the 160-slot pool: `enemy pool exhausted`, the
boss parts fail to spawn. Fix: recycle immediately in fastForward (`this.enemyPool.recycle(e)` instead of the graveyard). Bosses
now retry part spawns during their entry, so they recover once slots free up, but `__sky.goto('game',{startAt:999})` is unreliable.

## level — boss music / defeat flow (FYI, no change needed)
Engine `startBoss` already plays `boss`/`boss_final` + WARNING banner, so boss controllers do not call `playMusic` again (would
restart the track). Boss controllers emit `bossDefeated` themselves on core death, run a ~2.4 s chain-explosion sequence, then set
`done`; the Engine's `onBossDone` adds the bonus and calls `completeChapter()`. If `update()` is still called 0.6 s after `done`
the controller calls `world.completeChapter()` itself.

## level — optional: `LevelEvent` for background set-pieces
Roads/rails/runways under convoys, trains and offshore platforms are level-internal `features` (src/levels/types.ts), placed in
world space from the chapter's scroll profile. A contract event (`{type:"feature", kind, x, len}`) would let other tools see them;
low priority.

## menu-ui (round 3): render density on wide desktop windows (src/main.ts, Orchestrator)
- `renderDensity()` returns `1/scale` on windows larger than the field (e.g. 0.79 at 1920x1080), so KAPLAY's framebuffer is only ~1200x675 and is then upscaled 1.26x with nearest. Pixel-font text cannot be crisp below 12 framebuffer px, which forces the minimum UI text to ~19 CSS px at 1920x1080 and makes glyph pixels uneven (some 1, some 2 screen px). Request: consider `pixelDensity: 1` (or an integer-ratio choice) for WIDE desktop windows; the UI's `readableSize()` adapts automatically. No contract change needed.
- FYI: `src/ui/glfix.ts` switches the KAPLAY framebuffer texture's MIN filter to LINEAR at runtime (only affects downscaled windows: phones, 1366x768) because nearest minification dropped pixel rows of text and thin lines. If main.ts ever sets a framebuffer filter itself, that file can go.

## enemy (round 3 balance) — `WorldAPI.chapterIndex`
Regular enemies scale fire rate / bullet speed / missile performance per chapter (src/patterns/tiers.ts, QA #1/#9).
WorldAPI has no chapter info, so `chapterIndexOf(world)` duck-types the concrete World's `chapter.index` (falls back to
tier 0 = chapter 1 behaviour when absent). Request: add `readonly chapterIndex: number` (ChapterDef.index, 0-based) to
WorldAPI; tiers.ts already prefers `world.chapterIndex` when it exists.

## level (round 3 balance, QA #4) — wide-field copies out of `RunStats.spawned` / `killRate`
On wide fields the LevelRunner adds mirrored / flanking copies of some enemy events (now ~1.3x portrait, was ~1.7x).
Every copy is spawned with `opts.data.wideCopy === true`. Request (Engine, src/core/world.ts `spawnEnemy`):
`e.counted = def.destructible !== false && !o.bossId && o.data?.wideCopy !== true;` so `spawned` / `killRate` (and the
jungle "Destroy 65% of enemies" objective) mean the same on both layouts. Kills of copies still score and count in
`kills` / tag kills. Optionally document `data.wideCopy` on `EnemySpawnOpts.data` in contracts/enemies.ts.
