// SKY REAPER per-chapter enemy aircraft colours (round 6, item 13).
// For every AIR enemy sprite key K (planes, helicopters, drones, incl. _bankl/_bankr and their _dmg strips) this adds a
// palette-swapped copy `K + "__" + biome` for each biome id of src/contracts/consts.ts BIOMES (= ChapterDef.biome).
// Only the airframe paint is remapped (master-palette families G/B/O/T on fully opaque pixels). Outline (K), cockpit
// glass (C), lights (R/Y/W), flames, rotor blur (translucent) and damage decals keep their colours, so silhouettes,
// cockpits and lights read the same in every chapter. Camo / splinter patterns are keyed to the sprite-local pixel
// position, so every animation and banking frame of one unit carries the same pattern. Bosses are excluded.
// All variants of one biome are packed into ONE atlas PNG (assets/sprites/air__<biome>.png; manifest entries carry
// x/y), so the 280 variants cost 5 requests and 5 texture uploads instead of 280.
import { P, hex } from "./lib.mjs";
import { ENEMY_AIR } from "./gen_air.mjs";

export const BIOME_IDS = ["ocean", "jungle", "desert", "arctic", "citadel"];

/** air unit ids that get biome paint (bosses and players are never touched) */
export const AIR_IDS = [...Object.keys(ENEMY_AIR), "helicopter", "gunship_light", "shield_drone"];

const R5 = (...h) => h.map(hex);

/**
 * Per-biome paint: 5-tone ramps (dark -> light).
 *  a  = main airframe (source families G and T)
 *  b  = secondary parts (source families O and B: pods, booms, armour panels)
 *  c  = pattern colour that replaces `a` inside the camo / splinter pattern
 *  pat(x, y, w, h) -> true where the pattern colour is used (sprite-local pixel coordinates)
 * Every ramp was checked against the biome ground (contact sheets in assets_original/preview/biome_air_*.png).
 */
const PAINT = {
  // navy grey-blue, light enough to stand off the deep-blue sea
  ocean: {
    a: R5("#2b3648", "#4a5a72", "#71839c", "#9fb0c4", "#d2dce8"),
    b: R5("#1f2a3c", "#34476a", "#4f6890", "#7590b6", "#a8bed8"),
    c: null,
    pat: null,
  },
  // olive drab with dark green blotches (yellow-leaning so it separates from the canopy greens)
  jungle: {
    a: R5("#3e3e1c", "#68692c", "#959840", "#c2c262", "#e8e4a4"),
    b: R5("#3e3220", "#62502e", "#8a7444", "#b09a62", "#d4c494"),
    c: R5("#16220f", "#1f3618", "#2c4c20", "#3e652c", "#58823c"),
    pat: (x, y) => blob(x, y, 4.5, 11) > 0.54,
    // round 7: faint pale-olive rim so the dark K outline does not merge with the dark canopy (lowest body/ground ratio)
    rim: { c: hex("#e8eaa0"), a: 120 },
  },
  // round 7 (R6-3): dark olive-drab airframe with dark-brown parts and near-black blotches, plus a 1px light sand rim
  // outside the outline. The old tan paint sat at the dunes' luminance and vanished over the brown rock patches; the
  // dark body now separates from the sand by value and the rim separates it from the rock / hardpan.
  desert: {
    a: R5("#1c1e10", "#33381c", "#4c532c", "#68703e", "#8c9458"),
    b: R5("#20160c", "#382816", "#503a22", "#6a4e30", "#8a6a44"),
    c: R5("#121208", "#1e200e", "#2c3016", "#3a4020", "#4c5430"),
    pat: (x, y) => blob(x, y, 5, 23) > 0.6,
    rim: { c: hex("#fff0c8"), a: 230 },
  },
  // white / light grey with angular dark-grey splinter
  arctic: {
    a: R5("#7c8794", "#b4bdc8", "#dce2e8", "#f2f5f8", "#ffffff"),
    b: R5("#3e4652", "#5c6676", "#7e8898", "#a2acba", "#c8d0da"),
    c: R5("#20262e", "#323a46", "#4a5462", "#646e7e", "#848e9e"),
    pat: (x, y) => splinter(x, y),
  },
  // dark steel airframe with red accents (secondary parts + wing tips / tail edge in red)
  citadel: {
    a: R5("#2a2d36", "#464b58", "#666d7e", "#8c94a6", "#bcc3d0"),
    b: R5("#1c1e26", "#30343e", "#4a505e", "#6a7282", "#9098a8"),
    c: R5("#5a1424", "#9a2232", "#c8303a", "#e04438", "#ff8a66"),
    pat: null, // accents are applied by edge rule below
    accent: true,
  },
};

