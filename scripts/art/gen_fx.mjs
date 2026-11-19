// Bullets (authored pointing UP; renderer rotates to heading), effects and pickups.
import { Img, Mask, P, RAMP, shade, outline, vnoise, rng, mix, bayer } from "./lib.mjs";

const M = (w, h) => new Mask(w, h);
const A = (c, a) => [c[0], c[1], c[2], a];

// ------------------------------------------------------------------ bullets
function tracer(w, h, cols, frame = 0) {
  // vertical capsule bullet with a hot head and cooling tail
  const im = new Img(w, h);
  const core = M(w, h).capsule(w / 2, 1.5 + (w - 2) / 2, w / 2, h - 1.5 - (w - 2) / 2, (w - 2) / 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!core.has(x, y)) continue;
      const t = y / (h - 1);
      const i = Math.min(cols.length - 1, Math.floor(t * cols.length + (frame ? 0.5 : 0)));
      im.set(x, y, cols[i]);
    }
  outline(im);
  return im;
}

function orb(S, ramp, frame, ring) {
  const im = new Img(S, S);
  const c = S / 2;
  const r = S / 2 - 1.2 - (frame ? 0.4 : 0);
  if (ring) {
    const rg = M(S, S).ring(c, c, r - 0.2, r + 0.9);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (rg.has(x, y)) im.set(x, y, frame ? ramp[2] : ramp[1]);
  }
  const rr = ring ? r - 1.4 : r;
  shade(im, M(S, S).ellipse(c, c, rr, rr), [ramp[1], ramp[2], ramp[3], P.W], "dome");
  // white-hot centre
  const cr = Math.max(0.8, rr * (frame ? 0.42 : 0.5));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (Math.hypot(x + 0.5 - c, y + 0.5 - c) <= cr) im.set(x, y, P.W);
  outline(im, ramp[0] === P.K ? P.K : P.K);
  return im;
}

function missile(w, h, body, tip, frame, fins = RAMP.steel) {
  const im = new Img(w, h);
  const cx = w / 2;
  shade(im, M(w, h).poly([[cx, 1], [cx + 1.5, 3], [cx + 1.5, h - 5], [cx - 1.5, h - 5], [cx - 1.5, 3]]), body, "cyl");
  shade(im, M(w, h).poly([[cx - 1.5, h - 7], [cx - 2.9, h - 4], [cx + 2.9, h - 4], [cx + 1.5, h - 7]]), fins, "bevel");
  im.set(Math.floor(cx), 1, tip[1]);
  im.set(Math.floor(cx) - 1, 2, tip[0]);
  im.set(Math.floor(cx), 2, tip[1]);
  outline(im);
  // exhaust (no outline)
  const fl = frame ? 3 : 2;
  for (let i = 0; i < fl; i++) {
    const c = [P.W, P.Y3, P.Y2, P.Y1][i + (frame ? 0 : 1)];
    im.set(Math.floor(cx) - 1, h - 4 + i, c);
    im.set(Math.floor(cx), h - 4 + i, c);
  }
  return im;
}

function bomb(w, h, ramp, band, big = false) {
  const im = new Img(w, h);
  const cx = w / 2;
  shade(im, M(w, h).ellipse(cx, h * 0.42, w / 2 - 1.2, h * 0.36), ramp, "dome");
  // fins at the tail (bottom)
  shade(im, M(w, h).poly([[cx - 1, h * 0.7], [cx - w / 2 + 1, h - 1.2], [cx + w / 2 - 1, h - 1.2], [cx + 1, h * 0.7]]), RAMP.steel, "bevel");
  const by = Math.round(h * 0.5);
  for (let x = 0; x < w; x++) {
    im.paint(x, by, band[(x + (big ? 1 : 0)) % band.length]);
    if (big) im.paint(x, by - 1, band[(x + 1) % band.length]);
  }
  outline(im);
  return im;
}

function beam(w, h, ramp) {
  // vertically tileable beam segment: no top/bottom outline
  const im = new Img(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x + 0.5 - w / 2) / (w / 2);
      const wob = Math.sin((y / h) * Math.PI * 2) * 0.08;
      const v = d + wob;
      const c = v < 0.25 ? P.W : v < 0.5 ? ramp[3] : v < 0.75 ? ramp[2] : v < 0.95 ? ramp[1] : null;
      if (c) im.set(x, y, v >= 0.75 ? A(c, 200) : c);
    }
  return im;
}

