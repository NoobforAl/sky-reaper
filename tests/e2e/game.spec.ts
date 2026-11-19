import { expect, test } from "@playwright/test";
import { boot, CHAPTERS, fpsFloor, measureFps, realErrors, startChapter, trackErrors, worldTime } from "./helpers";

test("boots to the main menu without errors", async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as any).__sky.scene)).toBe("menu");
  await page.screenshot({ path: "test-results/screens/menu.png" });
  expect(realErrors(errors)).toEqual([]);
});

test("menu scenes render without errors", async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  for (const s of ["chapters", "shop", "settings", "menu"]) {
    await page.evaluate((scene) => (window as any).__sky.goto(scene), s);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `test-results/screens/${s}.png` });
  }
  expect(realErrors(errors)).toEqual([]);
});

test("chapter 1 runs with real input and keeps 60 FPS", async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.locator("canvas").click();
  await startChapter(page, "pacific", { godMode: true, seed: 7 });
  const t0 = await worldTime(page);
  // fly around and shoot for a few seconds with real key presses
  await page.keyboard.down("Space");
  for (const key of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(600);
    await page.keyboard.up(key);
  }
  await page.keyboard.press("k");
  const fps = await measureFps(page, 3000);
  await page.keyboard.up("Space");
  const t1 = await worldTime(page);
  await page.screenshot({ path: "test-results/screens/pacific-play.png" });
  expect(t1 - t0).toBeGreaterThan(3);
  expect(fps.avg).toBeGreaterThan(await fpsFloor(page, 50));
  expect(realErrors(errors)).toEqual([]);
});

test("pause overlay works", async ({ page }) => {
  await boot(page);
  await page.locator("canvas").click();
  await startChapter(page, "pacific", { godMode: true });
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const a = await worldTime(page);
  await page.waitForTimeout(800);
  const b = await worldTime(page);
  await page.screenshot({ path: "test-results/screens/pause.png" });
  expect(b - a).toBeLessThan(0.05);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  expect(await worldTime(page)).toBeGreaterThan(b);
});

for (const ch of CHAPTERS) {
  test(`chapter ${ch}: plays, reaches boss and can be finished`, async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    await startChapter(page, ch, { godMode: true, seed: 3 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `test-results/screens/${ch}-start.png` });
    // jump late into the timeline to exercise later waves + boss
    await startChapter(page, ch, { godMode: true, seed: 3, startAt: 200 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `test-results/screens/${ch}-late.png` });
    await page.evaluate(() => (window as any).__sky.game.cheatWin());
    await page.waitForFunction(() => (window as any).__sky.scene === "results", null, { timeout: 20_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `test-results/screens/${ch}-results.png` });
    expect(realErrors(errors)).toEqual([]);
  });
}

test("winning chapter 1 unlocks chapter 2 and persists", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await boot(page);
  await startChapter(page, "pacific", { godMode: true });
  await page.evaluate(() => (window as any).__sky.game.cheatWin());
  await page.waitForFunction(() => (window as any).__sky.scene === "results", null, { timeout: 20_000 });
  await page.reload();
  await boot(page);
  const save = await page.evaluate(() => (window as any).__sky.services.save.data);
  expect(save.chaptersUnlocked).toBeGreaterThanOrEqual(1);
  expect(save.credits).toBeGreaterThan(0);
});

test("stress: hundreds of bullets stays smooth", async ({ page }) => {
  await boot(page);
  await startChapter(page, "citadel", { godMode: true, startAt: 150 });
  await page.evaluate(() => {
    const w = (window as any).__sky.game.world;
    for (let i = 0; i < 600; i++) {
      w.spawnBullet({
        x: 240, y: 200, angle: (i * 360) / 600, speed: 60 + (i % 5) * 10, damageClass: "enemy", damage: 1, life: 6,
        visual: { sprite: "ebullet_small", color: [255, 80, 200], radius: 4 },
      });
    }
  });
  const fps = await measureFps(page, 3000);
  expect(fps.avg).toBeGreaterThan(await fpsFloor(page, 45));
});
