// SKY REAPER citadel base kit (round 6, item 11): floors, roads, walls, foundation pads, pipes and landing markings for
// a coherent industrial base. All pieces are top-down, lit from the top-left, drawn at PIXEL_SCALE like every tile.
//  - Floors (64x64, opaque, seamless with themselves): cit_floor_concrete, cit_floor_steel, cit_runway_v.
//  - Road / wall overlays (64x64, transparent outside the piece, seamless along their connections; centre line x/y 32):
//      _v (N+S), _h (W+E), _corner (S+E), _t (W+E+S), _tv (N+S+E), _cross (all), wall also _end (S only).
//    Other orientations: draw with flipX / flipY (corner S+E -> flipX = S+W, flipY = N+E, both = N+W;
//    _t flipY = W+E+N; _tv flipX = N+S+W; wall _end flipY = cap facing down, N only).
//  - Foundation pads (opaque, centred under a ground unit): cit_pad_s 24x24 (16-20 px units), cit_pad_m 32x32 (24-28 px),
//    cit_pad_l 56x56 (military_base 48x48), cit_pad_hangar 56x40 (hangar 48x32).
//  - Pipes: cit_pipe_v 16x64, cit_pipe_h 64x16 (seamless along their length), cit_pipe_corner 16x16 elbow (S+E).
//  - Landing: cit_helipad 48x48 (H pad), cit_mark_hazard 64x8 (hazard edge strip, seamless horizontally).
import { P, BIOME, Img, Mask, shade, outline, vnoise, bayer, hex, mix } from "./lib.mjs";

const C = BIOME.citadel;
const T = 64;
// concrete ramp (dark, cool; sits between the citadel metal m2 and m4 so units and pads read on it)
const CC = [hex("#25262e"), hex("#30323b"), hex("#3b3e48"), hex("#484b56"), hex("#5a5e6a")];
const ASPH = [hex("#16171d"), hex("#1d1e25"), hex("#24262e"), hex("#2e3039")];
const STEEL = [C.m1, C.m2, C.m3, C.m4];
const PIPE = [hex("#2a2c38"), hex("#454a5e"), hex("#6a7088"), hex("#9aa2b8")];
const WALL = [hex("#1a1b24"), hex("#2e303e"), hex("#464a5c"), hex("#646a80")];

const has = (dirs, d) => dirs.includes(d);

// ------------------------------------------------------------------ floors
function concrete() {
  const im = new Img(T, T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const n = vnoise(x, y, 8, T, 1201) * 0.6 + vnoise(x, y, 2, T, 1202) * 0.4;
      let c = n > 0.62 && bayer(x, y) < (n - 0.62) * 4 ? CC[3] : n < 0.36 && bayer(x, y) < (0.36 - n) * 4 ? CC[1] : CC[2];
      const px = x % 32, py = y % 32;
      if (px === 0 || py === 0) c = CC[0]; // expansion joints (32 px slabs)
      else if (px === 1 || py === 1) c = CC[3];
      im.set(x, y, c);
    }
  // a few stains / cracks inside the slabs (never on the tile border)
  for (const [x, y, l] of [[9, 12, 6], [41, 47, 5], [50, 14, 4]]) for (let i = 0; i < l; i++) im.set(x + i, y + ((i * 7) % 3 === 0 ? 1 : 0), CC[1]);
  return im;
}

function steelDeck() {
  const im = new Img(T, T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const px = x % 32, py = y % 32;
      let c = C.m2;
      // diamond tread: raised dashes alternating direction every 4 px cell
      const cx = x & 3, cy = y & 3, alt = ((x >> 2) + (y >> 2)) & 1;
      if (alt ? cx === cy : cx === 3 - cy) c = cx === 0 || cy === 0 ? C.m4 : C.m3;
      if (px === 0 || py === 0) c = C.m0;
      else if (px === 1 || py === 1) c = C.m3;
      else if (px === 31 || py === 31) c = C.m1;
      if ((px === 3 || px === 28) && (py === 3 || py === 28)) c = C.m4; // rivets
      im.set(x, y, c);
    }
  return im;
}

