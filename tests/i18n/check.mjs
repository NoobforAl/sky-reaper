#!/usr/bin/env node
/**
 * Farsi locale lint (docs/FA_STYLE_GUIDE.md). Plain node, no deps beyond the project's own esbuild (used only to
 * strip TypeScript; falls back to node's built-in type stripping).
 *
 *   node tests/i18n/check.mjs            # exit 0 = pass, 1 = errors (listed)
 *   node tests/i18n/check.mjs --verbose  # also print the length table
 *
 * Fails on: missing/extra keys, placeholder mismatch, fa length > 1.35 x en + 4, banned formal/literary/religious/
 * violent words, vulgar words from tests/i18n/blocklist.json (base64), Latin letters in fa outside the allowed tokens,
 * ZWNJ misuse (at word start/end, doubled, "می " without ZWNJ), Arabic ي / ك instead of Persian ی / ک,
 * Arabic script in en values (except the language-name keys), and any "+n" / "-n" in the fa output of t() that is not
 * led by an LRM (QA R5-5: the sign would render on the wrong side of the number in RTL text).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
// I18N_LOCALES_DIR: lint another copy of the tables (used to test this script itself)
const LOCALES = process.env.I18N_LOCALES_DIR ? path.resolve(process.env.I18N_LOCALES_DIR) : path.join(ROOT, "src/i18n/locales");
const VERBOSE = process.argv.includes("--verbose");

// ------------------------------------------------------------------ load the TS tables
async function loadTable(file, exportName) {
  const src = fs.readFileSync(path.join(LOCALES, file), "utf8");
  let js = null;
  try {
    const require = createRequire(path.join(ROOT, "package.json"));
    const esbuild = require("esbuild");
    js = esbuild.transformSync(src, { loader: "ts", format: "esm", target: "es2022" }).code;
  } catch {
    js = null;
  }
  if (js !== null) {
    // the tables only have type imports (erased), so the module is self-contained
    const mod = await import("data:text/javascript;base64," + Buffer.from(js, "utf8").toString("base64"));
    return mod[exportName];
  }
  const mod = await import(pathToFileURL(path.join(LOCALES, file)).href); // node >= 23 strips types natively
  return mod[exportName];
}

const en = await loadTable("en.ts", "en");
const fa = await loadTable("fa.ts", "fa");
if (!en || !fa) {
  console.error("[i18n check] could not load the locale tables");
  process.exit(2);
}

// ------------------------------------------------------------------ rules
const LENGTH_RATIO = 1.35;
const LENGTH_SLACK = 4;
/**
 * keys whose English value is empty or a fixed name (length rule does not apply); menu.flightTimeHM: English uses
 * one-letter unit abbreviations ("{h}H {m}M") that have no natural Farsi short form, so «ساعت»/«دقیقه» are spelled out
 */
const LENGTH_EXEMPT = new Set(["menu.subtitle", "settings.langFa", "settings.language.fa", "menu.flightTimeHM"]);
/** en keys allowed to contain Arabic script */
const EN_ARABIC_OK = new Set(["settings.langFa", "settings.language.fa"]);

/** Latin tokens allowed inside fa values: key/button names, units, logo, tech names */
const LATIN_OK = new Set([
  "SKY", "REAPER", "WASD", "ESC", "FPS", "SPACE", "SHIFT", "ENTER", "START", "SELECT", "STICK", "D-PAD",
  "A", "B", "E", "J", "K", "P", "Q", "R", "S", "X", "Y", "LB", "RB", "LT", "RT",
  "x", "MIT", "KAPLAY", "TypeScript", "Vite", "ASSET_CREDITS.md", "ENGLISH",
]);

// Banned words (guide rules 2-5). mode "word" = whole word, "start" = word begins with it.
const BANNED = [
  // literary / bureaucratic (rule 3)
  ["می‌بایست", "start"], ["میبایست", "start"], ["بایستی", "word"], ["مبادرت", "start"], ["خواهشمند", "start"],
  ["اینجانب", "start"], ["گردید", "start"], ["گردیده", "start"], ["می‌گردد", "word"], ["نمودن", "word"],
  ["نموده", "start"], ["نمود", "word"], ["نمایید", "word"], ["می‌نماید", "word"], ["می‌نمایند", "word"],
  ["بنمایید", "word"], ["جهت", "word"], ["فلذا", "word"], ["مزبور", "word"], ["لطفاً", "word"], ["لطفا", "word"],
  ["معهذا", "word"], ["علیهذا", "word"], ["مذکور", "word"], ["کماکان", "word"],
  // colloquial spellings (rule 2)
  ["میشه", "word"], ["نمیشه", "word"], ["بزنی‌ش", "word"],
  // religious / political (rule 4)
  ["شهید", "start"], ["شهادت", "start"], ["جهاد", "start"], ["مجاهد", "start"], ["کافر", "start"], ["سپاه", "start"],
  ["بسیج", "start"], ["امام", "word"], ["شیطان", "start"], ["جهنم", "start"], ["دوزخ", "start"], ["بهشت", "start"],
  ["لشکرکشی", "word"], ["جبار", "word"],
  // enemies are destroyed, not murdered (rule 5)
  ["قتل", "start"], ["کشتن", "word"], ["بکشید", "word"], ["کشته", "start"], ["کشتار", "start"], ["بکشش", "word"],
];
const BANNED_PHRASES = ["توجه داشته باشید", "لطفاً توجه"];

