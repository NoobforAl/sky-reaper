# I18N status: Farsi (Persian) support

Owner: i18n agent. Plan: `docs/I18N_FARSI_PLAN.md`. **Phases 1–2 are done as a self-contained module. Nothing in the
game uses it yet**: no screen, contract or loader imports `src/i18n`.

> **RELEASE GATE: a native Farsi speaker must review `src/i18n/locales/fa.ts` before release.** Round 5 rewrote it to
> `docs/FA_STYLE_GUIDE.md` (short, modern, game-like) and it passes `node tests/i18n/check.mjs`, but it is still not
> native-reviewed. Lines marked `// REVIEW: native speaker` are the least certain (2 left).

## 1. What exists

| File | Contents |
|---|---|
| `src/i18n/index.ts` | `t(key, params?, locale?)`, `setLocale`, `getLocale`, `onLocaleChange`, `isRtl`, `detectLocale` (`navigator.language` `fa*` → `"fa"`), `resolveLocale("auto"\|"en"\|"fa")`, `setPersianDigits` / `usesPersianDigits`, `formatNumber(n, {persianDigits, grouping, decimals})` (Intl `fa-IR`: `۱۲٬۳۴۵`, `٫` decimal; manual fallback), `toPersianDigits`, `toAsciiDigits`, `hasArabicScript`, `STRING_KEYS` |
| `src/i18n/locales/en.ts` | 501 keys (`menu.*`, `chapters.*`, `chapter.<id>.name/subtitle/briefing`, `objective.<id>`, `boss.<id>`, `tutorial.<step>.key/touch`, `hud.*`, `banner.*`, `touch.*`, `pause.*`, `results.*`, `settings.*`, `shop.*`, `weapon.<id>.name/desc`, `upgrade.<id>.*`, `aircraft.<id>.*`, `skin.<id>.*`, `medal.0-4`; round 5: `bossBanner.*`, `wave.<chapter>.*`, `banner.operation/chapterIntro/wave`, `chapter.<id>.opName`). Exports `StringKey` and `StringTable` |
| `src/i18n/locales/fa.ts` | Draft translation typed as `StringTable`. A missing or extra key is a type error |
| `src/i18n/text.ts` | `TextService` (`textService` singleton, `createTextService(opts)`): `drawText`, `drawNumber`, `measure`, `overflows`, `onOverflow`, `init(k)`, `ready()`, `clear()`, `stats()`, `usesCanvas()`, `baseRtl()` |
| `src/i18n/font.ts` | `loadPersianFont(baseUrl?)` registers Vazirmatn 400 and 700 with `FontFace`, then calls `document.fonts.load`. Also `persianFontReady()` and `FA_FONT_STACK` |
| `src/i18n/demo.html` + `demo.ts` | Standalone demo at `/src/i18n/demo.html` under `vite` dev. It is not in the game build (`vite build` only bundles `index.html`). `?stress=1` exercises LRU eviction and page recycling |
| `public/fonts/vazirmatn-{bold,regular}-subset.woff2` | 28.6 KB + 28.1 KB subsets (Latin, Arabic block, ZWNJ/ZWJ, bidi marks, punctuation; all OpenType layout features kept). `public/fonts/OFL-Vazirmatn.txt` is the license |
| `assets_original/fonts/vazirmatn/` | Original `Vazirmatn-Bold.ttf`, `Vazirmatn-Regular.ttf`, `OFL.txt`, `AUTHORS.txt`, `SOURCE.txt` |

**Rules for `t()`**
- Placeholders use `{name}`.
- A number param goes through `formatNumber`. It gets Persian digits in `fa` when the option is on, and grouping from 10 000 up.
- A string param is inserted verbatim. Key names and initials stay Latin.
- Literal ASCII digits in a Farsi template are converted when Persian digits are on.
- Plurals use `one|other`, chosen by `params.count` (or `params.n`). Farsi always uses the last form.
- A missing key falls back to English, then to the key itself, and warns once.