/** vertical runway / taxi strip: asphalt with white edge bars, dashed centre line and edge lights (tiles vertically) */
function runwayV() {
  const im = new Img(T, T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const n = vnoise(x, y, 4, T, 1301);
      im.set(x, y, n > 0.66 ? ASPH[3] : n < 0.3 ? ASPH[1] : ASPH[2]);
    }
  for (let y = 0; y < T; y++) {
    im.set(4, y, P.G3); im.set(5, y, P.G3); im.set(58, y, P.G3); im.set(59, y, P.G3);
    if (y % 32 < 18) { im.set(31, y, P.G4); im.set(32, y, P.G4); }
  }
  for (const y of [8, 40]) {
    im.set(1, y, C.haz); im.set(62, y, C.haz);
    im.set(1, y + 1, C.m0); im.set(62, y + 1, C.m0);
  }
  return im;
}

// ------------------------------------------------------------------ roads (overlay)
const RW = 14; // half width of the asphalt incl. kerb (28 px road on a 64 px tile)
function armMask(dirs, half) {
  const m = new Mask(T, T);
  const a = 32 - half, b = 32 + half;
  m.rect(a, a, b - a, b - a);
  if (has(dirs, "N")) m.rect(a, 0, b - a, b);
  if (has(dirs, "S")) m.rect(a, a, b - a, T - a);
  if (has(dirs, "W")) m.rect(0, a, b, b - a);
  if (has(dirs, "E")) m.rect(a, a, T - a, b - a);
  return m;
}

function road(dirs) {
  const im = new Img(T, T);
  const m = armMask(dirs, RW);
  const inner = armMask(dirs, RW - 2);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (!m.has(x, y)) continue;
      if (!inner.has(x, y)) {
        // kerb: light on the top/left edges, dark on bottom/right (light from top-left)
        const out = (dx, dy) => !m.has(x + dx, y + dy) && x + dx >= 0 && y + dy >= 0 && x + dx < T && y + dy < T;
        im.set(x, y, out(0, -1) || out(-1, 0) ? CC[4] : out(0, 1) || out(1, 0) ? CC[1] : CC[3]);
        continue;
      }
      const n = vnoise(x, y, 4, T, 1401);
      im.set(x, y, n > 0.68 ? ASPH[3] : n < 0.28 ? ASPH[1] : ASPH[2]);
    }
  // dashed centre line along each arm (period 16: seamless at the tile border), kept out of the junction box
  const dash = (i) => (i + 4) % 16 < 8;
  const box = (v) => v >= 32 - RW && v < 32 + RW;
  const straight = dirs.length === 2 && ((has(dirs, "N") && has(dirs, "S")) || (has(dirs, "W") && has(dirs, "E")));
  for (let i = 0; i < T; i++) {
    if (!straight && box(i)) continue;
    if (dash(i)) {
      if ((has(dirs, "N") && i < 32) || (has(dirs, "S") && i >= 32)) { im.set(31, i, C.haz); im.set(32, i, C.haz); }
      if ((has(dirs, "W") && i < 32) || (has(dirs, "E") && i >= 32)) { im.set(i, 31, C.haz); im.set(i, 32, C.haz); }
    }
  }
  // stop bars where a side road meets the junction
  if (!straight && dirs.length > 1)
    for (const d of dirs) {
      const a = 32 - RW + 2, b = 32 + RW - 2;
      for (let i = a; i < b; i++) {
        if (d === "N") im.set(i, 32 - RW - 1, P.G4);
        if (d === "S") im.set(i, 32 + RW, P.G4);
        if (d === "W") im.set(32 - RW - 1, i, P.G4);
        if (d === "E") im.set(32 + RW, i, P.G4);
      }
    }
  return im;
}

