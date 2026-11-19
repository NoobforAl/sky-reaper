// Boss part sprites `boss_<id>_<part>` — the showpieces. All face DOWN (toward the player); rotating parts
// (turrets/cannons) point DOWN at angle 0 with their pivot at the sprite centre.
import { Img, Mask, P, RAMP, BIOME, shade, outline, vnoise, rng, mix } from "./lib.mjs";

const M = (w, h) => new Mask(w, h);
const A = (c, a) => [c[0], c[1], c[2], a];

/** panel seams + rivets over the opaque part of `m` */
/**
 * Armour plating over the opaque part of `m`: the area is split (seeded BSP) into large irregular plates; each plate
 * gets a 1px dark seam on its bottom/right, a lit lip on its top/left, corner rivets, the odd vent grille or access
 * hatch, and dithered weathering — reads as riveted hull armour rather than a brick wall.
 */
function plating(im, m, ramp, cw = 12, ch = 10, seed = 1) {
  const r = rng(seed);
  const b = m.bounds();
  const plates = [];
  const split = (x, y, w, h, depth) => {
    const canV = w >= cw * 2, canH = h >= ch * 2;
    if ((!canV && !canH) || (depth > 2 && r() < 0.28)) return plates.push([x, y, w, h]);
    const vert = canV && (!canH || (w / cw > h / ch ? r() < 0.75 : r() < 0.25));
    if (vert) {
      const s = Math.round(cw + r() * (w - 2 * cw));
      split(x, y, s, h, depth + 1);
      split(x + s, y, w - s, h, depth + 1);
    } else {
      const s = Math.round(ch + r() * (h - 2 * ch));
      split(x, y, w, s, depth + 1);
      split(x, y + s, w, h - s, depth + 1);
    }
  };
  split(b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, 0);
  const inM = (x, y) => m.has(x, y);
  for (const [px, py, pw, ph] of plates) {
    const x1 = px + pw - 1, y1 = py + ph - 1;
    // weathering inside the plate (dither toward shadow, streaks run down = toward the bow)
    for (let y = py + 1; y < y1; y++)
      for (let x = px + 1; x < x1; x++) {
        if (!inM(x, y)) continue;
        const n = vnoise(x, y * 0.5, 4, 4096, seed * 31 + 5);
        if (n > 0.74 && ((x * 7 + y * 3) & 3) === 0) im.set(x, y, ramp[0]);
        else if (n < 0.16 && ((x + y) & 1) === 0) im.set(x, y, ramp[2]);
      }
    // seams: dark on bottom/right, lit lip on top/left
    for (let x = px; x <= x1; x++) {
      if (inM(x, y1) && inM(x, y1 + 1)) im.set(x, y1, ramp[0]);
      if (inM(x, py) && inM(x, py - 1) && x < x1) im.set(x, py, ramp[2]);
    }
    for (let y = py; y <= y1; y++) {
      if (inM(x1, y) && inM(x1 + 1, y)) im.set(x1, y, ramp[0]);
      if (inM(px, y) && inM(px - 1, y) && y < y1) im.set(px, y, ramp[2]);
    }
    // corner rivets
    if (pw >= 8 && ph >= 8)
      for (const [rx, ry] of [[px + 2, py + 2], [x1 - 2, py + 2], [px + 2, y1 - 2], [x1 - 2, y1 - 2]])
        if (inM(rx, ry) && inM(rx + 1, ry + 1)) { im.set(rx, ry, ramp[3]); im.set(rx + 1, ry + 1, ramp[0]); }
    // occasional vent grille / hatch
    const roll = r();
    if (pw >= 12 && ph >= 10 && roll < 0.18) {
      const vx = px + Math.floor(pw / 2) - 3, vy = py + Math.floor(ph / 2) - 2;
      for (let j = 0; j < 4; j += 2) for (let i = 0; i < 6; i++) if (inM(vx + i, vy + j)) { im.set(vx + i, vy + j, ramp[0]); im.set(vx + i, vy + j + 1, ramp[2]); }
    } else if (pw >= 10 && ph >= 10 && roll < 0.3) {
      const hx = px + Math.floor(pw / 2) - 2, hy = py + Math.floor(ph / 2) - 2;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (inM(hx + i, hy + j)) im.set(hx + i, hy + j, i === 3 || j === 3 ? ramp[2] : i === 0 || j === 0 ? ramp[0] : ramp[1]);
    }
  }
}

function hazard(im, x0, y0, w, h, c1 = P.Y2, c2 = P.K) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) im.set(x, y, ((x + y) >> 1) % 2 ? c1 : c2);
}

/** radial glow ball (cores) */
function glow(im, cx, cy, r, cols, pulse = 0) {
  for (let y = 0; y < im.h; y++)
    for (let x = 0; x < im.w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d > 1) continue;
      // light from the top-left: shift centre of the hot spot
      const dh = Math.hypot(x + 0.5 - (cx - r * 0.25), y + 0.5 - (cy - r * 0.25)) / r;
      const v = 1 - dh + pulse * 0.15;
      const i = v > 0.75 ? 3 : v > 0.45 ? 2 : v > 0.15 ? 1 : 0;
      im.set(x, y, cols[i]);
    }
}