function flak(frame) {
  const im = new Img(8, 8);
  shade(im, M(8, 8).ellipse(4, 4, 2.4, 2.4), RAMP.fire, "dome");
  const spikes = frame ? [[4, 0], [4, 7], [0, 4], [7, 4]] : [[1, 1], [6, 1], [1, 6], [6, 6]];
  for (const [x, y] of spikes) im.set(x, y, P.Y2);
  im.set(3, 3, P.W);
  outline(im);
  return im;
}

export function genBullets(reg) {
  const g = { group: "bullets" };
  const hot = [P.W, P.Y3, P.Y2, P.Y2, P.Y1, P.Y0];
  reg.add("bullet_player_vulcan", tracer(4, 10, hot), g);
  reg.add("bullet_player_spread", [0, 1].map((f) => orb(6, [P.K, P.C1, P.C2, P.W], f, false)), { ...g, fps: 12 });
  reg.add("bullet_player_missile", [0, 1].map((f) => missile(6, 12, RAMP.lsteel, [P.C1, P.C2], f, RAMP.sky)), { ...g, fps: 14 });
  reg.add("bullet_player_laser", beam(8, 16, [P.C0, P.C1, P.C2, P.W]), g);
  reg.add("bullet_player_bomb", bomb(8, 10, RAMP.olive, [P.Y2, P.Y1]), g);
  reg.add("bullet_player_rocket", [0, 1].map((f) => missile(5, 12, RAMP.lsteel, [P.R1, P.R2], f)), { ...g, fps: 16 });
  reg.add("bullet_player_pmissile", [0, 1].map((f) => missile(6, 14, [P.M0, P.M1, P.M2, P.W], [P.Y1, P.Y2], f, RAMP.lsteel)), { ...g, fps: 14 });
  reg.add("bullet_player_heavy", bomb(12, 16, RAMP.dsteel, [P.Y2, P.K], true), g);

  reg.add("ebullet_small", [0, 1].map((f) => orb(6, [P.K, P.R2, P.R3, P.Y3], f, false)), { ...g, fps: 10 });
  reg.add("ebullet_orb", [0, 1].map((f) => orb(10, [P.K, P.M1, P.M2, P.W], f, true)), { ...g, fps: 8 });
  reg.add("ebullet_needle", tracer(4, 10, [P.W, P.C2, P.C2, P.C1, P.C1, P.C0]), g);
  reg.add("ebullet_big", [0, 1].map((f) => orb(16, [P.K, P.R2, P.R3, P.Y3], f, true)), { ...g, fps: 8 });
  reg.add("ebullet_missile", [0, 1].map((f) => missile(6, 14, RAMP.steel, [P.R1, P.R2], f, RAMP.red)), { ...g, fps: 14 });
  reg.add("ebullet_bomb", [0, 1].map((f) => {
    const b = bomb(8, 10, RAMP.dsteel, [P.R2, P.R1]);
    if (f) b.set(4, 3, P.R3), b.set(3, 3, P.W);
    return b;
  }), { ...g, fps: 6 });
  reg.add("ebullet_flak", [0, 1].map(flak), { ...g, fps: 12 });
  reg.add("ebullet_laser", beam(6, 16, [P.R0, P.R1, P.R2, P.R3]), g);
}

// ------------------------------------------------------------------ effects
/**
 * 8-frame explosion: f0 white flash pop + shock ring, f1-3 boiling fireball with flying debris chunks,
 * f4-5 fire collapsing into a rolling smoke cloud with embers, f6-7 smoke thinning out (dithered falloff).
 */
