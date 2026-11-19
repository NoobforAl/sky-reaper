// Biome background tiles (seamless 64x64, water animated 4 frames), decor props (8 per biome) and clouds.
import { Img, Mask, P, BIOME, RAMP, shade, outline, fbm, vnoise, rng, bayer, wreck, mix } from "./lib.mjs";
import { tank } from "./gen_ground.mjs";

const T = 64;
const A = (c, a) => [c[0], c[1], c[2], a];
const M = (w, h) => new Mask(w, h);

/** noisy blob mask */
function blob(w, h, cx, cy, rx, ry, seed, amp = 0.3, cell = 4) {
  const m = M(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      const n = vnoise(x, y, cell, 4096, seed);
      if (d < 1 - amp + n * amp * 2) m.put(x, y);
    }
  return m;
}

/** pick from a list by value in [0,1] with ordered dithering between steps */
function pick(list, v, x, y) {
  const f = Math.max(0, Math.min(0.9999, v)) * list.length;
  let i = Math.floor(f);
  const fr = f - i;
  if (fr > 0.7 && bayer(x, y) < (fr - 0.7) * 2.2 && i < list.length - 1) i++;
  return list[i];
}

// ------------------------------------------------------------------ tiles
// Calm water (round-3 feedback: the old full-tile dash shimmer was tiring on wide screens).
// The water body is STATIC; only a handful of small soft crests animate. Each crest fades in, drifts 1px per frame
// and fades out over the 4-frame loop (it is invisible on its phase-0 frame, so the wrap-around jump never shows).
// Crests are staggered by phase, so every frame changes only ~1% of the tile and nothing flickers tile-wide.
/** wrapped small crest list for a tile, deterministic per seed */
function crests(seed, n) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: Math.floor(r() * T), y: Math.floor(r() * T), len: 2 + Math.floor(r() * 3), phase: Math.floor(r() * 4) });
  return out;
}
/** paint crests: horizontal 2-4px glints, centre brighter. levels[0] = invisible */
function paintCrests(im, list, frame, levels, axis = "x", fieldOk = () => true) {
  for (const c of list) {
    const step = (frame + c.phase) % 4; // 0 hidden, 1 rise, 2 peak, 3 fade
    const lv = [0, 1, 2, 1][step];
    if (!lv) continue;
    for (let i = 0; i < c.len; i++) {
      const d = step; // drift 1px per frame along the travel axis
      const px = axis === "x" ? c.x + i + d : c.x;
      const py = axis === "x" ? c.y : c.y + i + d;
      const x = ((px % T) + T) % T, y = ((py % T) + T) % T;
      if (!fieldOk(x, y)) continue;
      const centre = i > 0 && i < c.len - 1;
      im.set(x, y, levels[centre ? lv : Math.max(1, lv - 1)]);
    }
  }
}

function oceanTile(frame, shallow) {
  const B = BIOME.ocean;
  const im = new Img(T, T);
  // open sea: dark, very low contrast so neither the 64px repeat nor the water competes with bullets
  const d1 = mix(B.deep, B.mid, 0.22), d2 = mix(B.deep, B.mid, 0.45), d3 = mix(B.deep, B.mid, 0.7);
  // only SMALL-scale texture inside the tile (cells 4-8px): large blobs would repeat as a visible 64px grid;
  // large-scale light/dark variation comes from the background renderer's world-anchored patches instead
  const base = shallow ? [B.mid, mix(B.mid, B.shal, 0.5), B.shal] : [mix(B.deep, d1, 0.5), d1, d1, d1, mix(d1, d2, 0.5)];
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const n = shallow ? fbm(x, y, T, 210, 3, 32) : vnoise(x, y, 4, T, 200) * 0.55 + vnoise(x, y, 8, T, 202) * 0.45;
      let c = pick(base, n, x, y);
      // reef/sand patches under shallow water
      if (shallow) {
        const r = fbm(x, y, T, 230, 2, 16);
        if (r > 0.62) c = r > 0.7 ? B.reefL : B.reef;
      }
      // static long swell lines, one step lighter than the water under them, broken up by low-frequency noise
      const band = Math.sin(2 * Math.PI * (y / 16 + 0.7 * vnoise(x, y, 32, T, 300)));
      const gate = vnoise(x, y, 16, T, 301 + (y >> 4));
      if (band > 0.94 && gate > 0.55) c = shallow ? mix(B.shal, B.light, 0.5) : n > 0.5 ? d3 : d2;
      im.set(x, y, c);
    }
  const lv = shallow ? [null, mix(B.shal, B.light, 0.5), mix(B.light, B.foam, 0.4)] : [null, d3, mix(B.mid, B.shal, 0.45)];
  paintCrests(im, crests(shallow ? "crest_shal" : "crest_deep", shallow ? 10 : 9), frame, lv);
  return im;
}