function barrelDown(im, cx, y0, y1, w, ramp = RAMP.steel, muzzle = true) {
  shade(im, M(im.w, im.h).rect(Math.round(cx - w / 2), y0, w, y1 - y0 + 1), ramp, "cyl");
  if (muzzle) {
    shade(im, M(im.w, im.h).rect(Math.round(cx - w / 2) - 1, y1 - 2, w + 2, 3), RAMP.dsteel, "bevel", { grad: false });
    for (let x = Math.round(cx - w / 2); x < Math.round(cx - w / 2) + w; x++) im.set(x, y1, P.K);
  }
}

/** generic rotating turret: round armoured housing + barrels pointing down */
function turret(S, ramp, barrels, len, bw, accent = P.R2) {
  const im = new Img(S, S);
  const c = S / 2;
  const sp = barrels > 1 ? Math.max(bw + 1, S * 0.18) : 0;
  for (let i = 0; i < barrels; i++) {
    const bx = c + (i - (barrels - 1) / 2) * sp;
    barrelDown(im, bx, Math.round(c), Math.min(S - 1, Math.round(c + len)), bw);
  }
  const R = S * 0.32;
  const hm = M(S, S).poly([[c - R, c - R * 0.9], [c + R, c - R * 0.9], [c + R * 1.15, c + R * 0.3], [c + R * 0.6, c + R], [c - R * 0.6, c + R], [c - R * 1.15, c + R * 0.3]]);
  shade(im, hm, ramp, "bevel");
  shade(im, M(S, S).ellipse(c, c - R * 0.15, R * 0.55, R * 0.5), ramp, "dome");
  im.set(Math.round(c - R * 0.7), Math.round(c - R * 0.6), accent);
  im.set(Math.round(c + R * 0.7) - 1, Math.round(c - R * 0.6), accent);
  outline(im);
  return im;
}

/** static armoured turret ring (the rotating `_gun` overlay sits on it) */
function mount(S, ramp) {
  const im = new Img(S, S);
  const c = S / 2;
  shade(im, M(S, S).ellipse(c, c, S / 2 - 1, S / 2 - 1), ramp, "bevel");
  shade(im, M(S, S).ellipse(c, c, S * 0.36, S * 0.36), [P.K, P.G0, P.G1, P.G2], "bevel", { grad: false });
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2;
    im.paint(Math.round(c + Math.cos(t) * (S * 0.43) - 0.5), Math.round(c + Math.sin(t) * (S * 0.43) - 0.5), ramp[3]);
  }
  outline(im);
  return im;
}

// =============================================================== CARRIER
function carrierHull() {
  const W = 96, H = 240;
  const im = new Img(W, H);
  // stern at the top, bow (pointed) at the bottom; angled flight deck overhang on the left
  const hullPts = [[12, 6], [84, 6], [88, 20], [88, 170], [80, 205], [56, 236], [40, 236], [18, 205], [10, 170], [8, 120], [2, 96], [2, 60], [8, 40]];
  const hm = M(W, H).poly(hullPts);
  shade(im, hm, RAMP.steel, "bevel");
  // flight deck (dark asphalt) inset
  const deck = M(W, H).poly([[14, 9], [82, 9], [84, 22], [84, 168], [77, 200], [56, 228], [40, 228], [20, 200], [14, 168], [12, 120], [6, 96], [6, 62], [12, 42]]);
  shade(im, deck, [P.G0, P.G1, P.G1, P.G2], "bevel", { grad: false });
  // deck texture noise
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (deck.has(x, y) && vnoise(x, y, 3, 4096, 5) > 0.72) im.set(x, y, mix(P.G1, P.G0, 0.5));
  // main runway centre line (dashed white) + edge lines (along the bow axis)
  for (let y = 30; y < 222; y++) if (y % 10 < 5) { im.set(47, y, P.W); im.set(48, y, P.W); }
  for (let y = 26; y < 200; y++) { im.set(22, y, P.G3); im.set(73, y, P.G3); }
  // angled landing strip (diagonal) on the left
  for (let t = 0; t < 120; t++) {
    const x = 10 + t * 0.32, y = 64 + t;
    if (t % 10 < 5) im.set(Math.round(x + 10), Math.round(y), P.Y2);
    im.set(Math.round(x), Math.round(y), P.G3);
  }
  // arresting wires
  for (const y of [40, 48, 56]) for (let x = 16; x < 60; x++) if (x % 2) im.set(x, y, P.G3);
  // catapults at the bow
  for (const cx of [38, 58]) for (let y = 150; y < 214; y++) im.set(cx, y, y % 4 ? P.G2 : P.Y1);
  // elevators
  for (const [x, y] of [[66, 70], [66, 120], [16, 140]]) {
    shade(im, M(W, H).rect(x, y, 14, 14), RAMP.dsteel, "bevel", { grad: false });
    hazard(im, x, y, 14, 1);
  }
  // parked jets (tiny, enemy colours)
  const jet = (x, y) => {
    for (const [dx, dy, c] of [[0, 0, P.G4], [0, 1, P.G3], [0, 2, P.G3], [0, 3, P.G3], [0, 4, P.G2], [-1, 2, P.G3], [1, 2, P.G3], [-2, 3, P.G2], [2, 3, P.G2], [-1, 4, P.G2], [1, 4, P.G2], [0, 1, P.C1]]) im.set(x + dx, y + dy, c);
  };
  for (const [x, y] of [[28, 20], [34, 20], [40, 20], [56, 20], [62, 20], [28, 180], [64, 176]]) jet(x, y);
  // big deck number near the bow
  const glyph7 = ["####", "...#", "..#.", ".#..", ".#.."];
  glyph7.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "#") { im.set(44 + i * 2, 196 + j * 2, P.W); im.set(45 + i * 2, 196 + j * 2, P.W); im.set(44 + i * 2, 197 + j * 2, P.W); im.set(45 + i * 2, 197 + j * 2, P.W); } }));
  // gun tubs (sockets) around the edges where turret parts sit
  for (const [x, y] of [[14, 30], [82, 30], [12, 176], [84, 176]]) {
    shade(im, M(W, H).ellipse(x, y, 7, 7), RAMP.dsteel, "bevel");
    shade(im, M(W, H).ellipse(x, y, 4.5, 4.5), [P.K, P.G0, P.G1, P.G2], "bevel");
  }
  // starboard island footprint (where the bridge part sits)
  shade(im, M(W, H).rect(76, 92, 12, 44), RAMP.steel, "bevel");
  // hull side detail: portholes along the edges
  for (let y = 24; y < 168; y += 6) { im.paint(87, y, P.G1); im.paint(9, y + 3, P.G1); }
  outline(im);
  // stern wake (semi-transparent foam above the stern)
  for (let y = 0; y < 6; y++) for (let x = 14; x < 82; x++) if ((x + y * 3) % 5 === 0) im.set(x, y, A(P.W, 150 - y * 10));
  // bow spray
  for (let i = 0; i < 6; i++) { im.set(40 - i * 2, 236 - i, A(P.W, 180)); im.set(56 + i * 2, 236 - i, A(P.W, 180)); }
  return im;
}

