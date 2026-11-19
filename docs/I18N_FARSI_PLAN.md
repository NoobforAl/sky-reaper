# Plan: Farsi (Persian) language support

Status: **plan only — not implemented.** Owner: Orchestrator → UI/UX agent (+ Asset agent for fonts).

## 1. Goal

Let players switch SKY REAPER to Farsi (فارسی): every menu, HUD label, tutorial hint, chapter briefing, objective,
results screen, shop item and settings label. Gameplay itself does not change. English stays the default; Farsi is
picked automatically when the browser language starts with `fa`, and can be changed in Settings at any time.

## 2. Why this is not just "translate the strings"

| Problem | Why it matters here |
|---|---|
| **Letter shaping** | Persian letters change shape by position (isolated / initial / medial / final). KAPLAY's `drawText` draws one glyph per character from a font atlas, so it shows disconnected letters: wrong and unreadable. |
| **Right-to-left + mixed text** | Lines run right to left, but numbers, `x2` combos, key names (`SPACE`, `Q/E`) and weapon codes stay left to right inside them. That needs the Unicode bidi algorithm, which KAPLAY doesn't implement. |
| **Font** | `sr_font` is a 5×7-style ASCII-only bitmap font. Persian needs a real font with Arabic-script glyphs. |
| **Text length** | Persian strings are often 20–40 % longer or shorter, so fixed-width buttons and HUD boxes can overflow. |
| **Digits** | Persian uses ۰۱۲۳۴۵۶۷۸۹; scores and credits should use them in Farsi mode (optional, user setting). |

## 3. Chosen approach: render localized text with the browser, cache it as textures

Text drawing is already centralised (mostly `src/ui/widgets.ts`, plus `src/core/pause.ts`, `src/core/render.ts`,
`src/input/touch.ts`), so one text service can replace all of them.

1. **`TextService`** (new, `src/i18n/text.ts`): `drawText(k, str, opts)` with the same options the UI uses today
   (pos, size, color, anchor, outline, maxWidth).
   - Latin text in English mode → keep the current fast KAPLAY bitmap path (`sr_font`), so nothing changes for English.
   - Any string containing Arabic-script characters (or any string in Farsi mode) → draw it once into an offscreen
     `<canvas>` with Canvas2D `fillText` (`ctx.direction = "rtl"`, Persian font). The browser does shaping and bidi
     correctly for free. Turn that canvas into a KAPLAY sprite and cache it (LRU keyed by text + size + colour,
     about 200 entries). Static labels are drawn once; numbers that change every frame (score) are drawn as a
     cached label plus digits from a small digit atlas, so nothing is re-rendered per frame.
   - Outline / drop shadow done in the same Canvas2D pass (`strokeText`), so it matches the current style.
2. **Why not a DOM overlay?** It would also handle shaping, but it fights the letterboxed canvas scaling,
   screen shake and the in-canvas HUD. It's also harder to keep pixel-aligned. We keep it as the fallback if texture
   caching proves too slow on low-end phones.
3. **Why not pre-shaping libraries** (reshaper + bidi to presentation forms with a bitmap font)? They work,
   but they are fragile for mixed LTR/RTL strings and need a hand-built Persian bitmap font. That's more work for a worse result.

## 4. Fonts

- **Vazirmatn** (SIL Open Font License 1.1, open source, designed for Persian UI). Subset to Persian + Latin digits
  and punctuation, ship as `woff2` (target ≤ 60 KB), load with the `FontFace` API before first use, credit in
  `ASSET_CREDITS.md`.
- Use bold weight at gameplay sizes for readability; minimum 14 px on screen for Farsi (Arabic script needs more
  height than 5×7 Latin).
- Latin pixel font stays for English, but gets the readability upgrade planned in the next art round.

## 5. Localization infrastructure

- `src/i18n/index.ts`: `t(key, params?)` with `{name}` placeholders and simple plural rules; `setLocale("en" | "fa")`;
  `isRtl()`; `formatNumber(n)` (uses `Intl.NumberFormat("fa-IR")` when Persian digits are on).
- `src/i18n/locales/en.ts` and `fa.ts`: typed string tables. `fa` must have the same keys as `en` (a TypeScript type
  check fails the build if a key is missing).
- **Content strings move to keys**: chapter names, subtitles, briefings, objective texts (`ChapterDef`, `ObjectiveDef`),
  tutorial hints (`src/levels/tutorial.ts`), weapon / upgrade / aircraft / skin names and descriptions (`src/weapons`),
  enemy and boss names shown in the HUD. Data files keep English as the default and gain an optional `i18nKey`.
- **Contract changes (Orchestrator):** `Settings.locale: "auto" | "en" | "fa"`, `Settings.persianDigits: boolean`,
  `Services.text: TextService`, optional `i18nKey` fields on `ChapterDef`, `ObjectiveDef`, `PlayerWeaponDef`,
  `UpgradeDef`, `AircraftDef`, `SkinDef`.

## 6. RTL layout rules

- **Mirror:** text alignment, menu label/value columns, list order in multi-column screens (shop categories,
  chapter cards read right to left), back buttons move to the right, progress bars fill right to left in menus.
- **Do NOT mirror:** the playfield, player controls, touch joystick side, gameplay HUD positions (players rely on
  muscle memory), key names, numbers.
- Widgets get an `rtl` flag from `isRtl()` so each screen is written once.

## 7. Translation work

- About 350–450 strings (estimate from current UI + content). Create a short glossary first (military terms: sortie,
  ordnance, flare, bomber, AA, boss names) so wording stays consistent.
- Draft translation by a model, then **review by a native Farsi speaker** (required before release). Keep tone
  arcade/military, short (buttons ≤ 12 characters where possible).

## 8. Testing

- Unit: every `en` key exists in `fa`; `t()` placeholders match.
- Playwright: new project `fa-desktop` / `fa-mobile` that sets `locale: "fa"`. It screenshots every scene, checks
  for no console errors, and checks for text overflow (TextService reports when a string exceeds `maxWidth`).
- Visual check of shaping: compare a few known words (e.g. «شروع», «تنظیمات», «آشیانه») in screenshots.
- Performance: FPS with Farsi HUD active must stay within 5 % of English.

## 9. Phases and order

| Phase | Work | Owner | Size |
|---|---|---|---|
| 1 | Contract changes + `src/i18n` (t, locales, number format) + English table extracted from current UI | Orchestrator + UI agent | M |
| 2 | `TextService` (canvas-to-texture cache, Vazirmatn loading, outline), switch all `drawText` call sites | UI agent (+ Engine for pause/render) | M |
| 3 | Move content strings (chapters, objectives, tutorial, weapons, skins) to keys | Level, Engine, UI agents | M |
| 4 | RTL layout pass for menu / chapters / shop / settings / results | UI agent | M |
| 5 | Farsi translation + glossary + native review | Translator (human review) | M |
| 6 | Tests (locale projects, overflow check), perf check, credits | QA | S |

Phases 1–2 can start right after the current polish round; 3 and 4 run in parallel; 5 can start as soon as the
English key table from phase 1 exists.

## 10. Risks

- **Texture cache churn** if many unique strings appear per frame → mitigated by the digit atlas and caching static labels.
- **Font loading race** (text drawn before the font is ready) → wait for `document.fonts.load()` in `loadAssets`
  before the menu appears.
- **Mixed-direction strings** (e.g. "Press SPACE") → always build them through `t()` with placeholders so bidi
  handles the embedded Latin part; never concatenate translated pieces.
- **Translation quality** → native review is a release gate.
