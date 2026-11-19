# SKY REAPER: code review (read-only)

Date: 2026-11-19. Scope: every `.ts` file under `src/` and `worker/` (src/ui, src/levels, src/core and src/assets were
being edited during the review, so they were re-read before writing this). No code was changed.
I checked each finding against the source. Line numbers are from the review snapshot.

Severity: **High** = crash or broken game state in normal play · **Medium** = wrong behaviour or a security gap
that players or attackers can hit · **Low** = an edge case, a performance cost, or polish.
**Status:** each finding is either **Confirmed** or **Suspected**.

| # | Sev | Area (owner) | File:line | One-liner |
|---|---|---|---|---|
| 1 | High | Engine `src/core`, `src/player` | core/bullets.ts:189, 274-279; player/index.ts:343; core/world.ts:1099 | Player death clears bullets while a bullet loop is running, so the next pool access uses a stale index (pool corruption, `shootables` drift, possible TypeError crash) |
| 2 | Medium | Engine | core/results.ts:49 | `killRate` recomputed from `kills` (includes boss parts) overrides the correct engine value; objectives like "Destroy 70 %" become easier |
| 3 | Medium | DevOps `worker/` | worker/index.ts:133-151 | Rate limit is keyed per full IP; with IPv6, a single /64 range gets an unlimited number of keys |
| 4 | Medium | DevOps | worker/index.ts:118-123, 319-323 | The `ALLOWED_ORIGINS` feature cannot work: no CORS headers and OPTIONS preflight returns 405 |
| 5 | Medium | DevOps | worker/index.ts:262-265 | Body size check happens after `c.req.text()` has read the whole body (chunked or missing Content-Length) |
| 6 | Medium | UI/Input `src/input` | input/index.ts:284-312, 346-351 | Gamepad edge memory (`padPrev`) is stale when entering the game, so holding START from a menu pauses the game on its first frame (suspected) |
| 7 | Medium | Asset `src/assets`, Orchestrator `main.ts` | main.ts:53-55; assets/audio.ts:126-135 | Audio unlock listener is `once:true`; if the first gesture does not unlock the context (iOS pointerdown), audio stays locked with no retry (suspected) |
| 8 | Low | Engine | core/world.ts:1313-1317 | Hazard can be `releaseAt(i)`'d twice in one iteration |
| 9 | Low | Engine | core/results.ts:69 | "NEW BEST!" is shown on failed runs that are never recorded as the best |
| 10 | Low | Orchestrator | main.ts:71-73 | `__sky.fps` handler is registered outside a scene and is wiped by the first `k.go()`, so the value is frozen |
| 11 | Low | Enemy/AI `src/enemies` | enemies/movement.ts:42-47 | `turnToward` uses a single modulo on unnormalised headings, so it can turn the long way |
| 12 | Low | Asset | assets/sfx.ts:162; assets/music.ts:549 | Random start offset into the 1.5 s noise buffer cuts long noise tails short (explode_l, bomb_explode) |
| 13 | Low | UI/Save `src/save` | save/index.ts:186-188, 238-246 | Multi-tab last-writer-wins and "newer version" saves get downgraded on the next write |
| 14 | Low | Engine | core/render.ts:57-70 | `k.loadShader("srflash")` compiles a new GL program on every game scene entry |
| 15 | Low | Engine (perf) | core/world.ts:649; core/render.ts:209,260,324,360 | Per-entity string concatenation every frame in hot paths |
| 16 | Low | UI/Input (perf) | input/index.ts:436 | `safeInsets()` (getComputedStyle + getBoundingClientRect) runs every frame while touch controls show |
| 17 | Low | Enemy/AI (perf) | enemies/movement.ts:153 | `world.enemies.find(closure)` per formation member per step, O(n^2) |
| 18 | Low | UI (perf) | ui/widgets.ts:525-529 | `drawScanlines` makes about 285 drawRect calls with 3 new objects each, every UI frame |
| 19 | Low | Engine (perf) | core/render.ts:121, 174-180; core/world.ts:1410 | Small per-frame allocations (`uniform` object, `ring()` opts, HUD banner object) |
| 20 | Low | DevOps | worker/index.ts:177-189 | `/api/health` hits D1 on every request (no cache or rate limit) |
| 21 | Low | Engine | core/render.ts:258 | Off-screen draw cull uses `&&`, so it almost never culls |
| 22 | Low | Save/Levels | save/index.ts (field `tutorialSeen`) | `tutorialSeen` is never set to true anywhere |
| 23 | Info | DevOps | worker/index.ts:115-124, 104-113 | Same-origin check is not anti-cheat: any non-browser client can post plausible scores up to 1,000,000 |