function carrierBridge(frame = 0) {
  const W = 32, H = 40;
  const im = new Img(W, H);
  shade(im, M(W, H).poly([[6, 2], [26, 2], [30, 8], [30, 36], [26, 39], [6, 39], [2, 34], [2, 8]]), RAMP.lsteel, "bevel");
  // stepped superstructure
  shade(im, M(W, H).rect(7, 8, 18, 24), RAMP.steel, "bevel");
  shade(im, M(W, H).rect(10, 12, 12, 10), RAMP.lsteel, "bevel");
  // bridge windows (weak point glows)
  for (let x = 9; x < 23; x += 2) { const lit = ((x - 9) / 2 + frame) % 4 === 0; im.set(x, 31, lit ? P.W : P.C2); im.set(x, 32, P.C1); }
  // funnel + radar
  shade(im, M(W, H).ellipse(16, 26, 4, 3), RAMP.dark, "dome");
  im.set(16, 26, P.K); im.set(17, 26, P.K);
  im.vline(16, 4, 16, P.G3);
  // radar yard arm rotates about (16, 16)
  const ra = (frame * Math.PI) / 4;
  for (let t = -8; t <= 8; t += 0.5) im.set(Math.round(16 + Math.cos(ra) * t), Math.round(16 + Math.sin(ra) * t * 0.6), Math.abs(t) > 6 ? P.W : P.G4);
  shade(im, M(W, H).ellipse(16, 6, 3, 2), RAMP.lsteel, "dome");
  im.set(16, 4, frame % 2 ? P.R3 : P.R1);
  // number / markings
  im.set(5, 20, P.Y2); im.set(5, 21, P.Y2); im.set(26, 20, P.Y2); im.set(26, 21, P.Y2);
  outline(im);
  return im;
}

function carrierLauncher(frame = 0) {
  const S = 24;
  const im = new Img(S, S);
  shade(im, M(S, S).ellipse(12, 12, 10.5, 10.5), RAMP.dsteel, "bevel");
  shade(im, M(S, S).rect(5, 5, 14, 14), RAMP.steel, "bevel");
  for (const [x, y] of [[6, 6], [12, 6], [6, 12], [12, 12]]) {
    shade(im, M(S, S).rect(x, y, 6, 6), [P.K, P.G0, P.G1, P.G2], "bevel", { grad: false });
    shade(im, M(S, S).ellipse(x + 3, y + 3, 1.8, 1.8), frame === 2 ? [P.R1, P.R2, P.R3, P.W] : RAMP.red, "dome");
    const lid = [3, 1, 0, 1][frame]; // px of sliding lid still covering the cell
    if (lid) shade(im, M(S, S).rect(x, y, 6, lid * 2), RAMP.steel, "bevel", { grad: false });
  }
  hazard(im, 5, 19, 14, 2);
  outline(im);
  return im;
}

