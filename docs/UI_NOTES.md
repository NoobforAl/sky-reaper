# UI / Input / Save notes (UI/UX + Mobile agent)

## Files
- `src/save/index.ts` — SaveService. Key `sky-reaper-save-v1`, `version: 1`. Every load goes through `migrate()` → `sanitizeSave()`: values are deep-merged onto defaults, clamped and type-checked. Unparsable JSON is copied to `sky-reaper-save-v1-corrupt` and the game starts with a fresh save. If storage is unavailable (private mode, quota) the game keeps running in memory. `recordChapter` keeps the best score, the highest medal and the union of objectives, and unlocks the next chapter. The high-score table holds the top 10. `notifySettingsChanged()` saves first and then notifies subscribers.
- `src/input/` — `index.ts` (service), `keys.ts` (key names + labels), `coords.ts` (client↔game units, safe-area insets), `touch.ts` (on-screen controls).
- `src/ui/` — `index.ts` (registerUiScenes, createHud), `core.ts` (UiRoot: focus/nav/pointer + `beginScene`), `widgets.ts` (Gfx primitives, button/slider/toggle/selector, `drawBackdrop`, `drawScanlines`), `theme.ts`, `icons.ts`, `data.ts` (chapter info with fallback), `menu.ts`, `chapters.ts`, `shop.ts`, `settings.ts`, `results.ts`, `hud.ts`, `layout.ts` (wide/portrait geometry helpers), `skins.ts` (skin catalog + skinned aircraft drawing), `desktop/layout.ts` (stage sizing / framed portrait), `desktop/store.ts` (`hintMode`, `ShopFocus`).

## Input
- **Keyboard:** DOM listeners, so they work in every scene. Letters and digits use the physical key (`e.code`), so WASD stays in place on AZERTY. Bindings are stored in `settings.bindings`. `rebind()` removes the key from every other action.
- **Edge flags** (bomb/special/weapon/ground/pause) stay latched until `poll()`. Latches older than 400 ms are dropped, and `setTouchControlsVisible()` clears them, so a menu key press never leaks into the game.
- **Gamepad (standard mapping):**
  - Left stick or D-pad: move (radial deadzone 0.22)
  - A or RT: fire
  - B or X: bomb
  - Y or RB: flare
  - LB: next air weapon
  - LT or Select: next ordnance
  - Start: pause
  - Menus: D-pad/stick to navigate (auto-repeat), A to confirm, B to go back, LB/RB to switch tabs
- **Touch:** pointer events only, so there are no ghost mouse clicks. Fingers are tracked by `pointerId`, so multi-touch is safe. Pinch, double-tap zoom and scrolling are blocked on the canvas.
  - Default steering is **relative drag**. The target starts at the player position (read from `window.__sky.game.world.player`), then follows the finger delta ×1.15, clamped to the playfield. Without a player position it falls back to "finger + 96 units above".
  - The alternative is a floating **joystick**. Settings → Devices → Touch steering. This choice is stored in localStorage key `sky-reaper-ui`.
  - **Hold to fly + fire (round 3):** while a steering finger is down the ship fires continuously, also when the finger is held still (`TouchControls.firing`); lifting the finger stops firing. There is no FIRE button any more. The same rule applies to the joystick mode. The **AUTO-FIRE** setting still matters on touch: when it is ON the ship also fires with no finger down (between drags, while only pressing icons).
  - **Icon buttons** (no text circles): BOMB (current ordnance icon `ui_icon_<ground>`, stock badge, greyed + red `0` badge when empty) and FLARE (`ui_icon_flare`, cooldown pie sweep, pulse ring when ready) stacked on the right edge for the right thumb; air-weapon swap (current `ui_icon_<air>`, cyan) and ordnance swap (current `ui_icon_<ground>`, amber), each with a small circular-arrow badge, bottom-left above the HUD strip; pause in the HUD top bar between the progress bar (shortened to 116 when touch controls show) and the lives. Weapon icons fall back to the vector glyphs in `src/ui/icons.ts`; pause / swap badge are vector. HUD passes the state via `drawTouchControls(k, font, { flareReady, bombs, airWeapon, groundWeapon, icon })`.
  - Feedback: pressed icons shrink (0.88) and flash white for 180 ms; `navigator.vibrate(10)` on press when available (guarded). Hit radii ≥ 28 game units (≥ 45 CSS px targets on a 390-px phone); layout uses the safe-area insets. In WIDE (touch laptops) the icons sit above the corner plates and key-hint bar.
  - Multi-touch: a finger that starts on an icon only presses that icon (never steers or fires); icons react to touch-down only, so a steering finger sliding over an icon never triggers it. Steer with one thumb and bomb / flare with the other. Holding BOMB repeats like holding the bomb key.
  - The controls are drawn by the HUD (`input.drawTouchControls`). They are visible only while the game scene calls `setTouchControlsVisible(true)` and `touchControls` is `on`, or `auto` on a touch device.
