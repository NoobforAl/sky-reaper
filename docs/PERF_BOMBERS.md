# PERF: FPS drop "when bombers are coming"

Status: diagnosed, **no game source changed**. Owner of the fix: Engine (`src/core/render.ts`).
Measured 2026-11-19 on a production build (`vite build`) served by `vite preview`, Playwright 1x DPR, `godMode`, `seed: 1`.
The player never fires in these runs, so bombers live for their whole pass. That makes these numbers close to a worst case.

## TL;DR

Bombers do not cost much themselves. The cost comes from their **carpet bombs**. Each `carpet_bomb`/`carpet_heavy` volley spawns 5 or 7 **hazards**.
For every hazard, every frame, the renderer draws a **stroked circle** (`Renderer.ring()` → `k.drawCircle({fill:false, outline})`).
KAPLAY 3001 draws a stroked circle as 46 line quads, and **one 45-triangle filled "join" circle per segment**
(`drawLines` with `join` undefined → `drawCircle` per point). So one ring is about **2,350 vertices, 6,500 indices, about 93 `drawRaw` calls and more than 10k short-lived JS objects**.
With 2 bombers overlapping, 10-20 hazards are live at once. That costs **5-11 ms per frame of CPU just for ring outlines**, plus heavy GC churn (heap sawtooth 8 → 93 MB).
Patching only `ring()` in the page so it draws one miter polyline brought drawCircle time down by **about 10x** and **removed every frame drop on GPU**.

## Where bombers come from

| what | file:line |
|---|---|
| `bomber` def: attacks `carpet_bomb` every 4.2 s and `aimed_slow` | `src/enemies/defs.ts:84-103` (attack at :97) |
| `bomber_elite` def: `carpet_heavy` every 4.5 s and `fan3_aimed` | `src/enemies/defs.ts:676-696` (attack at :690) |
| `carpet_bomb`: areaStrike, 5 blasts, r 34, telegraph 900 ms + i*180 ms | `src/patterns/library.ts:51-61` |
| `carpet_heavy`: areaStrike, 7 blasts, r 40, telegraph 1000 ms + i*140 ms | `src/patterns/library.ts:87-97` |
| areaStrike spawns N hazards per volley | `src/patterns/runner.ts:343-369` |
| hazard pool / spawn / update / blast (shake on each blast) | `src/core/world.ts:983-1003`, `:1347-1359`, `:1361-1386` |
| waves: pacific 91, 95, 142, 173 · jungle 92 (x2 line), 161 · desert 31, 123 (elite + bomber), 172 · arctic 68, 118, 177 (elite) · citadel 81, 104 (elite + bomber), 170 | `src/levels/chapters/*.ts` (grep `bomber`) |

Each hazard stays live for its telegraph time plus a 0.3 s blast (about 0.9-1.9 s). Two bombers firing on overlapping 4.2 s cycles therefore keep **10-20 hazards** on screen. Measured peaks: 20 (jungle 89 s, wide), 19 (desert 121 s, wide).

## Measurements