function canopyTile() {
  const J = BIOME.jungle;
  const im = new Img(T, T);
  // understory
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) im.set(x, y, pick([J.g0, J.g1, J.g1], fbm(x, y, T, 400, 2, 16), x, y));
  // tree crowns: random circles, wrapped for seamlessness, sorted by y so lower ones overlap
  const r = rng("canopy");
  const trees = [];
  for (let i = 0; i < 26; i++) trees.push([r() * T, r() * T, 5 + r() * 6, r()]);
  trees.sort((a, b) => a[1] - b[1]);
  for (const [tx, ty, tr, k] of trees) {
    const ramp = k < 0.33 ? [J.g1, J.g2, J.g3, J.g4] : k < 0.8 ? [J.g2, J.g3, J.g4, J.g5] : [J.g1, J.g2, J.g4, J.g5];
    for (let y = -12; y <= 12; y++)
      for (let x = -12; x <= 12; x++) {
        const px = Math.floor(tx + x), py = Math.floor(ty + y);
        const dx = (px + 0.5 - tx) / tr, dy = (py + 0.5 - ty) / tr;
        const d = Math.hypot(dx, dy);
        const n = vnoise(px, py, 2, T, 410);
        if (d > 0.85 + n * 0.3) continue;
        const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d) ** 2));
        const L = -0.6 * dx - 0.6 * dy + nz * 0.7 + (n - 0.5) * 0.5;
        const c = L > 0.95 ? ramp[3] : L > 0.55 ? ramp[2] : L > 0.1 ? ramp[1] : ramp[0];
        im.set(((px % T) + T) % T, ((py % T) + T) % T, c);
      }
  }
  // flowers
  for (let i = 0; i < 6; i++) im.set(Math.floor(r() * T), Math.floor(r() * T), i % 2 ? hexish("#e05a8a") : hexish("#f0d060"));
  return im;
}
function hexish(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

function riverTile(frame) {
  const J = BIOME.jungle;
  const im = new Img(T, T);
  // static water body + a few soft glints drifting downstream 1px/frame (no full-pool scroll)
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const n = fbm(x, y, T, 500, 3, 32);
      im.set(x, y, pick([J.river0, J.river0, J.river1, J.river1], n, x, y));
    }
  paintCrests(im, crests("river_glint", 26), frame, [null, mix(J.river1, J.river2, 0.5), J.river2], "y");
  // lily pads (static)
  const r = rng("lily");
  for (let i = 0; i < 5; i++) {
    const cx = Math.floor(r() * T), cy = Math.floor(r() * T);
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 4 && !(x === 1 && y === 0)) im.set((cx + x + T) % T, (cy + y + T) % T, x + y < 0 ? J.g4 : J.g3);
  }
  return im;
}

function sandTile() {
  const D = BIOME.desert;
  const im = new Img(T, T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const n = fbm(x, y, T, 600, 3, 32);
      // diagonal ripples (period 8 along x+y keeps seamless on 64)
      const rp = Math.sin(((x + y * 2 + n * 18) / 8) * Math.PI * 2);
      let c = pick([D.s1, D.s2, D.s3, D.s3], n * 0.8 + 0.15, x, y);
      if (rp > 0.82) c = D.s4;
      else if (rp < -0.88) c = D.s1;
      im.set(x, y, c);
    }
  const r = rng("pebbles");
  for (let i = 0; i < 14; i++) im.set(Math.floor(r() * T), Math.floor(r() * T), i % 3 ? D.rock1 : D.rock0);
  return im;
}

function rockTile() {
  const D = BIOME.desert;
  const im = new Img(T, T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const n = fbm(x, y, T, 650, 3, 16);
      let c = pick([D.s0, D.s1, D.s1, D.s2], n, x, y);
      // cracks: cell borders of a coarse value lattice
      const v1 = vnoise(x, y, 8, T, 660), v2 = vnoise(x + 1, y + 1, 8, T, 660);
      if (Math.abs(v1 - 0.5) < 0.03) c = D.rock0;
      else if (Math.abs(v2 - 0.5) < 0.03) c = D.s3;
      im.set(x, y, c);
    }
  return im;
}

function snowTile() {
  const I = BIOME.arctic;
  const im = new Img(T, T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const n = fbm(x, y, T, 700, 3, 32);
      let c = pick([I.i2, I.i3, I.i4, I.i4, I.w], n, x, y);
      const drift = Math.sin(((x * 2 - y + n * 20) / 16) * Math.PI * 2);
      if (drift > 0.96 && bayer(x, y) < 0.6) c = I.w;
      else if (drift < -0.97) c = I.i3;
      im.set(x, y, c);
    }
  return im;
}

function iceTile() {
  const I = BIOME.arctic;
  const im = new Img(T, T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const n = fbm(x, y, T, 750, 3, 32);
      let c = pick([I.i0, I.i1, I.i1, I.i2], n, x, y);
      const cr = vnoise(x, y, 32, T, 760) * 0.8 + vnoise(x, y, 4, T, 761) * 0.2;
      if (Math.abs(cr - 0.5) < 0.014) c = I.i0;
      else if (cr - 0.5 > 0 && cr - 0.5 < 0.03) c = I.i3;
      if ((x - y + 128) % 23 === 0 && n > 0.55) c = I.i3; // glints
      im.set(x, y, c);
    }
  return im;
}

