import { expect, test } from "@playwright/test";
import { boot, fpsFloor, measureFps, realErrors, startChapter, trackErrors, worldTime } from "./helpers";

test("mobile portrait: boots, touch controls drive the game", async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.screenshot({ path: "test-results/screens/mobile-menu.png" });
  await startChapter(page, "pacific", { godMode: true });
  await page.waitForTimeout(1000);

  const box = (await page.locator("canvas").boundingBox())!;
  const before = await page.evaluate(() => ({ ...(window as any).__sky.game.world.player }));
  // drag on the lower-left part of the screen (movement zone)
  const sx = box.x + box.width * 0.35;
  const sy = box.y + box.height * 0.75;
  await page.touchscreen.tap(sx, sy);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, x: number, y: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] } as any);
  await touch("touchStart", sx, sy);
  for (let i = 1; i <= 15; i++) {
    await touch("touchMove", sx - i * 6, sy - i * 4);
    await page.waitForTimeout(30);
  }
  await touch("touchEnd", sx - 90, sy - 60);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ ...(window as any).__sky.game.world.player }));
  await page.screenshot({ path: "test-results/screens/mobile-game.png" });

  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(10);
  expect(await worldTime(page)).toBeGreaterThan(1);
  const fps = await measureFps(page, 2000);
  expect(fps.avg).toBeGreaterThan(await fpsFloor(page, 45));
  expect(realErrors(errors)).toEqual([]);
});