// =============================================================== HELI GUNSHIP
function heliBody() {
  const W = 64, H = 72;
  const im = new Img(W, H);
  const r = (pts) => M(W, H).poly(pts, true);
  // stub wings with hardpoints
  shade(im, r([[18, 34], [4, 32], [2, 34], [2, 44], [18, 44]]), RAMP.dsteel, "bevel");
  // engines (top, since the nose points down)
  shade(im, M(W, H).ellipse(22, 22, 6, 13), RAMP.olive, "cyl");
  shade(im, M(W, H).ellipse(42, 22, 6, 13), RAMP.olive, "cyl");
  for (const x of [22, 42]) { shade(im, M(W, H).ellipse(x, 10, 4, 3), RAMP.dark, "dome"); im.set(x, 9, P.K); im.set(x - 1, 9, P.K); }
  // fuselage
  const body = r([[32, 70], [26, 66], [22, 56], [21, 30], [24, 8], [28, 2], [32, 1]]);
  shade(im, body, RAMP.olive, "cyl");
  plating(im, body, RAMP.olive, 9, 8, 3);
  // tandem cockpits
  shade(im, M(W, H).ellipse(32, 56, 5, 6), RAMP.glass, "dome");
  shade(im, M(W, H).ellipse(32, 45, 5.5, 6), RAMP.glass, "dome");
  im.hline(28, 36, 51, P.G0);
  // markings: red star / stripes
  for (const x of [8, 55]) for (let y = 36; y < 42; y++) im.set(x, y, y % 2 ? P.R2 : P.W);
  im.set(32, 30, P.R2); im.set(31, 31, P.R2); im.set(33, 31, P.R2); im.set(32, 31, P.R3);
  // rotor mast hub
  shade(im, M(W, H).ellipse(32, 26, 5, 5), RAMP.steel, "dome");
  outline(im);
  return im;
}

function heliRotor(frame) {
  const S = 96;
  const im = new Img(S, S);
  const c = 48;
  // blur disc (transparent)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d < 46.5 && d > 45.2) im.set(x, y, A(P.G3, 90));
      else if (d < 45 && ((Math.atan2(y - c, x - c) * 180) / Math.PI + 360 + frame * 15) % 90 < 20) im.set(x, y, A(P.G2, 26));
    }
  // 4 blades
  for (let b = 0; b < 4; b++) {
    const a = ((b * 90 + frame * 15) * Math.PI) / 180;
    const bm = M(S, S);
    const ex = c + Math.cos(a) * 46, ey = c + Math.sin(a) * 46;
    bm.capsule(c, c, ex, ey, 1.8);
    shade(im, bm, RAMP.dsteel, "bevel", { grad: false });
    // tip stripe
    for (let t = 40; t < 45; t++) im.set(Math.floor(c + Math.cos(a) * t), Math.floor(c + Math.sin(a) * t), P.Y2);
    // trailing smear
    for (let t = 8; t < 45; t += 1) {
      const a2 = a - 0.08;
      im.set(Math.floor(c + Math.cos(a2) * t), Math.floor(c + Math.sin(a2) * t), A(P.G2, 120));
    }
  }
  shade(im, M(S, S).ellipse(c, c, 5, 5), RAMP.steel, "dome");
  im.set(c, c, P.R2);
  return im;
}

function heliTail(frame = 0) {
  const W = 16, H = 40;
  const im = new Img(W, H);
  shade(im, M(W, H).poly([[5, 0], [11, 0], [10, 30], [6, 30]]), RAMP.olive, "cyl");
  shade(im, M(W, H).rect(1, 26, 14, 5), RAMP.olive, "bevel"); // stabilizer
  shade(im, M(W, H).rect(9, 30, 3, 9), RAMP.dsteel, "bevel"); // fin
  // tail rotor (disc)
  for (let y = 31; y < 40; y++) for (let x = 3; x < 9; x++) if (Math.hypot(x - 5.5, y - 35) < 3.6) im.set(x, y, A(P.G3, 130));
  const ta = (frame * Math.PI) / 4;
  for (let t = -3; t <= 3; t += 0.5) im.set(Math.round(5.5 + Math.cos(ta) * t - 0.5), Math.round(35 + Math.sin(ta) * t), P.G2);
  im.set(5, 35, P.G1);
  if (frame < 2) { im.set(2, 28, P.R3); im.set(13, 28, P.R3); }
  im.set(2, 28, P.R2); im.set(13, 28, P.R2);
  outline(im);
  return im;
}

function heliGunpod() {
  const W = 20, H = 28;
  const im = new Img(W, H);
  // rotary cannon: 3 barrels pointing down
  for (const x of [7, 10, 13]) barrelDown(im, x, 10, 26, 2, RAMP.steel, false);
  shade(im, M(W, H).rect(5, 22, 10, 3), RAMP.dsteel, "bevel", { grad: false });
  shade(im, M(W, H).ellipse(10, 9, 7.5, 8), RAMP.olive, "dome");
  shade(im, M(W, H).rect(6, 13, 8, 4), RAMP.dsteel, "bevel");
  im.set(7, 5, P.Y2);
  outline(im);
  return im;
}