function metalTile() {
  const C = BIOME.citadel;
  const im = new Img(T, T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const px = x % 32, py = y % 32;
      const n = fbm(x, y, T, 800, 2, 16);
      let c = pick([C.m1, C.m2, C.m2], n, x, y);
      if (px === 0 || py === 0) c = C.m0;
      else if (px === 1 || py === 1) c = C.m3;
      else if (px === 31 || py === 31) c = C.m1;
      if ((px === 4 || px === 27) && (py === 4 || py === 27)) c = C.m4; // rivets
      im.set(x, y, c);
    }
  // hazard stripe band on one plate (kept off the tile border so the _b hatch variant can share edges)
  for (let y = 40; y < 44; y++) for (let x = 6; x < 28; x++) im.set(x, y, ((x + y) >> 1) % 2 ? C.haz : C.m0);
  for (let x = 6; x < 28; x++) { im.set(x, 39, C.m0); im.set(x, 44, C.m3); }
  // conduit with neon
  for (let y = 6; y < 27; y++) { im.set(48, y, C.m0); im.set(49, y, C.neonD); im.set(50, y, C.m0); im.set(51, y, C.m1); }
  im.set(49, 6, C.m3); im.set(49, 26, C.m3);
  im.set(49, 12, C.neon); im.set(49, 20, C.neon);
  // scuffs / oil stains for wear
  const r = rng("metalwear");
  for (let i = 0; i < 18; i++) {
    const x = 3 + Math.floor(r() * 58), y = 3 + Math.floor(r() * 58);
    if (x % 32 > 2 && x % 32 < 30 && y % 32 > 2 && y % 32 < 30) im.set(x, y, r() < 0.5 ? C.m1 : C.m3);
  }
  return im;
}

function gratingTile(frame) {
  const C = BIOME.citadel;
  const im = new Img(T, T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const gx = x % 4, gy = y % 4;
      let c = gx === 0 || gy === 0 ? C.m3 : gx === 1 || gy === 1 ? C.m2 : C.m0;
      // deep machinery glow under the grating
      const g = vnoise(x, y, 16, T, 900);
      if (gx > 1 && gy > 1 && g > 0.6) c = g > 0.7 ? C.cyD : C.m1;
      im.set(x, y, c);
    }
  // circuit traces: a short soft pulse travels along each trace (muted colours, slow manifest fps)
  const pulse = frame * 16;
  const cyM = mix(C.cyD, C.cy, 0.45), neM = mix(C.neonD, C.neon, 0.45);
  for (let x = 0; x < T; x++) {
    im.set(x, 20, ((x - pulse + 64) % 64) < 3 ? cyM : C.cyD);
    im.set(x, 52, ((x + pulse) % 64) < 3 ? neM : C.neonD);
  }
  for (let y = 20; y < 52; y++) im.set(36, y, ((y - pulse + 64) % 64) < 2 ? cyM : C.cyD);
  return im;
}

// ------------------------------------------------------------------ _b variants (share every edge with _a)
// A `_b` tile = the matching `_a` frame with a feature painted into its interior only. The outer EDGE px ring is
// copied verbatim from `_a`, so _a/_b can be mixed freely in any arrangement (and any animation frame offset)
// without seams.
const EDGE = 6;
/** organic interior field: > 0 inside the feature, <= 0 within EDGE px of the tile border */
function field(seed, R, amp = 0.3, cx = 32, cy = 32, sx = 1, sy = 1) {
  const f = new Float32Array(T * T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const d = Math.hypot((x + 0.5 - cx) / sx, (y + 0.5 - cy) / sy) / R;
      const n = vnoise(x, y, 8, 4096, seed) * 0.7 + vnoise(x, y, 3, 4096, seed + 1) * 0.3;
      const ed = Math.min(x, y, T - 1 - x, T - 1 - y) - EDGE;
      f[y * T + x] = Math.min(1 - d + (n - 0.5) * amp * 2, ed / 8);
    }
  return f;
}
const at = (f, x, y) => (x < 0 || y < 0 || x >= T || y >= T ? -1 : f[y * T + x]);

function oceanTileB(frame) {
  const B = BIOME.ocean;
  const deep = oceanTile(frame, false), shal = oceanTile(frame, true);
  const f = field(1201, 24, 0.35, 32, 33, 1.15, 0.9);
  const im = deep.clone();
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const v = at(f, x, y);
      if (v <= 0) continue;
      // dithered depth falloff into the shoal, then a sand bar with lapping foam in the very centre
      if (v < 0.18 && bayer(x, y) > v / 0.18) continue;
      let c = shal.get(x, y);
      // foam ring: static texture, its inner edge laps 1 step in/out over the loop (only a thin ring changes)
      const lap = [0, 0.02, 0.04, 0.02][frame % 4];
      if (v > 0.7 + lap) c = v > 0.8 ? (x + y < 60 ? hexish("#ecdcaa") : B.sand) : vnoise(x, y, 2, 4096, 77) > 0.5 ? B.foam : mix(B.foam, B.light, 0.5);
      else if (v > 0.56 && bayer(x, y) < 0.5) c = B.reefL;
      im.set(x, y, c);
    }
  // dark wet-sand rim on the bar's shadow side
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (at(f, x, y) > 0.8 && at(f, x + 1, y + 1) <= 0.8) im.set(x, y, B.sandD);
  return im;
}