- `svc.input` also implements `SkyInputService` (`isSkyInput()`): `onKey`, `menuPad`, `drawTouchControls`, `touchMoveMode`, `lastDevice`.

## Screen modes (wide desktop vs portrait)
`GAME_W` is chosen once at load by `contracts/consts.ts`: `480` (DESIGN_W) on phones / narrow / portrait windows, up to `MAX_GAME_W` (1520) on landscape desktops (`WIDE === true`). `GAME_H` is always 854. Force a mode with `?layout=wide` or `?layout=portrait`.
- **WIDE:** the canvas fills the whole window (`#stage` = 100vw × 100dvh). KAPLAY letterboxes only when the window is wider than 1520:854. Pixel density stays 1, so the canvas is drawn at window resolution and is crisp.
- **Portrait field on a wide window** (`?layout=portrait`): `src/ui/desktop/layout.ts` sizes the stage exactly to 480:854 and frames it (class `sr-desk` on `<html>`). The old DOM side panels are gone, so nothing shrinks the stage in WIDE mode.
- **Phones:** full-window letterboxed canvas, as before.
- `src/ui/layout.ts` provides the layout helpers: `WIDE`, `M` (margin), `cols([...])` column splitter, `BOTTOM_Y/H`. Every UI scene has two layouts: the original portrait layout when `GAME_W === 480`, and a multi-column layout when WIDE.
  - **Menu:** logo + PILOT RECORD panel on the left. The record shows the aircraft in its equipped skin, credits, campaign progress, totals and the top 8 pilots, plus a keycap strip with the flight controls. The menu buttons sit on the right.
  - **Chapters:** 5 tall cards in a row. Hovering a card previews it, clicking selects it, and clicking again launches. Below the cards: the BRIEFING panel (objectives + rewards) and a MEDALS & RECORD panel (medal ladder, best score/time, clear bonus).
  - **Hangar:** categories (UPGRADES / ARSENAL / AIRCRAFT / SKINS) in a column on the left, the item list in the centre, and a DETAILS panel on the right. The DETAILS panel shows a big preview, stats, the action wording and the price for the hovered (or focused) item.
  - **Settings:** AUDIO / GAME / DEVICES tabs on the left. The right side always shows the full key-binding table, with click-to-rebind and reset.
  - **Results:** debrief + objectives on the left, credits + initials / top 10 on the right, and 4 buttons in a row. Desktop shortcuts: R retry, N next, C chapters, H hangar, Esc menu.
- **Desktop polish:**
  - Hover highlight + pointer cursor on anything clickable, and `ew-resize` on sliders.
  - Tooltips after 350 ms. The hangar shows short tooltips in WIDE (the DETAILS panel has the full text) and full tooltips in portrait.
  - The mouse wheel adjusts the slider/selector under the cursor. Otherwise it steps the focus through the list, or the chapter selection on the chapters screen.
  - Hint bars use keycaps (`Gfx.hintBar`) and follow the last device: keyboard/mouse → ENTER/ESC/ARROWS/Q/E, gamepad → A/B/D-PAD/LB/RB, touch → hidden. Touch wording ("TAP", "DRAG TO FLY") appears only in touch mode.
  - Text sizing: see "Readability (round 3)" below.