// ------------------------------------------------------------------ walls (overlay)
const WW = 6; // half thickness (12 px wall)
function wall(dirs) {
  const im = new Img(T, T);
  const m = armMask(dirs, WW);
  // cast shadow (down-right, 3 px, translucent) first
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) if (!m.has(x, y) && m.has(x - 3, y - 3) && x - 3 >= 0 && y - 3 >= 0) im.set(x, y, [0, 0, 0, 110]);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (!m.has(x, y)) continue;
      const inT = (dx, dy) => x + dx < 0 || y + dy < 0 || x + dx >= T || y + dy >= T || m.has(x + dx, y + dy);
      let c = WALL[2];
      if (!inT(0, 1) || !inT(1, 0)) c = WALL[0];
      else if (!inT(0, -1) || !inT(-1, 0)) c = WALL[3];
      else if (!inT(0, 2) || !inT(2, 0)) c = WALL[1];
      im.set(x, y, c);
    }
  // capstone line + red warning lights every 32 px along the wall top
  for (let i = 0; i < T; i++) {
    const lit = i % 32 === 16;
    if (has(dirs, "N") && i < 32 - WW || has(dirs, "S") && i > 32 + WW) im.set(32, i, lit ? C.neon : WALL[1]);
    if (has(dirs, "W") && i < 32 - WW || has(dirs, "E") && i > 32 + WW) im.set(i, 32, lit ? C.neon : WALL[1]);
  }
  // junction block: a slightly raised pillar with a light
  const a = 32 - WW - 1, b = 32 + WW;
  for (let y = a; y <= b; y++)
    for (let x = a; x <= b; x++) {
      const e = x === a || y === a ? WALL[3] : x === b || y === b ? WALL[0] : WALL[2];
      im.set(x, y, e);
    }
  im.set(32, 32, C.neon); im.set(31, 32, C.neonD); im.set(32, 31, C.neonD);
  outline(im, C.m0);
  return im;
}

// ------------------------------------------------------------------ foundation pads
function pad(w, h, kind) {
  const im = new Img(w, h);
  const ch = kind === "l" || kind === "hangar" ? 5 : 3; // chamfer
  const m = new Mask(w, h).poly([[ch, 0], [w - ch, 0], [w, ch], [w, h - ch], [w - ch, h], [ch, h], [0, h - ch], [0, ch]]);
  shade(im, m, [CC[1], CC[3], CC[4], hex("#6c7080")], "bevel");
  // hazard stripes on the corners
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!m.has(x, y)) continue;
      const cx = Math.min(x, w - 1 - x), cy = Math.min(y, h - 1 - y);
      const band = cx + cy;
      if (band >= ch + 1 && band <= ch + 3 && cx > 0 && cy > 0) im.set(x, y, ((x + y) >> 1) % 2 ? C.haz : C.m0);
    }
  if (kind === "s" || kind === "m") {
    // recessed mounting ring for the turret / unit base
    const r = kind === "s" ? 8.5 : 11.5;
    const ring = new Mask(w, h).ring(w / 2, h / 2, r - 1.5, r);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ring.has(x, y)) im.set(x, y, y + x < w ? C.m0 : CC[4]);
    // 4 bolts
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const bx = Math.round(w / 2 + dx * (r + 2) * 0.72), by = Math.round(h / 2 + dy * (r + 2) * 0.72);
      im.set(bx, by, C.m4); im.set(bx + 1, by + 1, C.m0);
    }
  } else {
    // large slab: 16 px panel seams + tie-down points + edge lights
    for (let y = 4; y < h - 4; y++) for (let x = 4; x < w - 4; x++) if ((x - 4) % 16 === 0 || (y - 4) % 16 === 0) im.set(x, y, CC[2]);
    for (const [x, y] of [[2, Math.floor(h / 2)], [w - 3, Math.floor(h / 2)], [Math.floor(w / 2), 1], [Math.floor(w / 2), h - 2]]) im.set(x, y, kind === "hangar" ? C.cy : C.neon);
    if (kind === "hangar")
      // apron arrows in front of the doors (bottom edge)
      for (let i = 0; i < 4; i++) for (const sx of [w / 2 - 12, w / 2 + 8]) { im.set(sx + i, h - 6 + Math.abs(i - 1.5), P.G4); }
  }
  outline(im, C.m0);
  return im;
}

