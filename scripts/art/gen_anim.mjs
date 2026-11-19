// Enemy animation extras (round 5, "better enemy animations"). Runs after genAirEnemies + genGroundEnemies and derives:
//   enemy_<id>_bankl / _bankr      air units: banking frames (same frame layout as the base strip; renderer already picks them)
//   enemy_<id>_dmg                 every enemy: damaged variant (scorch, smoke holes, flickering embers, soot streaks), < 50 % HP
//   enemy_<id>_bankl_dmg / _bankr_dmg   air units: damaged banking frames
//   enemy_<id>_gun                 turret overlays become 3-frame STATE strips: 0 rest, 1 fire (recoil + flash), 2 return
//   enemy_<id>_burn                ground units: burning wreck, 3-frame loop (drawn instead of `_dead` while it burns)
//   debris_s / debris_m / debris_l 4 chunk variants each (state strips: pick a frame per chunk)
//   fx_muzzle_e / fx_muzzle_e_l    enemy muzzle flash (points DOWN at 0deg, muzzle = top-centre), 3 frames over its life
// Frame-selection rules for the renderer: docs/ANIM_SPEC.md. Deterministic (seeded).
import { Img, Mask, P, RAMP, shade, outline, rng, mix, lum } from "./lib.mjs";
import { buildPlane, ENEMY_AIR, helicopter, gunshipLight } from "./gen_air.mjs";

const AL = (c, a) => [c[0], c[1], c[2], a];
const G = "enemy_anim";

/** air units that get banking art: [id, frameCount, (frame, bank) => Img] */
function bankers() {
  const list = Object.entries(ENEMY_AIR).map(([id, e]) => [id, e.frames, (f, b) => buildPlane(e.spec, { down: true, frame: f, bank: b, parallax: 0.7 })]);
  list.push(["helicopter", 6, helicopter]);
  list.push(["gunship_light", 6, gunshipLight]);
  return list;
}

// ------------------------------------------------------------------ damage decals
/** pick stable decal spots from the first frame's interior (pixels whose 4 neighbours are opaque) */
function pickSpots(img, seed, avoidR = 0) {
  const r = rng("dmgspots_" + seed);
  const m = img.mask();
  const inner = [];
  for (let y = 1; y < img.h - 1; y++)
    for (let x = 1; x < img.w - 1; x++)
      if (m.has(x, y) && m.has(x - 1, y) && m.has(x + 1, y) && m.has(x, y - 1) && m.has(x, y + 1)) {
        const c = img.get(x, y);
        if (c && c[3] === 255 && lum(c) > 0.28 && Math.hypot(x + 0.5 - img.w / 2, y + 0.5 - img.h / 2) > avoidR) inner.push([x, y]);
      }
  if (!inner.length) return [];
  const n = Math.max(2, Math.min(5, Math.round(inner.length / 70)));
  const spots = [];
  for (let tries = 0; spots.length < n && tries < 200; tries++) {
    const [x, y] = inner[Math.floor(r() * inner.length)];
    if (spots.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) < 5)) continue;
    spots.push({ x, y, rad: 1.3 + r() * (img.w >= 28 ? 1.3 : 0.7), hole: spots.length % 2 === 0 || img.w < 20 });
  }
  return spots;
}

const EMBER = [P.Y2, P.R2, P.Y1, P.R3];
/** damaged strip: identical decals on every frame (no popping), embers flicker per frame, soot streaks trail aft (up) */
export function damageStrip(frames, seed, avoidR = 0) {
  const spots = pickSpots(frames[0], seed, avoidR);
  return frames.map((f, fi) => {
    const o = f.clone();
    const m = f.mask();
    const solid = (x, y) => m.has(x, y) && (f.get(x, y)?.[3] ?? 0) === 255;
    spots.forEach((s, i) => {
      // soot streak first (aft = toward -y for nose-down sprites and ground units facing down)
      for (let k = 1; k <= 3; k++) if (solid(s.x, s.y - k - 1)) o.set(s.x, s.y - k - 1, k === 3 ? mix(o.get(s.x, s.y - k - 1) ?? P.G0, P.G0, 0.5) : P.G0);
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const d = Math.hypot(dx, dy);
          if (d > s.rad + 0.4) continue;
          const x = s.x + dx, y = s.y + dy;
          if (!solid(x, y)) continue;
          o.set(x, y, d < s.rad * 0.45 && s.hole ? P.K : d < s.rad * 0.8 ? P.G0 : mix(o.get(x, y) ?? P.G0, P.G0, 0.55));
        }
      if (s.hole) {
        o.set(s.x, s.y, P.K);
        o.set(s.x + 1, s.y, EMBER[(fi + i) % 4]);
        if ((fi + i) % 2 === 0 && solid(s.x, s.y + 1)) o.set(s.x, s.y + 1, P.Y1);
      } else if ((fi + i) % 3 === 0) o.set(s.x, s.y, P.R1);
    });
    return o;
  });
}