// ------------------------------------------------------------------ helpers
const AR = "؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿";
const WORD_RE = new RegExp(`[${AR}‌]+`, "g");
const ZWNJ = "‌";
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const uniq = (a) => [...new Set(a)];
const words = (s) => s.match(WORD_RE) ?? [];
/** the whole word plus each ZWNJ-separated part, so compounds are checked part by part */
const wordForms = (w) => uniq([w, ...w.split(ZWNJ).filter(Boolean)]);
const norm = (s) => s.replace(/ي/g, "ی").replace(/ك/g, "ک");

/** "word": the whole token (ZWNJ compounds stay one token, so «جهت‌نما» is not «جهت»); "start": the token or any ZWNJ part begins with it */
function matches(word, entry, mode) {
  const w = norm(word);
  if (mode === "word") return w === entry;
  for (const f of wordForms(w)) if (f.startsWith(entry)) return true;
  return false;
}

const blocklist = JSON.parse(fs.readFileSync(path.join(HERE, "blocklist.json"), "utf8")).entries.map((e) => ({
  w: Buffer.from(e.b64, "base64").toString("utf8"),
  mode: e.mode === "word" ? "word" : "start",
}));

// ------------------------------------------------------------------ run
const errors = [];
const err = (key, msg) => errors.push(`${key}: ${msg}`);
const enKeys = Object.keys(en);
const faKeys = Object.keys(fa);

for (const k of enKeys) if (!(k in fa)) err(k, "missing in fa");
for (const k of faKeys) if (!(k in en)) err(k, "extra key in fa (not in en)");

let maxRatio = 0;
let maxKey = "";
let sumRatio = 0;
let nRatio = 0;
const rows = [];

for (const k of enKeys) {
  const e = en[k];
  if (typeof e !== "string") {
    err(k, "en value is not a string");
    continue;
  }
  if (!EN_ARABIC_OK.has(k) && new RegExp(`[${AR}]`).test(e)) err(k, "en value contains Arabic script");
  const f = fa[k];
  if (typeof f !== "string") continue;

  // placeholders (plural forms may differ in count, the set must match)
  const pe = uniq(placeholders(e)).join(",");
  const pf = uniq(placeholders(f)).join(",");
  if (pe !== pf) err(k, `placeholders differ: en {${pe}} fa {${pf}}`);

  // length
  if (!LENGTH_EXEMPT.has(k)) {
    const limit = LENGTH_RATIO * e.length + LENGTH_SLACK;
    if (f.length > limit) err(k, `too long: fa ${f.length} chars > ${limit.toFixed(1)} (en ${e.length})`);
    if (e.length > 0) {
      const r = f.length / e.length;
      sumRatio += r;
      nRatio++;
      if (r > maxRatio) {
        maxRatio = r;
        maxKey = k;
      }
      rows.push([k, e.length, f.length, r]);
    }
  }

  // Arabic letter forms
  if (/[يك]/.test(f)) err(k, "Arabic ي/ك used: write Persian ی/ک");

  // banned words / phrases
  const ws = words(f);
  for (const [b, mode] of BANNED) {
    const hit = ws.find((w) => matches(w, b, mode));
    if (hit) err(k, `banned word «${b}» (in «${hit}»), see docs/FA_STYLE_GUIDE.md`);
  }
  for (const p of BANNED_PHRASES) if (norm(f).includes(p)) err(k, `banned phrase «${p}»`);

  // vulgar blocklist (reports the offending fa word, never dumps the decoded list)
  for (const { w, mode } of blocklist) {
    const hit = ws.find((x) => matches(x, w, mode));
    if (hit) err(k, `blocklisted substring (${mode}) in word «${hit}»: rephrase or keep Latin`);
  }

  // Latin letters
  const latin = f.replace(/\{\w+\}/g, " ").match(/[A-Za-z][A-Za-z0-9_.\-]*[A-Za-z0-9]|[A-Za-z]/g) ?? [];
  const bad = latin.filter((tk) => !LATIN_OK.has(tk));
  if (bad.length) err(k, `Latin text not allowed in fa: ${uniq(bad).join(", ")}`);

  // ZWNJ
  for (let i = 0; i < f.length; i++) {
    if (f[i] !== ZWNJ) continue;
    const prev = f[i - 1] ?? "";
    const next = f[i + 1] ?? "";
    const isL = (c) => new RegExp(`[${AR}]`).test(c) && c !== ZWNJ;
    if (next === ZWNJ) err(k, `double ZWNJ at ${i}`);
    else if (!isL(prev) || !isL(next)) err(k, `ZWNJ at word start/end (index ${i})`);
  }
  if (new RegExp(`(^|[\\s(«])(ن?می) (?=[${AR}])`).test(f)) err(k, "«می» followed by a space: use ZWNJ (می‌کند)");
}