function heliMissilepod(frame = 0) {
  const S = 20;
  const im = new Img(S, S);
  shade(im, M(S, S).rect(2, 2, 16, 16), RAMP.olive, "bevel");
  for (const [x, y] of [[4, 4], [10, 4], [4, 10], [10, 10]]) {
    shade(im, M(S, S).ellipse(x + 3, y + 3, 2.8, 2.8), [P.K, P.G0, P.G1, P.G2], "bevel");
    shade(im, M(S, S).ellipse(x + 3, y + 3, 1.6, 1.6), RAMP.red, "dome");
  }
  hazard(im, 2, 17, 16, 1);
  im.set(3, 3, frame ? P.R3 : P.R0); im.set(16, 3, frame ? P.R0 : P.R3);
  outline(im);
  return im;
}

// =============================================================== LAND FORTRESS
function fortressBody() {
  const W = 128, H = 160;
  const im = new Img(W, H);
  const hull = M(W, H).poly([[16, 4], [112, 4], [124, 18], [124, 140], [108, 158], [20, 158], [4, 140], [4, 18]]);
  shade(im, hull, RAMP.tan, "bevel");
  plating(im, hull, RAMP.tan, 16, 14, 7);
  // raised armour deck
  const deck = M(W, H).poly([[24, 14], [104, 14], [112, 26], [112, 132], [100, 146], [28, 146], [16, 132], [16, 26]]);
  shade(im, deck, [P.T0, P.T1, P.T2, P.T3], "bevel");
  plating(im, deck, [P.T0, P.T1, P.T2, P.T3], 12, 12, 8);
  // central citadel block around the core socket
  shade(im, M(W, H).rect(40, 56, 48, 48), RAMP.steel, "bevel");
  plating(im, M(W, H).rect(40, 56, 48, 48), RAMP.steel, 8, 8, 9);
  shade(im, M(W, H).ellipse(64, 80, 19, 19), RAMP.dsteel, "bevel");
  shade(im, M(W, H).ellipse(64, 80, 16, 16), [P.K, P.G0, P.G1, P.G2], "bevel");
  // turret rings (sockets) for turret_big (front) and 4 small ones
  for (const [x, y, r] of [[64, 126, 20], [30, 36, 10], [98, 36, 10], [30, 112, 10], [98, 112, 10]]) {
    shade(im, M(W, H).ellipse(x, y, r + 2, r + 2), RAMP.dsteel, "bevel");
    shade(im, M(W, H).ellipse(x, y, r - 1, r - 1), [P.K, P.G0, P.G1, P.G2], "bevel", { grad: false });
  }
  // exhaust stacks at the rear
  for (const x of [48, 64, 80]) {
    shade(im, M(W, H).ellipse(x, 20, 5, 5), RAMP.dark, "dome");
    shade(im, M(W, H).ellipse(x, 20, 2.5, 2.5), [P.K, P.K, P.G0, P.G0], "flat");
  }
  // hazard stripes on the bow
  hazard(im, 28, 148, 72, 4);
  // red insignia
  for (const [x, y] of [[20, 74], [104, 74]]) {
    shade(im, M(W, H).ellipse(x, y, 5, 5), RAMP.red, "dome");
    im.set(x, y, P.W);
  }
  // headlights
  for (const x of [36, 92]) { im.set(x, 154, P.Y3); im.set(x + 1, 154, P.Y3); }
  outline(im);
  return im;
}

function fortressTread(frame) {
  const W = 20, H = 160;
  const im = new Img(W, H);
  shade(im, M(W, H).rect(1, 1, 18, 158), RAMP.dark, "bevel", { grad: false });
  for (let y = 2; y < 158; y++) {
    const link = (y + frame) % 6;
    for (let x = 2; x < 18; x++) {
      if (link === 0) im.set(x, y, P.K);
      else if (link === 1) im.set(x, y, P.G2);
      else if (x === 2 || x === 17) im.set(x, y, P.G0);
    }
    if (link === 3) { im.set(9, y, P.G3); im.set(10, y, P.G3); }
  }
  // road wheels show through
  for (let y = 10; y < 158; y += 20) shade(im, M(W, H).ellipse(10, y, 3, 3), RAMP.steel, "dome");
  outline(im);
  return im;
}

function fortressCore(frame) {
  const S = 32;
  const im = new Img(S, S);
  shade(im, M(S, S).ellipse(16, 16, 15, 15), RAMP.steel, "bevel");
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2;
    shade(im, M(S, S).ellipse(16 + Math.cos(t) * 12, 16 + Math.sin(t) * 12, 1.6, 1.6), RAMP.dsteel, "dome");
  }
  const pulse = [0, 1, 2, 1][frame];
  glow(im, 16, 16, 9, [P.R1, P.R2, P.Y1, P.Y3], pulse);
  glow(im, 16, 16, 4 + pulse * 0.6, [P.Y1, P.Y2, P.Y3, P.W], pulse);
  outline(im);
  return im;
}

// =============================================================== ICE DREADNOUGHT
const ICE = () => [BIOME.arctic.i0, BIOME.arctic.i1, BIOME.arctic.i3, BIOME.arctic.w];

