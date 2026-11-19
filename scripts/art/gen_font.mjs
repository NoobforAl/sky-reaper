// SKY REAPER bitmap fonts (original design, CC0 like the rest of the generated art).
//
// Design grid: 5px-wide glyphs, cap height 8, x-height 6, 2px descenders, true lowercase. Every glyph sits in a
// 7x11 design cell (1px outline ring around a 5x10 glyph box, open at the bottom for descenders). Distinct shapes for the classic pixel-font traps:
// O vs 0 (slashed zero) vs D (square corners) vs Q, U vs V (V tapers in the last 3 rows) vs J, C vs G (G has a bar),
// I vs l vs 1, B vs 8, S vs 5, Z vs 2, p/q/g/y/j real descenders.
//
// The PNG atlases are stored at ATLAS_SCALE x (every design pixel = 2x2 texels) and loaded with a LINEAR texture
// filter: KAPLAY's back buffer is often below 1 buffer px per game unit (phones, 1366x768), and nearest sampling
// then drops whole rows/columns ("WEAPON" -> "WEAPUN"). 2x blocks + bilinear give every 1px stroke a 1.5 design-px
// sampling footprint, so strokes survive down to ~0.67 buffer px per design px (4x blocks would NOT: the bilinear
// footprint shrinks to 1.125 px and strokes drop again); magnified glyphs keep a ~half-design-px soft edge. Minified glyphs blur
// slightly instead of losing strokes, and magnified glyphs stay sharp-edged.
//
//  sr_font          7x11 design cell, white glyph + 1px dark 8-neighbour outline (drop-in for the old sr_font)
//  sr_font_outline  8x11 design cell, white glyph + outline + extra 1px drop shadow down-right (HUD over busy art)
import { Img, P, outline } from "./lib.mjs";

export const ATLAS_SCALE = 2;
// design cell height: 1px outline row + 8 cap rows + 2 descender rows (descenders run to the cell edge, so the
// glyph fills 8/11 of the text size - nearly the old 7/9 - and common UI sizes 10-12 stay at ~1 game px per design px)
const GH = 11;