**How TextService renders**
- **English and Latin-only text** goes to `k.drawText` with `sr_font` (`sr_font_outline` when `outline` is set), or CSS `monospace` if the bitmap font is not loaded. English output is unchanged.
- **Arabic-script text, or any text while the locale is `fa`** is drawn once with Canvas2D:
  - Settings: `direction` rtl, Vazirmatn, `strokeText` outline plus a 1-unit drop shadow, word wrap at `maxWidth`, alignment `start`/`end`/`left`/`center`/`right`.
  - Storage: the result is uploaded with `Texture.update(canvas, x, y)` into atlas pages. Each page is a `k.loadSprite(null, canvas, {singular:true})` texture of 1024². There are up to 3 pages, filled by a shelf packer, and the least recently used page is recycled.
  - Drawing: `k.drawUVQuad({tex, quad})`, at positions snapped to back-buffer pixels.
  - Cache: LRU of 200 entries, keyed by text, size, weight, colour, outline, width, align, dir, locale and resolution.
- **Paragraph direction**:
  - In `fa`, every string with Arabic script is RTL. For example, «SPACE را نگه دارید» puts SPACE at the right.
  - In `en`, the first strong character decides. «LANGUAGE: فارسی» stays LTR.
  - `opts.dir` overrides both.
- **Numbers**: a numeric-only string in canvas mode, or any `drawNumber` call, uses a **digit atlas**. Glyphs are cached once per style and composed left to right, so a score that changes every frame is never re-rasterised. In the demo it stays at 31 rasterisations total while the score counts up.
- **Size**: Arabic text is clamped to a minimum of 14 units. The default weight is 700; use 400 for body text.
- **Overflow**: when a laid-out width is greater than `maxWidth` (one very long word, or `wrap:false`), it is pushed to `textService.overflows` as `{text, id, width, maxWidth, locale}`. It also logs `console.warn("[i18n] text overflow …")` once and fires the `onOverflow` callbacks.

**Verified**
- `npx tsc --noEmit | grep ^src/i18n` is clean.
- The demo was screenshotted with headless Chromium on port 5281, and the server was stopped afterwards. Letters are joined and lines run right to left. SPACE, J, Q/E and R sit correctly inside the RTL lines. Persian digits come out as `۳۶٬۴۱۰`, `۷۰٪`, `رتبه #۳`. The wrapped briefing is right-aligned. The single overflow (settings.resetKeys in a 90-wide box) was reported. English is unchanged next to it.
- The stress run used 2720 rasterisations through 64 entries on 2×256² pages with 0 errors and no corrupted glyphs.

## 2. Integration steps (phases 3–6)

### Phase 2b / 3: boot and contract (Orchestrator)
1. In `main.ts`, after `loadAssets(k)`:
   ```ts
   setLocale(resolveLocale(save.data.settings.locale));
   setPersianDigits(save.data.settings.persianDigits ?? true);
   if (getLocale() === "fa") await loadPersianFont();
   await textService.init(k);
   svc.text = textService;
   ```
   Changing the setting to `fa` at runtime must `await loadPersianFont()` and then call `textService.clear()`.
2. Contract changes (proposal, `src/contracts/state.ts`). Append these to `docs/CONTRACT_REQUESTS.md` (I did not edit it, because it is outside my paths):
   - `Settings.locale: "auto" | "en" | "fa"` (default `"auto"`) and `Settings.persianDigits: boolean` (default `true`). `DEFAULT_SETTINGS` gets both. The save migration fills them in.
   - `Services.text: TextService`. Import the type from `src/i18n/text`, or put a minimal interface `{ drawText; drawNumber; measure }` in contracts.
   - Optional `i18nKey?: string` on `ChapterDef`, `ObjectiveDef`, `PlayerWeaponDef`, `UpgradeDef`, `AircraftDef`, `SkinDef`. Without it, keys can be derived from ids: `chapter.<id>.name`, `objective.<id>`, `weapon.<id>.name`, `upgrade.<id>.name`, `aircraft.<id>.name`, `skin.<id>.name`. An explicit `i18nKey` lets content rename an id without breaking translations.
   - Optional `i18nKey` on `BossHudInfo` (otherwise `boss.<bossId>`), and on banner events (`{ text, textKey?, subtextKey? }`).