// ------------------------------------------------------------------ turret recoil
/**
 * `_gun` overlay -> [rest, fire, return]. The barrel section (rows below the turret body) slides back into the body
 * (2px on fire, 1px on return); the freed muzzle rows get a flash on the fire frame. Pivot/orientation unchanged.
 */
function recoilStrip(img) {
  const W = img.w, H = img.h;
  const widths = [];
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (img.a(x, y) > 0) n++;
    widths.push(n);
  }
  let split = 0;
  for (let y = 0; y < H; y++) if (widths[y] > W * 0.45) split = y + 1;
  // muzzle columns: opaque non-outline pixels of the lowest barrel rows
  let tipY = H - 1;
  while (tipY > split && widths[tipY] === 0) tipY--;
  const cols = [];
  for (let x = 0; x < W; x++) {
    const c = img.get(x, tipY - 1);
    if (c && !(c[0] === P.K[0] && c[1] === P.K[1] && c[2] === P.K[2])) cols.push(x);
  }
  const retract = (d) => {
    const o = new Img(W, H);
    for (let y = 0; y < split; y++) for (let x = 0; x < W; x++) { const c = img.get(x, y); if (c) o.set(x, y, c); }
    for (let y = split; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = img.get(x, y + d);
        if (c && !o.get(x, y)) o.set(x, y, c);
      }
    return o;
  };
  const fire = retract(2);
  // flash in the freed rows under each barrel
  const big = W >= 20;
  for (const x of cols) {
    fire.set(x, tipY - 1, P.W);
    fire.set(x, tipY, P.Y3);
    if (big) fire.set(x, Math.min(H - 1, tipY + 1), P.Y2);
  }
  if (cols.length) {
    const l = cols[0] - 1, r = cols[cols.length - 1] + 1;
    fire.set(l, tipY, AL(P.Y2, 170));
    fire.set(r, tipY, AL(P.Y2, 170));
  }
  return { frames: [img.clone(), fire, retract(1)], split, tipY, cols };
}

// ------------------------------------------------------------------ burning wreck
/** wreck -> 3-frame burning loop: flame tongues (sway + height cycle), glowing base, translucent smoke wisps */
function burnStrip(wreckImg, seed) {
  const r = rng("burn_" + seed);
  const m = wreckImg.mask();
  const b = m.bounds();
  const cand = [];
  for (let y = Math.max(b.y0 + 5, 5); y <= b.y1 - 1; y++)
    for (let x = b.x0 + 2; x <= b.x1 - 2; x++) if (m.has(x, y) && m.has(x - 1, y) && m.has(x + 1, y)) cand.push([x, y]);
  const area = (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
  const n = Math.max(1, Math.min(5, Math.round(area / 180)));
  const anchors = [];
  for (let t = 0; anchors.length < n && t < 300 && cand.length; t++) {
    const [x, y] = cand[Math.floor(r() * cand.length)];
    if (anchors.some((a) => Math.abs(a.x - x) < 6 && Math.abs(a.y - y) < 6)) continue;
    anchors.push({ x, y, h: wreckImg.w >= 40 ? 7 : wreckImg.w >= 24 ? 5 : 4 });
  }
  const HGT = [1, 0.7, 0.85];
  const SWAY = [0, 1, -1];
  return [0, 1, 2].map((f) => {
    const o = wreckImg.clone();
    anchors.forEach((a, i) => {
      const ph = (f + i) % 3;
      const h = Math.max(2, Math.round(a.h * HGT[ph]));
      // glowing base
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1]]) if (m.has(a.x + dx, a.y + dy)) o.set(a.x + dx, a.y + dy, dy ? P.R1 : P.R2);
      // centre tongue
      for (let k = 0; k < h; k++) {
        const x = a.x + (k >= h - 1 ? SWAY[ph] : 0);
        const c = k === 0 ? P.Y3 : k < h * 0.5 ? P.Y2 : k < h - 1 ? P.Y1 : P.R2;
        o.set(x, a.y - k, c);
      }
      // side tongues (shorter, alternate)
      const sh = Math.max(1, h - 2 - (ph === 1 ? 1 : 0));
      for (let k = 0; k < sh; k++) {
        o.set(a.x - 1, a.y - k, k === 0 ? P.Y2 : k === sh - 1 ? P.R2 : P.Y1);
        if (k < sh - (ph === 2 ? 1 : 0)) o.set(a.x + 1, a.y - k, k === 0 ? P.Y2 : P.R2);
      }
      // smoke above the tip
      const sx = a.x + SWAY[(ph + 1) % 3];
      for (let k = 1; k <= 3; k++) {
        const y = a.y - h - k + (ph === 2 ? 1 : 0);
        if (y < 0) break;
        o.set(sx + (k === 3 ? SWAY[ph] : 0), y, AL(k === 1 ? P.G1 : P.G2, 170 - k * 40));
      }
    });
    return o;
  });
}