- **HUD in WIDE:** corner clusters on translucent plates, with no full-width bars, so the playfield centre stays clear:
  - top-left: score, combo and chapter progress
  - top-right: lives and FPS
  - top-centre: boss bar (it moves below the clusters on narrow-wide fields)
  - bottom-left: hull, shield and power-up timers
  - bottom-right: weapon + power pips, ordnance + stock, and the flare ring
  - Keyboard players see their bound keys above the weapon plate for the first 25 s.
  - Hints and banners are centred and width-limited. Long banner titles shrink to fit one line.
  - Touch buttons still draw only when touch is in use.

## Skins
- Catalog: `SKINS` from `src/weapons` (local fallback in `src/ui/skins.ts`, same ids/costs). `SKIN_SWATCH` / `SKIN_TINT` are UI-only colours.
- Save (`src/save`): `unlockedSkins` is sanitised to known `SKIN_IDS`, deduplicated, and always includes `standard`. `selectedSkin[aircraft]` survives only if that skin is owned (unknown aircraft keys are dropped). `freshSave()` starts with `["standard"]` / `{}`.
- Hangar SKINS tab:
  - A picker row (FALCON / RAPTOR / BULWARK) chooses the aircraft to preview. Locked aircraft can be previewed but not equipped.
  - Each row shows the skin on that aircraft (`player_<aircraft>_<skin>` sprite, else `player_<aircraft>` tinted, else a vector jet), a swatch, and its state: EQUIPPED / OWNED / price / lock + chapter.
  - Clicking a row equips an owned skin on that aircraft. An unowned skin is bought and equipped, but only if its `unlockChapter` is cleared; otherwise the click is refused and shows "CLEAR CH n FIRST".
- Portrait shows a preview stage above the list. WIDE shows the preview in the DETAILS panel. The aircraft cards and the menu's pilot record also draw the equipped skin.

## UI
- Portrait 480×854 layouts with a safe-area-aware HUD. Mouse hover/click, touch tap, and keyboard (arrows/WASD, Enter/Space, Esc/Backspace, Q/E tabs) all work. Gamepad works on every screen. Focus moves spatially.
- Uses the `sr_font` font when it is loaded, otherwise `monospace`. Uses `ui_logo`, `ui_medal_*`, `ui_icon_<weapon>`, `ui_heart`, `ui_bomb` and `player_<id>` sprites when present, with vector fallbacks.
- Music: `menu` on menu/chapters/shop/settings (it is not restarted between them). `results` plays on the results screen.
- Settings apply live and persist. The UI also pushes volume/mute into `AudioService` on every change.
- Results:
  - The engine records the high score as `PILOT`. The results screen lets the player rename that entry with 3 initials (type letters, or use +/- buttons or the gamepad). If no entry exists and the score qualifies, it adds one.
  - It updates `totals` (plays, kills, seconds) once per run.
  - Tap or press any key to skip the count-up animation.
- HUD:
  - Score, with a combo multiplier when `stats.combo` exists
  - Progress bar, lives, FPS (setting)
  - Boss bar with phase notches
  - Hull and shield bars
  - Air weapon icon with power pips
  - Ordnance icon with stock pips
  - Flare cooldown ring
  - Temporary power-up timers
  - Hint box, banners
  - Missile edge arrows and on-screen reticles
  - Lock-on frame and brackets
  - Low-hull vignette
  - Touch controls

## Verification
Wide/skins round: headless Chromium at 1920×1080 and 1366×768 (WIDE), 1920×1080 with `?layout=portrait` (framed), and 390×844 touch (portrait). Screens checked: menu, chapters, hangar (all tabs, hover tooltip + details, pointer cursor), settings, results (anim + initials), and game HUD. The skin flow was scripted: sanitising a hand-edited save, buying + equipping ARCTIC by mouse click, refusing a chapter-locked skin, and re-equipping STANDARD. No console errors.