### Phase 2: switch the text call sites
Line numbers are a snapshot taken while the UI agent was still editing, so re-grep before use: `grep -nE "\.text\(|drawText\(|formatText\(" src`.
- **The one central primitive**: `src/ui/widgets.ts` `Gfx.text()` (~L203–248, `formatText` + `drawFormattedText`), plus `Gfx.measure` (~L161) and the height/fit helpers (~L170, L183).
  - Route these through `svc.text.drawText/measure` when `textService.usesCanvas(str)` is true, and keep the existing bitmap code for English.
  - Mapping: `TextOpts.width` → `maxWidth`, `outline` 1/-1/≥2 → `outline: 1/1/2`, `align` → `align`.
  - Wrapping in widgets (`fits` loop, L183) must call `textService.measure(str, {size, maxWidth})`.
- `Gfx.text` callers inside `src/ui`: these only need their **string literals** changed to `t(...)`, because they already go through `Gfx.text`.
  - `src/ui/chapters.ts`: 36, 37, 39, 40, 148, 149, 150, 153, 159, 163, 196, 197, 198, 202, 206, 207, 212, 221, 226, 227, 230, 235, 236, 243, 244, 251, 254, 268, 269, 274–279
  - `src/ui/hud.ts`: 53, 54, 58, 67, 76, 83, 86, 101, 102, 133, 145, 146, 150, 155, 163, 167, 180, 182, 184, 186, 198, 199, 211, 217, 220, 227, 238, 275, 277, 279, 292, 300, 307, 316, 317, 328, 355, 374, 375, 402, 419, 420. Score, credits and timer values should use `drawNumber`.
  - `src/ui/menu.ts`: 39, 40, 41, 45, 189, 192, 194, 209, 210, 211, 213, 214, 222, 232, 233, 236, 238, 243, 244, 246, 247, 252, 254, 273, 275, 277, 281, 282, 284, 285
  - `src/ui/results.ts`: 128, 135, 144, 145, 148, 164, 165, 184, 187, 193, 201, 202, 219, 220, 221, 228, 233, 238, 244, 245, 247, 248, 250, 256, 342
  - `src/ui/settings.ts`: 78, 79, 80, 86, 88, 89, 93, 102, 113, 115, 116, 121, 122, 434, 442, plus the label tables at 13–30 and 272–455
  - `src/ui/shop.ts`: 113, 122, 123, 126, 128, 131, 132, 150, 494, 495, 496, 584, 585, 587, 588, 591, 601, 605, 606, 619, 626, 627, 652, 657, 660, 662, 668, 669, 671, 672, 680, 681, 682, 696, 699, 709, 713, 714, plus `upgradeEffect` (L32–48) → `shop.effect.*`
  - `src/ui/widgets.ts` internal: 633, 634, 673, 674 (ON/OFF), 717, 724, 760, 763, plus key-hint chips ~L250–266
  - Data tables: `src/ui/theme.ts` `MEDAL_NAMES` (L31) → `medal.N`, `src/ui/skins.ts` L12–18, and the fallback `src/ui/data.ts` L17–45. That fallback is only used when the level module is missing, so it is not translated: show `chapter.<id>.*` instead.
- **Direct KAPLAY text calls** (Engine, Input):
  - `src/core/pause.ts:94` and `:100` (the `text()` helper): `textService.drawText`. Strings at 17–19, 106, 123, 124 become `pause.*`.
  - `src/core/render.ts:179` (`text()` helper, used for pickup letters at :370): leave it as is. P, B and S are icon letters, not words.
  - `src/input/touch.ts:230`: `drawText`. Labels at 79–83 become `touch.*`.
  - Banners in `src/core/world.ts` 453, 502, 534 become `banner.*`. Boss subtext uses `t("boss."+id)`.