function jungleTileB(frame) {
  const J = BIOME.jungle;
  const im = canopyTile();
  const water = riverTile(frame);
  const f = field(1301, 18, 0.35, 32, 32, 1.1, 0.95);
  const r = rng("clearing");
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const v = at(f, x, y);
      if (v <= 0) continue;
      let c;
      if (v > 0.45) c = water.get(x, y); // jungle pool (animated)
      else if (v > 0.38) c = (x + y) % 3 ? J.dirt1 : J.dirt0; // muddy bank
      else c = pick([J.g2, J.g3, J.g3, J.dirt1], vnoise(x, y, 4, 4096, 1302), x, y); // grassy clearing
      // canopy casts shadow down-right into the clearing
      if (at(f, x - 1, y - 1) <= 0 || at(f, x - 2, y - 2) <= 0 || at(f, x - 3, y - 2) <= 0) c = v > 0.45 ? J.river0 : J.g1;
      im.set(x, y, c);
    }
  // bank highlights + reeds
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const v = at(f, x, y);
    if (v > 0.38 && v <= 0.45 && at(f, x - 1, y - 1) <= 0.38) im.set(x, y, J.dirt2);
  }
  for (let i = 0; i < 14; i++) {
    const x = 14 + Math.floor(r() * 36), y = 14 + Math.floor(r() * 36);
    const v = at(f, x, y);
    if (v > 0.33 && v < 0.47) { im.set(x, y, J.g5); im.set(x, y - 1, J.g4); }
  }
  return im;
}

function desertTileB() {
  const D = BIOME.desert;
  const sand = sandTile(), rock = rockTile();
  const f = field(1401, 25, 0.45, 32, 32, 1.2, 0.85);
  const im = sand.clone();
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const v = at(f, x, y);
      if (v <= 0) continue;
      if (v < 0.2 && bayer(x, y) > v / 0.2) continue; // sand drifting over the hardpan edge
      im.set(x, y, rock.get(x, y));
    }
  // boulders on the hardpan, lit top-left with a cast shadow
  const r = rng("boulders");
  for (let i = 0; i < 5; i++) {
    const bx = 20 + r() * 24, by = 20 + r() * 24, br = 1.6 + r() * 2.2;
    if (at(f, Math.round(bx), Math.round(by)) < 0.3) continue;
    for (let y = -4; y <= 5; y++) for (let x = -4; x <= 5; x++) {
      const d = Math.hypot(x - 1, y - 1) / br;
      if (d <= 1) im.set(Math.round(bx + x), Math.round(by + y), D.s0);
    }
    const m = new Mask(T, T).ellipse(bx, by, br, br * 0.85);
    shade(im, m, [D.rock0, D.rock1, D.rock2, D.s3], "dome");
  }
  return im;
}

function arcticTileB() {
  const I = BIOME.arctic;
  const snow = snowTile(), ice = iceTile();
  const f = field(1501, 17, 0.3, 32, 32, 1.15, 0.95);
  const im = snow.clone();
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const v = at(f, x, y);
      if (v > 0) {
        let c = ice.get(x, y);
        // the snow bank shades the top-left inside edge of the frozen pond
        if (at(f, x - 1, y - 1) <= 0 || at(f, x - 2, y - 1) <= 0) c = I.i0;
        // light sheen streak across the ice
        else if (Math.abs(x - y + 6) < 1.5 && v > 0.25) c = I.i3;
        im.set(x, y, c);
      } else if (at(f, x + 1, y + 1) > 0 || at(f, x + 1, y) > 0 || at(f, x, y + 1) > 0) im.set(x, y, I.w); // bright bank lip
      else if (at(f, x - 1, y - 1) > 0 || at(f, x - 1, y) > 0) im.set(x, y, I.i3);
    }
  return im;
}

function citadelTileB(frame) {
  const C = BIOME.citadel;
  const a = metalTile();
  const g = gratingTile(frame);
  const im = a.clone();
  const x0 = 8, x1 = 55; // recessed maintenance hatch over the plate seams
  for (let y = x0; y <= x1; y++)
    for (let x = x0; x <= x1; x++) {
      let c = g.get(x, y);
      if (x === x0 || y === x0) c = C.m0; // recess shadow (light from top-left)
      else if (x === x0 + 1 || y === x0 + 1) c = C.m1;
      else if (x === x1 || y === x1) c = C.m4;
      else if (x === x1 - 1 || y === x1 - 1) c = C.m3;
      im.set(x, y, c);
    }
  // frame lip around the hatch + corner bolts + status lights
  for (let i = x0 - 1; i <= x1 + 1; i++) { im.set(i, x0 - 1, C.m4); im.set(x0 - 1, i, C.m4); im.set(i, x1 + 1, C.m0); im.set(x1 + 1, i, C.m0); }
  for (const [x, y] of [[x0 + 3, x0 + 3], [x1 - 3, x0 + 3], [x0 + 3, x1 - 3], [x1 - 3, x1 - 3]]) { im.set(x, y, C.m4); im.set(x + 1, y + 1, C.m0); }
  for (let i = 0; i < 4; i++) im.set(x0 + 6 + i * 3, x1 - 3, i === frame ? C.neon : C.neonD);
  for (let i = 0; i < 8; i++) im.set(x1 - 4 - i, x0 + 3, (i >> 1) % 2 ? C.haz : C.m0);
  return im;
}

/** sanity: assert _b keeps _a's border ring */
function assertSharedEdges(key, as, bs) {
  for (let i = 0; i < bs.length; i++) {
    const A0 = as[i % as.length], B0 = bs[i];
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        if (Math.min(x, y, T - 1 - x, T - 1 - y) >= 3) continue;
        const p = A0.get(x, y), q = B0.get(x, y);
        if (String(p) !== String(q)) throw new Error(`${key} frame ${i}: edge pixel ${x},${y} differs from _a`);
      }
  }
}