// ------------------------------------------------------------------ patterns
function h2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** smooth value noise (not tileable; sprite-local) */
function blob(x, y, cell, seed) {
  const fx = x / cell, fy = y / cell;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = h2(ix, iy, seed), b = h2(ix + 1, iy, seed), c = h2(ix, iy + 1, seed), d = h2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** angular splinter: regions cut by a few slanted straight lines, alternating light/dark */
function splinter(x, y) {
  const u = Math.floor((x * 0.82 + y * 0.57) / 6.5);
  const v = Math.floor((x * -0.47 + y * 0.88 + 40) / 9);
  return h2(u, v, 97) > 0.55;
}

// ------------------------------------------------------------------ source palette lookup
/** exact master-palette colour -> [family ramp key, tone 0..1] for the airframe families we repaint */
const SRC = new Map();
{
  const fam = { G: ["G0", "G1", "G2", "G3", "G4"], B: ["B0", "B1", "B2", "B3"], O: ["O0", "O1", "O2", "O3"], T: ["T0", "T1", "T2", "T3"] };
  for (const [f, list] of Object.entries(fam))
    list.forEach((k, i) => {
      const c = P[k];
      // 4-tone families sit between G1 and G4 in brightness, map them onto tones 0.25..1
      const tone = list.length === 5 ? i / 4 : 0.25 + (i / 3) * 0.75;
      SRC.set((c[0] << 16) | (c[1] << 8) | c[2], [f === "G" || f === "T" ? "a" : "b", tone]);
    });
}

const pick = (ramp, tone) => ramp[Math.max(0, Math.min(4, Math.round(tone * 4)))];

/** citadel accent mask: body pixels within 2px of the left/right silhouette extremes (wing tips) or in the top 2 rows (tail edge; planes point down) */
function accentMask(img) {
  let x0 = img.w, x1 = -1, y0 = img.h;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const o = (y * img.w + x) * 4;
      if (img.d[o + 3] === 255 && !(img.d[o] === P.K[0] && img.d[o + 1] === P.K[1] && img.d[o + 2] === P.K[2])) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
      }
    }
  const span = x1 - x0;
  return (x, y) => span > 8 && (x <= x0 + 2 || x >= x1 - 2 || y <= y0 + 1);
}

function repaint(img, paint, accent) {
  const o = img.clone();
  const d = o.d;
  for (let y = 0; y < o.h; y++)
    for (let x = 0; x < o.w; x++) {
      const i = (y * o.w + x) * 4;
      if (d[i + 3] !== 255) continue; // rotor blur, glows: untouched
      const src = SRC.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      if (!src) continue; // outline, glass, lights, flames, decals
      const [role, tone] = src;
      let ramp = paint[role];
      if (accent && accent(x, y)) ramp = paint.c;
      else if (role === "a" && paint.pat && paint.pat(x, y, o.w, o.h)) ramp = paint.c;
      const c = pick(ramp, tone);
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
    }
  if (paint.rim) addRim(o, paint.rim);
  return o;
}

/** 1px rim outside the silhouette: fully transparent pixels 4-adjacent to an opaque pixel get the rim colour */
function addRim(img, rim) {
  const { w, h, d } = img;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] === 255;
  const hit = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] === 0 && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) hit.push((y * w + x) * 4);
  for (const i of hit) {
    d[i] = rim.c[0];
    d[i + 1] = rim.c[1];
    d[i + 2] = rim.c[2];
    d[i + 3] = rim.a;
  }
}

/** key matcher: enemy_<airId> + optional _bankl/_bankr + optional _dmg */
const KEY_RE = new RegExp("^enemy_(" + AIR_IDS.join("|") + ")(_bankl|_bankr)?(_dmg)?$");

/** Add the biome variants. Run after genAirEnemies + genEnemyAnims (needs the bank / dmg strips). */
export function genBiomeAir(reg) {
  const src = reg.items.filter((it) => KEY_RE.test(it.key));
  let n = 0;
  for (const it of src) {
    for (const b of BIOME_IDS) {
      const paint = PAINT[b];
      reg.add(it.key + "__" + b, it.frames.map((f) => repaint(f, paint, paint.accent ? accentMask(f) : null)), { fps: it.fps, loop: it.loop ?? true, group: "enemy_biome_" + b, atlas: "air__" + b });
      n++;
    }
  }
  return n;
}