Harness: `%TEMP%\sky_perf_bombers\perf.cjs` and `summarize.cjs`. Raw JSON, logs and screenshots are in `%TEMP%\sky_perf_bombers\results\`.
Each scenario runs `__sky.goto('game', {chapterId, startAt, godMode:true, seed:1})` and samples once per second.
Sampled values: rAF FPS, worst frame, frames over 20 ms, live enemies, enemy bullets, fx, hazards, `drawCircle` calls and time (wrapped `k.drawCircle`), GL `drawElements` per frame, and `world.step` ms (wrapped).
The first second of each scenario is dropped.
"base" is the shipped renderer. "fixring" is the same build with `k.drawCircle` patched **in the page only**, so that outline circles draw a single 24-segment `k.drawLines({join:"miter"})`. That emulates fix #1.

GPU = Edge, `--enable-gpu --ignore-gpu-blocklist --use-angle=d3d11` → *ANGLE Intel UHD Graphics (D3D11)*, display capped at 75 Hz.
SW = bundled Chromium, SwiftShader.
Wide = viewport 1600x900 (`?layout=wide`, GAME_W 1520). Portrait = 540x960 (`?layout=portrait`, GAME_W 480).

### GPU, wide (the user's likely setup)

| scenario | variant | avg FPS | min 1 s FPS | worst frame ms | frames >20 ms | max hazards | rings/frame avg / max | drawCircle ms/frame avg / max | GL draws/frame max | sim ms/frame | heap MB min-max |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pacific 46 s (no bombers, control) | base | 75.0 | 75.0 | 13.5 | 0 | 0 | 1.0 / 1.0 | 1.00 / 1.14 | 44 | 0.06 | 8.6-43.4 |
| pacific 88 s (2 bombers) | base | 75.0 | 75.0 | 13.5 | 0 | 10 | 3.2 / 9.5 | 1.96 / 5.50 | 56 | 0.05 | 8.8-46.5 |
| pacific 171 s (2 bombers) | base | 75.0 | 75.0 | 13.5 | 0 | 7 | 4.0 / 7.4 | 2.61 / 4.79 | 54 | 0.06 | 9.1-39.9 |
| **jungle 89 s (bomber line x2)** | base | **72.7** | **62.3** | **53.3** | **42** | 20 | 5.8 / 19.3 | **3.62 / 11.30** | 77 | 0.06 | 8.3-81.5 |
| **desert 121 s (elite + bomber)** | base | **70.2** | **60.2** | **40.1** | **82** | 19 | 8.7 / 16.1 | **5.20 / 9.83** | 73 | 0.07 | 7.5-93.2 |
| pacific 46 s | fixring | 75.0 | 75.0 | 13.6 | 0 | 0 | 1.0 / 1.0 | 0.13 / 0.18 | 44 | 0.05 | 8.1-38.5 |
| pacific 88 s | fixring | 75.0 | 75.0 | 13.5 | 0 | 10 | 3.2 / 9.8 | 0.24 / 0.57 | 55 | 0.05 | 9.0-42.3 |
| pacific 171 s | fixring | 75.0 | 75.0 | 13.6 | 0 | 7 | 4.0 / 7.5 | 0.24 / 0.39 | 53 | 0.06 | 8.7-41.6 |
| **jungle 89 s** | fixring | **75.0** | **75.0** | **13.6** | **0** | 20 | 6.0 / 19.4 | **0.40 / 0.93** | 76 | 0.06 | 8.8-43.8 |
| **desert 121 s** | fixring | **75.0** | **75.0** | **13.5** | **0** | 19 | 9.0 / 17.9 | **0.49 / 1.00** | 71 | 0.08 | 10.3-51.5 |

### GPU, portrait (base)

| scenario | avg FPS | min 1 s | worst ms | >20 ms | max hazards | rings max | drawCircle ms avg / max |
|---|---|---|---|---|---|---|---|
| pacific 46 (control) | 74.8 | 73.0 | 40.0 | 2 | 0 | 1.0 | 1.14 / 1.49 |
| pacific 88 | 74.9 | 73.0 | 26.6 | 3 | 10 | 9.4 | 2.96 / 8.09 |
| pacific 171 | 74.5 | 70.1 | 40.0 | 8 | 8 | 7.9 | 3.86 / 7.56 |
| jungle 89 | 74.8 | 73.0 | 26.8 | 3 | 10 | 10.6 | 3.04 / 7.63 |
| **desert 121** | **71.5** | **48.7** | 40.1 | **55** | 11 | 10.9 | **5.65 / 12.33** |

### Software GL (SwiftShader). Fill-bound, so read these numbers relative to each other.

| scenario | wide base avg (hazard s / no-hazard s) | wide fixring avg (hazard / none) | portrait base avg (hazard / none) | portrait fixring avg (hazard / none) |
|---|---|---|---|---|
| pacific 46 control | 21.1 | 23.5 | 54.7 | 45.6 * |
| pacific 88 | 20.4 (19.0 / 21.2) | 23.5 (23.2 / 23.8) | 52.7 (50.2 / 54.3) | 48.6 (48.4 / 48.7) |
| pacific 171 | 21.5 (21.0 / 22.0) | 23.3 (23.2 / 23.5) | 50.0 (45.5 / 55.1) | 44.3 (43.7 / 45.0) |
| jungle 89 | 23.4 (21.7 / 24.6) | 25.3 (24.4 / 25.9) | 52.8 (47.4 / 55.3) | 45.2 (43.3 / 46.0) |
| desert 121 | 17.7 (16.8 / 19.8) | 19.1 (19.2 / 18.8) | 39.7 (37.8 / 46.0) | 38.1 (37.6 / 39.1) |

\* The SW portrait fixring run happened while other agents were loading the machine. Its control dropped from 54.7 to 45.6 FPS between runs, so compare columns **within** a run.
In both SW layouts, base loses 2-10 FPS in seconds that have hazards. With fixring the "hazard vs none" gap disappears: 0-2 FPS, within noise.
Wide SW sits at about 21 FPS even with no bombers. That is SwiftShader rasterising a 1520x854 canvas, a separate issue that a real GPU does not have.

### What the numbers rule out

- **Simulation is not the cause.** `world.step` takes 0.05-0.17 ms per frame in every scenario, bomber waves included. Collision (`src/core/bullets.ts:209+`) is pb x enemies, with no O(n²) blow-up at these counts.
- **Bullet and enemy counts are not the cause.** The control segment has as many enemies (23) and enemy bullets (65) as pacific 88, and runs at 75 FPS on both variants. Desert at 211 enemy bullets runs at 75 FPS once rings are fixed.
- **Bomber smoke trails are not the cause.** `world.ts:676-685` only spawns smoke or fire below 50 % HP. The player never hit anything here, so fx stayed at 0-44 live particles, all drawn as single sprites.
- **Pool exhaustion is not the cause.** Hazards peak at 20, and they are pooled.

## Root causes

### 1. `Renderer.ring()` uses KAPLAY's stroked circle (main cause, about 0.55 ms per ring on this laptop CPU)
- `src/core/render.ts:196-205`: `ring()` → `k.drawCircle(this.rgo)` with `fill:false, outline:{width,color}`. `join` is unset.
- In KAPLAY 3001.0.19, `drawCircle` → `drawEllipse` → `getArcPts` gives 46 points at a fixed 8° step, whatever the radius. Then `drawPolygon(outline)` → `drawLines`.
  With `join` undefined (`!== "none"`), that draws **one `drawLine` plus one `drawCircle(radius = width/2)` for each of the 46 segments**. Each of those join circles again builds 46 `Vec2`, a 47-vertex polygon, `Object.assign` copies and a push/pop transform.
  Per ring: about 2,346 vertices and 6,486 indices. KAPLAY's batch holds 12,288 indices, so **every second ring forces an extra flush**, plus a `new Float32Array` of the vertex queue.
- Per-frame callers while bombers are on screen:
  - `src/core/render.ts:681`: every **telegraphing hazard** (warning ring, width 2), every frame.
  - `src/core/render.ts:686`: every **blasting hazard** (width 3) for 0.3 s.
  - `src/core/render.ts:508`: the **player shield bubble**, every frame whenever shield > 0. This is the constant baseline of 1 ring and about 1 ms per frame, even with no bombers.
  - `src/core/render.ts:528`, `:538`: rapid/overdrive aura and missile-lock ring. These are occasional but cost the same.
  - `src/core/render.ts:644`, `:656`, `:660`: fx fallbacks. They only run when an fx sprite is missing (today all fx sprites exist).
- Measured slope: (5.20 - 1.00 ms) / (8.7 - 1.0 rings) ≈ **0.55 ms CPU per ring** on desert-wide. At the peak of 19 rings, 9.8-11.3 ms per frame goes to rings alone. That is most of a 13.3 ms (75 Hz) or 16.7 ms (60 Hz) frame. On phones and slower CPUs, expect 2-4x that.
- Note: the UI agent already found this KAPLAY behaviour and avoided it in the HUD. See `src/ui/widgets.ts:81` (`strokeCircle`), `:277`, `src/ui/hud.ts:243` and `src/input/touch.ts:67`. Only the core renderer still uses the slow path.

### 2. GC pressure from that geometry (causes the 27-53 ms spikes)
Each ring allocates more than 10k short-lived objects (Vec2, vertex objects, arrays, option copies). With rings on screen, the JS heap swings from **8 MB to 81-93 MB** within one-second windows, against 38-46 MB peaks in the control or with fixring.
The 40-53 ms "worst frames" and the 42-82 frames over 20 ms per run are major-GC pauses on top of the extra CPU time. Fix #1 removes them: 0 frames over 20 ms on GPU.

### 3. Hazard draw order alternates textures (secondary, about +2 GL draws per hazard)
`src/core/render.ts:674-688` draws, for each hazard, `circ` → `circ` → `ring` (default white texture) and then `spr("fx_warning")` (sprite atlas).
KAPLAY's batch flushes on every texture change, so each hazard adds about 2 flushes. GL draws per frame went from 44 to 71-77 at 19-20 hazards, and those numbers include ring overflow flushes.
This is cheap on a desktop GPU but matters on mobile and software GL.

### 4. Minor or not measured
- `src/core/world.ts:1358`: `enemyBlast` calls `shake(4, 140)` for every carpet blast (r ≥ 40), so a heavy carpet means 7 shakes in about 1 s. This is visual only, not a perf issue.
- Audio: each blast plays `explode_m`. `src/assets/audio.ts:9` caps voices at 24, so audio is bounded. It was not measured in headless runs (audio is locked).
- `src/ui/widgets.ts:295` and `src/ui/hud.ts:364` still use KAPLAY outlines (a small circle and a triangle). These are per-frame HUD calls, but each is a single small shape. Low priority.

## Fix proposals (for the Engine agent; I changed no source)

| # | change | where | est. gain |
|---|---|---|---|
| 1 | Replace `ring()` with a cheap stroke: reuse a module-level array of about 24 `Vec2`, fill it with cos/sin of a cached unit circle, and call **`k.drawLines({ pts, width, color, opacity, join: "miter" })`** (one `drawRaw`, no join circles). Alternatively, port `strokeCircle` from `src/ui/widgets.ts:82` (no joins, but 1 drawRaw per segment) | `src/core/render.ts:196-205` | **Measured:** drawCircle CPU 5.2 → 0.5 ms per frame (desert) and 3.6 → 0.4 ms (jungle). FPS min 60 → 75 (GPU wide), 0 frames over 20 ms, heap peak 93 → 52 MB. Also removes the constant ~0.9 ms per frame from the shield bubble |
| 2 | Better still for hazards: draw the telegraph ring as a **sprite** (`fx_ring` already exists, or a new `fx_hazard_ring` in `docs/ASSET_REQUESTS.md`), tinted with `color`, scaled to `radius`. That costs 1 quad instead of a polyline | `src/core/render.ts:681`, `:686` | Rings cost nearly nothing (one quad each), and they batch with `fx_warning` |
| 3 | Split `drawHazards` into two passes: all shapes (circles and rings) first, then all `fx_warning` sprites. That gives one texture switch per frame instead of 2 per hazard | `src/core/render.ts:671-689` | −2 GL draws per hazard (about −35 at 19 hazards). Small on desktop, worthwhile on mobile and SW GL |
| 4 | Lower the filled-circle tessellation for small or fast shapes: pass `resolution: 0.5` in `circ()` for radius < 12 (hit-dot, muzzle fallbacks), so KAPLAY's fixed 46 points become 23 | `src/core/render.ts:184-194` | Minor, about 5-10 % of the remaining circle cost |
| 5 | Optional design tweak: cap concurrent enemy hazards (for example skip `spawnHazard` when more than 24 are live) | `src/core/world.ts:983` | Safety net only. Not needed after #1 |

Expected outcome after #1 and #3: bomber waves cost the same as any other wave (measured hazard vs no-hazard gap ≤ 1 FPS on GPU). The constant shield-bubble cost goes too.

## Playwright perf test sketch (for QA, `tests/e2e/perf-bombers.spec.ts`)

```ts
import { test, expect } from "@playwright/test";
import { boot, startChapter, measureFps, fpsFloor, trackErrors, realErrors } from "./helpers";