// ------------------------------------------------------------------ decor helpers
function island(w, h, seed, palms) {
  const B = BIOME.ocean, J = BIOME.jungle;
  const im = new Img(w, h);
  // shallow halo (semi transparent)
  const halo = blob(w, h, w / 2, h / 2, w / 2 - 0.5, h / 2 - 0.5, seed, 0.18);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (halo.has(x, y)) im.set(x, y, A(B.reefL, 110));
  const sand = blob(w, h, w / 2, h / 2, w / 2 - 3, h / 2 - 3, seed + 1, 0.22);
  shade(im, sand, [B.sandD, B.sand, hexish("#ecdcaa"), hexish("#fff2cc")], "bevel");
  const grass = blob(w, h, w / 2 - 1, h / 2 - 1, w / 2 - 6, h / 2 - 6, seed + 2, 0.3);
  shade(im, grass, [J.g2, J.g3, J.g4, J.g5], "dome");
  const r = rng(seed);
  for (let i = 0; i < palms; i++) palm(im, w / 2 - 6 + r() * 12, h / 2 - 5 + r() * 10, 4 + r() * 2);
  return im;
}

function palm(im, cx, cy, R) {
  const J = BIOME.jungle;
  for (let a = 0; a < 6; a++) {
    const t = (a / 6) * Math.PI * 2 + 0.4;
    for (let d = 0; d <= R; d++) {
      const x = Math.round(cx + Math.cos(t) * d), y = Math.round(cy + Math.sin(t) * d);
      im.set(x, y, d < R * 0.5 ? J.g4 : t > Math.PI ? J.g5 : J.g3);
      if (d > 1) im.set(x + (Math.abs(Math.sin(t)) > 0.5 ? 1 : 0), y + (Math.abs(Math.sin(t)) > 0.5 ? 0 : 1), J.g2);
    }
  }
  im.set(Math.round(cx), Math.round(cy), J.dirt1);
}

function treeCluster(w, h, seed, n, ramp) {
  const im = new Img(w, h);
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([3 + r() * (w - 6), 3 + r() * (h - 6), 3 + r() * Math.min(w, h) * 0.18]);
  pts.sort((a, b) => a[1] - b[1]);
  for (const [x, y, rr] of pts) {
    const m = blob(w, h, x, y, rr, rr, seed + Math.floor(x * 7 + y), 0.2, 2);
    shade(im, m, ramp, "dome");
  }
  outline(im, ramp[0] === BIOME.jungle.g1 ? BIOME.jungle.g0 : P.K);
  return im;
}

function crater(S, seed, ground) {
  const im = new Img(S, S);
  const rim = blob(S, S, S / 2, S / 2, S / 2 - 1, S / 2 - 1.5, seed, 0.15);
  shade(im, rim, [ground[0], ground[1], ground[2], ground[3]], "bevel", { grad: false });
  const pit = blob(S, S, S / 2 + 0.5, S / 2 + 0.5, S / 2 - 3.5, S / 2 - 4, seed + 1, 0.15);
  // inverted shading for a hole: dark at top-left
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (!pit.has(x, y)) continue;
      const k = (x + y) / (2 * S);
      im.set(x, y, k < 0.45 ? P.K : k < 0.6 ? P.G0 : ground[0]);
    }
  return im;
}

function rocks(w, h, seed, ramp, n = 3) {
  const im = new Img(w, h);
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const rx = 2 + r() * (w / 4), ry = 2 + r() * (h / 4);
    const m = blob(w, h, rx + 1 + r() * (w - 2 * rx - 2), ry + 1 + r() * (h - 2 * ry - 2), rx, ry, seed + i, 0.25, 2);
    shade(im, m, ramp, "bevel");
  }
  outline(im);
  return im;
}

function hut(S, roof, wall) {
  const im = new Img(S, S);
  shade(im, M(S, S).rect(2, 3, S - 4, S - 5), roof, "cylH");
  for (let x = 3; x < S - 3; x += 2) im.paint(x, 3 + Math.floor((S - 5) / 2), roof[0]);
  shade(im, M(S, S).rect(4, S - 3, 3, 2), wall, "bevel");
  outline(im);
  return im;
}

