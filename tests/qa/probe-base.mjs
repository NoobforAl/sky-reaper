/**
 * Probe: can bases / hangars actually be destroyed with the default bomb? (objective "Destroy 3 bases or hangars"
 * never completed in 60 bot runs). Spawns each structure in front of a god-mode player, holds bomb + fire, logs hits.
 *   node tests/qa/probe-base.mjs     (server on QA_URL, default http://localhost:5282)
 */
import { chromium } from "@playwright/test";
const URL_BASE = process.env.QA_URL || "http://localhost:5282";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
await page.goto(`${URL_BASE}/?layout=portrait`);
await page.waitForFunction(() => !!window.__sky);
const out = [];
for (const id of ["hangar", "military_base", "radar_station", "gunboat", "destroyer"]) {
  await page.evaluate(() => window.__sky.goto("game", { chapterId: "desert", godMode: true, seed: 5 }));
  await page.waitForFunction(() => !!window.__sky?.game?.world);
  const r = await page.evaluate(async (defId) => {
    const w = window.__sky.game.world;
    const input = window.__sky.services.input;
    w.setScrollSpeed(0);
    const log = { hits: 0, dmg: 0, byClass: {}, killed: false, immune: 0, hpStart: 0, hpEnd: 0, bombsUsed0: w.stats.bombsUsed };
    let n = 0;
    input.poll = () => {
      n++;
      const p = w.player;
      p.bombs = Math.max(p.bombs, 3);
      return { moveX: 0, moveY: 0, fire: true, bomb: true, special: false, bombPressed: n % 30 === 0, specialPressed: false, weaponPrev: false, weaponNext: false, groundNext: false, pausePressed: false, dragTarget: { x: e.x, y: Math.min(800, e.y + 220) } };
    };
    const e = w.spawnEnemy(defId, w.player.x, 320);
    if (!e) return { error: "spawn failed" };
    log.hpStart = e.hp;
    const id = e.id;
    w.events.on("enemyHit", (p) => {
      if (p.enemy.id !== id) return;
      log.hits++;
      log.dmg += p.damage;
      log.byClass[p.byClass] = (log.byClass[p.byClass] || 0) + 1;
    });
    w.events.on("enemyImmune", (p) => {
      if (p.enemy.id === id) log.immune++;
    });
    w.events.on("enemyKilled", (p) => {
      if (p.enemy.id === id) log.killed = true;
    });
    await new Promise((r) => setTimeout(r, 9000));
    log.hpEnd = e.alive ? e.hp : 0;
    log.y = Math.round(e.y);
    log.bombsUsed = w.stats.bombsUsed - log.bombsUsed0;
    log.tagKills = { ...w.stats.tagKills };
    return log;
  }, id);
  out.push({ id, ...r });
  console.log(id, JSON.stringify(r));
}
await browser.close();