function explosion(S, frames, seed) {
  const out = [];
  const R = S / 2 - 1;
  const c = S / 2;
  const big = S >= 32;
  // debris: fixed set of chunks flying out on ballistic-ish rays (same chunks every frame = readable motion)
  const rr = rng(seed * 7 + 3);
  const chunks = [];
  for (let i = 0; i < (big ? 9 : 5); i++) chunks.push({ a: rr() * Math.PI * 2, v: 0.75 + rr() * 0.5, sz: big && rr() < 0.8 ? 2 : 1, hot: rr() < 0.5 });
  for (let f = 0; f < frames; f++) {
    const t = f / (frames - 1);
    const im = new Img(S, S);
    // fireball radius grows fast then stalls; smoke keeps expanding a little
    const r = R * (f === 0 ? 0.42 : 0.5 + 0.5 * Math.min(1, Math.sqrt(t * 1.6)));
    const fire = Math.max(0, 1 - t * 1.12); // how much flame is left
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c + t * S * 0.06; // smoke drifts up a touch
        const d = Math.hypot(dx, dy);
        const n = vnoise(x + f * 2, y - f * 3, Math.max(2, S / 8), 4096, seed);
        const n2 = vnoise(x, y, Math.max(2, S / 5), 4096, seed + 7);
        const edge = r * (0.74 + 0.36 * n2);
        if (d > edge) continue;
        const k = d / edge;
        if (f === 0) {
          im.set(x, y, k < 0.55 ? P.W : k < 0.8 ? P.Y3 : P.Y2);
          continue;
        }
        // dissolve from the edges inward late in life (ordered dither = soft falloff in pixel art)
        if (t > 0.5) {
          const keep = 1 - (t - 0.5) * 2.1 * (0.6 + k * 0.8) + (n - 0.5) * 0.6;
          if (keep < bayer(x, y)) continue;
        }
        const heat = (1 - k) * (0.6 + fire) + (n - 0.5) * 0.55 + fire * 0.35 - (1 - fire) * 0.4;
        // lit from the top-left: smoke tone by position
        const lit = (-dx - dy) / (edge * 2) + (n - 0.5) * 0.6;
        let col;
        if (heat > 1.05) col = P.W;
        else if (heat > 0.85) col = P.Y3;
        else if (heat > 0.66) col = P.Y2;
        else if (heat > 0.5) col = P.Y1;
        else if (heat > 0.36) col = P.R2;
        else if (heat > 0.24) col = fire > 0.3 ? P.R1 : P.G2;
        else col = lit > 0.45 ? P.G3 : lit > 0.12 ? P.G2 : lit > -0.25 ? P.G1 : P.G0;
        im.set(x, y, col);
      }
    // crisp dark-red rim while the fireball is young (punch against bright biomes)
    if (f > 0 && t < 0.45) outline(im, P.R0);
    if (f === 0) outline(im, P.Y1);
    // shock ring on the first frames
    if (f <= 2) {
      const sr = R * (0.55 + f * 0.24);
      for (let a = 0; a < 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        if (f === 2 && a % 2) continue;
        im.set(Math.floor(c + Math.cos(ang) * sr), Math.floor(c + Math.sin(ang) * sr), f === 0 ? A(P.W, 230) : A(P.Y3, f === 1 ? 200 : 120));
      }
    }
    // flying debris: dark chunk with a bright leading ember and a short smoke streak
    if (f >= 1 && f <= 6)
      for (const ch of chunks) {
        const dd = r * (0.55 + ch.v * t * 1.25);
        const px = c + Math.cos(ch.a) * dd, py = c + Math.sin(ch.a) * dd + t * t * S * 0.12;
        const tx = c + Math.cos(ch.a) * (dd - 2.2), ty = c + Math.sin(ch.a) * (dd - 2.2) + t * t * S * 0.12;
        if (f >= 2) im.set(Math.floor(tx), Math.floor(ty), A(P.G2, 150));
        im.set(Math.floor(px), Math.floor(py), ch.hot && f < 5 ? P.Y2 : P.K);
        if (ch.sz > 1) { im.set(Math.floor(px) + 1, Math.floor(py), P.G0); im.set(Math.floor(px), Math.floor(py) + 1, ch.hot && f < 4 ? P.R2 : P.G0); }
      }
    // embers floating in the late smoke
    const r2 = rng(seed + f);
    if (f >= 3)
      for (let i = 0; i < Math.floor(S / 8); i++) {
        const a = r2() * Math.PI * 2, dd = r2() * r * 0.8;
        const x = Math.floor(c + Math.cos(a) * dd), y = Math.floor(c + Math.sin(a) * dd);
        if (im.get(x, y)) im.set(x, y, r2() < 0.5 ? P.Y1 : P.R2);
      }
    out.push(im);
  }
  return out;
}