---

## 1. High: bullet pool corruption and possible crash when the player dies inside a bullet loop

**Files:** `src/core/bullets.ts:181-190` (updateBullets), `src/core/bullets.ts:264-280` (collideAll, enemy bullets vs player),
`src/player/index.ts:327-345` (`die()` → `w.clearEnemyBullets(p.x, p.y, 70)`), `src/core/world.ts:1083-1106`.
**Status:** Confirmed by code reading.

Both loops walk `eBullets.items` backwards and, after a call that can kill the player, run `w.freeEnemyBullet(i, b)`
with the index they captured earlier:

```ts
// collideAll
w.pc.hurt(b.damage, ...)  // or w.detonate(b) -> enemyBlast -> pc.hurt
w.freeEnemyBullet(i, b);  // i may be stale now
// updateBullets
if (!stepEnemy(w, b, dt)) w.freeEnemyBullet(i, b);  // stepEnemy -> detonate -> enemyBlast -> pc.hurt
```

`hurt()` → `die()` → `clearEnemyBullets(p.x, p.y, 70)` swap-removes every enemy bullet within 70 units. That includes
`b` itself, because `b` just touched the player. After that, `items[i]` is either a different live bullet or out of range.
`Pool.releaseAt(i)` then does one of two things:
- it releases an unrelated live bullet, so that bullet disappears and its missile-lock and shootable bookkeeping is skipped; or
- if `i >= length`, it pops the last live bullet without returning it to the free list (the object leaks) and pushes
  `undefined` onto the free list (`acquire()` then returns `null` once).
- In both cases `freeEnemyBullet` runs `if (b.hp > 0) this.shootables--` a second time for `b`. Enemy missiles always have
  `hp: 2` (`patterns/runner.ts:223`), so every death by missile pushes `shootables` one lower. Because the shoot-down passes
  are gated by `shootables > 0` (bullets.ts:244, world.ts:1211, 1261), the player can stop being able to shoot down
  missiles or flak for the rest of the run.
- **Crash path** (`updateBullets`): the loop does not stop after the death, and it continues with `i-1` while the array
  has shrunk. If `b` was among the top-k indices (k = number of bullets cleared), `eb[i]` is `undefined`, so
  `stepEnemy(w, undefined)` throws `TypeError: Cannot read properties of undefined (reading 'age')`. `world.step()` has no
  try/catch around the bullet passes (core/index.ts:126), so the error escapes the scene's `onUpdate` and KAPLAY shows
  its error screen. Trigger: an enemy missile (blastRadius 22) whose `life` runs out within about 26 units of the player
  while the player has no i-frames and not much HP left.

**Fix (Engine):** make bullet removal safe against changes made during the loop. Either of these works:
- Make `clearEnemyBullets` lazy while a pass is running: set `b.life = -1` / a `dead` flag and let `updateBullets` sweep
  those bullets. `freeEnemyBullet` should also check that `items[i] === b` and return early otherwise.
- Or, in both loops, re-check after any call that can hurt the player:
  `if (eb[i] !== b) { const j = eb.indexOf(b); if (j >= 0) w.freeEnemyBullet(j, b); i = Math.min(i, eb.length); continue; }`

Also guard `Pool.releaseAt` with `if (i >= items.length) return;` so a bad index can never push `undefined`.

## 2. Medium: `killRate` is overwritten with a value that includes boss parts

**File:** `src/core/results.ts:49`. **Status:** Confirmed.
`World.killEnemy` keeps `killRate` correct by counting only `er.counted` kills (destructible, not boss parts,
world.ts:824-827). `finishRun` then overwrites it with `stats.kills / stats.spawned`. `kills` also counts every boss part
the player destroys (5-10 per boss), but those parts never count toward `spawned`, so the rate is inflated by several
percent. The jungle objective `jun_rate` (killRate ≥ 0.7, levels/chapters/jungle.ts:120) is therefore easier than designed.
**Fix:** delete line 49, or expose `killedCounted` and use it.

## 3. Medium: rate limit is per full IP, which an IPv6 client can bypass