// ------------------------------------------------------------------ pipes
function pipeV() {
  const im = new Img(16, T);
  shade(im, new Mask(16, T).rect(2, 0, 5, T), PIPE, "cyl", { edge: false });
  shade(im, new Mask(16, T).rect(9, 0, 5, T), PIPE, "cyl", { edge: false });
  for (const y of [10, 42]) {
    shade(im, new Mask(16, T).rect(1, y, 14, 3), STEEL, "bevel"); // flange clamp
    im.set(7, y + 1, C.neonD);
  }
  // pipe outlines only on the long sides so the strip tiles vertically
  for (let y = 0; y < T; y++) for (const x of [1, 7, 8, 14]) if (!im.get(x, y)) im.set(x, y, C.m0);
  return im;
}
function pipeH() {
  // transpose of the vertical pipe (light still reads from the top)
  const v = pipeV();
  const im = new Img(T, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < T; x++) { const c = v.get(y, x); if (c) im.set(x, y, c); }
  return im;
}
function pipeCorner() {
  // elbow joining the bottom (S) and right (E) edges, two concentric pipes matching cit_pipe_v / _h positions
  const S = 16;
  const im = new Img(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - S, y + 0.5 - S); // centre at bottom-right corner
      const inA = d >= S - 7 && d < S - 2; // outer pipe (cols 2..6 at the bottom edge)
      const inB = d >= S - 14 && d < S - 9; // inner pipe (cols 9..13)
      if (!inA && !inB) continue;
      const r0 = inA ? S - 7 : S - 14, t = (d - r0) / 5; // 0..1 across the pipe
      const ang = Math.atan2(S - (y + 0.5), S - (x + 0.5)); // 0..pi/2
      const lit = (1 - Math.abs(t - 0.35) * 2.2) * (0.8 + 0.2 * Math.sin(ang));
      im.set(x, y, lit > 0.75 ? PIPE[3] : lit > 0.35 ? PIPE[2] : lit > 0 ? PIPE[1] : PIPE[0]);
    }
  outline(im, C.m0);
  // keep the joins open: clear the outline on the two connecting edges
  for (let i = 0; i < S; i++) {
    const b = im.get(i, S - 1), r = im.get(S - 1, i);
    if (b && b[0] === C.m0[0] && b[1] === C.m0[1] && b[2] === C.m0[2] && !(i === 1 || i === 7 || i === 8 || i === 14)) im.clear(i, S - 1);
    if (r && r[0] === C.m0[0] && r[1] === C.m0[1] && r[2] === C.m0[2] && !(i === 1 || i === 7 || i === 8 || i === 14)) im.clear(S - 1, i);
  }
  return im;
}

// ------------------------------------------------------------------ landing markings
function helipad() {
  const S = 48;
  const im = new Img(S, S);
  const m = new Mask(S, S).poly([[12, 0], [36, 0], [48, 12], [48, 36], [36, 48], [12, 48], [0, 36], [0, 12]]);
  shade(im, m, [CC[0], CC[2], CC[3], CC[4]], "bevel");
  const ring = new Mask(S, S).ring(24, 24, 15, 17);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (ring.has(x, y)) im.set(x, y, (Math.floor(Math.atan2(y - 24, x - 24) * 4) & 1) ? C.haz : P.G4);
  // "H"
  for (let y = 16; y < 32; y++) for (const x of [17, 18, 19, 28, 29, 30]) im.set(x, y, P.G4);
  for (let x = 20; x < 28; x++) for (const y of [23, 24]) im.set(x, y, P.G4);
  for (const [x, y] of [[24, 3], [24, 44], [3, 24], [44, 24]]) { im.set(x, y, C.cy); im.set(x - 1, y, C.cyD); }
  outline(im, C.m0);
  return im;
}
function hazardStrip() {
  const im = new Img(T, 8);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < T; x++) {
      let c = ((x + y) >> 2) % 2 ? C.haz : C.m0;
      if (y === 0) c = CC[4];
      if (y === 7) c = CC[0];
      im.set(x, y, c);
    }
  return im;
}

