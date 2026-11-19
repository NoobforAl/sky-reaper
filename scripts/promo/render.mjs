#!/usr/bin/env node
/**
 * Render the SKY REAPER title / key art from real game sprites.
 *   node scripts/promo/render.mjs
 * Outputs: promo/ (store / website images), docs/images/title.png (README), public/og-image.png (link previews).
 */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = resolve(".");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const p = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!p.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(p);
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await chromium.launch();
try {
  for (const [w, h, out] of [
    [1920, 1080, "promo/sky-reaper-title-1920x1080.png"],
    [1920, 1080, "docs/images/title.png"],
    [1200, 630, "promo/sky-reaper-title-1200x630.png"],
    [1200, 630, "public/og-image.png"],
    [1200, 1800, "promo/sky-reaper-poster-1200x1800.png"],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/scripts/promo/title.html?w=${w}&h=${h}`);
    await page.waitForFunction(() => document.title === "ready" || false, null, { timeout: 20000 }).catch(() => {});
    if (errs.length) throw new Error(errs.join("\n"));
    await mkdir(resolve(out, ".."), { recursive: true });
    await page.locator("#c").screenshot({ path: out });
    console.log("[promo] wrote", out);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