function puff(S, frames, cols, seed, grow = true) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    const t = f / Math.max(1, frames - 1);
    const im = new Img(S, S);
    const r = (S / 2 - 0.6) * (grow ? 0.55 + 0.45 * t : 1);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2);
        const n = vnoise(x, y + f, 2, 1024, seed);
        if (d > r * (0.8 + 0.3 * n)) continue;
        if (n < t * 0.7 - 0.1) continue;
        const k = (x + y) / (2 * S); // light from the top-left
        const i = k < 0.38 ? 0 : k < 0.6 ? 1 : 2;
        im.set(x, y, cols[i]);
      }
    out.push(im);
  }
  return out;
}

function fireFrames() {
  const out = [];
  for (let f = 0; f < 4; f++) {
    const im = new Img(8, 8);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const ty = y / 7; // 0 top .. 1 bottom
        const w = 0.6 + 2.8 * Math.sin(ty * Math.PI * 0.85);
        const wob = Math.sin(f * 1.7 + y * 1.3) * 0.7;
        const d = Math.abs(x + 0.5 - 4 - wob * (1 - ty));
        if (d > w) continue;
        const heat = (1 - d / w) * 0.6 + ty * 0.6 - (y < 2 ? 0.3 : 0);
        im.set(x, y, heat > 0.95 ? P.W : heat > 0.75 ? P.Y3 : heat > 0.55 ? P.Y2 : heat > 0.35 ? P.Y1 : P.R2);
      }
    out.push(im);
  }
  return out;
}

function spark() {
  const fr = [];
  for (let f = 0; f < 3; f++) {
    const im = new Img(4, 4);
    if (f === 0) { im.rect(1, 0, 2, 4, P.Y3); im.rect(0, 1, 4, 2, P.Y3); im.rect(1, 1, 2, 2, P.W); }
    else if (f === 1) { im.rect(1, 1, 2, 2, P.Y2); im.set(1, 1, P.W); }
    else im.set(1, 1, P.Y1), im.set(2, 2, P.Y1);
    fr.push(im);
  }
  return fr;
}

function ringFrames() {
  const out = [];
  for (let f = 0; f < 4; f++) {
    const S = 24;
    const im = new Img(S, S);
    const th = 2.6 - f * 0.55;
    const rg = M(S, S).ring(12, 12, 10.6 - th, 10.8);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (rg.has(x, y)) {
      const lit = x + y < 22;
      im.set(x, y, f === 0 ? P.W : lit ? P.C2 : P.B3);
    }
    out.push(im);
  }
  return out;
}

function flareFrames() {
  const out = [];
  for (let f = 0; f < 4; f++) {
    const S = 32;
    const im = new Img(S, S);
    const c = 16;
    const rays = 8;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c;
        const d = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx) + f * 0.2;
        const ray = Math.pow(Math.abs(Math.cos((a * rays) / 2)), 8);
        const core = 5 - f * 0.6;
        const v = d < core ? 1 : ray * (1 - d / 15) * 1.3 + Math.max(0, 1 - d / (core + 4)) * 0.6;
        if (v < 0.18) continue;
        const col = v > 0.9 ? P.W : v > 0.6 ? P.Y3 : v > 0.35 ? P.Y2 : P.Y1;
        im.set(x, y, v < 0.3 ? A(col, 170) : col);
      }
    out.push(im);
  }
  return out;
}

function muzzle() {
  const out = [];
  for (let f = 0; f < 2; f++) {
    const im = new Img(8, 8);
    const m = M(8, 8).poly(f ? [[4, 0], [6, 5], [8, 4], [5, 8], [3, 8], [0, 4], [2, 5]] : [[4, 1], [5.5, 5], [7, 5], [4, 8], [1, 5], [2.5, 5]]);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (m.has(x, y)) im.set(x, y, y > 5 ? P.W : y > 3 ? P.Y3 : P.Y2);
    out.push(im);
  }
  return out;
}

function shieldFrames() {
  const out = [];
  for (let f = 0; f < 4; f++) {
    const S = 32;
    const im = new Img(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const dx = x + 0.5 - 16, dy = y + 0.5 - 16;
        const d = Math.hypot(dx, dy);
        if (d > 15) continue;
        // hex lattice lines
        const hx = x + (Math.floor(y / 4) % 2) * 2;
        const hex = (hx % 4 === 0 && y % 4 !== 0) || y % 4 === 0;
        const sweep = Math.abs(((x - y + f * 8 + 64) % 32) - 16) < 3;
        if (d > 13.6) im.set(x, y, A(d > 14.4 ? P.B2 : P.C2, 230));
        else if (hex && (sweep || bayer(x, y) < 0.25)) im.set(x, y, A(sweep ? P.C2 : P.B3, sweep ? 180 : 90));
        else if (dx + dy < -12 && d > 9) im.set(x, y, A(P.W, 120));
      }
    out.push(im);
  }
  return out;
}