**File:** `worker/index.ts:133-134`. **Status:** Confirmed.
`CF-Connecting-IP` is hashed as-is. Any IPv6 client controls at least a /64, which is 2^64 different keys, so the limit of
10 POSTs per 10 minutes does not apply to it. The default salt `"sky-reaper"` is public, but the hashes are never
exposed, so that part is minor.
**Fix:** if the IP contains `:`, keep only the first four hextets (/64) before hashing. Consider also using Cloudflare
Rate Limiting rules or the Workers `ratelimit` binding for `/api/score`.

## 4. Medium: cross-origin submission (`ALLOWED_ORIGINS`) cannot work

**File:** `worker/index.ts:115-124, 319-323`. **Status:** Confirmed.
A POST with `Content-Type: application/json` from another origin triggers a CORS preflight. `OPTIONS /api/score` lands
in `app.all("/api/*")` and returns 405. No response ever carries `Access-Control-Allow-Origin`. So browsers block every
origin listed in `ALLOWED_ORIGINS`, and the `Sec-Fetch-Site: same-site` branch is dead code for real browsers.
**Fix:** add an OPTIONS handler and ACAO/Vary headers for allowed origins (e.g. `hono/cors` with an origin callback
using the same `allowed` set), or remove the option and document "same-origin only".

## 5. Medium: request body is read in full before the size check

**File:** `worker/index.ts:262-265`. **Status:** Confirmed.
The `Content-Length` check is skipped when the header is missing (chunked upload), because `Number("0")` is 0. Then
`await c.req.text()` buffers the entire body before checking `MAX_BODY_BYTES`. A client can stream many MB per request,
and invalid requests are not rate limited because the limit runs after validation. Also, `text.length` counts UTF-16
code units, not bytes.
**Fix:** read `c.req.raw.body` with a reader, keep a byte total, and stop with 413 at 2048 bytes. Or reject requests that
have no `Content-Length`. Use `new TextEncoder().encode(text).length` (or count bytes while streaming) for the limit.

## 6. Medium (suspected): stale gamepad edge state pauses the game when it is started with START

**File:** `src/input/index.ts:281-312`, `346-351`. **Status:** Suspected (code path confirmed; it needs a pad to reproduce).
`poll()` detects button edges against `padPrev`, which is only updated inside `poll()`. Menus use `menuPad()`, which has
its own `menuPrev`. So when the game scene starts, `padPrev` still holds the state from the last gameplay frame (or is
empty). `ui/core.ts:324` lets START (button 9) confirm in menus. If START is still held on the first `poll()` in the
game, `edge(9)` is true, `pausePressed` is set, and the game opens paused. B/X (bomb edges) behave the same way after
returning from a menu.
**Fix:** in `setTouchControlsVisible()` (called on game enter and leave), set
`padPrev` to the current pad buttons (`getPad()?.buttons.map(...)`), so held buttons are not treated as new presses.

## 7. Medium (suspected): audio unlock is attempted only once

**Files:** `src/main.ts:53-55` (`{ once: true }`), `src/assets/audio.ts:126-135`. **Status:** Suspected (depends on the browser).
If `ctx.resume()` on the first `pointerdown` does not unlock the context (older iOS Safari only accepts
`touchend`/`click` as the gesture for audio), the listeners are already removed, and the error handler of the
rejected promise is empty. Audio then stays silent unless KAPLAY happens to resume the context itself (the
`statechange` hook would catch that).
**Fix (Orchestrator / Asset):** keep the listeners registered (pointerdown, pointerup, touchend, keydown, click) until
`ctx.state === "running"`, then remove them. `AudioService.unlock()` is already safe to call repeatedly.

## 8. Low: a hazard can be released twice in one iteration

**File:** `src/core/world.ts:1313-1317`. **Status:** Confirmed (rare timing).
In the state-1 branch, `releaseAt(i)` runs when `blastT > 0.3`, and then the off-screen check runs `releaseAt(i)` again
on the same index, with no `continue` in between. If both conditions hit in the same step (an anchored hazard
scrolling past `GAME_H + r + 20` at the end of its blast), an unrelated hazard is removed, or `undefined` is pushed to
the free list. **Fix:** `continue` after each `releaseAt`.

## 9. Low: "NEW BEST!" appears on failed runs

**File:** `src/core/results.ts:69` → `ui/results.ts:146`. **Status:** Confirmed.
`newBest` is computed for defeats too, but `recordChapter` (which stores `bestScore`) only runs on victory.
**Fix:** `const newBest = victory && stats.score > (prev?.bestScore ?? 0);`

## 10. Low: `__sky.fps` stays frozen

