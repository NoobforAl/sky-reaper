# ENGINE_NOTES (Engine/Gameplay agent: `src/core`, `src/player`, `src/weapons`)

## Public API
- `registerGameScene(svc)` (src/core) registers scene `"game"` (params: `GameSceneParams`: `chapterId`, `startAt`, `godMode`, `seed`).
  On enter it fills `window.__sky.game = { world, cheatWin, cheatKillAll, setGod }`; before going to results it sets `__sky.scene="results"`.
- `World` (src/core/world.ts) implements `WorldAPI` + `EventBus` (+ `FireContext`/`PlayerHost` for weapons/player).
  Extras beyond the contract (engine-internal, safe to ignore): `pc` (PlayerController), `stats.combo/comboTimer`, `state`
  (`playing|complete|failed|done`), `pickAirTarget`, `pickGroundTarget`, `beamTick`, `deployFlare`, `canHurt`.
- `src/weapons`: `PLAYER_WEAPONS` (8), `UPGRADES` (7), `AIRCRAFT` (3), `shopCost(def, level)` (cost of the NEXT level, `Infinity` at max),
  `computeLoadout(save.data)` -> `Loadout` (maxHp, maxShield, shieldRegen, maxBombs, speed, damageMult, fireRateMult, flareCooldown, hitRadius,
  unlocked air/ground lists), plus fire logic (`fireAir`, `fireGround`, `airFireRate`, `groundCooldown`, laser helpers).
- `src/player`: `PlayerController` (movement, weapons, flares, damage, death/respawn, pickups) and `PLAYER_TUNING`.
- Results: `src/core/results.ts` (`finishRun`, `objectiveDone`, `medalFor`, `RESULTS_TUNING`).

## Per-step order (SIM_DT = 1/60, accumulator in the scene, max 5 steps/frame, near-60Hz frame times snapped to 1 step)
input.poll -> player.update -> levelRunner.update -> boss.update -> enemies (e.t, scroll for anchored ground units, `enemySystem.update`,
onScreen/animation frame/damage smoke, cull) -> bullets (motion) -> collisions -> hazards -> pickups -> fx -> cleanup -> flow
(complete/fail timers). The engine never integrates `e.vx/vy`; behaviours own their motion (engine only adds scroll to anchored ground units).

## Hot-path rules
- All entities are pooled (`Pool<T>`: dense active list + free stack). Iterate BACKWARDS when releasing (swap-remove). Enemies use order-preserving
  `splice` and a 2.5 s graveyard before the object is reused (stale references in boss/pattern code stay "dead").
- No allocation per step: weapon fire uses one scratch spec, HUD data/missile list are reused, event payloads are only built when a listener exists
  (`bus.has`). Renderer reuses draw option objects and caches colors / sprite infos.
- Gameplay randomness = `world.rng()` (seeded mulberry32); visual jitter = `world.frng()` so fx never desync a seed.
- Pool capacities (WORLD_TUNING.pools): player bullets 320, enemy bullets 1400, enemies 160, fx 700, pickups 96, hazards 96. Exhaustion drops silently.
- Errors thrown by Enemy/Level/Boss code are caught and logged (first 3 per source) so one bad behaviour cannot freeze the game.

## Rules implemented
- Vulnerability (ARCH 3.2): `canHurt(cls, hitsAir, enemy)`. Air-class shots hurt `air|both`; ground-class hurt ground-layer `ground|both` and air-layer only with `hitsAir`.
  Wrong class on a ground unit => grey ping + `hit_metal` + `enemyImmune` (throttled 0.22 s per enemy); bullets keep flying (they pass over ground units).
  `invuln`/`destructible:false` => ping and the shot is absorbed (air layer). Armor = flat reduction, min 1. Brackets: orange (ground-only, + bomb glyph), green (both).
- Blast bullets (`blastRadius>0`: bomb, rocket, seeker, heavy, enemy missiles) do NOT apply direct damage; they detonate (area damage, 40 % falloff at the edge).
  Heavy bomb = lobbed shell -> telegraphed ground hazard (0.5 s) -> r90 blast that also hits air.
