/**
 * Progression economy check: credits earned per chapter (from playtest JSON) vs shop prices.
 * Prices are parsed from src/weapons/index.ts (UPGRADES / AIRCRAFT / SKINS / PLAYER_WEAPONS) and shopCost() is
 * re-implemented here as documented: round(baseCost * (lvl+1)^1.25) (BALANCE_SPEC U2/U3; keep in sync with SHOP_COST_EXP in src/weapons).
 *   node tests/qa/economy.mjs [test-results/qa/play-human.json ...]
 * Writes test-results/qa/economy.json and prints a summary.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = fs.readFileSync(path.join(ROOT, "src/weapons/index.ts"), "utf8");

function rows(name) {
  const m = src.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];`));
  if (!m) throw new Error("cannot parse " + name);
  return m[1]
    .split("\n")
    .filter((l) => l.includes("id:"))
    .map((l) => {
      const o = {};
      for (const [, k, v] of l.matchAll(/(\w+):\s*("[^"]*"|[\d.]+)/g)) o[k] = v.startsWith('"') ? v.slice(1, -1) : Number(v);
      return o;
    });
}
const UPGRADES = rows("UPGRADES");
const AIRCRAFT = rows("AIRCRAFT");
const SKINS = rows("SKINS");
const WEAPONS = rows("PLAYER_WEAPONS");
const shopCost = (u, lvl) => (lvl >= u.maxLevel ? Infinity : Math.round(u.baseCost * Math.pow(lvl + 1, 1.25)));

const files = process.argv.slice(2).length ? process.argv.slice(2) : ["test-results/qa/play-human.json", "test-results/qa/play-expert.json"];
const perChapter = {};
for (const f of files) {
  const p = path.resolve(ROOT, f);
  if (!fs.existsSync(p)) continue;
  const prof = /human/.test(f) ? "human" : "expert";
  for (const r of JSON.parse(fs.readFileSync(p, "utf8"))) {
    if (!r.chapter || r.credits == null) continue;
    const key = `${r.chapter}`;
    (perChapter[key] ??= { win: [], loss: [] })[r.outcome === "victory" ? "win" : "loss"].push({ credits: r.credits, prof, layout: r.layout });
  }
}
const order = ["pacific", "jungle", "desert", "arctic", "citadel"];
const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
const earn = order.map((c) => ({ chapter: c, winAvg: avg((perChapter[c]?.win ?? []).map((x) => x.credits)), lossAvg: avg((perChapter[c]?.loss ?? []).map((x) => x.credits)), n: (perChapter[c]?.win.length ?? 0) + (perChapter[c]?.loss.length ?? 0) }));
const campaignFirstClear = earn.reduce((a, e) => a + (e.winAvg ?? 0), 0);

const upgradeTotals = UPGRADES.map((u) => {
  const steps = Array.from({ length: u.maxLevel }, (_, l) => shopCost(u, l));
  return { id: u.id, baseCost: u.baseCost, lvl1: steps[0], lvl4Total: steps.slice(0, 4).reduce((a, b) => a + b, 0), maxTotal: steps.reduce((a, b) => a + b, 0), steps };
});
const allUpgradesMax = upgradeTotals.reduce((a, u) => a + u.maxTotal, 0);
const weapons = WEAPONS.filter((w) => w.unlockCost > 0).map((w) => ({ id: w.id, cost: w.unlockCost }));
const aircraft = AIRCRAFT.filter((a) => a.unlockCost > 0).map((a) => ({ id: a.id, cost: a.unlockCost }));
const skins = SKINS.filter((s) => s.cost > 0).map((s) => ({ id: s.id, cost: s.cost }));
const totalStore = allUpgradesMax + weapons.reduce((a, w) => a + w.cost, 0) + aircraft.reduce((a, w) => a + w.cost, 0) + skins.reduce((a, w) => a + w.cost, 0);

// "runs to afford": number of first-clear-average runs of a given chapter needed to buy an item
const runsFor = (cost, perRun) => (perRun ? +(cost / perRun).toFixed(1) : null);
const keyItems = [
  ...weapons.map((w) => ({ item: "weapon:" + w.id, cost: w.cost })),
  ...aircraft.map((a) => ({ item: "aircraft:" + a.id, cost: a.cost })),
  { item: "all upgrades to lvl 4", cost: upgradeTotals.reduce((a, u) => a + u.lvl4Total, 0) },
  { item: "all upgrades maxed", cost: allUpgradesMax },
  { item: "everything in the shop", cost: totalStore },
];
const table = keyItems.map((k) => ({ ...k, runsOfCh1: runsFor(k.cost, earn[0].winAvg), runsOfCh5: runsFor(k.cost, earn[4].winAvg), campaignClears: campaignFirstClear ? +(k.cost / campaignFirstClear).toFixed(2) : null }));

const out = { earn, campaignFirstClear, upgradeTotals, allUpgradesMax, weapons, aircraft, skins, totalStore, table };
const OUT = process.env.QA_OUT ? path.resolve(process.env.QA_OUT) : path.join(ROOT, "test-results/qa");
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "economy.json"), JSON.stringify(out, null, 1));
console.log("credits per chapter (avg win / avg loss):");
for (const e of earn) console.log(`  ${e.chapter.padEnd(8)} win ${e.winAvg}  loss ${e.lossAvg}  (n=${e.n})`);
console.log("campaign first clear total:", campaignFirstClear);
console.log("upgrades:", upgradeTotals.map((u) => `${u.id} L1=${u.lvl1} L1-4=${u.lvl4Total} max=${u.maxTotal}`).join(" | "));
console.log("all upgrades maxed:", allUpgradesMax, " whole store:", totalStore);
console.table(table);
