import { expect, type Page } from "@playwright/test";

/** Collect console errors + page errors for the whole test. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

/** Ignore noise that is not a game bug (e.g. optional leaderboard API missing in vite dev). */
export function realErrors(errors: string[]): string[] {
  return errors.filter((e) => !/\/api\/|Failed to load resource|favicon/i.test(e));
}

export async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForFunction(() => !!(window as any).__sky, null, { timeout: 30_000 });
  const bootErr = await page.evaluate(() => (window as any).__skyBootError ?? null);
  expect(bootErr).toBeNull();
}

export async function startChapter(page: Page, chapterId: string, opts: Record<string, unknown> = {}): Promise<void> {
  await page.evaluate(([id, o]) => (window as any).__sky.goto("game", { chapterId: id, ...(o as object) }), [chapterId, opts] as const);
  await page.waitForFunction(() => !!(window as any).__sky?.game?.world, null, { timeout: 20_000 });
}

export async function worldTime(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).__sky.game.world.time as number);
}

/** Average FPS over `ms`, measured with requestAnimationFrame in the page. */
export async function measureFps(page: Page, ms = 3000): Promise<{ avg: number; worstFrameMs: number }> {
  return page.evaluate(
    (dur) =>
      new Promise<{ avg: number; worstFrameMs: number }>((resolve) => {
        let frames = 0;
        let worst = 0;
        const t0 = performance.now();
        let last = t0;
        const step = (t: number) => {
          frames++;
          worst = Math.max(worst, t - last);
          last = t;
          if (t - t0 < dur) requestAnimationFrame(step);
          else resolve({ avg: (frames * 1000) / (t - t0), worstFrameMs: worst });
        };
        requestAnimationFrame(step);
      }),
    ms,
  );
}

/** true when WebGL runs on a software rasterizer (SwiftShader / llvmpipe): FPS then reflects the CPU, not the game. */
export async function isSoftwareGl(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|software|basic render/i.test(r);
  });
}

/** FPS the test requires: `gpuFloor` with a real GPU, a lower floor on software GL (still catches pathological slowdowns). */
export async function fpsFloor(page: Page, gpuFloor: number): Promise<number> {
  return (await isSoftwareGl(page)) ? Math.min(gpuFloor, 24) : gpuFloor;
}

export const CHAPTERS = ["pacific", "jungle", "desert", "arctic", "citadel"] as const;
