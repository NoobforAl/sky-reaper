# SKY REAPER — Asset credits

Every art and audio asset that ships today is **original work created for this project** and released under
**CC0-1.0** (public domain dedication; the code that generates it is MIT like the rest of the repo). No third-party art
or audio is bundled, and there are **no placeholders** (`SpriteInfo.placeholder` is never set). The one third-party
asset is the Vazirmatn font used for Farsi text (see the last row of the table, SIL OFL 1.1).

| Asset | Author | Source / URL | License | Notes |
|---|---|---|---|---|
| All sprites in `public/assets/sprites/*.png` (aircraft + aircraft skins `player_<aircraft>_<skin>`, enemies incl. bank / damaged / recoil / burning-wreck animation strips, debris, wrecks, boss parts, bullets, fx, pickups, biome tiles, decor, clouds, UI incl. `ui_skin_*` swatches, logo) | SKY REAPER project (procedural pixel-art generator) | `scripts/art/*.mjs` → `npm run art` | CC0-1.0 | Generated deterministically from code: master palette + per-biome palettes, auto outline/shading. Preview: `assets_original/preview/contact_sheet.png` |
| Bitmap fonts `sr_font` + `sr_font_outline` (`public/assets/sr_font.png`, `public/assets/sr_font_outline.png`) | SKY REAPER project | `scripts/art/gen_font.mjs` | CC0-1.0 | Original hand-authored pixel font (round 3 redraw): 5px glyphs, cap height 8, true lowercase with descenders, 7x11 / 8x11 cells stored at 2x. No third-party font used. Test sheet: `assets_original/preview/font_test.png` |
| All music (`menu`, `pacific`, `jungle`, `desert`, `arctic`, `citadel`, `boss`, `boss_final`, `results`) | SKY REAPER project (runtime chiptune synth) | `src/assets/music.ts` | CC0-1.0 | Hand-authored A/B-section melodies, chord progressions and drum grooves per track (`TRACKS[id].song`), synthesized at runtime with WebAudio; no audio files |
| All sound effects (every `SfxId`) | SKY REAPER project (runtime synth) | `src/assets/sfx.ts` | CC0-1.0 | Oscillator/noise recipes; no audio files |
| PNG encoder/decoder | SKY REAPER project | `scripts/art/png.mjs` | MIT | Node built-in `zlib` only |
| Vazirmatn font (v33.003, subset to Latin + Arabic block) | © Saber Rastikerdar and contributors | https://github.com/rastikerdar/vazirmatn | SIL Open Font License 1.1 | Files: `public/fonts/vazirmatn-*-subset.woff2`; license: `public/fonts/OFL-Vazirmatn.txt`. The subset is a Modified Version under the OFL (no Reserved Font Name declared); originals in `assets_original/fonts/vazirmatn/` |

## Optional third-party packs (not included)

| Pack | Author | URL | License | Status |
|---|---|---|---|---|
| Pixel Shmup | Kenney (kenney.nl) | https://kenney.nl/assets/pixel-shmup | CC0-1.0 | **Not used.** kenney.nl blocks scripted downloads; a user may drop the unzipped pack into `assets_original/kenney-pixel-shmup/` with a `map.json` (see docs/ASSET_MANIFEST.md). If you do, add a row here listing the overridden keys. |
