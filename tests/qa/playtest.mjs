/**
 * SKY REAPER QA playtest driver (Node + Playwright, no test runner).
 *
 * Usage (server must already run on QA_URL, default http://localhost:5282):
 *   node tests/qa/playtest.mjs play      [--chapters=pacific,jungle] [--layouts=wide,portrait] [--seeds=1] [--turbo=6] [--par=3]
 *   node tests/qa/playtest.mjs boss      (godMode, starts just before the boss; time-to-kill per phase)
 *   node tests/qa/playtest.mjs fps       (real time, GPU Edge; 35 s of early waves + 35 s of boss per chapter/layout)
 *   node tests/qa/playtest.mjs tutorial  (chapter 1 real time, screenshots at every tutorial hint + vulnerability markers)
 * Output: test-results/qa/<mode>.json (+ screenshots under test-results/qa/).
 * The bot lives in tests/qa/bot.js and only reads/drives the game through window.__sky.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
// QA_OUT lets long batches write somewhere `playwright test` will not wipe (it empties test-results/ on start);
// copy the folder to test-results/qa afterwards. Screenshot paths in the JSON always say test-results/qa/<file>.
const OUT = process.env.QA_OUT ? path.resolve(process.env.QA_OUT) : path.join(ROOT, "test-results", "qa");
fs.mkdirSync(OUT, { recursive: true });
const BOT = fs.readFileSync(path.join(HERE, "bot.js"), "utf8");
const URL_BASE = process.env.QA_URL || "http://localhost:5282";

const args = Object.fromEntries(
  process.argv.slice(3).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "1"];
  }),
);
const MODE = process.argv[2] || "play";
const CHAPTERS = (args.chapters || "pacific,jungle,desert,arctic,citadel").split(",");
const LAYOUTS = (args.layouts || "wide,portrait").split(",");
const SEEDS = (args.seeds || "1").split(",").map(Number);
const TURBO = Number(args.turbo || 6);
const PAR = Number(args.par || 3);
/** movement re-plan interval in sim steps: 1 = "expert" (frame-perfect), 12 = "human" (~200 ms reaction) */
const REPLAN = Number(args.replan || 1);
/** --novice: short perception (150u) + 0.25 s look-ahead, no panic flares (combine with --replan=18) */
const NOVICE = !!args.novice;
const BOSS_T = { pacific: 197, jungle: 200, desert: 193, arctic: 197, citadel: 198 };
const VIEWPORT = { wide: { width: 1920, height: 1080 }, portrait: { width: 540, height: 960 } };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const gpu = process.env.QA_GPU !== "0";
  return chromium.launch(gpu ? { channel: "msedge", args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] } : {});
}

async function openGame(browser, layout) {
  const ctx = await browser.newContext({ viewport: VIEWPORT[layout] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/\/api\/|Failed to load resource|favicon/i.test(m.text())) errors.push(m.text().slice(0, 300));
  });
  await page.goto(`${URL_BASE}/?layout=${layout}`);
  await page.waitForFunction(() => !!window.__sky, null, { timeout: 30000 });
  await page.addScriptTag({ content: BOT });
  const gl = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : "none";
  });
  return { ctx, page, errors, gl };
}

async function startChapter(page, chapterId, params, botOpts) {
  await page.evaluate(([id, p]) => window.__sky.goto("game", { chapterId: id, ...p }), [chapterId, params]);
  await page.waitForFunction(() => !!window.__sky?.game?.world, null, { timeout: 20000 });
  await page.evaluate((o) => window.__qaInstall(o), botOpts);
}

const snapStats = (page) =>
  page.evaluate(() => {
    const g = window.__sky.game;
    if (!g) return null;
    const w = g.world;
    const s = w.stats;
    return {
      time: +w.time.toFixed(1),
      state: w.state,
      score: s.score,
      kills: s.kills,
      airKills: s.airKills,
      groundKills: s.groundKills,
      spawned: s.spawned,
      coins: s.coins,
      deaths: s.deaths,
      damageTaken: Math.round(s.damageTaken),
      bombsUsed: s.bombsUsed,
      flaresUsed: s.flaresUsed,
      tagKills: { ...s.tagKills },
      lives: w.player.lives,
      power: w.player.power,
      boss: w.boss ? w.boss.hud() : null,
    };
  });

async function runPlay(browser, chapter, layout, seed, opts) {
  const { ctx, page, errors, gl } = await openGame(browser, layout);
  const t0 = Date.now();
  const params = { seed, ...(opts.params || {}) };
  await startChapter(page, chapter, params, opts.bot);
  let stats = null;
  let log = null;
  const deadline = Date.now() + (opts.wallMs || 15 * 60_000);
  while (Date.now() < deadline) {
    await sleep(1500);
    const s = await snapStats(page).catch(() => null);
    if (s) stats = s;
    log = await page.evaluate(() => window.__qaLog).catch(() => log);
    if (log && log.outcome && log.outcome !== "timeout") break;
    if (log && log.outcome === "timeout") break;
    if (opts.stopAfterSim && s && s.time >= opts.stopAfterSim) break;
  }
  // let the results scene finish bookkeeping
  let credits = null,
    finalScore = null;
  if (log && (log.outcome === "victory" || log.outcome === "failed")) {
    await page.waitForFunction(() => window.__sky.scene === "results", null, { timeout: 20000 }).catch(() => {});
    await sleep(500);
    const sv = await page.evaluate(() => {
      const d = window.__sky.services.save.data;
      return { credits: d.credits, hs: d.highScores };
    });
    credits = sv.credits;
    finalScore = sv.hs && sv.hs.length ? Math.max(...sv.hs.map((h) => h.score)) : stats?.score ?? 0;
    if (opts.shotResults) await page.screenshot({ path: path.join(OUT, `${opts.tag}-${chapter}-${layout}-results.png`) });
  }
  const fpsSecs = (log?.fps?.secs || []).slice(3);
  const res = {
    chapter,
    layout,
    seed,
    gl,
    wallSec: Math.round((Date.now() - t0) / 1000),
    outcome: log?.outcome ?? "incomplete",
    simEnd: log?.endT ?? stats?.time,
    stats,
    credits,
    finalScore,
    log: log && { ...log, fps: undefined },
    fps: fpsSecs.length ? { min: Math.min(...fpsSecs), avg: +(fpsSecs.reduce((a, b) => a + b, 0) / fpsSecs.length).toFixed(1), worstFrameMs: log.fps.worstMs } : null,
    errors: errors.slice(0, 20),
  };
  await ctx.close();
  return res;
}

