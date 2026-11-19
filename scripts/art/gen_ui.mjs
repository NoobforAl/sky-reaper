// UI sprites (panel, button, icons, heart/shield/bomb, medals, logo) + bitmap font `sr_font`.
import { Img, Mask, P, RAMP, shade, outline, mix } from "./lib.mjs";

// ------------------------------------------------------------------ font (5x7 glyphs, 7x9 cells with 1px outline)
const G = {
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  '"': [".#.#.", ".#.#.", ".....", ".....", ".....", ".....", "....."],
  "#": [".#.#.", "#####", ".#.#.", ".#.#.", "#####", ".#.#.", "....."],
  $: ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", ".#.##", "#..##"],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
  "'": ["..#..", "..#..", ".....", ".....", ".....", ".....", "....."],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
  "*": [".....", "..#..", "#.#.#", ".###.", "#.#.#", "..#..", "....."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  ",": [".....", ".....", ".....", ".....", ".##..", "..#..", ".#..."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  "/": ["....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."],
  0: [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  3: ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  4: ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  5: ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  6: [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  7: ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  9: [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", "..#..", ".#..."],
  "<": ["...#.", "..#..", ".#...", "#....", ".#...", "..#..", "...#."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  ">": [".#...", "..#..", "...#.", "....#", "...#.", "..#..", ".#..."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "@": [".###.", "#...#", "#.###", "#.#.#", "#.###", "#....", ".###."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "[": [".###.", ".#...", ".#...", ".#...", ".#...", ".#...", ".###."],
  "\\": ["#....", ".#...", ".#...", "..#..", "...#.", "...#.", "....#"],
  "]": [".###.", "...#.", "...#.", "...#.", "...#.", "...#.", ".###."],
  "^": ["..#..", ".#.#.", "#...#", ".....", ".....", ".....", "....."],
  _: [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
  "`": [".#...", "..#..", ".....", ".....", ".....", ".....", "....."],
  a: [".....", ".....", ".###.", "....#", ".####", "#...#", ".####"],
  b: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "####."],
  c: [".....", ".....", ".###.", "#....", "#....", "#...#", ".###."],
  d: ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
  e: [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
  f: ["..##.", ".#...", ".#...", "###..", ".#...", ".#...", ".#..."],
  g: [".....", ".####", "#...#", "#...#", ".####", "....#", ".###."],
  h: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#"],
  i: ["..#..", ".....", ".##..", "..#..", "..#..", "..#..", ".###."],
  j: ["...#.", ".....", "..##.", "...#.", "...#.", "#..#.", ".##.."],
  k: ["#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#."],
  l: [".##..", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  m: [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#"],
  n: [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"],
  o: [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
  p: [".....", "####.", "#...#", "#...#", "####.", "#....", "#...."],
  q: [".....", ".####", "#...#", "#...#", ".####", "....#", "....#"],
  r: [".....", ".....", "#.##.", "##..#", "#....", "#....", "#...."],
  s: [".....", ".....", ".####", "#....", ".###.", "....#", "####."],
  t: [".#...", ".#...", "###..", ".#...", ".#...", ".#..#", "..##."],
  u: [".....", ".....", "#...#", "#...#", "#...#", "#..##", ".##.#"],
  v: [".....", ".....", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  w: [".....", ".....", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  x: [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  y: [".....", "#...#", "#...#", "#...#", ".####", "....#", ".###."],
  z: [".....", ".....", "#####", "...#.", "..#..", ".#...", "#####"],
  "{": ["...##", "..#..", "..#..", ".#...", "..#..", "..#..", "...##"],
  "|": ["..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  "}": ["##...", "..#..", "..#..", "...#.", "..#..", "..#..", "##..."],
  "~": [".....", ".....", ".#...", "#.#.#", "...#.", ".....", "....."],
};

let CHARS = "";
for (let c = 32; c < 127; c++) CHARS += String.fromCharCode(c);
export const FONT_INFO = { gridW: 7, gridH: 9, chars: CHARS };

function glyph(ch) {
  return G[ch] ?? G[ch.toUpperCase()] ?? G["?"];
}

/** sr_font.png: 16 columns x 6 rows of 7x9 cells, white glyph + dark outline (tintable by drawText color). */
export function genFont() {
  const cols = 16;
  const rows = Math.ceil(CHARS.length / cols);
  const img = new Img(cols * 7, rows * 9);
  [...CHARS].forEach((ch, i) => {
    const ox = (i % cols) * 7, oy = Math.floor(i / cols) * 9;
    const cell = new Img(7, 9);
    const g = glyph(ch);
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (g[y][x] === "#") cell.set(x + 1, y + 1, P.W);
    // subtle bottom shading on glyph strokes for a 16-bit feel
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (g[y][x] === "#" && y >= 5) cell.set(x + 1, y + 1, P.G4);
    outline(cell, P.K, true);
    img.blit(cell, ox, oy);
  });
  return img;
}

/** draw plain text into an Img (used for contact-sheet labels and the logo). */
export function drawText(img, text, x, y, color = P.W, scale = 1) {
  let cx = x;
  for (const ch of text) {
    const g = glyph(ch);
    for (let gy = 0; gy < 7; gy++)
      for (let gx = 0; gx < 5; gx++)
        if (g[gy][gx] === "#") for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) img.set(cx + gx * scale + sx, y + gy * scale + sy, color);
    cx += 6 * scale;
  }
  return cx;
}

// ------------------------------------------------------------------ helpers
const img = (w, h) => new Img(w, h);
function dome(im, cx, cy, rx, ry, ramp) {
  shade(im, new Mask(im.w, im.h).ellipse(cx, cy, rx, ry), ramp, "dome");
}

// ------------------------------------------------------------------ icons (16x16)
export function weaponIcon(id) {
  const im = img(16, 16);
  const m = () => new Mask(16, 16);
  switch (id) {
    case "vulcan": {
      // one big cartridge flying up-right (copper ogive tip, brass case, dark rim) + speed streaks: reads as
      // "gun round" and can never be mistaken for a pause "||" glyph
      const A = [2.6, 13.4];
      const d = [Math.SQRT1_2, -Math.SQRT1_2];
      const n = [Math.SQRT1_2, Math.SQRT1_2];
      const at = (u, v) => [A[0] + d[0] * u + n[0] * v, A[1] + d[1] * u + n[1] * v];
      const quad = (u0, u1, w) => [at(u0, -w), at(u1, -w), at(u1, w), at(u0, w)];
      shade(im, m().poly(quad(1.4, 9.4, 2.5)), RAMP.gold, "bevel");
      shade(im, m().poly(quad(0, 1.6, 2.9)), RAMP.dsteel, "bevel");
      shade(im, m().poly([at(9.2, -2.3), at(11.6, -2.0), at(13.4, -1.1), at(14.6, 0), at(13.4, 1.1), at(11.6, 2.0), at(9.2, 2.3)]), [P.R1, P.T1, P.T2, P.T3], "bevel");
      // crimp groove between case and bullet
      for (let v = -2; v <= 2; v++) {
        const [x, y] = at(9.3, v);
        im.paint(Math.round(x), Math.round(y), P.Y0);
      }
      // highlights along the lit edge
      for (const u of [3, 4.5, 6, 7.5]) {
        const [x, y] = at(u, -1.3);
        im.paint(Math.round(x), Math.round(y), P.Y3);
      }
      { const [x, y] = at(11.5, -1); im.paint(Math.round(x), Math.round(y), P.T3); }
      // speed streaks behind the round
      for (const [x, y] of [[1, 6], [2, 5], [10, 15], [11, 14]]) im.set(x, y, P.Y2);
      break;
    }
    case "spread":
      for (const [x, y] of [[7.5, 3], [3, 6], [12, 6], [1.5, 11], [13.5, 11]]) dome(im, x + 0.5, y + 0.5, 1.8, 1.8, RAMP.cyan);
      dome(im, 8, 12, 2.2, 2.2, RAMP.cyan);
      break;
    case "homing": {
      const mm = m().capsule(4, 13, 11, 4, 1.4);
      shade(im, mm, RAMP.lsteel, "bevel");
      im.set(11, 3, P.R2); im.set(12, 4, P.R2); im.set(11, 4, P.R1);
      im.set(3, 14, P.Y2); im.set(2, 15, P.Y1); im.set(4, 14, P.Y3);
      // curved trail
      for (const [x, y] of [[2, 12], [1, 10], [1, 8]]) im.set(x, y, P.G3);
      break;
    }
    case "laser":
      shade(im, m().rect(6, 0, 4, 16), RAMP.cyan, "cylH");
      for (let y = 0; y < 16; y++) im.set(7, y, P.W), im.set(8, y, P.C2);
      break;
    case "bomb":
      dome(im, 8, 9, 4.2, 5, RAMP.dsteel);
      shade(im, m().poly([[5.5, 2], [10.5, 2], [9.5, 5], [6.5, 5]]), RAMP.steel, "bevel");
      im.set(8, 14, P.Y1);
      break;
    case "rocket":
      for (const x of [4, 10]) {
        shade(im, m().rect(x, 3, 3, 9), RAMP.lsteel, "bevel");
        im.set(x + 1, 2, P.R2);
        im.set(x, 3, P.R1); im.set(x + 2, 3, P.R1);
        im.set(x + 1, 12, P.Y2); im.set(x + 1, 13, P.Y1);
      }
      break;
    case "pmissile": {
      shade(im, m().rect(7, 3, 3, 10), RAMP.steel, "bevel");
      im.set(8, 2, P.R2);
      shade(im, m().poly([[6, 10], [11, 10], [12, 13], [5, 13]]), RAMP.steel, "bevel");
      // crosshair
      for (const [x, y] of [[1, 1], [2, 1], [1, 2], [14, 1], [13, 1], [14, 2], [1, 14], [1, 13], [2, 14], [14, 14], [13, 14], [14, 13]]) im.set(x, y, P.M2);
      break;
    }
    case "heavy":
      dome(im, 8, 8.5, 6, 6.5, RAMP.dsteel);
      for (let x = 3; x < 13; x++) im.paint(x, 8, P.Y2), im.paint(x, 9, P.Y1);
      im.set(8, 1, P.G3); im.set(7, 1, P.G3); im.set(8, 0, P.G2);
      break;
    case "flare":
      for (let a = 0; a < 8; a++) {
        const r = (a * Math.PI) / 4;
        for (let d = 2; d < 7; d++) im.set(Math.round(8 + Math.cos(r) * d), Math.round(8 + Math.sin(r) * d), d < 4 ? P.Y3 : P.Y1);
      }
      dome(im, 8.5, 8.5, 2.5, 2.5, RAMP.gold);
      im.set(8, 8, P.W);
      break;
  }
  outline(im);
  return im;
}

export function heart() {
  const im = img(12, 12);
  const m = new Mask(12, 12).ellipse(4, 4.5, 3, 3).ellipse(8, 4.5, 3, 3).poly([[1.2, 5.5], [10.8, 5.5], [6, 11]]);
  shade(im, m, RAMP.red, "dome");
  im.set(3, 3, P.W);
  outline(im);
  return im;
}
export function shieldIcon() {
  const im = img(12, 12);
  const m = new Mask(12, 12).poly([[1.5, 1.5], [10.5, 1.5], [10.5, 6], [6, 11], [1.5, 6]]);
  shade(im, m, RAMP.sky, "bevel");
  for (let y = 2; y < 10; y++) im.paint(6, y, P.B1);
  im.set(3, 3, P.W);
  outline(im);
  return im;
}
export function bombIcon() {
  const im = img(12, 12);
  shade(im, new Mask(12, 12).ellipse(6, 7, 3.6, 4.2), RAMP.dsteel, "dome");
  shade(im, new Mask(12, 12).poly([[3.5, 0.5], [8.5, 0.5], [7.5, 3.5], [4.5, 3.5]]), RAMP.steel, "bevel");
  im.paint(6, 7, P.Y2);
  im.paint(5, 7, P.Y1);
  im.paint(7, 7, P.Y1);
  outline(im);
  return im;
}

export function medal(kind) {
  const ramps = { bronze: [P.T0, P.T1, P.T2, P.T3], silver: RAMP.lsteel, gold: RAMP.gold, ace: [P.M0, P.M1, P.C2, P.W] };
  const ribbon = { bronze: [P.R1, P.R2], silver: [P.B1, P.B2], gold: [P.R1, P.Y2], ace: [P.K, P.M1] };
  const im = img(16, 20);
  // ribbon (V)
  for (let y = 0; y < 8; y++) {
    for (let x = 3 + Math.floor(y / 2); x < 7 + Math.floor(y / 2); x++) im.set(x, y, ribbon[kind][x % 2]);
    for (let x = 9 - Math.floor(y / 2); x < 13 - Math.floor(y / 2); x++) im.set(x, y, ribbon[kind][(x + 1) % 2]);
  }
  const m = new Mask(16, 20);
  if (kind === "ace") m.poly([[8, 6], [10, 10.5], [15, 11], [11.2, 14.2], [12.5, 19.5], [8, 16.6], [3.5, 19.5], [4.8, 14.2], [1, 11], [6, 10.5]]);
  else m.ellipse(8, 13, 5.5, 5.5);
  shade(im, m, ramps[kind], kind === "ace" ? "bevel" : "dome");
  if (kind !== "ace") {
    // star emboss
    const s = new Mask(16, 20).poly([[8, 9.5], [9, 12], [11.5, 12.2], [9.6, 13.8], [10.2, 16.4], [8, 15], [5.8, 16.4], [6.4, 13.8], [4.5, 12.2], [7, 12]]);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 16; x++) if (s.has(x, y)) im.set(x, y, ramps[kind][x + y < 22 ? 3 : 1]);
  } else im.set(8, 12, P.W);
  outline(im);
  return im;
}

/** 24x24 9-slice panel (border 8): dark steel plate with rivets + gold trim */
export function panel() {
  const im = img(24, 24);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const edge = Math.min(x, y, 23 - x, 23 - y);
      let c = [18, 20, 32, 235];
      if (edge === 0) c = P.K;
      else if (edge === 1) c = x === 1 || y === 1 ? P.G3 : P.G1;
      else if (edge === 2) c = P.G0;
      im.set(x, y, c);
    }
  for (const [x, y] of [[4, 4], [19, 4], [4, 19], [19, 19]]) {
    im.set(x, y, P.G3);
    im.set(x + 1, y + 1, P.K);
  }
  return im;
}
/** 48x16 button, 3 frames: normal / hover / pressed (9-slice border 5) */
export function button(state) {
  const im = img(48, 16);
  const ramp = state === 1 ? RAMP.gold : state === 2 ? [P.Y0, P.Y0, P.Y1, P.Y2] : RAMP.steel;
  shade(im, new Mask(48, 16).rect(1, 1, 46, 14), ramp, "bevel", { grad: false });
  for (let x = 3; x < 45; x++) im.paint(x, 13, ramp[0]);
  // chevrons at edges
  im.set(3, 7, ramp[3]); im.set(4, 8, ramp[3]); im.set(3, 9, ramp[3]);
  im.set(44, 7, ramp[3]); im.set(43, 8, ramp[3]); im.set(44, 9, ramp[3]);
  outline(im);
  for (const [x, y] of [[0, 0], [47, 0], [0, 15], [47, 15]]) im.clear(x, y);
  return im;
}

/** HUD missile-warning arrow (points UP; rotate in code) 12x12 */
export function arrow(frame) {
  const im = img(12, 12);
  const m = new Mask(12, 12).poly([[6, 0.5], [11.5, 7], [8, 7], [8, 11.5], [4, 11.5], [4, 7], [0.5, 7]]);
  shade(im, m, frame ? [P.R1, P.R2, P.R3, P.W] : RAMP.red, "bevel");
  outline(im);
  return im;
}

/** Title logo 176x64: "SKY REAPER" over wings with a reaper-scythe chevron */
export function logo() {
  const W = 176, H = 64;
  const im = img(W, H);
  // wings emblem
  // layered feathers, longest on top; drawn bottom-up so upper feathers overlap
  const feathers = [
    [[96, 40], [128, 36], [146, 34], [132, 42], [96, 48]],
    [[94, 34], [136, 26], [160, 22], [142, 33], [94, 42]],
    [[92, 28], [140, 16], [170, 10], [150, 24], [92, 36]],
    [[90, 22], [130, 10], [174, 2], [156, 14], [90, 30]],
  ];
  const rampsF = [RAMP.dsteel, RAMP.steel, RAMP.steel, RAMP.lsteel];
  feathers.forEach((pts, i) => {
    const m = new Mask(W, H).poly(pts, true);
    shade(im, m, rampsF[i], "bevel", { grad: false });
    // feather shaft line
    const [a, , c] = pts;
    for (let t = 0.15; t < 0.9; t += 0.02) {
      const x = Math.round(a[0] + (c[0] - a[0]) * t), y = Math.round(a[1] + 2 + (c[1] - a[1]) * t);
      im.paint(x, y, rampsF[i][0]);
      im.paint(W - 1 - x, y, rampsF[i][0]);
    }
  });
  // central shield
  const sh = new Mask(W, H).poly([[74, 18], [102, 18], [102, 40], [88, 52], [74, 40]]);
  shade(im, sh, RAMP.red, "bevel");
  const sk = new Mask(W, H).poly([[81, 22], [95, 22], [95, 36], [88, 44], [81, 36]]);
  shade(im, sk, RAMP.dsteel, "bevel");
  // scythe chevron
  for (let i = 0; i < 9; i++) {
    im.set(84 + i, 28 + Math.abs(4 - i), P.Y2);
    im.set(84 + i, 29 + Math.abs(4 - i), P.Y1);
  }
  outline(im);
  // text: two-tone gold, scale 2, with dark plate behind
  const text = "SKY REAPER";
  const tw = text.length * 12 - 2;
  const tx = Math.floor((W - tw) / 2), ty = 40;
  const t = img(W, H);
  drawText(t, text, tx, ty, P.Y2, 2);
  // vertical gradient: top rows bright, bottom darker
  const t2 = t.map((c, x, y) => (y < ty + 4 ? P.Y3 : y < ty + 9 ? P.Y2 : P.Y1));
  // drop shadow
  const sh2 = t.map(() => P.R1);
  im.blit(sh2, 1, 2);
  outline(t2, P.K, true);
  im.blit(t2, 0, 0);
  return im;
}

export function genUi(reg, extras = {}) {
  reg.add("ui_panel", panel(), { group: "ui" });
  reg.add("ui_button", [0, 1, 2].map(button), { group: "ui", fps: 0, loop: false });
  for (const w of ["vulcan", "spread", "homing", "laser", "bomb", "rocket", "pmissile", "heavy", "flare"]) reg.add("ui_icon_" + w, weaponIcon(w), { group: "ui" });
  reg.add("ui_heart", heart(), { group: "ui" });
  reg.add("ui_shield", shieldIcon(), { group: "ui" });
  reg.add("ui_bomb", bombIcon(), { group: "ui" });
  for (const k of ["bronze", "silver", "gold", "ace"]) reg.add("ui_medal_" + k, medal(k), { group: "ui" });
  reg.add("ui_arrow", [arrow(0), arrow(1)], { group: "ui", fps: 6 });
  reg.add("ui_logo", logo(), { group: "ui" });
  void extras;
  void mix;
}