// ------------------------------------------------------------------ bidi of signed numbers (QA R5-5)
// Every "+n" / "-n" that t() produces in Farsi must start with U+200E (LRM), otherwise the RTL paragraph shows the
// sign on the far side of the number ("15+"). Runs t() itself (bundled from src/i18n/index.ts) with every number
// placeholder filled, with Persian digits on and off. Skipped when I18N_LOCALES_DIR points at another table copy.
let signedChecked = 0;
if (!process.env.I18N_LOCALES_DIR) {
  let i18n = null;
  try {
    const require = createRequire(path.join(ROOT, "package.json"));
    const esbuild = require("esbuild");
    const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, "src/i18n/index.ts")], bundle: true, write: false, format: "esm", platform: "neutral", target: "es2022", logLevel: "silent" });
    i18n = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text, "utf8").toString("base64"));
  } catch (e) {
    err("(bidi)", "could not bundle src/i18n/index.ts for the signed-number check: " + (e?.message ?? e));
  }
  if (i18n) {
    const LRM = "\u200E";
    const SIGN = /([+\-])(?=[0-9\u06F0-\u06F9])/g;
    for (const pd of [true, false]) {
      i18n.setPersianDigits(pd);
      for (const k of faKeys) {
        if (typeof fa[k] !== "string" || !/[+\-]/.test(fa[k])) continue;
        const params = {};
        for (const p of placeholders(fa[k])) params[p] = 15;
        const s = i18n.t(k, params, "fa");
        for (const m of s.matchAll(SIGN)) {
          const prev = s[m.index - 1] ?? "";
          if (/[0-9\u06F0-\u06F9]/.test(prev)) continue; // a range like 1-3 stays one number run
          signedChecked++;
          if (prev !== LRM) err(k, `signed number without LRM in fa output «${s}» (renders as «15+»), see bidiSigned() in src/i18n/index.ts`);
        }
      }
    }
    i18n.setPersianDigits(true);
    // the helper itself
    const cases = [["+15 سکه", LRM + "+15 سکه"], ["-۰٫۸ ثانیه", LRM + "-۰٫۸ ثانیه"], ["۱-۳", "۱-۳"], [LRM + "+5", LRM + "+5"], ["x1.5", "x1.5"]];
    for (const [a, b] of cases) if (i18n.bidiSigned(a) !== b) err("(bidi)", `bidiSigned(${JSON.stringify(a)}) = ${JSON.stringify(i18n.bidiSigned(a))}, expected ${JSON.stringify(b)}`);
  }
}

// ------------------------------------------------------------------ report
if (VERBOSE) {
  rows.sort((a, b) => b[3] - a[3]);
  for (const [k, le, lf, r] of rows.slice(0, 40)) console.log(`${r.toFixed(2)}  en ${String(le).padStart(3)}  fa ${String(lf).padStart(3)}  ${k}`);
}
const avg = nRatio ? sumRatio / nRatio : 0;
console.log(
  `[i18n check] ${enKeys.length} en keys, ${faKeys.length} fa keys, blocklist ${blocklist.length} entries, ` +
    `fa/en length ratio avg ${avg.toFixed(2)} max ${maxRatio.toFixed(2)} (${maxKey}), ${signedChecked} signed numbers bidi-checked`,
);
if (errors.length) {
  console.error(`[i18n check] FAIL: ${errors.length} problem(s)`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("[i18n check] PASS");