function warning() {
  const out = [];
  for (let f = 0; f < 2; f++) {
    const im = new Img(16, 16);
    shade(im, M(16, 16).poly([[8, 1], [15, 14], [1, 14]]), f ? [P.Y0, P.Y1, P.Y2, P.Y3] : [P.R1, P.R2, P.R3, P.Y3], "bevel", { grad: false });
    im.rect(7, 5, 2, 5, P.K);
    im.rect(7, 11, 2, 2, P.K);
    outline(im);
    out.push(im);
  }
  return out;
}

function lockFrames() {
  const out = [];
  for (let f = 0; f < 2; f++) {
    const S = 32;
    const im = new Img(S, S);
    const o = f ? 3 : 1;
    const L = 7;
    const col = f ? P.R3 : P.R2;
    for (let i = 0; i < L; i++) {
      for (const [x, y] of [[o + i, o], [o, o + i], [S - 1 - o - i, o], [S - 1 - o, o + i], [o + i, S - 1 - o], [o, S - 1 - o - i], [S - 1 - o - i, S - 1 - o], [S - 1 - o, S - 1 - o - i]]) im.set(x, y, col);
    }
    for (let i = 13; i < 19; i++) if (i < 15 || i > 16) { im.set(i, 16, col); im.set(16, i, col); }
    outline(im);
    out.push(im);
  }
  return out;
}

function blastGround() {
  const out = [];
  const S = 48;
  for (let f = 0; f < 4; f++) {
    const t = f / 3;
    const im = new Img(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const dx = x + 0.5 - 24, dy = y + 0.5 - 24;
        const d = Math.hypot(dx, dy);
        const n = vnoise(x, y, 4, 4096, 99);
        const R = 20 + n * 4;
        if (d > R) continue;
        const a = Math.atan2(dy, dx);
        const ray = Math.pow(Math.abs(Math.cos(a * 5 + n * 2)), 6);
        if (d > 13 + ray * 9 && d > 13) continue;
        let col;
        if (d < 8 + n * 2) col = d < 4 ? P.K : P.G0;
        else if (d < 12) col = P.T0;
        else col = A(P.T0, 160);
        if (f === 0 && d < 12) col = d < 6 ? P.W : d < 9 ? P.Y3 : P.Y1;
        if (f === 1 && d < 7) col = P.Y1;
        if (f === 1 && d < 4) col = P.Y2;
        if (f >= 2 && d < 5 && n > 0.6 - t * 0.1) col = P.R1; // embers
        im.set(x, y, col);
      }
    out.push(im);
  }
  return out;
}

function hitFrames() {
  const out = [];
  for (let f = 0; f < 3; f++) {
    const im = new Img(8, 8);
    const r = [2, 3, 3.5][f];
    for (let i = -Math.floor(r); i <= Math.floor(r); i++) {
      im.set(4 + i, 4, f === 2 ? P.Y3 : P.W);
      im.set(4, 4 + i, f === 2 ? P.Y3 : P.W);
    }
    if (f < 2) im.rect(3, 3, 2, 2, P.W);
    if (f === 1) for (const [x, y] of [[2, 2], [6, 2], [2, 6], [6, 6]]) im.set(x, y, P.Y2);
    out.push(im);
  }
  return out;
}

