# Round 3 queue (user feedback, after round 2 finishes)

1. **Ocean animation is uncomfortable on full screen** — the water tile shimmer/animation at wide sizes is too busy and
   tiring to look at. Calm it: slower, lower-contrast shimmer, fewer moving highlights, no full-tile flicker; same check
   for river / citadel grating animations. (Asset agent: tile frames + fps; Gameplay agent: background parallax speed.)
2. **Main menu background should match the level the player selected** — menu / chapters / hangar backdrop shows the
   biome of the selected (or last played / next unlocked) chapter, using the real biome background renderer
   (`BiomeBackground` from src/levels) slowly scrolling, dimmed so menu text stays readable. (UI agent.)
3. **Font readability** — some screens are hard to read. Replace or upgrade `sr_font`: a larger, clearer pixel font
   (e.g. 8×12 cell with proper lowercase, 1px outline baked or drawn as shadow), minimum on-screen size rules, better
   contrast behind text (panels/shadows). An open-licensed pixel font (OFL/CC0) is acceptable if credited. (Asset agent:
   font; UI agent: sizes, contrast, layout.)
5. **Mobile controls (user request, mobile/touch only):** hold anywhere on the screen = move the plane (relative drag)
   AND fire continuously while the finger is down (even when not moving); lift = stop. No FIRE button needed.
   Other actions as icon buttons (bomb, flare, air-weapon swap, ordnance swap, pause) using ui_icon_* sprites with
   cooldown / ammo shown on the icon. Desktop/keyboard/gamepad unchanged.
   DONE. Follow-up for the i18n merge: sync src/i18n/locales/en.ts keys menu.touchHint, tutorial.move.touch,
   tutorial.fire_air.touch, tutorial.weapons.touch with the new wording in src/levels/tutorial.ts / src/ui/menu.ts.
6. **Score popups on kills (user request, queued for after round 4; owner: engine render/world, small UI toggle):**
   when an enemy is destroyed, show the points earned at the kill position, e.g. "+150" (show the combo-boosted value;
   tint by combo level; boss parts and the boss kill get a bigger popup). It drifts up ~20-30 units and fades out over
   ~0.8-1.0 s, then disappears. It must not get in the player's way: small outlined font (sr_font_outline), drawn
   UNDER enemy bullets, low opacity when near the player's ship, pooled (no allocations), max ~24 on screen
   (oldest removed first), and nearby kills in the same instant merge into one popup. Settings toggle "Score popups"
   (default ON; UI prefs). Works in wide and portrait.
7. **Enemies overlap each other (user request; owner: enemy movement + level formations):** tanks drive through each
   other and planes of the same flight stack on top of one another. Add cheap separation: ground units in a lane keep a
   minimum gap (follower slows / waits instead of overlapping), air formation members keep slot spacing (soft
   separation push between same-layer enemies, spatial grid, no O(n^2) over all enemies), and level spawn spacing is
   checked so authored waves don't start overlapped. Bosses and their parts are exempt.
8. **Game is too easy (user: "without upgrades I skipped 3 levels"; owner: enemy tiers + level density + bosses +
   economy, verified by QA bots):** apply the balance research in docs/BALANCE_RESEARCH.md. Target: a no-upgrade
   average player clears ch1, struggles in ch2, and needs upgrades (or real skill) for ch3+. Expected upgrade level
   per chapter must be explicit (ch1: 0, ch2: ~3, ch3: ~6, ch4: ~9, ch5: ~12 upgrade levels) and enemy HP / bullet
   density scale against it. Bosses must not be skippable by face-tanking.
9. **Better enemy animations (user request; owner: asset generator + render):** idle/movement animation for every
   enemy (prop/rotor spin, engine flame flicker, tank tread scroll + turret recoil, banking frames when turning,
   muzzle flash on fire, hit flash + smoke when damaged, staged destruction: debris + spin-out for planes, burning
   wreck decal for ground units).
10. **Performance drop when bombers arrive (user report; owner: engine render/bullets + enemy patterns):** profile the
   bomber waves (heavy bomber, bomber formations, carpet-bomb patterns): bullet/fx counts, per-frame allocations,
   trail/smoke particle spawn rate, draw calls. Fix: cap particle trails, pool everything, batch draws, limit
   simultaneous bomber bullet emitters. Add a Playwright perf test for a bomber wave (FPS floor 50 on GPU).
4. Farsi support: see docs/I18N_FARSI_PLAN.md (plan only; start after 1–3 unless the user says otherwise).