### Phase 3: content strings
- **Chapters**: `chapter.<id>.name/subtitle/briefing`.
- **Objectives**: `t("objective."+def.id, { n: def.goal })`. For `jun_rate`, pass `n: def.goal*100`. `cit_deaths` uses `count`.
- **Tutorial** (`src/levels/tutorial.ts` `hintText`): `t(\`tutorial.${step}.${isTouch() ? "touch" : "key"}\`)`.
- **Weapons, upgrades, aircraft, skins**: `t("weapon."+id+".name")` and so on. **Boss names**: `t("boss."+bossId)`.
- Composite strings must be built through `t()` with placeholders and never concatenated. For example, `${act()} TO BUY` becomes `t("common.toBuy", {act: t("act.click")})`.

### Phase 4: RTL layout (UI agent)
Use `isRtl()` to mirror text alignment, label/value columns, chapter card order, shop category order and the back-button side. Do **not** mirror the playfield, the gameplay HUD positions, the touch stick, key names or numbers (plan §6).

### Phase 5: translation
Native review of `fa.ts` and of the glossary below. Buttons should be 12 characters or fewer where possible. Use the overflow report to find labels that are too long.

### Phase 6: QA
- Add Playwright projects `fa-desktop` and `fa-mobile` (set `locale:"fa"` in the save). Assert `window.__sky.services.text.overflows.length === 0` on every scene, with no console errors.
- Add a unit test that every key has `{placeholders}` matching between `en` and `fa`. Key presence is already enforced by the type.
- Check that FPS stays within 5 % of English.
- Add credits (§4).

## 3. Glossary

The glossary now lives in `docs/FA_STYLE_GUIDE.md` (core terms + the "Names and recurring terms" table). The old draft
glossary that stood here was replaced in round 5: credits are «سکه» (not «اعتبار»), flare is «منور» (not «فلر»), boss
is «غول آخر», back is «برگشت», high score / best score is «رکورد», campaign is «کمپین», briefing is «شرح مأموریت»,
sortie is «پرواز», the logo stays Latin **SKY REAPER** with `menu.subtitle` «جنگنده‌ی آسمان».

Things that stay Latin: key and button names (SPACE, Q/E, ESC, ENTER, SHIFT, D-PAD, LB/RB, A/B), "FPS", "MIT", file
names, player initials, `x{n}` multipliers, `+{n}` / `-{n}` signs.

## 4. Font and credits

- Source: Vazirmatn v33.003 by Saber Rastikerdar, from the official release `https://github.com/rastikerdar/vazirmatn/releases/download/v33.003/vazirmatn-v33.003.zip` (sha256 `0a9afd41967e6f57096a56a181a23f81a2b999b62f1f2a4e4b26736580854fdb`). License: SIL Open Font License 1.1.
- Subset made with fontTools `pyftsubset` (`--unicodes=U+0020-007E,U+00A0,U+00AB,U+00BB,U+00D7,U+0600-06FF,U+200C-200F,U+2010-2014,U+2018-201D,U+2022,U+2026,U+202A-202E,U+2066-2069,U+2212 --layout-features='*' --flavor=woff2`). Under the OFL the subset is a Modified Version. It keeps the family name, which the license allows because Vazirmatn declares no Reserved Font Name. If release review disagrees, rename the family to e.g. "SR Vazir Subset".
- **Proposed line for `ASSET_CREDITS.md`** (owned by the asset agent; I did not edit it):
  `Vazirmatn font (v33.003, subset to Latin + Arabic block) — © Saber Rastikerdar and contributors — SIL Open Font License 1.1 — https://github.com/rastikerdar/vazirmatn — files: public/fonts/vazirmatn-*-subset.woff2, license: public/fonts/OFL-Vazirmatn.txt`