// ------------------------------------------------------------------ main
export const CITADEL_KIT = [
  // [key, w, h, use]
  ["cit_floor_concrete", 64, 64, "opaque floor, 32 px slabs, seamless"],
  ["cit_floor_steel", 64, 64, "opaque steel deck, 32 px plates, seamless"],
  ["cit_runway_v", 64, 64, "opaque taxiway/runway strip, tiles vertically"],
  ["cit_road_v", 64, 64, "overlay, road N+S (28 px wide, centred)"],
  ["cit_road_h", 64, 64, "overlay, road W+E"],
  ["cit_road_corner", 64, 64, "overlay, road S+E (flipX: S+W, flipY: N+E)"],
  ["cit_road_t", 64, 64, "overlay, road W+E+S (flipY: W+E+N)"],
  ["cit_road_tv", 64, 64, "overlay, road N+S+E (flipX: N+S+W)"],
  ["cit_road_cross", 64, 64, "overlay, road all four"],
  ["cit_wall_v", 64, 64, "overlay, wall N+S (12 px thick, centred, 3 px shadow)"],
  ["cit_wall_h", 64, 64, "overlay, wall W+E"],
  ["cit_wall_corner", 64, 64, "overlay, wall S+E (flips as road)"],
  ["cit_wall_t", 64, 64, "overlay, wall W+E+S"],
  ["cit_wall_tv", 64, 64, "overlay, wall N+S+E"],
  ["cit_wall_cross", 64, 64, "overlay, wall all four"],
  ["cit_wall_end", 64, 64, "overlay, wall end cap, continues S (flipY: continues N)"],
  ["cit_pad_s", 24, 24, "foundation for 16-20 px units: aa_turret, citadel_turret, sam_site, missile_launcher, tank_light"],
  ["cit_pad_m", 32, 32, "foundation for 24-28 px units: radar_station, oil_tank, tank_heavy"],
  ["cit_pad_l", 56, 56, "foundation for military_base (48x48)"],
  ["cit_pad_hangar", 56, 40, "foundation/apron for hangar (48x32), apron arrows on the bottom edge"],
  ["cit_pipe_v", 16, 64, "twin pipe, tiles vertically"],
  ["cit_pipe_h", 64, 16, "twin pipe, tiles horizontally"],
  ["cit_pipe_corner", 16, 16, "pipe elbow S+E (flipX/flipY for others)"],
  ["cit_helipad", 48, 48, "landing pad with H and hazard ring"],
  ["cit_mark_hazard", 64, 8, "hazard edge strip, tiles horizontally"],
];

export function genCitadelKit(reg) {
  const make = {
    cit_floor_concrete: concrete,
    cit_floor_steel: steelDeck,
    cit_runway_v: runwayV,
    cit_road_v: () => road(["N", "S"]),
    cit_road_h: () => road(["W", "E"]),
    cit_road_corner: () => road(["S", "E"]),
    cit_road_t: () => road(["W", "E", "S"]),
    cit_road_tv: () => road(["N", "S", "E"]),
    cit_road_cross: () => road(["N", "S", "W", "E"]),
    cit_wall_v: () => wall(["N", "S"]),
    cit_wall_h: () => wall(["W", "E"]),
    cit_wall_corner: () => wall(["S", "E"]),
    cit_wall_t: () => wall(["W", "E", "S"]),
    cit_wall_tv: () => wall(["N", "S", "E"]),
    cit_wall_cross: () => wall(["N", "S", "W", "E"]),
    cit_wall_end: () => wall(["S"]),
    cit_pad_s: () => pad(24, 24, "s"),
    cit_pad_m: () => pad(32, 32, "m"),
    cit_pad_l: () => pad(56, 56, "l"),
    cit_pad_hangar: () => pad(56, 40, "hangar"),
    cit_pipe_v: pipeV,
    cit_pipe_h: pipeH,
    cit_pipe_corner: pipeCorner,
    cit_helipad: helipad,
    cit_mark_hazard: hazardStrip,
  };
  for (const [key, w, h] of CITADEL_KIT) {
    const im = make[key]();
    if (im.w !== w || im.h !== h) throw new Error(`${key}: ${im.w}x${im.h}, expected ${w}x${h}`);
    reg.add(key, im, { group: "citadel_kit", atlas: "citadel_kit" });
  }
}

export { mix };