export function genFx(reg) {
  const g = { group: "fx" };
  reg.add("fx_explosion_s", explosion(16, 8, 11), { ...g, fps: 20, loop: false });
  reg.add("fx_explosion_m", explosion(32, 8, 23), { ...g, fps: 16, loop: false });
  reg.add("fx_explosion_l", explosion(56, 8, 37), { ...g, fps: 12, loop: false });
  reg.add("fx_smoke", puff(8, 4, [P.G4, P.G3, P.G2], 5), { ...g, fps: 6, loop: false });
  reg.add("fx_fire", fireFrames(), { ...g, fps: 12 });
  reg.add("fx_spark", spark(), { ...g, fps: 12, loop: false });
  reg.add("fx_ring", ringFrames(), { ...g, fps: 10, loop: false });
  reg.add("fx_flare", flareFrames(), { ...g, fps: 10 });
  reg.add("fx_trail", puff(6, 4, [P.W, P.G4, P.G3], 9), { ...g, fps: 10, loop: false });
  reg.add("fx_muzzle", muzzle(), { ...g, fps: 20 });
  reg.add("fx_shield", shieldFrames(), { ...g, fps: 8 });
  reg.add("fx_warning", warning(), { ...g, fps: 6 });
  reg.add("fx_lock", lockFrames(), { ...g, fps: 6 });
  reg.add("fx_blast_ground", blastGround(), { ...g, fps: 8, loop: false });
  reg.add("fx_hit", hitFrames(), { ...g, fps: 24, loop: false });
}

// ------------------------------------------------------------------ pickups (12x12, 4 frames)
const GLYPH = {
  P: ["####.", "#...#", "#...#", "####.", "#....", "#...."],
  B: ["####.", "#...#", "####.", "#...#", "#...#", "####."],
  S: [".####", "#....", ".###.", "....#", "....#", "####."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#.."],
  bolt: ["...#.", "..#..", ".####", "..##.", "..#..", ".#..."],
  dbl: ["..#..", ".#.#.", "#...#", "..#..", ".#.#.", "#...#"],
  mag: ["#...#", "#...#", "#...#", "#...#", "#.#.#", ".###."],
};

function badge(ramp, glyph, frame, glyphCol = P.W) {
  const im = new Img(12, 12);
  const m = M(12, 12).ellipse(6, 6, 5, 5);
  shade(im, m, ramp, "dome");
  // inner ring
  const rg = M(12, 12).ring(6, 6, 3.9, 4.6);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (rg.has(x, y)) im.paint(x, y, x + y < 11 ? ramp[3] : ramp[0]);
  const g = GLYPH[glyph];
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 5; x++) if (g[y][x] === "#") {
      im.set(4 + x, 4 + y, P.K);
      im.set(3 + x, 3 + y, glyphCol);
    }
  // shimmer sweep
  const s = [-4, 1, 6, 11][frame];
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (x + y === s + 4 || x + y === s + 5) {
    const c = im.get(x, y);
    if (c && c[0] !== P.K[0]) im.set(x, y, mix(c, P.W, 0.55));
  }
  outline(im);
  return im;
}

function coin(frame) {
  const im = new Img(12, 12);
  const rx = [4.6, 3.2, 1.2, 3.2][frame];
  shade(im, M(12, 12).ellipse(6, 6, rx, 4.8), RAMP.gold, frame === 2 ? "bevel" : "dome");
  if (frame !== 2) {
    for (let y = 4; y < 9; y++) im.paint(6, y, P.Y0);
    if (frame === 0) { im.paint(5, 4, P.Y0); im.paint(7, 8, P.Y0); }
    im.paint(Math.round(6 - rx * 0.5), 3, P.Y3);
  }
  outline(im);
  return im;
}

export function genPickups(reg) {
  const g = { group: "pickups", fps: 6 };
  const defs = {
    power: [RAMP.red, "P"],
    bomb: [[P.Y0, P.Y1, P.Y2, P.Y3], "B", P.K],
    repair: [RAMP.olive, "+"],
    shield: [RAMP.sky, "S"],
    rapid: [RAMP.gold, "bolt", P.W],
    overdrive: [RAMP.mag, "dbl"],
    magnet: [RAMP.steel, "mag", P.R2],
  };
  reg.add("pickup_coin", [0, 1, 2, 3].map(coin), g);
  for (const [k, [ramp, gl, gc]] of Object.entries(defs)) {
    const fixed = gc === P.K ? P.K : gc ?? P.W;
    reg.add("pickup_" + k, [0, 1, 2, 3].map((f) => badge(ramp, gl, f, fixed)), g);
  }
  // 16x16 ui icons for pickups (ui_icon_bomb is the ordnance icon from gen_ui)
  for (const k of ["coin", "power", "repair", "shield", "rapid", "overdrive", "magnet"]) {
    const src = reg.get("pickup_" + k).frames[0];
    const im = new Img(16, 16);
    im.blit(src, 2, 2);
    reg.add("ui_icon_" + k, im, { group: "ui" });
  }
}