## 5. Known limits

- Atlas pages are created through `loadSprite`, so the first frame after `init` waits for the asset microtask. Await `textService.init(k)` before the first scene.
- Canvas text is rasterised at back-buffer density, which is at most 1× in this game (`renderDensity`). With `texFilter:"nearest"` it is crisp at 1:1 but not smoothed. If phones look rough, pass `resolution: 2` (costs 4× atlas space).
- Objective texts in the chapter data have their numbers baked into English (`"Sink 6 ships"`). The keyed versions take `{n}` from `goal`.
- The pluralisation is deliberately minimal (`one|other`).

## 6. Missing keys (round 4 snapshot): ADDED in round 5

All keys proposed in the round 4 snapshot now exist in `en.ts` + `fa.ts`. Wiring them is the UI / level / boss owners' job:

| Source | Keys |
|---|---|
| `src/bosses/framework.ts:484,506` | `bossBanner.coreExposed`, `bossBanner.coreExposed.sub`, `bossBanner.armourCracking`, `bossBanner.armourCracking.sub` |
| `src/bosses/citadel_core.ts:62-63` | `bossBanner.shieldGensDown`, `bossBanner.emitterDestroyed` |
| `src/bosses/heli_gunship.ts:54,61,71` | `bossBanner.heli.drones`, `bossBanner.heli.strafing`, `bossBanner.heli.tailRotor`, `bossBanner.heli.tailRotor.sub` |
| `src/bosses/ice_dreadnought.ts:51,61` | `bossBanner.ice.drill`, `bossBanner.ice.drill.sub`, `bossBanner.ice.engines`, `bossBanner.ice.engines.sub` |
| `src/bosses/land_fortress.ts:59,72` | `bossBanner.fortress.ramming`, `bossBanner.fortress.ramming.sub`, `bossBanner.fortress.immobilised` |
| chapter intro `tl.banner` at t=0 | `banner.operation` = `OPERATION {name}` with `name = t("chapter.<id>.opName")`; `banner.chapterIntro` = `CHAPTER {n} - {name}` with `name = t("chapter.<id>.name")` |
| `WAVE n` titles | `banner.wave` = `WAVE {n}` (the subtext has a `wave.<chapter>.<slug>.sub` key) |
| `src/levels/chapters/pacific.ts` | `wave.pacific.surface(.sub)`, `wave.pacific.escort.sub`, `wave.pacific.bomberRun.sub`, `wave.pacific.interceptors.sub`, `wave.pacific.carrierAhead(.sub)` |
| `src/levels/chapters/jungle.ts` | `wave.jungle.ambush(.sub)`, `wave.jungle.hiddenBase(.sub)`, `wave.jungle.convoy(.sub)`, `wave.jungle.bomberFormation.sub`, `wave.jungle.stronghold(.sub)`, `wave.jungle.gunshipEscort.sub` |
| `src/levels/chapters/desert.ts` | `wave.desert.oilField(.sub)`, `wave.desert.sandstorm(.sub)`, `wave.desert.armouredConvoy`, `wave.desert.airbase(.sub)`, `wave.desert.sandstormRaid(.sub)`, `wave.desert.armourScreen.sub` |
| `src/levels/chapters/arctic.ts` | `wave.arctic.blizzard(.sub)`, `wave.arctic.train(.sub)`, `wave.arctic.minefield(.sub)`, `wave.arctic.icebreaker`, `wave.arctic.whiteout(.sub)`, `wave.arctic.outpost` |
| `src/levels/chapters/citadel.ts` | `wave.citadel.gauntlet(.sub)`, `wave.citadel.droneSwarm`, `wave.citadel.factory(.sub)`, `wave.citadel.heavyEscort.sub`, `wave.citadel.train`, `wave.citadel.walls(.sub)` |
| `src/ui/hud.ts:293-295` | `hud.rapidAbbr`, `hud.overdriveAbbr`, `hud.magnetAbbr` |
| `src/ui/results.ts:161` | `results.bombsFlaresShort` |
| `src/ui/shop.ts:353` | `shop.swapTouch` |
| `src/ui/settings.ts:79,93,102` | `settings.subtitle`, `settings.keyHelpWide`, `settings.keyHelp`: English values changed to the sentence-case text the screen shows now |
| `src/ui/chapters.ts:159` | compose `chapters.bestScore` + `chapters.objCount` (existing keys) |