// ------------------------------------------------------------------ decor per biome
function oceanDecor() {
  const B = BIOME.ocean;
  const out = [];
  out.push(island(32, 24, 11, 2));
  out.push(island(48, 40, 12, 5));
  out.push(rocks(16, 12, 13, RAMP.steel, 3));
  {
    const im = new Img(32, 24);
    const m = blob(32, 24, 16, 12, 15, 11, 14, 0.35, 3);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) if (m.has(x, y)) {
      const n = vnoise(x, y, 2, 4096, 15);
      im.set(x, y, n > 0.6 ? A(B.reefL, 200) : n > 0.35 ? A(B.reef, 170) : A(B.shal, 120));
    }
    out.push(im); // reef
  }
  {
    const im = new Img(16, 32); // shipwreck: broken hull half-submerged
    shade(im, M(16, 32).poly([[4, 4], [12, 3], [13, 18], [10, 29], [5, 27], [3, 15]]), RAMP.rust, "bevel");
    for (let y = 6; y < 26; y += 4) im.paint(8, y, P.K), im.paint(9, y, P.K);
    im.paint(7, 10, P.G0);
    outline(im, B.deep);
    for (let x = 2; x < 14; x += 3) im.set(x, 30, A(B.foam, 180));
    out.push(im);
  }
  {
    const im = new Img(8, 8); // buoy
    shade(im, M(8, 8).ellipse(4, 4, 2.6, 2.6), RAMP.red, "dome");
    im.set(4, 3, P.W);
    outline(im);
    out.push(im);
  }
  {
    const im = new Img(32, 32); // oil platform
    for (const [x, y] of [[4, 4], [24, 4], [4, 24], [24, 24]]) shade(im, M(32, 32).rect(x, y, 4, 4), RAMP.dsteel, "bevel");
    shade(im, M(32, 32).rect(6, 6, 20, 20), RAMP.steel, "bevel");
    for (let x = 7; x < 25; x += 2) im.paint(x, 7, P.Y2);
    shade(im, M(32, 32).ellipse(20, 12, 3.5, 3.5), RAMP.lsteel, "dome");
    shade(im, M(32, 32).ellipse(12, 19, 4, 4), RAMP.steel, "bevel");
    for (const [x, y] of [[11, 17], [11, 18], [11, 19], [11, 20], [11, 21], [12, 19], [13, 19], [14, 17], [14, 18], [14, 19], [14, 20], [14, 21]]) im.paint(x, y, P.Y2);
    im.line(22, 22, 28, 28, P.G3);
    im.set(28, 28, P.Y2);
    outline(im);
    out.push(im);
  }
  {
    const im = new Img(16, 8); // whitecaps
    for (const [x, y, l] of [[1, 2, 5], [8, 5, 6], [10, 1, 3]]) for (let i = 0; i < l; i++) im.set(x + i, y, A(i === 0 || i === l - 1 ? B.foam : B.white, 210));
    out.push(im);
  }
  return out;
}

function jungleDecor() {
  const J = BIOME.jungle;
  const out = [];
  out.push(treeCluster(32, 32, 21, 7, [J.g1, J.g2, J.g3, J.g4]));
  out.push(treeCluster(24, 24, 22, 3, [J.g2, J.g3, J.g4, J.g5]));
  {
    const im = new Img(16, 16);
    palm(im, 8, 8, 6.5);
    outline(im, J.g0);
    out.push(im);
  }
  out.push(hut(16, [J.dirt0, J.dirt1, J.dirt2, hexish("#b89a5a")], RAMP.tan));
  {
    const im = new Img(32, 32); // stepped temple ruins
    const ramps = [[P.G0, P.G1, P.G2, P.G3], [P.G1, P.G2, P.G3, P.G4]];
    for (let i = 0; i < 3; i++) shade(im, M(32, 32).rect(2 + i * 5, 2 + i * 5, 28 - i * 10, 28 - i * 10), ramps[i % 2], "bevel");
    const r = rng("vines");
    for (let i = 0; i < 40; i++) im.paint(Math.floor(r() * 32), Math.floor(r() * 32), r() < 0.5 ? J.g3 : J.g2);
    outline(im);
    out.push(im);
  }
  out.push(crater(16, 23, [J.dirt0, J.dirt1, J.dirt2, hexish("#a88a5a")]));
  out.push(rocks(16, 12, 24, [P.G1, P.G2, P.G3, P.G4], 3));
  {
    const im = new Img(40, 12); // wooden bridge (spans a river horizontally)
    shade(im, M(40, 12).rect(0, 2, 40, 8), [J.dirt0, J.dirt1, J.dirt2, hexish("#b89a5a")], "bevel", { grad: false });
    for (let x = 2; x < 40; x += 3) im.paint(x, 2 + 1, J.dirt0), im.vline(x, 3, 8, J.dirt0);
    im.hline(0, 39, 1, J.dirt0);
    im.hline(0, 39, 10, J.dirt0);
    for (let x = 0; x < 40; x += 8) { im.set(x, 0, J.dirt1); im.set(x, 11, J.dirt1); }
    out.push(im);
  }
  return out;
}

function desertDecor() {
  const D = BIOME.desert;
  const out = [];
  {
    const im = new Img(48, 24); // dune
    const m = blob(48, 24, 24, 13, 23, 10, 31, 0.15, 6);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) if (m.has(x, y)) {
      const ridge = 12 + Math.sin(x / 7) * 2;
      im.set(x, y, y < ridge - 1 ? (y < ridge - 6 ? D.s3 : D.s4) : y < ridge + 1 ? D.s4 : y < ridge + 5 ? D.s1 : D.s2);
    }
    out.push(im);
  }
  out.push(rocks(24, 16, 32, [D.rock0, D.rock1, D.rock2, D.s3], 4));
  {
    const im = new Img(40, 32); // mesa
    const top = blob(40, 32, 20, 13, 17, 11, 33, 0.18, 4);
    const side = blob(40, 32, 21, 17, 18, 12, 33, 0.18, 4);
    shade(im, side, [D.rock0, D.rock0, D.rock1, D.rock1], "bevel");
    shade(im, top, [D.s1, D.s2, D.s3, D.s4], "bevel");
    outline(im, D.rock0);
    out.push(im);
  }
  {
    const im = new Img(24, 24); // oasis: pond + palms
    const pond = blob(24, 24, 12, 13, 8, 6, 34, 0.2);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (pond.has(x, y)) im.set(x, y, x + y < 22 ? BIOME.ocean.shal : BIOME.ocean.mid);
    outline(im, D.s1);
    palm(im, 6, 7, 5);
    palm(im, 18, 17, 5);
    out.push(im);
  }
  out.push(wreck(tank(16, 0, RAMP.tan, { turretR: 0.21 }), "desert_wreck"));
  out.push(hut(16, [P.T1, P.T2, P.T3, hexish("#f4e2b0")], RAMP.olive)); // tent
  out.push(crater(16, 35, [D.s0, D.s1, D.s2, D.s3]));
  {
    const im = new Img(24, 8); // sandbag wall
    for (let i = 0; i < 5; i++) shade(im, M(24, 8).ellipse(3 + i * 4.5, 4, 2.6, 2.4), RAMP.tan, "dome");
    outline(im);
    out.push(im);
  }
  return out;
}

