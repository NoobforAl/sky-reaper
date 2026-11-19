import { test, expect } from "@playwright/test";
import { fpsFloor, measureFps, realErrors, startChapter, trackErrors } from "./helpers";

/**
 * Bomber-wave performance (round3 #10, docs/PERF_BOMBERS.md). desert @116 s spawns bomber_elite + bomber at 118 s (round 6 moved the pair from 123 s):
 * their carpet-bomb volleys keep ~15-20 hazards (telegraph discs + rings + fx_warning) on screen at once, which used to
 * cost 5-11 ms of CPU per frame in KAPLAY's stroked drawCircle. Wide layout (GAME_W 1520) is the worst case.
 * FPS floor 50 with a GPU (fpsFloor() lowers it on software GL, where the 1520-wide canvas is fill-bound anyway).
 */
test.use({ viewport: { width: 1600, height: 900 } });

test("bomber wave holds FPS (desert@116, wide)", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  // boot() in helpers navigates to "/", so navigate with the layout query here
  await page.goto("/?layout=wide");
  await page.waitForFunction(() => !!(window as any).__sky, null, { timeout: 30_000 });
  expect(await page.evaluate(() => (window as any).__skyBootError ?? null)).toBeNull();
  await startChapter(page, "desert", { startAt: 116, godMode: true, seed: 1 });

  // wait until the first carpet volleys are armed (bombers enter ~2 s after spawn, first carpet ~3 s later)
  await page
    .waitForFunction(() => ((window as any).__sky.game.world.hazards?.items?.length ?? 0) > 0, null, { timeout: 20_000 })
    .catch(() => {});

  // sample live hazards while measuring (annotation only: hazards is a core internal, not WorldAPI)
  await page.evaluate(() => {
    const w = (window as any).__sky.game.world;
    const s = ((window as any).__perfHz = { max: 0, sum: 0, n: 0 });
    const id = setInterval(() => {
      const n = w.hazards?.items?.length ?? 0;
      s.max = Math.max(s.max, n);
      s.sum += n;
      s.n++;
    }, 100);
    (window as any).__perfHzStop = () => clearInterval(id);
  });

  const floor = await fpsFloor(page, 50);
  const r = await measureFps(page, 8000);
  const hz = await page.evaluate(() => {
    (window as any).__perfHzStop?.();
    const s = (window as any).__perfHz;
    return { max: s.max, avg: s.n ? s.sum / s.n : 0 };
  });
  test.info().annotations.push({
    type: "perf",
    description: `avg ${r.avg.toFixed(1)} fps (floor ${floor}), worst frame ${r.worstFrameMs.toFixed(1)} ms, hazards max ${hz.max} avg ${hz.avg.toFixed(1)}`,
  });
  console.log(`[perf] bomber wave desert@116 wide: avg ${r.avg.toFixed(1)} fps (floor ${floor}) worst ${r.worstFrameMs.toFixed(1)} ms hazards max ${hz.max} avg ${hz.avg.toFixed(1)}`);

  expect(hz.max, "the scenario must actually put carpet-bomb hazards on screen").toBeGreaterThan(0);
  expect(r.avg).toBeGreaterThanOrEqual(floor);
  expect(r.worstFrameMs).toBeLessThan(150); // catches long GC stalls
  expect(realErrors(errors)).toEqual([]);
});