**Round 5 keys** (for the contract fields the Orchestrator added): `settings.scorePopups` SCORE POPUPS,
`settings.language` LANGUAGE (already existed), `settings.langEn` ENGLISH, `settings.langFa` فارسی (the older
`settings.language.en/.fa` stay for the demo), `hud.threat` THREAT, `hud.enraged` ENRAGED, `results.maxThreat`
MAX THREAT, `menu.subtitle` (en `""` so the English logo has no subtitle; fa «جنگنده‌ی آسمان»), `chapters.replayBonus`
REPLAY BONUS.

`AAA` default initials stay Latin. Other agents request keys in `docs/I18N_KEYS_REQUESTED.md`.

**Round 5 merge (I18N MERGE agent):** all requests in that file are merged and marked DONE there. +7 keys
(`menu.flightTimeHM`, `menu.flightTimeM`, `settings.secondsShort`, `bossBanner.enraged1/2/3`, `banner.threat`) and 4
text changes (`upgrade.damage/fireRate/hull/shield.desc`, BALANCE_SPEC U1 values 10% / 7% / +15 / +10). A grep of
every literal `t("…")` / `tr("…")` / `fromEn` / `bannerText` key in `src/` finds 0 keys missing from `en.ts`; the
template keys (`medal.*`, `settings.tab.*`, `settings.action.*`, `shop.tab.*`) all resolve. Every `desc` in
`src/weapons/index.ts` matches its `en.ts` value. Farsi choices: ENRAGED II / III are «خشمگین‌تر!» / «خشم نهایی!» (a
Latin roman numeral is not allowed in fa); `banner.threat` keeps the numeral as the `{n}` parameter («خطر {n}»).

## 7. Automated Farsi check

```
node tests/i18n/check.mjs            # exit 0 pass / 1 fail; --verbose prints the 40 highest fa/en length ratios
```
`package.json` is not owned by i18n; the Orchestrator may add `"test:i18n": "node tests/i18n/check.mjs"`.
The script loads both tables through the project's esbuild (`transformSync`, with node's type stripping as fallback).
`I18N_LOCALES_DIR=<dir>` lints another copy of the tables (used to test the script itself). It fails on:
- missing / extra keys, `{placeholder}` set mismatch;
- fa length > 1.35 × en + 4 chars (`menu.subtitle`, the language-name keys and `menu.flightTimeHM` are exempt; the
  last has one-letter English units «{h}H {m}M» with no natural Farsi short form);
- banned words (guide rules 2–5: literary/bureaucratic, colloquial spellings, religious/political, «قتل»/«کشتن»).
  `word` = whole token (a ZWNJ compound is one token, so «جهت‌نماها» passes), `start` = the token or one of its
  ZWNJ parts starts with it;
- the vulgar Persian blocklist `tests/i18n/blocklist.json` (39 entries, base64 UTF-8, start / whole-word modes);
- Latin letters in fa except key names, the `x` multiplier, SKY REAPER, MIT, KAPLAY / TypeScript / Vite,
  ASSET_CREDITS.md, ENGLISH;
- ZWNJ at a word start/end or doubled, «می »/«نمی » followed by a space, Arabic «ي»/«ك», Arabic script in en values.

Result now: 501 keys in each table, PASS, fa/en length ratio avg 0.94, max 2.50 (`common.ok` OK → «تأیید»; the
highest ratios are all 2–4 character English labels). A mutation run with 10 injected faults in a scratch copy reported
all 10.