function arcticDecor() {
  const I = BIOME.arctic;
  const ice = [I.i1, I.i2, I.i3, I.w];
  const out = [];
  {
    const im = new Img(32, 24);
    shade(im, blob(32, 24, 16, 12, 14, 10, 41, 0.25, 4), ice, "bevel");
    outline(im, I.i0);
    out.push(im);
  }
  const pineR = [hexish("#1c3a34"), hexish("#2a5446"), hexish("#3e7058"), I.w];
  {
    const im = new Img(24, 24);
    const r = rng("pines");
    for (let i = 0; i < 5; i++) pine(im, 4 + r() * 16, 4 + r() * 16, 3 + r() * 2, pineR);
    out.push(im);
  }
  {
    const im = new Img(12, 16);
    pine(im, 6, 8, 5, pineR);
    out.push(im);
  }
  out.push(rocks(24, 16, 43, [I.rock0, I.rock1, I.i2, I.w], 3));
  {
    const im = new Img(40, 32); // iceberg
    shade(im, blob(40, 32, 20, 17, 18, 13, 44, 0.2, 5), [I.i0, I.i1, I.i2, I.i3], "bevel");
    shade(im, blob(40, 32, 18, 14, 11, 8, 45, 0.25, 3), [I.i2, I.i3, I.i4, I.w], "dome");
    outline(im, I.water0);
    out.push(im);
  }
  out.push(hut(16, [I.i2, I.i3, I.i4, I.w], RAMP.rust)); // snowy cabin
  {
    const im = new Img(12, 12); // fuel drums
    for (const [x, y] of [[3.5, 3.5], [8.5, 4], [5, 8.5]]) shade(im, M(12, 12).ellipse(x, y, 2.4, 2.4), RAMP.olive, "dome");
    outline(im);
    out.push(im);
  }
  out.push(crater(16, 46, [I.rock0, I.rock1, I.i2, I.i3]));
  return out;
}

function pine(im, cx, cy, R, ramp) {
  // top-down conifer: star of layered needles, snow-dusted highlights
  for (let y = -R; y <= R; y++)
    for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y);
      const a = Math.atan2(y, x);
      const lobes = 0.75 + 0.25 * Math.cos(a * 8);
      if (d > R * lobes) continue;
      const L = (-x - y) / (2 * R) + (1 - d / R) * 0.6;
      im.set(Math.round(cx + x), Math.round(cy + y), L > 0.75 ? ramp[3] : L > 0.35 ? ramp[2] : L > -0.1 ? ramp[1] : ramp[0]);
    }
}