// ------------------------------------------------------------------ debris
/** 4 chunk variants per size: 0 bent plate, 1 jagged shard, 2 strut/tube, 3 heavy chunk (track/wheel/engine) */
function debrisChunk(S, v, seed) {
  const r = rng("debris_" + seed + "_" + v);
  const im = new Img(S, S);
  const c = S / 2;
  if (v === 0 || v === 1) {
    const pts = [];
    const k = v === 0 ? 5 : 7;
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + r() * 0.5;
      const rad = (S / 2 - 1.2) * (v === 0 ? 0.75 + r() * 0.25 : i % 2 ? 0.45 + r() * 0.15 : 0.85 + r() * 0.15);
      pts.push([c + Math.cos(a) * rad, c + Math.sin(a) * rad * (v === 0 ? 0.75 : 1)]);
    }
    shade(im, new Mask(S, S).poly(pts), v === 0 ? RAMP.steel : RAMP.lsteel, "bevel", { grad: false });
    // paint chip / rivet
    im.paint(Math.round(c), Math.round(c), v === 0 ? P.R1 : P.G1);
    if (S >= 8) im.paint(Math.round(c) - 1, Math.round(c) - 1, P.G4);
  } else if (v === 2) {
    const m = new Mask(S, S).capsule(1.5, S - 2.5, S - 2.5, 1.5, Math.max(0.9, S / 9));
    shade(im, m, RAMP.dsteel, "bevel", { grad: false });
    im.paint(Math.round(c), Math.round(c), P.G3);
    if (S >= 8) im.paint(Math.round(c) + 1, Math.round(c) - 1, P.G3);
  } else {
    const m = new Mask(S, S).rect(1, Math.round(S * 0.25), S - 2, Math.round(S * 0.5));
    shade(im, m, RAMP.dark, "bevel", { grad: false });
    for (let x = 2; x < S - 2; x += 2) im.paint(x, Math.round(S * 0.25), P.G2); // track links / cooling fins
    im.paint(1, Math.round(S * 0.25), P.G3);
  }
  // glowing hot edge pixel
  const hot = [[S - 3, S - 4], [2, S - 3], [S - 3, 2], [S - 3, S - 4]][v];
  im.paint(hot[0], hot[1], P.Y1);
  if (S >= 10) im.paint(hot[0] - 1, hot[1], P.R2);
  outline(im);
  return im;
}

