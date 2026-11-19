// SKY REAPER art build: `npm run art` (node scripts/art/build.mjs)
// Generates every sprite strip into public/assets/sprites/*.png, the font, public/assets/manifest.json and a
// contact sheet at assets_original/preview/contact_sheet.png. Fully deterministic.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodePNG } from "./png.mjs";
import { Img, Registry, strip, upscale, P } from "./lib.mjs";
import { genPlayers, genAirEnemies } from "./gen_air.mjs";
import { genGroundEnemies } from "./gen_ground.mjs";
import { genEnemyAnims } from "./gen_anim.mjs";
import { genBosses } from "./gen_boss.mjs";
import { genBullets, genFx, genPickups } from "./gen_fx.mjs";
import { genWorld } from "./gen_world.mjs";
import { genUi, drawText } from "./gen_ui.mjs";
import { genFonts, fontTestSheet } from "./gen_font.mjs";
import { genSkins } from "./gen_skins.mjs";
import { mergeKenney } from "./merge_kenney.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "public/assets");
const SPR = path.join(OUT, "sprites");
const PREVIEW = path.join(ROOT, "assets_original/preview");

const SFX = [
  "shot_vulcan", "shot_spread", "shot_laser", "shot_missile", "bomb_drop", "bomb_explode", "rocket", "explode_s", "explode_m",
  "explode_l", "hit", "hit_metal", "player_hit", "player_die", "shield_up", "shield_hit", "pickup_coin", "pickup_power",
  "pickup_misc", "flare", "warning", "missile_launch", "lock_on", "boss_roar", "boss_phase", "ui_move", "ui_select", "ui_back",
  "ui_buy", "ui_deny", "medal", "stage_clear",
];
const MUSIC = ["menu", "pacific", "jungle", "desert", "arctic", "citadel", "boss", "boss_final", "results"];

function writePng(file, img) {
  fs.writeFileSync(file, encodePNG(img.w, img.h, img.d));
}

function main() {
  const only = process.argv.includes("--sheet-only");
  const reg = new Registry();
  genPlayers(reg);
  genSkins(reg);
  genAirEnemies(reg);
  genGroundEnemies(reg);
  genEnemyAnims(reg); // bank / damaged / recoil / burning-wreck / debris / muzzle (docs/ANIM_SPEC.md)
  genBosses(reg);
  genBullets(reg);
  genFx(reg);
  genPickups(reg);
  genWorld(reg);
  genUi(reg);
  const fonts = genFonts();
  const merged = mergeKenney(reg, ROOT); // optional user-supplied pack (never required)

  fs.mkdirSync(SPR, { recursive: true });
  fs.mkdirSync(PREVIEW, { recursive: true });
  // clean stale pngs
  for (const f of fs.readdirSync(SPR)) if (f.endsWith(".png")) fs.unlinkSync(path.join(SPR, f));

  const sprites = [];
  for (const it of reg.items) {
    const s = strip(it.frames);
    if (!only) writePng(path.join(SPR, it.key + ".png"), s);
    const info = { key: it.key, src: "assets/sprites/" + it.key + ".png", frameW: it.w, frameH: it.h, frames: it.frames.length };
    if (it.frames.length > 1) {
      info.fps = it.fps ?? 8;
      info.loop = it.loop ?? true;
    }
    if (it.placeholder) info.placeholder = true;
    sprites.push(info);
  }
  for (const f of fonts) writePng(path.join(OUT, f.file), f.img);
  writePng(path.join(PREVIEW, "font_test.png"), fontTestSheet());
  const manifest = {
    version: 1,
    sprites,
    sounds: [
      ...SFX.map((k) => ({ key: k, src: "synth:" + k, kind: "sfx", license: "CC0-1.0", author: "SKY REAPER project (original runtime synth)" })),
      ...MUSIC.map((k) => ({ key: k, src: "synth:" + k, kind: "music", license: "CC0-1.0", author: "SKY REAPER project (original runtime synth)" })),
    ],
    fontKey: "sr_font",
    font: { src: "assets/sr_font.png", ...fonts[0].info },
    fonts: fonts.map((f) => ({ key: f.key, src: "assets/" + f.file, ...f.info })),
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));

  // ------------------------------------------------------------ contact sheet
  const sheet = contactSheet(reg);
  writePng(path.join(PREVIEW, "contact_sheet.png"), sheet);
  // per-group close-ups for review
  const groups = [...new Set(reg.items.map((i) => i.group))];
  for (const g of groups) writePng(path.join(PREVIEW, "group_" + g + ".png"), contactSheet(reg, g, 3));
  // seamless check: per biome a 3x3 mix of _a/_b tiles (frame offset like the renderer: (cI + r) % n) and, below it,
  // a 3x2 _a field with every decor prop scattered on top
  const biomes = ["ocean", "jungle", "desert", "arctic", "citadel"];
  const MIX = [[0, 1, 0], [0, 0, 1], [1, 0, 0]];
  const tsheet = new Img(biomes.length * 200, 3 * 64 + 4 + 2 * 64);
  biomes.forEach((b, bi) => {
    const A = reg.get("bgtile_" + b + "_a"), B = reg.get("bgtile_" + b + "_b");
    const ox = bi * 200;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        const it = MIX[r][c] ? B : A;
        tsheet.blit(it.frames[(c + r) % it.frames.length], ox + c * 64, r * 64);
      }
    const oy = 3 * 64 + 4;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) tsheet.blit(A.frames[0], ox + c * 64, oy + r * 64);
    const deco = reg.items.filter((d) => d.key.startsWith("bgdeco_" + b + "_"));
    let dx = ox + 2, dy = oy + 2, rowH = 0;
    for (const d of deco) {
      if (dx + d.w > ox + 190) { dx = ox + 2; dy += rowH + 2; rowH = 0; }
      tsheet.blit(d.frames[0], dx, dy);
      dx += d.w + 3;
      rowH = Math.max(rowH, d.h);
    }
  });
  writePng(path.join(PREVIEW, "tiles_tiled.png"), upscale(tsheet, 2));
  fs.writeFileSync(path.join(ROOT, "docs/ASSET_MANIFEST.md"), manifestDoc(reg, manifest));
  console.log(`art:${reg.items.length} sprites, ${merged} merged from Kenney pack, sheet ${sheet.w}x${sheet.h}`);
}