function citadelDecor() {
  const C = BIOME.citadel;
  const metal = [C.m1, C.m2, C.m3, C.m4];
  const out = [];
  {
    const im = new Img(48, 12); // pipes
    shade(im, M(48, 12).rect(0, 1, 48, 4), metal, "cylH");
    shade(im, M(48, 12).rect(0, 6, 48, 5), metal, "cylH");
    for (const x of [10, 30]) shade(im, M(48, 12).rect(x, 0, 3, 12), RAMP.steel, "bevel");
    im.set(20, 8, C.neon);
    outline(im, C.m0);
    out.push(im);
  }
  {
    const im = new Img(16, 16); // vent fan
    shade(im, M(16, 16).rect(1, 1, 14, 14), metal, "bevel");
    shade(im, M(16, 16).ellipse(8, 8, 5.5, 5.5), [P.K, C.m0, C.m1, C.m2], "bevel");
    for (let a = 0; a < 4; a++) {
      const t = (a / 4) * Math.PI * 2 + 0.3;
      for (let d = 1; d < 5; d++) im.set(Math.round(8 + Math.cos(t) * d - 0.5), Math.round(8 + Math.sin(t) * d - 0.5), C.m3);
    }
    outline(im, C.m0);
    out.push(im);
  }
  {
    const im = new Img(32, 32); // landing pad
    shade(im, M(32, 32).poly([[9, 1], [23, 1], [31, 9], [31, 23], [23, 31], [9, 31], [1, 23], [1, 9]]), metal, "bevel");
    const ring = M(32, 32).ring(16, 16, 10, 11);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (ring.has(x, y)) im.set(x, y, (x + y) % 4 < 2 ? C.haz : C.m0);
    for (let i = 0; i < 4; i++) {
      const t = (i / 4) * Math.PI * 2 + Math.PI / 4;
      im.set(Math.round(16 + Math.cos(t) * 13 - 0.5), Math.round(16 + Math.sin(t) * 13 - 0.5), C.cy);
    }
    outline(im, C.m0);
    out.push(im);
  }
  {
    const im = new Img(8, 16); // light pylon
    shade(im, M(8, 16).rect(2, 3, 4, 12), metal, "bevel");
    shade(im, M(8, 16).ellipse(4, 3.5, 3, 3), [C.neonD, C.neon, hexish("#ff9ab4"), P.W], "dome");
    outline(im, C.m0);
    out.push(im);
  }
  {
    const im = new Img(24, 24); // silo
    shade(im, M(24, 24).ellipse(12, 12, 10.5, 10.5), metal, "dome");
    const ring = M(24, 24).ring(12, 12, 6, 7);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (ring.has(x, y)) im.paint(x, y, C.m0);
    shade(im, M(24, 24).ellipse(12, 12, 3, 3), [C.cyD, C.cy, hexish("#9ff4ff"), P.W], "dome");
    outline(im, C.m0);
    out.push(im);
  }
  {
    const im = new Img(32, 8); // cable bundle
    for (const [y, c] of [[1, C.m3], [3, C.neonD], [5, C.m2]]) for (let x = 0; x < 32; x++) im.set(x, y + Math.round(Math.sin(x / 5 + y) * 0.8), c);
    outline(im, C.m0);
    out.push(im);
  }
  {
    const im = new Img(16, 16); // crate stack
    for (const [x, y] of [[1, 6], [8, 6], [4, 1]]) {
      shade(im, M(16, 16).rect(x, y, 7, 7), [P.T0, P.T1, P.T2, P.T3], "bevel");
      im.line(x, y, x + 6, y + 6, P.T0);
    }
    outline(im);
    out.push(im);
  }
  {
    const im = new Img(32, 32); // reactor cooling tower (top-down)
    shade(im, M(32, 32).ellipse(16, 16, 15, 15), metal, "dome");
    const hole = M(32, 32).ellipse(16, 16, 9, 9);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (hole.has(x, y)) {
      const k = (x + y) / 64;
      im.set(x, y, k < 0.5 ? P.K : vnoise(x, y, 3, 4096, 77) > 0.6 ? C.cyD : C.m0);
    }
    outline(im, C.m0);
    out.push(im);
  }
  return out;
}

// ------------------------------------------------------------------ clouds
function cloud(w, h, seed) {
  const im = new Img(w, h);
  const r = rng(seed);
  const puffs = [];
  const n = Math.round(w / 7);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const pr = h * (0.22 + 0.2 * Math.sin(t * Math.PI)) + r() * 2;
    puffs.push([w * 0.08 + t * w * 0.84 + (r() - 0.5) * 3, h * 0.55 - Math.sin(t * Math.PI) * h * 0.12 + (r() - 0.5) * 3, pr]);
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let best = -1, inside = false;
      for (const [px, py, pr] of puffs) {
        const dx = (x + 0.5 - px) / pr, dy = (y + 0.5 - py) / pr;
        const d = dx * dx + dy * dy;
        if (d <= 1) {
          inside = true;
          const nz = Math.sqrt(1 - d);
          const L = -0.55 * dx - 0.7 * dy + 0.5 * nz;
          best = Math.max(best, L);
        }
      }
      if (!inside) continue;
      const c = best > 0.6 ? P.W : best > 0.2 ? P.G4 : best > -0.2 ? P.G3 : P.G2;
      im.set(x, y, A(c, 225));
    }
  return im;
}

export function genWorld(reg) {
  const t = { group: "tiles" };
  const F4 = [0, 1, 2, 3];
  const tiles = {
    ocean: [F4.map((f) => oceanTile(f, false)), F4.map(oceanTileB), 3, 3],
    jungle: [[canopyTile()], F4.map(jungleTileB), 0, 3],
    desert: [[sandTile()], [desertTileB()], 0, 0],
    arctic: [[snowTile()], [arcticTileB()], 0, 0],
    citadel: [[metalTile()], F4.map(citadelTileB), 0, 3],
  };
  for (const [b, [fa, fb, fpsA, fpsB]] of Object.entries(tiles)) {
    assertSharedEdges(`bgtile_${b}_b`, fa, fb);
    reg.add(`bgtile_${b}_a`, fa, fpsA ? { ...t, fps: fpsA } : t);
    reg.add(`bgtile_${b}_b`, fb, fpsB ? { ...t, fps: fpsB } : t);
  }
  const decor = { ocean: oceanDecor(), jungle: jungleDecor(), desert: desertDecor(), arctic: arcticDecor(), citadel: citadelDecor() };
  for (const [b, list] of Object.entries(decor)) list.forEach((im, i) => reg.add(`bgdeco_${b}_${i + 1}`, im, { group: "decor_" + b }));
  reg.add("bgcloud_1", cloud(64, 32, 51), { group: "clouds" });
  reg.add("bgcloud_2", cloud(48, 24, 52), { group: "clouds" });
  reg.add("bgcloud_3", cloud(32, 16, 53), { group: "clouds" });
}