// rows 0..7 = cap box (baseline under row 7), rows 8..9 = descender
const G = {
  " ": [],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  '"': [".#.#.", ".#.#.", ".#.#."],
  "#": [".....", ".#.#.", "#####", ".#.#.", ".#.#.", "#####", ".#.#.", "....."],
  $: ["..#..", ".####", "#.#..", ".###.", "..#.#", "..#.#", "####.", "..#.."],
  "%": ["##..#", "##..#", "...#.", "..#..", "..#..", ".#...", "#..##", "#..##"],
  "&": [".##..", "#..#.", "#..#.", ".##..", "#.#.#", "#..#.", "#..#.", ".##.#"],
  "'": ["..#..", "..#..", "..#.."],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "...#.", "..#..", ".#..."],
  "*": [".....", "..#..", "#.#.#", ".###.", "#.#.#", "..#..", ".....", "....."],
  "+": [".....", ".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  ",": [".....", ".....", ".....", ".....", ".....", ".....", "..##.", "..##.", "..#..", ".#..."],
  "-": [".....", ".....", ".....", ".....", ".####", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".....", "..##.", "..##."],
  "/": ["....#", "....#", "...#.", "..#..", "..#..", ".#...", "#....", "#...."],
  0: [".###.", "#...#", "#..##", "#.#.#", "#.#.#", "##..#", "#...#", ".###."],
  1: ["..#..", ".##..", "#.#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  3: [".###.", "#...#", "....#", "..##.", "....#", "....#", "#...#", ".###."],
  4: ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#.", "...#."],
  5: ["#####", "#....", "#....", "####.", "....#", "....#", "#...#", ".###."],
  6: ["..##.", ".#...", "#....", "####.", "#...#", "#...#", "#...#", ".###."],
  7: ["#####", "....#", "...#.", "...#.", "..#..", "..#..", "..#..", "..#.."],
  8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", "#...#", ".###."],
  9: [".###.", "#...#", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  ":": [".....", ".....", "..##.", "..##.", ".....", ".....", "..##.", "..##."],
  ";": [".....", ".....", "..##.", "..##.", ".....", ".....", "..##.", "..##.", "..#..", ".#..."],
  "<": [".....", "...#.", "..#..", ".#...", "#....", ".#...", "..#..", "...#."],
  "=": [".....", ".....", "#####", ".....", ".....", "#####", ".....", "....."],
  ">": [".....", ".#...", "..#..", "...#.", "....#", "...#.", "..#..", ".#..."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", "..#..", ".....", "..#.."],
  "@": [".###.", "#...#", "#.###", "#.#.#", "#.#.#", "#.##.", "#....", ".####"],
  A: [".###.", "#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#....", "#...#", ".###."],
  D: ["###..", "#..#.", "#...#", "#...#", "#...#", "#...#", "#..#.", "###.."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#....", "#..##", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#.#.#", "#..##", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".###.", "#...#", "#....", ".###.", "....#", "....#", "#...#", ".###."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#....", "#####"],
  "[": [".###.", ".#...", ".#...", ".#...", ".#...", ".#...", ".#...", ".###."],
  "\\": ["#....", "#....", ".#...", "..#..", "..#..", "...#.", "....#", "....#"],
  "]": [".###.", "...#.", "...#.", "...#.", "...#.", "...#.", "...#.", ".###."],
  "^": ["..#..", ".#.#.", "#...#"],
  _: [".....", ".....", ".....", ".....", ".....", ".....", ".....", ".....", "#####"],
  "`": [".#...", "..#.."],
  a: [".....", ".....", ".###.", "....#", ".####", "#...#", "#..##", ".##.#"],
  b: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#", "####."],
  c: [".....", ".....", ".###.", "#...#", "#....", "#....", "#...#", ".###."],
  d: ["....#", "....#", ".####", "#...#", "#...#", "#...#", "#...#", ".####"],
  e: [".....", ".....", ".###.", "#...#", "#####", "#....", "#...#", ".###."],
  f: ["..##.", ".#..#", ".#...", "####.", ".#...", ".#...", ".#...", ".#..."],
  g: [".....", ".....", ".####", "#...#", "#...#", "#...#", "#...#", ".####", "....#", ".###."],
  h: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#", "#...#"],
  i: ["..#..", ".....", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  j: ["...#.", ".....", "..##.", "...#.", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  k: ["#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  l: [".##..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..##."],
  m: [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#", "#...#"],
  n: [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#", "#...#"],
  o: [".....", ".....", ".###.", "#...#", "#...#", "#...#", "#...#", ".###."],
  p: [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#", "####.", "#....", "#...."],
  q: [".....", ".....", ".####", "#...#", "#...#", "#...#", "#...#", ".####", "....#", "....#"],
  r: [".....", ".....", "#.##.", "##..#", "#....", "#....", "#....", "#...."],
  s: [".....", ".....", ".####", "#....", ".###.", "....#", "....#", "####."],
  t: [".#...", ".#...", "####.", ".#...", ".#...", ".#...", ".#..#", "..##."],
  u: [".....", ".....", "#...#", "#...#", "#...#", "#...#", "#..##", ".##.#"],
  v: [".....", ".....", "#...#", "#...#", "#...#", ".#.#.", ".#.#.", "..#.."],
  w: [".....", ".....", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  x: [".....", ".....", "#...#", ".#.#.", "..#..", "..#..", ".#.#.", "#...#"],
  y: [".....", ".....", "#...#", "#...#", "#...#", "#...#", "#...#", ".####", "....#", ".###."],
  z: [".....", ".....", "#####", "...#.", "..#..", ".#...", "#....", "#####"],
  "{": ["...##", "..#..", "..#..", ".#...", "..#..", "..#..", "..#..", "...##"],
  "|": ["..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  "}": ["##...", "..#..", "..#..", "...#.", "..#..", "..#..", "..#..", "##..."],
  "~": [".....", ".....", ".....", ".#...", "#.#.#", "...#.", ".....", "....."],
};

let CHARS = "";
for (let c = 32; c < 127; c++) CHARS += String.fromCharCode(c);
export { CHARS };

const COLS = 16;

/** one design-resolution cell (1x) */
function glyphCell(ch, w, shadow) {
  const cell = new Img(w, GH);
  const g = G[ch] ?? G["?"];
  for (let y = 0; y < g.length; y++) for (let x = 0; x < 5; x++) if (g[y][x] === "#") cell.set(x + 1, y + 1, P.W);
  outline(cell, P.K, true);
  if (shadow) {
    const src = cell.clone();
    for (let y = 0; y < GH; y++) for (let x = 0; x < w; x++) if (src.a(x, y) > 0 && src.a(x + 1, y + 1) === 0) cell.set(x + 1, y + 1, P.K);
  }
  return cell;
}

function atlas(w, shadow, scale) {
  const rows = Math.ceil(CHARS.length / COLS);
  const img = new Img(COLS * w * scale, rows * GH * scale);
  [...CHARS].forEach((ch, i) => {
    const c = glyphCell(ch, w, shadow);
    const ox = (i % COLS) * w * scale, oy = Math.floor(i / COLS) * GH * scale;
    for (let y = 0; y < c.h * scale; y++)
      for (let x = 0; x < c.w * scale; x++) {
        const p = c.get(Math.floor(x / scale), Math.floor(y / scale));
        if (p) img.set(ox + x, oy + y, p);
      }
  });
  return img;
}

/** returns [{ key, file, img, info }] - info is the manifest grid block (gridW/gridH in atlas texels) */
export function genFonts() {
  const S = ATLAS_SCALE;
  return [
    { key: "sr_font", file: "sr_font.png", img: atlas(7, false, S), info: { gridW: 7 * S, gridH: GH * S, chars: CHARS, filter: "linear", designW: 7, designH: GH } },
    { key: "sr_font_outline", file: "sr_font_outline.png", img: atlas(8, true, S), info: { gridW: 8 * S, gridH: GH * S, chars: CHARS, filter: "linear", designW: 8, designH: GH } },
  ];
}

/** 1x design atlas (for previews) */
export function fontDesignAtlas(outlined = false) {
  return atlas(outlined ? 8 : 7, outlined, 1);
}

// ------------------------------------------------------------------ preview: emulate the runtime draw
// KAPLAY draws each glyph quad at (size / gridH) scale and the GPU point-samples the ATLAS_SCALE x atlas with a
// bilinear (LINEAR) filter at each buffer pixel centre. Emulated exactly here so the sheet shows what ships.
function renderText(out, text, x0, y0, size, color, outlined, buf = 1) {
  const w = outlined ? 8 : 7;
  const S = ATLAS_SCALE;
  const k = (size / GH) * buf; // buffer px per design px
  const cellW = w * k;
  let cx = x0;
  for (const ch of text) {
    const c = glyphCell(ch, w, outlined);
    const tex = (tx, ty) => {
      tx = Math.min(w * S - 1, Math.max(0, tx)); ty = Math.min(GH * S - 1, Math.max(0, ty)); // clamp to the cell
      const p = c.get(Math.floor(tx / S), Math.floor(ty / S));
      if (!p) return [0, 0, 0, 0];
      const t = p[0] > 128 ? color : p;
      return [t[0] * p[3] / 255, t[1] * p[3] / 255, t[2] * p[3] / 255, p[3] / 255]; // premultiplied
    };
    const px0 = Math.floor(cx), px1 = Math.ceil(cx + cellW), py1 = Math.ceil(y0 + size * buf);
    for (let py = y0; py < py1; py++)
      for (let px = px0; px < px1; px++) {
        const u = ((px + 0.5 - cx) / k) * S - 0.5, v = ((py + 0.5 - y0) / k) * S - 0.5;
        if (u < -0.5 || v < -0.5 || u > w * S - 0.5 || v > GH * S - 0.5) continue;
        const ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
        const q = [0, 0, 0, 0];
        for (const [ox, oy, wt] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
          const t = tex(ix + ox, iy + oy);
          for (let i = 0; i < 4; i++) q[i] += t[i] * wt;
        }
        if (q[3] <= 0) continue;
        const base = out.get(px, py);
        if (!base) continue;
        out.set(px, py, [0, 1, 2].map((i) => Math.round(base[i] * (1 - q[3]) + q[i])).concat(255));
      }
    cx += cellW;
  }
}

/** assets_original/preview/font_test.png: every printable glyph + the words reported broken, at runtime sizes */
export function fontTestSheet() {
  const W = 1100;
  const lines = [];
  const ascii = [];
  for (let i = 0; i < CHARS.length; i += 48) ascii.push(CHARS.slice(i, i + 48));
  const words = [
    "HOLD SPACE / J: GUNS   WEAPON  ORDNANCE  EVERY  IMPROVEMENTS",
    "O0 Q D  U V J  C G  I l 1 |  B 8  S 5  Z 2  p q g y j",
    "Shoot down every bomber. Upgrade your plane: +25% power!",
  ];
  const sizes = [8, 10, 12, 16, 24];
  let y = 8;
  for (const outlined of [false, true])
    for (const s of sizes) {
      for (const t of [...ascii, ...words]) {
        lines.push([t, y, s, outlined]);
        y += Math.ceil(s * 1.2);
      }
      y += 6;
    }
  // phone (390px CSS): the back buffer is 0.81 px per game unit -> worst realistic minification
  for (const s of [10, 12, 16]) {
    for (const t of words) {
      lines.push([t, y, s, false, 0.81]);
      y += Math.ceil(s * 1.2);
    }
    y += 6;
  }
  // 1x design atlases at 4x zoom
  const d0 = fontDesignAtlas(false), d1 = fontDesignAtlas(true);
  const atlasY = y + 8;
  const H = atlasY + d0.h * 4 + 12;
  const out = new Img(W, H);
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) out.set(xx, yy, xx < W / 2 ? [22, 30, 52, 255] : [70, 110, 150, 255]);
  for (const [t, ly, s, o, buf] of lines) {
    renderText(out, t, 8, ly, s, [255, 255, 255], o, buf ?? 1);
  }
  for (let yy = 0; yy < d0.h * 4; yy++)
    for (let xx = 0; xx < d0.w * 4; xx++) {
      const p = d0.get(xx >> 2, yy >> 2);
      if (p) out.set(8 + xx, atlasY + yy, p);
    }
  for (let yy = 0; yy < d1.h * 4; yy++)
    for (let xx = 0; xx < d1.w * 4 && 8 + d0.w * 4 + 16 + xx < W; xx++) {
      const p = d1.get(xx >> 2, yy >> 2);
      if (p) out.set(8 + d0.w * 4 + 16 + xx, atlasY + yy, p);
    }
  return out;
}