async function pool(jobs, n) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < jobs.length) {
      const j = jobs[i++];
      try {
        const r = await j();
        out.push(r);
        console.log(`[qa] ${r.chapter}/${r.layout}/s${r.seed}: ${r.outcome} t=${r.simEnd?.toFixed?.(1)} deaths=${r.stats?.deaths} score=${r.finalScore ?? r.stats?.score} credits=${r.credits} maxB=${r.log?.maxBullets} zeroEsc=${r.log?.escape?.zero} wall=${r.wallSec}s`);
      } catch (e) {
        console.log("[qa] job failed", String(e).slice(0, 400));
        out.push({ error: String(e).slice(0, 400) });
      }
    }
  }
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

async function main() {
  const browser = await launch();
  let results = [];
  try {
    if (MODE === "play") {
      const jobs = [];
      for (const seed of SEEDS) for (const ch of CHAPTERS) for (const lay of LAYOUTS) jobs.push(() => runPlay(browser, ch, lay, seed, { tag: `play${args.nododge ? "-nododge" : NOVICE ? "-novice" : REPLAN > 1 ? "-human" : ""}-s${seed}`, bot: { turbo: TURBO, maxSimSec: 420, replan: REPLAN, novice: NOVICE, noDodge: !!args.nododge }, shotResults: seed === SEEDS[0] }));
      results = await pool(jobs, PAR);
    } else if (MODE === "boss") {
      const jobs = [];
      for (const ch of CHAPTERS)
        for (const lay of LAYOUTS)
          jobs.push(() =>
            runPlay(browser, ch, lay, SEEDS[0], { tag: "boss", params: { godMode: true, startAt: BOSS_T[ch] - 2 }, bot: { turbo: TURBO, god: true, maxSimSec: BOSS_T[ch] + 300 } }),
          );
      results = await pool(jobs, PAR);
    } else if (MODE === "fps") {
      for (const ch of CHAPTERS)
        for (const lay of LAYOUTS) {
          const early = await runPlay(browser, ch, lay, 1, { tag: "fps", params: { godMode: true, startAt: 60 }, bot: { turbo: 1, god: true }, stopAfterSim: 60 + 35, wallMs: 60_000 });
          const boss = await runPlay(browser, ch, lay, 1, { tag: "fps", params: { godMode: true, startAt: BOSS_T[ch] - 2 }, bot: { turbo: 1, god: true }, stopAfterSim: BOSS_T[ch] + 35, wallMs: 60_000 });
          const r = { chapter: ch, layout: lay, gl: early.gl, early: early.fps, earlyMaxBullets: early.log?.maxBullets, boss: boss.fps, bossMaxBullets: boss.log?.maxBullets, errors: [...early.errors, ...boss.errors] };
          console.log("[qa fps]", JSON.stringify(r));
          results.push(r);
        }
    } else if (MODE === "tutorial") {
      for (const lay of LAYOUTS) results.push(await runTutorial(browser, lay));
    }
  } finally {
    await browser.close();
  }
  const file = path.join(OUT, `${MODE}${args.suffix ? "-" + args.suffix : ""}.json`);
  fs.writeFileSync(file, JSON.stringify(results, null, 1));
  console.log("[qa] wrote", file);
}

async function runTutorial(browser, layout) {
  const { ctx, page, errors } = await openGame(browser, layout);
  await startChapter(page, "pacific", { seed: 1 }, { turbo: 1 });
  const shots = [];
  const fixed = [12, 27.5, 31, 36, 40, 66.5, 83];
  let lastHint = undefined;
  let firstImmune = false;
  const start = Date.now();
  while (Date.now() - start < 110_000) {
    await sleep(200);
    const st = await page
      .evaluate(() => {
        const g = window.__sky.game;
        if (!g) return null;
        return { t: g.world.time, hint: g.world.runner.hint, imm: window.__qaLog.immunePings, alive: g.world.player.alive };
      })
      .catch(() => null);
    if (!st) break;
    if (st.t > 92) break;
    const snap = async (label) => {
      const f = `tutorial-${layout}-${label}-t${st.t.toFixed(0)}.png`;
      await page.screenshot({ path: path.join(OUT, f) });
      shots.push({ t: +st.t.toFixed(1), label, file: `test-results/qa/${f}`, hint: st.hint });
    };
    if (st.hint !== lastHint) {
      lastHint = st.hint;
      if (st.hint) await snap("hint");
    }
    if (fixed.length && st.t >= fixed[0]) {
      fixed.shift();
      await snap("fixed");
    }
    if (!firstImmune && st.imm > 0) {
      firstImmune = true;
      await snap("immune");
    }
  }
  const log = await page.evaluate(() => window.__qaLog).catch(() => null);
  await ctx.close();
  return { layout, shots, hints: log?.hints, banners: log?.banners, immunePings: log?.immunePings, immuneByTarget: log?.immuneByTarget, hits: log?.hits, deaths: log?.deaths, errors };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