Earlier round:
Verified with headless Chromium at 1280×800 (mouse + keyboard) and at 390×844 (touch, DPR 2). The tested flow was:
- menu → chapters (locked card) → hangar (buy upgrade, weapon, aircraft)
- settings (slider drag, toggles, rebind fire → `L`), reload → settings, credits and bindings persisted
- game (keyboard / touch drag) → `cheatWin` → results → initials stored
There were no console errors and `__sky.errors` was empty. The script is not committed; QA owns `tests/**`.

## Known gaps
- The pause overlay belongs to the engine (`src/core/pause.ts`). It has no gamepad navigation beyond Start to resume.
- The HUD has no access to the event bus, so `enemyImmune` tooltips are not shown.
- Difficulty selector values are 0.7 / 1 / 1.5, not 0, because the engine treats the setting as a multiplier.

## Readability (round 3)
- **Font:** `sr_font` (7x12 design cell, true lowercase, baked 1px dark outline) and `sr_font_outline` (adds a drop shadow), both 4x atlases with a linear filter. `Gfx` takes both (`resolveFont` / `resolveOutlineFont`). `outline: 0` = plain sr_font, `1` / `-1` = sr_font_outline, `>= 2` = outline font plus an extra dark ring (titles). The HUD sets `g.defaultOutline = 1` (all HUD text sits over gameplay).
- **Never draw dark text on a light fill** (the baked outline turns it into a blob). Panel title tabs are now a dark tab with accent text.
- **Crisp sizes (`readableSize`)**: KAPLAY renders into an offscreen framebuffer of `GAME_W*pixelDensity` px. Text is drawn at whole steps of the font cell in framebuffer px (12, 18, 24, 36...), never below 12 fb px and never below 12 CSS px; `Gfx.text` snaps the top-left corner to framebuffer pixels. Consequence: on phones / 1366x768 any requested size < ~15 renders at the minimum (14.8 / 13.3 units). Measure with `g.measure()` / `g.textHeight()` / the height returned by `g.text()`, never `length * k`.
- `TextOpts.maxLines` (with `width`) clips wrapped text with "..." (cached); used for list-row descriptions. Details panels / tooltips keep the full text. Long descriptions are sentence case (no `.toUpperCase()`).
- **Framebuffer minify fix (`src/ui/glfix.ts`)**: when the window is smaller than the game field (phones: 0.81 CSS px/unit, 1366x768: 0.9), KAPLAY's final framebuffer blit minifies with NEAREST and drops whole pixel rows/columns (letters lost their stems). `smoothFramebufferMinify()` (called from `refreshBuf()` inside the UI/HUD onDraw) sets only that texture's MIN filter to LINEAR. Magnification (big windows) stays nearest.
- Contrast: `C.grey` raised to 158,170,192; important values use `C.text`/`C.white`; text over the backdrop (hint bars, version line, menu controls strip) gets the outline font and/or a dark plate; HUD hint box grows with wrapped text, banner plate 0.74.

## Biome menu backdrop (round 3)
- `src/ui/backdrop.ts`: menu / chapters / hangar / settings / results draw `createMenuBackdrop(biome, {dim: 0, speed: 16})` from src/levels (fallback: a local `BiomeBackground` wrapper, then a palette-only drawing; a renderer that throws falls back to the palette for 3 s and is retried). Own veil per biome (bright desert/arctic dimmed more) + edge vignette.
- Chapter shown: chapter select = the selected card (crossfade: 0.45 s dip to dark); elsewhere = `menuChapter()` = remembered chapter (UI prefs `menuChapter`, set when a chapter is selected in chapter select or a results screen is shown) else the next unlocked chapter.
- Accent tint: `applyTint(chapter)` mixes `C.cyan` 35% / `C.cyanDim` 25% / amber 10% toward the chapter accent and the navy panel fills ~15-18% toward the chapter bg. Reset to the base theme when the game scene starts (HUD unchanged).
- **UI prefs** (`src/ui/prefs.ts`, localStorage `sky-reaper-ui`, shared with the touch steering pref): `menuChapter`, `reducedMotion` (unset = follow the OS `prefers-reduced-motion`).
- Settings -> GAME -> **REDUCED MOTION** toggles the pref and calls `setReducedMotion()` from src/levels (also applied at boot in `registerUiScenes`).