function iceHull() {
  const W = 96, H = 180;
  const im = new Img(W, H);
  const ice = ICE();
  // flying warship, armour plates white/ice blue, prow pointing down
  const hull = M(W, H).poly([[48, 178], [30, 160], [18, 126], [14, 60], [22, 18], [36, 4], [60, 4], [74, 18], [82, 60], [78, 126], [66, 160]]);
  shade(im, hull, RAMP.steel, "bevel");
  const armour = M(W, H).poly([[48, 170], [34, 154], [24, 124], [20, 62], [27, 24], [38, 12], [58, 12], [69, 24], [76, 62], [72, 124], [62, 154]]);
  shade(im, armour, ice, "bevel");
  plating(im, armour, ice, 14, 12, 11);
  // engine wing sponsons (where engine parts mount)
  const sp = M(W, H).poly([[16, 40], [2, 52], [2, 76], [16, 84]], true);
  shade(im, sp, RAMP.dsteel, "bevel");
  for (const x of [8, 87]) shade(im, M(W, H).ellipse(x, 64, 6, 6), [P.K, P.G0, P.G1, P.G2], "bevel");
  // ice crystal spikes along the dorsal line
  for (const y of [34, 58, 82, 106]) {
    const cm = M(W, H).poly([[48, y - 8], [52, y], [48, y + 8], [44, y]]);
    shade(im, cm, [P.C0, P.C1, P.C2, P.W], "bevel", { grad: false });
  }
  // core socket + cannon sockets
  shade(im, M(W, H).ellipse(48, 132, 15, 15), RAMP.dsteel, "bevel");
  shade(im, M(W, H).ellipse(48, 132, 12, 12), [P.K, P.G0, P.G1, P.G2], "bevel");
  for (const x of [30, 66]) {
    shade(im, M(W, H).ellipse(x, 96, 14, 14), RAMP.dsteel, "bevel");
    shade(im, M(W, H).ellipse(x, 96, 10, 10), [P.K, P.G0, P.G1, P.G2], "bevel");
  }
  // bridge windows near the stern
  for (let x = 38; x < 58; x += 3) im.set(x, 22, P.C2), im.set(x + 1, 22, P.C1);
  // frost streaks
  const r = rng("frost");
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H);
    if (armour.has(x, y)) im.set(x, y, BIOME.arctic.w);
  }
  // red faction markings
  for (const [x, y] of [[28, 50], [67, 50]]) for (let j = 0; j < 4; j++) for (let i = 0; i < 2; i++) im.set(x + i, y + j, P.R2);
  outline(im);
  // rear thruster glow (stern = top)
  for (const x of [40, 48, 56]) for (let y = 0; y < 4; y++) im.set(x, 3 - y, A(y < 2 ? P.C2 : P.C1, 220 - y * 40));
  return im;
}

function iceCannon() {
  const S = 32;
  const im = new Img(S, S);
  barrelDown(im, 16, 14, 31, 5, RAMP.lsteel);
  for (let y = 18; y < 28; y += 3) for (let x = 14; x < 19; x++) im.paint(x, y, P.G2);
  const R = 9;
  shade(im, M(S, S).poly([[16 - R, 8], [16 + R, 8], [16 + R + 2, 16], [16 + R - 3, 22], [16 - R + 3, 22], [16 - R - 2, 16]]), ICE(), "bevel");
  shade(im, M(S, S).ellipse(16, 13, 4, 3.5), RAMP.glass, "dome");
  outline(im);
  return im;
}

function iceEngine(frame) {
  const S = 24;
  const im = new Img(S, S);
  shade(im, M(S, S).ellipse(12, 12, 10.5, 10.5), RAMP.steel, "bevel");
  shade(im, M(S, S).ellipse(12, 12, 8, 8), [P.K, P.G0, P.G1, P.G2], "bevel");
  const p = [0, 1, 2, 1][frame];
  glow(im, 12, 12, 5.5 + p * 0.5, [P.C0, P.C1, P.C2, P.W], p);
  // turbine blades
  for (let a = 0; a < 6; a++) {
    const t = (a / 6) * Math.PI * 2 + frame * 0.26;
    im.set(Math.round(12 + Math.cos(t) * 7 - 0.5), Math.round(12 + Math.sin(t) * 7 - 0.5), P.G3);
  }
  outline(im);
  return im;
}

function iceCore(frame) {
  const S = 28;
  const im = new Img(S, S);
  // crystal core: faceted diamond
  const d = M(S, S).poly([[14, 1], [26, 14], [14, 27], [2, 14]]);
  shade(im, d, [P.C0, P.C1, P.C2, P.W], "bevel");
  const p = [0, 1, 2, 1][frame];
  glow(im, 14, 14, 6 + p, [P.C1, P.C2, P.W, P.W], p);
  // facets
  im.line(14, 1, 14, 27, A(P.W, 140));
  im.line(2, 14, 26, 14, A(P.C0, 160));
  outline(im);
  return im;
}

