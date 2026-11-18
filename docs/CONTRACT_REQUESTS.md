# Contract change requests

Agents append requests here (`## <agent> — <title>` + what/why). The Orchestrator applies or rejects them between rounds.


> Orchestrator: the three enemy requests below are APPLIED (documented in contracts/enemies.ts EnemySystem comment).

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