// worst measured bomber overlaps (2 bombers / elite+bomber => 19-20 live hazards)
const CASES = [
  { chapter: "jungle", startAt: 89 },   // WAVE 3 BOMBER FORMATION (line of 2) at 92 s
  { chapter: "desert", startAt: 121 },  // bomber_elite + bomber at 123 s
  { chapter: "pacific", startAt: 171 }, // 2 bombers at 173 s
];

for (const layout of ["wide", "portrait"] as const) {
  for (const c of CASES) {
    test(`bomber wave holds FPS: ${c.chapter}@${c.startAt} ${layout}`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto(`/?layout=${layout}`);
      await boot(page); // or inline the waitForFunction if boot() hardcodes "/"
      await startChapter(page, c.chapter, { startAt: c.startAt, godMode: true, seed: 1 });
      // let the first carpet volleys arm (bomber enters ~2 s after spawn, carpet at ~3 s)
      await page.waitForFunction(() => (window as any).__sky.game.world.hazards?.items?.length > 0 || (window as any).__sky.game.world.time > 0, null);
      await page.waitForTimeout(4000);
      const floor = await fpsFloor(page, 50); // 50 on GPU, 24 on software GL
      const r = await measureFps(page, 8000); // covers >= 2 carpet cycles
      const hz = await page.evaluate(() => (window as any).__sky.game.world.hazards.items.length);
      test.info().annotations.push({ type: "perf", description: `avg ${r.avg.toFixed(1)} worst ${r.worstFrameMs.toFixed(1)}ms hazards ${hz}` });
      expect(r.avg).toBeGreaterThanOrEqual(floor);
      expect(r.worstFrameMs).toBeLessThan(100); // catches GC stalls
      expect(realErrors(errors)).toEqual([]);
    });
  }
}
```

For GPU runs on Windows, use the project with `channel: "msedge"` and `launchOptions.args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"]`.
`world.hazards` is a `core` internal and not part of the `WorldAPI` contract, so the hazard count is used only for the annotation.

A stricter variant counts primitives instead of FPS, which is deterministic and not affected by machine noise. Wrap `__sky.services.k.drawCircle` before `startChapter`, then assert that the per-frame `drawCircle` time stays under 2 ms during the wave. Today it reaches 10-12 ms; with the fix, under 1 ms. See `%TEMP%\sky_perf_bombers\perf.cjs` `instrument()`.