function manifestDoc(reg, manifest) {
  const L = [];
  L.push("# SKY REAPER asset manifest");
  L.push("");
  L.push("Generated by `npm run art` (scripts/art/build.mjs). Do not edit by hand.");
  L.push("Runtime source of truth: `public/assets/manifest.json` (type `AssetManifest`, plus a `font` block with the bitmap grid).");
  L.push("");
  L.push("## Conventions");
  L.push("- Strips are horizontal: `frames` x `frameW`, drawn at `PIXEL_SCALE` (2). KAPLAY sprite = key, `sliceX = frames`, anim `loop` when frames > 1.");
  L.push("- Player planes point **up**. Frames: 0 level, 1 bank left, 2 bank right (`fps 0`, not an animation).");
  L.push("- Skins: `player_<aircraft>_<skin>` (+ `_dmg`) for skin in arctic|desert|nightfall|crimson|tiger|gold, same 24x24 x 3 frames as the standard sprite (generated by `scripts/art/gen_skins.mjs`); `ui_skin_<skin>` 12x12 swatches (incl. `ui_skin_standard`).");
  L.push("- Enemy animation loops: the renderer plays any frame count (`frame = e.frame % frames`, fps from the manifest). Rotors 6f, radar dish 8f (full turn), afterburners/props/tracks/wakes 4f, missile-carrier bay doors 8f.");
  L.push("- Air enemies point **down** at angle 0 (renderer rotates by `facing - 90`). Ground units face down and are not rotated.");
  L.push("- `*_gun` overlays (turrets, tanks, boss turrets) point **down** at angle 0, pivot = sprite centre, matching the renderer's `angleToPlayer - 90`.");
  L.push("- Bullets point **up** at angle 0 (renderer uses `angle + 90`). `bullet_player_laser` / `ebullet_laser` tile vertically.");
  L.push("- FX frames are chosen by progress (0..1 over life), so fps there is only a hint.");
  L.push("- Enemy animation extras (scripts/art/gen_anim.mjs; selection rules in docs/ANIM_SPEC.md): `enemy_<id>_bankl|_bankr` (air, same frames as base), `enemy_<id>_dmg` (all, < 50 % HP) and `_bankl_dmg|_bankr_dmg`, `enemy_<id>_gun` = 3-frame state strip [rest, fire+recoil, return], `enemy_<id>_burn` 3-frame burning wreck, `debris_s|m|l` (4 variants, fps 0), `fx_muzzle_e|_l` (enemy muzzle flash, points down, muzzle = top-centre).");
  L.push("- Ground units have a burnt `enemy_<id>_dead` wreck. Tiles are seamless 64x64 (_a/_b share a 6px edge ring). Animated water/grating tiles are calm 4-frame loops: static body, only a few soft crests/glints fade in, drift 1px/frame and fade out (about 1% of pixels change per frame; nothing flickers tile-wide). The citadel trace pulse steps 16px/frame in muted colours.");
  L.push("- Fonts (KAPLAY bitmap fonts, loaded from the manifest `fonts` array by src/assets/loader.ts; the old `font` block is kept for compatibility):");
  L.push("  - `sr_font` = `assets/sr_font.png`: original pixel font (scripts/art/gen_font.mjs), design cell 7x11 (5px glyphs, cap height 8, x-height 6, 2px descenders, true lowercase), white glyph + 1px dark outline. Tint with `color`.");
  L.push("  - `sr_font_outline` = `assets/sr_font_outline.png`: same glyphs, design cell 8x11, outline + 1px drop shadow down-right. For the UI agent: use it for HUD / text over gameplay or busy backgrounds. Same `size` => same glyph height (advance is 8/7 wider). It is registered only when its PNG loads, so fall back to `sr_font` when `k.getFont(\"sr_font_outline\")` is null.");
  L.push("  - Atlases are stored at 2x (grid 14x22 / 16x22 texels, chars = printable ASCII 32..126, 16 per row) and loaded with a LINEAR filter so glyphs never drop rows/columns when the back buffer is below 1 px per game unit (phones, 1366x768).");
  L.push("  - `size` = design cell height (11; cap height = 8/11 of size). 1 design px = size/11 game units. Readable sizes: 11-12 minimum for body/HUD, 16-22 for headings, 33+ for titles. Below 11 the 1px strokes blur (never below 9). Multiples of 11 are pixel-perfect when the back buffer is at 1x.");
  L.push("  - Text width per char = size * 7/11 (sr_font) or size * 8/11 (sr_font_outline). Glyph test sheet: `assets_original/preview/font_test.png`.");
  L.push("- Audio: every SfxId / MusicId is runtime synth (`synth:<id>`), see src/assets/sfx.ts and music.ts.");
  L.push("");
  const groups = [...new Set(reg.items.map((i) => i.group))];
  for (const g of groups) {
    L.push(`## ${g}`);
    L.push("");
    L.push("| key | frame | frames | fps |");
    L.push("|---|---|---|---|");
    for (const it of reg.items.filter((i) => i.group === g)) L.push(`| \`${it.key}\` | ${it.w}x${it.h} | ${it.frames.length} | ${it.frames.length > 1 ? it.fps ?? 8 : "-"} |`);
    L.push("");
  }
  L.push("## Sounds");
  L.push("");
  L.push("SFX: " + manifest.sounds.filter((s) => s.kind === "sfx").map((s) => "`" + s.key + "`").join(", "));
  L.push("");
  L.push("Music: " + manifest.sounds.filter((s) => s.kind === "music").map((s) => "`" + s.key + "`").join(", "));
  L.push("");
  L.push("## Merging a Kenney Pixel Shmup pack (optional)");
  L.push("");
  L.push("kenney.nl blocks scripted downloads, so the build never fetches it. To use it: download the pack by hand,");
  L.push("unzip into `assets_original/kenney-pixel-shmup/`, create `assets_original/kenney-pixel-shmup/map.json`");
  L.push('mapping our keys to pack files, e.g. `{ "enemy_fighter_basic": ["Ships/ship_0001.png", "Ships/ship_0002.png"] }`,');
  L.push("then run `npm run art`. Mapped frames are centred into our frame size (`scripts/art/merge_kenney.mjs`); unmapped keys keep the original art.");
  L.push("Add the pack (CC0, Kenney, https://kenney.nl/assets/pixel-shmup) to ASSET_CREDITS.md.");
  L.push("");
  return L.join("\n");
}

function contactSheet(reg, group, scale = 2) {
  const items = reg.items.filter((i) => !group || i.group === group);
  const W = group ? 900 : 1600;
  const pad = 6;
  // layout rows
  let x = pad, y = pad, rowH = 0;
  const pos = [];
  for (const it of items) {
    const n = Math.min(it.frames.length, 8);
    const w = Math.max(it.w * n * scale + (n - 1) * 2, it.key.length * 6) + pad;
    const h = it.h * scale + 12 + pad;
    if (x + w > W) {
      x = pad;
      y += rowH;
      rowH = 0;
    }
    pos.push([it, x, y, n]);
    x += w;
    rowH = Math.max(rowH, h);
  }
  const H = y + rowH + pad;
  const img = new Img(W, H);
  // checker-ish dark background to judge outlines + contrast
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) img.set(xx, yy, ((xx >> 3) + (yy >> 3)) & 1 ? [44, 52, 72, 255] : [36, 42, 60, 255]);
  for (const [it, px, py, n] of pos) {
    for (let f = 0; f < n; f++) img.blit(upscale(it.frames[f], scale), px + f * (it.w * scale + 2), py);
    drawText(img, it.key, px, py + it.h * scale + 2, P.G4, 1);
  }
  return img;
}

main();