// ------------------------------------------------------------------ enemy muzzle flash
/** points DOWN at angle 0 (rotate by dir - 90); muzzle point = top-centre of the frame */
function muzzleE(S, f) {
  const im = new Img(S, S);
  const c0 = S / 2 - 1, c1 = S / 2; // two centre columns
  const L = [S - 1, Math.round(S * 0.6), Math.round(S * 0.35)][f];
  const col = (k) => {
    const t = k / L;
    if (f === 2) return t < 0.5 ? P.Y2 : AL(P.R2, 170);
    return t < 0.3 ? P.W : t < 0.55 ? P.Y3 : t < 0.8 ? P.Y2 : P.Y1;
  };
  for (let k = 0; k < L; k++) {
    im.set(c0, k, col(k));
    im.set(c1, k, col(k));
  }
  if (f < 2) {
    // side spikes
    const sw = f === 0 ? Math.round(S * 0.35) : Math.round(S * 0.2);
    for (let k = 1; k <= sw; k++) {
      const y = 1 + Math.floor(k * 0.6);
      const c = k === sw ? P.Y1 : k > sw / 2 ? P.Y2 : P.Y3;
      im.set(c0 - k, y, c);
      im.set(c1 + k, y, c);
    }
    // diagonal spikes
    for (let k = 1; k <= (f === 0 ? 2 : 1) + (S >= 12 ? 1 : 0); k++) {
      im.set(c0 - k, 2 + k, AL(P.Y2, 200));
      im.set(c1 + k, 2 + k, AL(P.Y2, 200));
    }
  }
  return im;
}

// ------------------------------------------------------------------ main
export function genEnemyAnims(reg) {
  const stats = { bank: 0, dmg: 0, gun: 0, burn: 0 };
  // 1. banking frames (+ damaged banking frames)
  const bankKeys = [];
  for (const [id, n, make] of bankers()) {
    for (const [suffix, b] of [["_bankl", -1], ["_bankr", 1]]) {
      const fr = [];
      for (let f = 0; f < n; f++) fr.push(make(f, b));
      const base = reg.get("enemy_" + id);
      reg.add("enemy_" + id + suffix, fr, { fps: base?.fps, loop: true, group: G });
      bankKeys.push(["enemy_" + id + suffix, id]);
      stats.bank++;
    }
  }
  // 2. damaged variants for every enemy body strip (not `_gun` / `_dead`)
  const bodies = reg.items.filter((it) => (it.group === "enemy_air" || it.group === "enemy_ground") && /^enemy_[a-z_]+$/.test(it.key) && !/_(gun|dead)$/.test(it.key));
  for (const it of bodies) {
    const id = it.key.slice(6);
    // units with a rotating `_gun` overlay: keep decals off the centre (the turret covers it)
    const avoid = reg.get(it.key + "_gun") ? it.w * 0.3 : 0;
    reg.add(it.key + "_dmg", damageStrip(it.frames, id, avoid), { fps: it.fps, loop: it.loop ?? true, group: G });
    stats.dmg++;
  }
  for (const [key, id] of bankKeys) {
    const it = reg.get(key);
    reg.add(key + "_dmg", damageStrip(it.frames, id), { fps: it.fps, loop: true, group: G });
    stats.dmg++;
  }
  // 3. turret recoil: `_gun` becomes a 3-frame state strip (fps 0)
  const guns = {};
  for (const it of reg.items.filter((i) => /^enemy_.*_gun$/.test(i.key))) {
    const r = recoilStrip(it.frames[0]);
    it.frames = r.frames;
    it.fps = 0;
    it.loop = false;
    guns[it.key] = r;
    stats.gun++;
  }
  // 4. burning wrecks for every ground unit with a `_dead` wreck
  for (const it of reg.items.filter((i) => /^enemy_.*_dead$/.test(i.key))) {
    const id = it.key.slice(6, -5);
    reg.add("enemy_" + id + "_burn", burnStrip(it.frames[0], id), { fps: 10, loop: true, group: G });
    stats.burn++;
  }
  // 5. debris chunks
  for (const [k, S] of [["s", 6], ["m", 8], ["l", 12]]) reg.add("debris_" + k, [0, 1, 2, 3].map((v) => debrisChunk(S, v, k)), { fps: 0, loop: false, group: G });
  // 6. enemy muzzle flashes
  reg.add("fx_muzzle_e", [0, 1, 2].map((f) => muzzleE(8, f)), { fps: 30, loop: false, group: G });
  reg.add("fx_muzzle_e_l", [0, 1, 2].map((f) => muzzleE(12, f)), { fps: 30, loop: false, group: G });
  return { stats, guns };
}