**File:** `src/main.ts:71-73`. **Status:** Confirmed against the kaplay@3001.0.19 source.
`go()` runs `app.events.clear()`, `game.events.clear()` and `root.clearEvents()`, so an `onUpdate` registered before the
first `k.go(menu)` runs for at most one frame. The tests currently measure FPS themselves, so nothing breaks, but the
`SkyDebug.fps` contract field is misleading. The same reset also means `dbg.scene` is only right when a scene sets it.
**Fix:** use `requestAnimationFrame` in main.ts (or have each scene update `__sky.fps`; the game scene already
computes `world.fps`).

## 11. Low: `turnToward` can turn the long way

**File:** `src/enemies/movement.ts:42-47`. **Status:** Confirmed math; rare in play.
`((target - cur + 540) % 360) - 180` assumes `target - cur > -540`. `s.heading` is never normalised. A `follow` or
`dive` unit that keeps turning in one direction can reach headings like 390 while `want` is about -170. The `%` result is
then negative and the unit turns about 200° the wrong way.
**Fix:** `let d = ((((target - cur) % 360) + 540) % 360) - 180;`, the same as `steer()` in core/bullets.ts, and/or
normalise `s.heading`.

## 12. Low: long noise sounds are cut short

**Files:** `src/assets/sfx.ts:162`, `src/assets/music.ts:549`. **Status:** Confirmed.
`src.start(st, (st * 7.3) % 1)` starts up to 1 s into a 1.5 s, non-looping noise buffer. Steps longer than about 0.5 s
(`explode_l` 1.2 s and 1.0 s, `bomb_explode` 0.75 s, `player_die` 1.2 s) stop early, at a random point.
**Fix:** `src.loop = true`, or `offset = (st * 7.3) % Math.max(0.001, 1.5 - s.dur)`.

## 13. Low: localStorage edge cases

**File:** `src/save/index.ts`. **Status:** Confirmed.
- Two open tabs: each keeps its own `data` in memory and writes the whole blob, so the last writer wins. Shop purchases
  or progress made in the other tab are lost. Fix: listen to the `storage` event for `SAVE_KEY` and reload
  (`data = load()`, then notify), or re-merge before each write.
- A save from a newer version is loaded "best effort", and the next `save()` writes it back as v1 without the unknown
  fields (silent downgrade if an older cached build runs). Fix: keep a backup (`<KEY>-v<n>`) before the first write, or
  keep the raw blob read-only.
- Each slider step calls `notifySettingsChanged()` → `save()` (settings.ts:67-68), which means a synchronous
  localStorage write for every drag event. Fix: debounce writes (about 250 ms).

## 14. Low: flash shader is recompiled on every run

**File:** `src/core/render.ts:57-70`. **Status:** Confirmed (KAPLAY `loadShader` with inline source calls `addLoaded(makeShader(...))` synchronously).
Each `new Renderer` (each game scene entry or restart) compiles and links a new WebGL program and replaces the asset
entry. The old program is not deleted. **Fix:** load it once (module-level flag, or `k.getShader("srflash")` check), or
load it at boot.

## 15-19. Low: per-frame allocations in hot paths (header comments say "allocates nothing")

**Status:** Confirmed. Engine owns these; none of them is a correctness bug.
- `core/world.ts:649` `reg.info(def.sprite ?? "enemy_" + def.id)` builds a new string for every enemy on every sim step.
  `core/render.ts:209/260/264/275/324` do the same 3-5 more times per enemy per frame, plus `"pickup_" + kind` (360) and
  `playerKey()` (438-444). Fix: cache the sprite key on the def (`WeakMap<EnemyDef, {key, bankL, bankR, gun}>`) or on
  `EnemyRT` at spawn.
- `render.ts:121` `o.uniform = { u_amt: 0.85 }` creates an object per flashing enemy per frame. Use a constant.
- `render.ts:174-180` `ring()` and `text()` allocate options and a vec2 per call (shield bubble every frame, hazards, ping fx).
  Reuse an options object like `co` does.
- `world.ts:1410` `h.banner = {...}` every frame while a banner shows. Mutate a reused object.
- `input/index.ts:284` `pad.buttons.map` plus a new `InputState` per poll. Minor.
- `bosses/framework.ts:202-204` `offsetOf` returns a tuple per part per step. Minor.
- `input/index.ts:436` (16) calls `safeInsets(canvas)` every frame while touch controls show, which means
  `getComputedStyle` + `getBoundingClientRect` + `innerWidth/innerHeight` each frame on phones. Fix: cache it the way
  `ui/core.ts:436-440` and `hud.ts:422` already do (every 0.5 s or on resize).