- Enemy bullet damage x(0.5+0.5*difficulty), speed x(0.92+0.08*difficulty). Contact damage (air-layer enemies only) uses the same damage factor; kamikaze (`dive` / tag `kamikaze`) dies on contact.
- Missiles: `missileLaunched` + sfx on spawn; `missileLock` when armed and steering at the player; `HudData.incomingMissiles` lists every `isMissile` bullet. Flares
  (Shift, 12 s -> 7 s): missiles inside r120 are destroyed, other decoyable homing bullets on screen chase the decoy for 2.6 s then go dumb; small bullets in the burst are cleared; 0.4 s i-frames.
- Player: hit radius 3.5-4, 1.2 s i-frames on hull damage (0.7 s if only shield absorbed), shield regen after 3 s, 3 lives, respawn 1.5 s later with full hull/shield,
  3 s i-frames, power -1, bombs >= 2. 0 lives => 2.4 s => results (`victory=false`).
- Score/combo: x1.0..x2.0 (+0.1 per kill within 2 s, reset on hit). Victory adds 500/life left + 500/objective, boss defeat +2000.
  Credits: victory = coins + objective rewards + chapter reward + score/100; defeat = coins + score/250; pause->quit keeps coins only.
- `startBoss` creates via `bosses.create` (falls back to the DEV boss / finishes the chapter if it throws), emits `bossSpawned`, plays `boss`/`boss_final`.
  `bossPhase` events trigger: clear bullets + flash + shake + sfx. When `BossController.done` (or the boss calls `completeChapter`) the chapter enters a 3.2 s "complete" state
  with chain explosions, then `SCENES.results`.
- `startAt` fast-forwards the level runner in 0.25 s chunks (enemies spawned meanwhile are silently dropped; stops when a boss starts).

## Sprite conventions assumed by the renderer
`player_<aircraft>` 3 frames [level, bankL, bankR] (+`_dmg`), `enemy_<id>` (+`_gun` rotates for `rotatesToPlayer`, `_dead` wreck for ground units), air sprites face DOWN and are
rotated by `facing-90`. Bullet sprites point UP and are rotated by `heading+90` unless `visual.rotate === false`. Pickups `pickup_<kind>`, fx `fx_<kind>` (frames play over the lifetime),
`fx_lock`, `fx_warning`, `bullet_player_*`. Everything falls back to shapes when a key is missing.

## Tuning constants (see exported objects)
- PLAYER_TUNING: accel 3400 / decel 4600 u/s^2, base speed 270 (x aircraft x 1.04^lvl), drag gain 20, wind damping 1.2, flare radius 120, bomb regen 25 s, rapid x1.4, overdrive x2.
- Air weapons (volleys/s, dmg per bullet by power 1..5): vulcan 12-16, 3-4.2, 2 -> 4 barrels (+2 wing guns L5); spread 5-7/s, 3-7 pellets, arc 18-52 deg, range ~350;
  homing 1-4 missiles/volley, 9-11 dmg, turn 280 deg/s; laser tick 10-15/s, 5-11.5 dmg, half-width 5-14. Ground: bomb 75 (r44, cd .45, 1 ord), rocket 2x18 (r26, hits air, cd .55),
  seeker 100 (r34, locks nearest ground target, cd .8), heavy 240 (r90 delayed, 2 ord, cd 1.8).
- Upgrades: damage +8 %, fire rate +6 %, hull +10, shield +8 (& +1.5/s regen), bombs +1, speed +4 %, flares -0.8 s; cost `round(base * (lvl+1)^1.4)`, max level 8.

## DEV demo
`src/core/devdemo.ts` is only used when `levels.chapters` is empty (it uses the real enemy roster when present, plus a DEV boss). Remove nothing: it deactivates itself when real levels exist.
Dev test tip: with Vite HMR other agents' edits reload the page; QA runs against a snapshot server (`server.hmr=false`).
