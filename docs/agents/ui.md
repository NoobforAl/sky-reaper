# UI/UX + MOBILE agent brief — owns `src/ui/**`, `src/input/**`, `src/save/**`

Read `docs/agents/COMMON.md` first, plus `src/main.ts` and the current stubs in your dirs. `src/weapons` (Engine) exports PLAYER_WEAPONS, UPGRADES, AIRCRAFT, shopCost, computeLoadout — use them. Art (`ui_*` sprites, `sr_font`) may arrive later: fall back to KAPLAY primitives + "monospace" and switch automatically when `svc.sprites.has(key)`.

1. `src/save/index.ts`: full SaveService — versioned localStorage, defaults merge/migration, corruption-safe, spend/earn, recordChapter (best score/medal/objectives, unlock next chapter), top-10 high scores, settings pub/sub.
2. `src/input/index.ts`: `createInputService(k, save)` — rebindable keyboard (persisted), analog move; Gamepad API (stick/dpad, A fire, B/X bomb, Y/RB flare, bumpers switch, Start pause, deadzone); touch: virtual joystick or relative drag-to-move (finger offset) + FIRE/BOMB/FLARE/weapon-swap buttons, auto-fire, scales with the letterboxed canvas, multi-touch safe, no scroll/zoom, ignores ghost mouse events. `touchControls: auto|on|off`. Edge flags latched until poll().
3. `src/ui/index.ts`: `registerUiScenes(svc)` (menu, chapters, shop, settings, results) and `createHud(svc)`. Retro military arcade look (navy/steel panels, amber + cyan accents, subtle scanlines, animated backdrop, SKY REAPER logo). Mouse, touch (≥44px targets) and keyboard/gamepad navigation everywhere.
   - Menu: Start/Continue, Chapter select, Hangar, Settings, Credits.
   - Chapters: 5 biome cards, lock state, best score/medal, objectives, briefing (data from `levels` in ../levels; fall back if empty).
   - Hangar: credits, 7 upgrades with pips + cost, weapon unlocks, 3 aircraft with stat bars + `player_<id>` preview; sfx ui_buy/ui_deny.
   - Settings: volumes, mute, auto-fire, difficulty, shake, FPS, touch mode, key rebinding, gamepad status, reset save with confirm; apply live.
   - Results (ResultsParams): stats, objectives ✓, medal animation, credits count-up, 3-letter initials for top 10, Retry / Next / Hangar / Menu.
   - Music: 'menu' on menu scenes, 'results' on results.
   - HUD (HudData): hull, shield, bombs, air+ground weapon icons with power pips, flare cooldown, score + combo, lives, boss bar with phase notches, progress bar, hint line, banners, FPS, missile warning arrows + lock-on flash. Compact, safe-area aware.
   - `src/ui/widgets.ts`: button, slider, toggle, panel, outlined text, `drawBackdrop(k, t)`.
4. Browser-verify at 1280×800 and 390×844 with touch: screenshot every scene, full flow menu → chapters → shop (buy) → settings (rebind, reload, persists) → game → results; no console errors. Write `docs/UI_NOTES.md`.