- `enemies/movement.ts:153` (17) runs `world.enemies.find((o) => ...)` per formation follower per step: a closure
  allocation plus an O(n) scan, so O(n²) per step with large formations (pool of 160). Fix: cache the leader reference
  in the move state and re-check `leader.id === f.leaderId && leader.alive`.
- `ui/widgets.ts:525-529` (18) `drawScanlines` makes about 285 `drawRect` calls per UI frame, each with a new opts
  object, vec2 and Color. Fix: reuse one opts object and one Color, or draw a single pre-rendered scanline sprite.

## 20. Low: health endpoint is uncached

**File:** `worker/index.ts:177-189`. Each `GET /api/health` runs a D1 query with no caching or limit.
Fix: cache for about 10 s, or skip the DB ping unless `?deep=1`.

## 21. Low: draw cull condition

**File:** `src/core/render.ts:258`. `!e.onScreen && Math.abs(e.x - GAME_W/2) > GAME_W && e.y < -200` only culls an
enemy that is off-screen, far to the side and above the screen, all at once. Everything else is drawn even when
off-screen. Intended: `!e.onScreen && (Math.abs(e.x - GAME_W/2) > GAME_W || e.y < -200 || e.y > GAME_H + 200)`.

## 22. Low: `tutorialSeen` is never written

`SaveData.tutorialSeen` is sanitised and read nowhere, and nothing sets it to true. The chapter 1 tutorial hints
therefore show on every run. Either set it after the first tutorial (Levels/UI) or drop the field via
`docs/CONTRACT_REQUESTS.md`.

## 23. Info: leaderboard integrity

`isSameOrigin` only stops browsers. curl can set `Origin` to anything, and the plausibility bounds allow a 1,000,000
score after a claimed 380 s of play. `medal` is not checked against score thresholds. This is acceptable for a casual
board. If that matters, add a signed run token issued at chapter start (HMAC of chapter, seed, start time), and check
the claimed `timeSec` against the server-side elapsed time.

---

## Checked and found OK (no finding)

- **KAPLAY handlers**: every `onUpdate/onDraw/onMouse*/wait` is registered inside a scene, so `go()` clears it.
  The only exception is main.ts (#10).
- **DOM listeners**: input/index.ts, ui/core.ts (`installPointer` guarded by `installedOn`) and ui/desktop/layout.ts
  (`installed` flag) are each installed once. core/index.ts removes its `visibilitychange` listener in `onSceneLeave`.
  `UiRoot.onKey` hooks are removed on leave.
- **Promises**: `net/leaderboard.ts` never rejects (it has try/catch plus an AbortController timeout). Asset loading
  falls back. `audio.unlock` handles rejection. `boot()` has a catch. No floating promises found.
- **Pattern instances** are cancelled in `enemySystem.onDeath` (including culls), and boss patterns on part death,
  phase change and defeat. So recycled pool enemies never inherit a stale shooter.
- **Pool exhaustion**: every `acquire()` caller handles `null`. Boss parts retry through `pending`. `fastForward`
  drains the graveyard. Wide-field duplicate spawns stop at 100 alive.
- **Music players**: the interval is cleared and the gain disconnected on stop. Per-note nodes are fire-and-forget and
  get garbage collected. SFX voice and per-id limits are in place.
- **NaN guards**: save sanitising clamps every number. Divisions use `Math.max(1, …)` or a positive guard
  (`lobT`, `telegraph`, `maxHp`, `initialTotal`). `difficulty` is clamped in save, enemies and bosses. Shop `buy`
  rejects `Infinity` costs and `spend` rejects non-finite values.
- **Wide vs portrait**: gameplay code uses `GAME_W` / `X_SCALE` / `mapX`. The only hard-coded 480-space values are in
  `core/devdemo.ts` (DEV content only) and the authored `maxY: 480` attack windows in enemies/defs.ts, which are
  y-values and correct. `GAME_W` is fixed at load by design, so rotating or resizing after load keeps the old field
  (documented in consts.ts).
- **Worker**: errors return generic JSON (`onError`). Every SQL statement is parameterised. zod `.strict()` rejects
  unknown keys. Names are sanitised to `[A-Z0-9 _.-]{1,12}` and constrained again by the D1 CHECK. Hono's
  `c.header()` after `next()` correctly re-wraps immutable cached responses (hono 4.13 context.js:199-205).