function iceDrill(frame) {
  const W = 24, H = 40;
  const im = new Img(W, H);
  shade(im, M(W, H).rect(3, 0, 18, 10), RAMP.dsteel, "bevel");
  const cone = M(W, H).poly([[3, 10], [21, 10], [12, 39]]);
  shade(im, cone, RAMP.lsteel, "cyl");
  // spiral flutes scroll with frame
  for (let y = 10; y < 39; y++) {
    const half = ((39 - y) / 29) * 9;
    for (let k = 0; k < 3; k++) {
      const ph = ((y * 0.5 + frame * 1.5 + k * 4) % 6) / 6;
      const x = Math.round(12 - half + ph * half * 2);
      if (cone.has(x, y)) im.set(x, y, P.G1);
    }
  }
  im.set(12, 38, P.C2);
  hazard(im, 3, 8, 18, 2);
  outline(im);
  return im;
}

// =============================================================== CITADEL CORE
const NEON = () => [P.R0, BIOME.citadel.neon, P.R3, P.W];

function citadelCore(frame) {
  const S = 48;
  const im = new Img(S, S);
  const C = BIOME.citadel;
  shade(im, M(S, S).poly([[16, 1], [32, 1], [47, 16], [47, 32], [32, 47], [16, 47], [1, 32], [1, 16]]), [C.m1, C.m2, C.m3, C.m4], "bevel");
  shade(im, M(S, S).ellipse(24, 24, 17, 17), [P.K, C.m0, C.m1, C.m2], "bevel");
  const p = [0, 1, 2, 1][frame];
  glow(im, 24, 24, 13 + p * 0.5, [P.M0, P.M1, C.neon, P.R3], p);
  // the eye: vertical slit pupil
  for (let y = 15 - p; y <= 33 + p; y++) {
    const w = y > 19 && y < 29 ? 2 : 1;
    for (let x = 24 - w; x < 24 + w; x++) im.set(x, y, P.K);
  }
  im.set(19, 18, P.W); im.set(20, 18, P.W); im.set(19, 19, P.W);
  // conduit nodes
  for (const [x, y] of [[24, 4], [24, 43], [4, 24], [43, 24]]) { im.set(x, y, C.cy); im.set(x + 1, y, C.cy); }
  outline(im);
  return im;
}

function citadelRing(frame = 0) {
  const S = 160;
  const im = new Img(S, S);
  const C = BIOME.citadel;
  const c = S / 2;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);
      if (d < 64 || d > 79) continue;
      const a = Math.atan2(dy, dx);
      const seg = ((a + Math.PI) / (Math.PI * 2)) * 12;
      const gap = seg % 1 < 0.06 || seg % 1 > 0.94;
      if (gap) continue;
      // bevel lit from the top-left
      const lit = -(dx / d) * 0.6 - (dy / d) * 0.6;
      let col;
      if (d > 77.5) col = lit > 0 ? C.m4 : C.m0;
      else if (d < 65.5) col = lit > 0 ? C.m0 : C.m4;
      else if (d > 70 && d < 73) col = (Math.floor(seg * 4) + frame) % 4 === 0 ? C.neon : (Math.floor(seg * 4) + frame) % 4 === 1 ? P.R3 : C.neonD;
      else col = lit > 0.3 ? C.m3 : lit > -0.3 ? C.m2 : C.m1;
      im.set(x, y, col);
    }
  // emitter studs every segment
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2 - Math.PI;
    const x = c + Math.cos(a) * 71.5, y = c + Math.sin(a) * 71.5;
    shade(im, M(S, S).ellipse(x, y, 3, 3), (i + frame) % 4 === 0 ? [C.cy, hexish("#9ff4ff"), P.W, P.W] : [C.cyD, C.cy, hexish("#9ff4ff"), P.W], "dome");
  }
  outline(im);
  return im;
}
function hexish(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

function citadelCannon(frame = 0) {
  const S = 32;
  const im = new Img(S, S);
  const C = BIOME.citadel;
  barrelDown(im, 12, 14, 31, 3, RAMP.dsteel);
  barrelDown(im, 20, 14, 31, 3, RAMP.dsteel);
  for (const x of [11, 12, 13, 19, 20, 21]) im.set(x, 31, C.neon);
  shade(im, M(S, S).poly([[6, 6], [26, 6], [29, 14], [24, 20], [8, 20], [3, 14]]), [C.m1, C.m2, C.m3, C.m4], "bevel");
  for (let x = 9; x < 24; x++) im.set(x, 14, (x + frame) % 4 === 0 ? P.W : x % 2 ? C.neon : C.neonD);
  outline(im);
  return im;
}

function citadelShieldgen(frame) {
  const S = 24;
  const im = new Img(S, S);
  const C = BIOME.citadel;
  shade(im, M(S, S).poly([[6, 1], [18, 1], [23, 6], [23, 18], [18, 23], [6, 23], [1, 18], [1, 6]]), [C.m1, C.m2, C.m3, C.m4], "bevel");
  // four prongs
  for (const [x, y] of [[4, 4], [18, 4], [4, 18], [18, 18]]) shade(im, M(S, S).rect(x, y, 3, 3), RAMP.steel, "bevel");
  const p = [0, 1, 2, 1][frame];
  glow(im, 12, 12, 6 + p * 0.6, [C.cyD, C.cy, hexish("#9ff4ff"), P.W], p);
  // crackling arcs between prongs (vary per frame)
  const r = rng("arc" + frame);
  for (const [x0, y0, x1, y1] of [[5, 5, 12, 12], [19, 5, 12, 12], [5, 19, 12, 12], [19, 19, 12, 12]]) {
    let x = x0, y = y0;
    for (let i = 0; i < 7; i++) {
      x += (x1 - x0) / 7 + (r() - 0.5) * 1.5;
      y += (y1 - y0) / 7 + (r() - 0.5) * 1.5;
      im.set(Math.round(x), Math.round(y), i % 2 ? C.cy : P.W);
    }
  }
  outline(im);
  return im;
}

function citadelEmitter(frame) {
  const S = 40;
  const im = new Img(S, S);
  const C = BIOME.citadel;
  // dish pointing down (toward the player)
  shade(im, M(S, S).ellipse(20, 18, 18, 16), [C.m1, C.m2, C.m3, C.m4], "dome");
  shade(im, M(S, S).ellipse(20, 20, 13, 11), [P.K, C.m0, C.m1, C.m2], "bevel");
  // prongs converge at the bottom
  for (const x of [10, 30]) im.line(x, 24, 20, 37, C.m4);
  im.line(20, 10, 20, 37, C.m3);
  const p = frame;
  const cols = NEON();
  glow(im, 20, 36, 2 + p * 0.8, [cols[0], cols[1], cols[2], cols[3]], p / 2);
  // charge rings
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    if ((a + frame) % 4 === 0) im.set(Math.round(20 + Math.cos(t) * 11 - 0.5), Math.round(20 + Math.sin(t) * 9 - 0.5), C.neon);
  }
  outline(im);
  return im;
}

// =============================================================== register
export function genBosses(reg) {
  const g = { group: "boss" };
  const add = (k, fr, o = {}) => reg.add("boss_" + k, fr, { ...g, ...o });
  // carrier
  add("carrier_hull", carrierHull());
  // rotating turrets: static mount `boss_<id>_<part>` + rotating overlay `_gun` (points DOWN at angle 0)
  add("carrier_turret", mount(24, RAMP.steel));
  add("carrier_turret_gun", turret(24, RAMP.steel, 2, 11, 2));
  add("carrier_bridge", [0, 1, 2, 3].map(carrierBridge), { fps: 6, loop: true });
  add("carrier_launcher", [0, 1, 2, 3].map(carrierLauncher), { fps: 3, loop: true });
  add("carrier_aa", mount(16, RAMP.dsteel));
  add("carrier_aa_gun", turret(16, RAMP.dsteel, 2, 7, 1, P.Y2));
  // heli gunship
  add("heli_gunship_body", heliBody());
  add("heli_gunship_rotor", [0, 1, 2, 3, 4, 5].map(heliRotor), { fps: 24, loop: true });
  add("heli_gunship_tail", [0, 1, 2, 3].map(heliTail), { fps: 16, loop: true });
  add("heli_gunship_gunpod", heliGunpod());
  add("heli_gunship_missilepod", [0, 1].map(heliMissilepod), { fps: 3, loop: true });
  // land fortress
  add("land_fortress_body", fortressBody());
  add("land_fortress_turret_big", mount(40, [P.T0, P.T1, P.T2, P.T3]));
  add("land_fortress_turret_big_gun", turret(40, [P.T0, P.T1, P.T2, P.T3], 2, 19, 4));
  add("land_fortress_turret_small", mount(20, [P.T0, P.T1, P.T2, P.T3]));
  add("land_fortress_turret_small_gun", turret(20, [P.T0, P.T1, P.T2, P.T3], 1, 9, 2));
  add("land_fortress_core", [0, 1, 2, 3].map(fortressCore), { fps: 8, loop: true });
  add("land_fortress_tread", [0, 1, 2, 3, 4, 5].map(fortressTread), { fps: 12, loop: true });
  // ice dreadnought
  add("ice_dreadnought_hull", iceHull());
  add("ice_dreadnought_cannon", iceCannon());
  add("ice_dreadnought_engine", [0, 1, 2, 3].map(iceEngine), { fps: 12, loop: true });
  add("ice_dreadnought_core", [0, 1, 2, 3].map(iceCore), { fps: 8, loop: true });
  add("ice_dreadnought_drill", [0, 1, 2, 3].map(iceDrill), { fps: 14, loop: true });
  // citadel core
  add("citadel_core_core", [0, 1, 2, 3].map(citadelCore), { fps: 6, loop: true });
  add("citadel_core_ring", [0, 1, 2, 3].map(citadelRing), { fps: 8, loop: true });
  add("citadel_core_cannon", [0, 1, 2, 3].map(citadelCannon), { fps: 10, loop: true });
  add("citadel_core_shieldgen", [0, 1, 2, 3].map(citadelShieldgen), { fps: 12, loop: true });
  add("citadel_core_emitter", [0, 1, 2, 3].map(citadelEmitter), { fps: 8, loop: true });
}
