// SKY REAPER pixel-art toolkit: palette, RGBA image, shape masks, auto shading/outline, noise, derived variants.
// Everything is deterministic (seeded PRNG, no Math.random).

// ------------------------------------------------------------------ colour
export function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}
export function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    255,
  ];
}
export function lum(c) {
  return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255;
}

/**
 * MASTER PALETTE (33 entries incl. outline). Every actor/fx/ui sprite uses only these colours
 * (biome tiles add the per-biome palettes below).
 */
export const P = {
  K: hex("#0c0a12"), // outline / deepest shadow
  G0: hex("#24222e"), G1: hex("#3d3f52"), G2: hex("#646a80"), G3: hex("#9aa2b6"), G4: hex("#d4dae6"), W: hex("#ffffff"),
  B0: hex("#142650"), B1: hex("#23468a"), B2: hex("#3a74c4"), B3: hex("#78b4f0"),
  C0: hex("#0e5866"), C1: hex("#22a6c0"), C2: hex("#7ef0ff"),
  O0: hex("#26331a"), O1: hex("#41562a"), O2: hex("#66833a"), O3: hex("#9cb856"),
  T0: hex("#4a3624"), T1: hex("#7d5d38"), T2: hex("#b48a52"), T3: hex("#e6c886"),
  R0: hex("#4c1022"), R1: hex("#9a2232"), R2: hex("#e04438"), R3: hex("#ff8a66"),
  Y0: hex("#b05a14"), Y1: hex("#f09a24"), Y2: hex("#ffd844"), Y3: hex("#fff6c0"),
  M0: hex("#6a1670"), M1: hex("#c83cc8"), M2: hex("#ff86f4"),
};

/** 4-tone ramps: [shadow, mid, light, highlight] — light comes from the top-left. */
export const RAMP = {
  steel: [P.G1, P.G2, P.G3, P.G4],
  dsteel: [P.G0, P.G1, P.G2, P.G3],
  lsteel: [P.G2, P.G3, P.G4, P.W],
  navy: [P.B0, P.B1, P.B2, P.B3],
  sky: [P.B1, P.B2, P.B3, P.W],
  glass: [P.C0, P.C1, P.C2, P.W],
  olive: [P.O0, P.O1, P.O2, P.O3],
  tan: [P.T0, P.T1, P.T2, P.T3],
  red: [P.R0, P.R1, P.R2, P.R3],
  gold: [P.Y0, P.Y1, P.Y2, P.Y3],
  fire: [P.R1, P.Y1, P.Y2, P.Y3],
  mag: [P.M0, P.M1, P.M2, P.W],
  cyan: [P.C0, P.C1, P.C2, P.W],
  rust: [P.R0, P.T0, P.T1, P.T2],
  dark: [P.K, P.G0, P.G1, P.G2],
};

/** Per-biome palettes (background tiles + decor only). */
export const BIOME = {
  ocean: {
    deep: hex("#0b2140"), mid: hex("#123a66"), shal: hex("#1a5a8c"), light: hex("#2e7fb2"), foam: hex("#9fd8ee"), white: hex("#e8f8ff"),
    sand: hex("#d8c088"), sandD: hex("#a88a58"), reef: hex("#2a9a9a"), reefL: hex("#58c8b8"),
  },
  jungle: {
    g0: hex("#0f2412"), g1: hex("#173a1a"), g2: hex("#235424"), g3: hex("#357430"), g4: hex("#56983c"), g5: hex("#8cc254"),
    dirt0: hex("#3a2a18"), dirt1: hex("#5e4426"), dirt2: hex("#86663a"), river0: hex("#1a3a3a"), river1: hex("#2a5a50"), river2: hex("#4a8a74"),
  },
  desert: {
    s0: hex("#7a5430"), s1: hex("#a0743e"), s2: hex("#c49650"), s3: hex("#dcb468"), s4: hex("#f0d490"),
    rock0: hex("#4a3426"), rock1: hex("#6e4e36"), rock2: hex("#946a48"),
  },
  arctic: {
    i0: hex("#3a5a7a"), i1: hex("#5a82a6"), i2: hex("#8eb6d4"), i3: hex("#c4dcec"), i4: hex("#eaf4fb"), w: hex("#ffffff"),
    water0: hex("#0c1e34"), water1: hex("#163452"), rock0: hex("#2e3440"), rock1: hex("#4c5464"),
  },
  citadel: {
    m0: hex("#12121c"), m1: hex("#1e1f2c"), m2: hex("#2c2e40"), m3: hex("#3e4258"), m4: hex("#5a6078"),
    neon: hex("#ff3c6e"), neonD: hex("#7a1838"), cy: hex("#2ae0ff"), cyD: hex("#145a70"), haz: hex("#e8b830"),
  },
};

// ------------------------------------------------------------------ rng / hashing / noise
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
export function rng(seed) {
  let a = typeof seed === "string" ? hashStr(seed) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function h2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Periodic (tileable) value noise in [0,1]. `cell` = lattice spacing in px, `period` = tile size in px. */
export function vnoise(x, y, cell, period, seed) {
  const n = Math.max(1, Math.round(period / cell));
  const fx = x / cell, fy = y / cell;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const m = (v) => ((v % n) + n) % n;
  const a = h2(m(ix), m(iy), seed), b = h2(m(ix + 1), m(iy), seed);
  const c = h2(m(ix), m(iy + 1), seed), d = h2(m(ix + 1), m(iy + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** Tileable fBm in [0,1]. */
export function fbm(x, y, period, seed, octaves = 3, base = 16) {
  let v = 0, amp = 1, tot = 0, cell = base;
  for (let o = 0; o < octaves && cell >= 1; o++) {
    v += vnoise(x, y, cell, period, seed + o * 101) * amp;
    tot += amp;
    amp *= 0.5;
    cell /= 2;
  }
  return v / tot;
}
/** 4x4 Bayer threshold in [0,1) for ordered dithering. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(x, y) {
  return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

// ------------------------------------------------------------------ image
export class Img {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  in(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  a(x, y) {
    return this.in(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0;
  }
  get(x, y) {
    if (!this.in(x, y)) return null;
    const o = (y * this.w + x) * 4;
    if (this.d[o + 3] === 0) return null;
    return [this.d[o], this.d[o + 1], this.d[o + 2], this.d[o + 3]];
  }
  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (!c || !this.in(x, y)) return;
    const o = (y * this.w + x) * 4;
    const al = c[3] ?? 255;
    if (al >= 255 || this.d[o + 3] === 0) {
      this.d[o] = c[0]; this.d[o + 1] = c[1]; this.d[o + 2] = c[2]; this.d[o + 3] = al;
    } else {
      const t = al / 255;
      this.d[o] = this.d[o] + (c[0] - this.d[o]) * t;
      this.d[o + 1] = this.d[o + 1] + (c[1] - this.d[o + 1]) * t;
      this.d[o + 2] = this.d[o + 2] + (c[2] - this.d[o + 2]) * t;
      this.d[o + 3] = Math.max(this.d[o + 3], al);
    }
  }
  clear(x, y) {
    if (!this.in(x, y)) return;
    this.d.fill(0, (y * this.w + x) * 4, (y * this.w + x) * 4 + 4);
  }
  /** set only where already opaque */
  paint(x, y, c) {
    if (this.a(x, y) > 0) this.set(x, y, c);
  }
  /** mirrored pair (about the vertical centre line) */
  sym(x, y, c) {
    this.set(x, y, c);
    this.set(this.w - 1 - x, y, c);
  }
  symPaint(x, y, c) {
    this.paint(x, y, c);
    this.paint(this.w - 1 - x, y, c);
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  hline(x0, x1, y, c) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c);
  }
  vline(x, y0, y1, c) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c);
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  blit(src, dx, dy, opts = {}) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.get(x, y);
        if (!c) continue;
        if (opts.alpha != null) c[3] = Math.round(c[3] * opts.alpha);
        this.set(dx + x, dy + y, c);
      }
    return this;
  }
  clone() {
    const o = new Img(this.w, this.h);
    o.d.set(this.d);
    return o;
  }
  flipX() {
    const o = new Img(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = this.get(x, y); if (c) o.set(this.w - 1 - x, y, c); }
    return o;
  }
  flipY() {
    const o = new Img(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = this.get(x, y); if (c) o.set(x, this.h - 1 - y, c); }
    return o;
  }
  /** rotate by multiples of 90deg clockwise */
  rot90(times = 1) {
    let src = this;
    for (let t = 0; t < (((times % 4) + 4) % 4); t++) {
      const o = new Img(src.h, src.w);
      for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const c = src.get(x, y); if (c) o.set(src.h - 1 - y, x, c); }
      src = o;
    }
    return src === this ? this.clone() : src;
  }
  /** nearest-neighbour rotation by arbitrary angle (deg) about centre (used for spinning frames). */
  rotate(deg) {
    const o = new Img(this.w, this.h);
    const r = (-deg * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
    const cx = this.w / 2, cy = this.h / 2;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const sx = Math.floor(cx + dx * cs - dy * sn), sy = Math.floor(cy + dx * sn + dy * cs);
        const c = this.get(sx, sy);
        if (c) o.set(x, y, c);
      }
    return o;
  }
  map(fn) {
    const o = new Img(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = this.get(x, y); if (c) o.set(x, y, fn(c, x, y)); }
    return o;
  }
  mask() {
    const m = new Mask(this.w, this.h);
    for (let i = 0; i < this.w * this.h; i++) m.d[i] = this.d[i * 4 + 3] > 0 ? 1 : 0;
    return m;
  }
}

/** Horizontal strip from frames (all same size). */
export function strip(frames) {
  const w = frames[0].w, h = frames[0].h;
  const o = new Img(w * frames.length, h);
  frames.forEach((f, i) => o.blit(f, i * w, 0));
  return o;
}

// ------------------------------------------------------------------ masks
export class Mask {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8Array(w * h);
  }
  has(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[y * this.w + x] === 1;
  }
  put(x, y, v = 1) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = v;
  }
  /** polygon in pixel space; samples pixel centres. `mirror`: also add mirrored about vertical centre. */
  poly(pts, mirror = false, v = 1) {
    const test = (px, py) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (test(x + 0.5, y + 0.5)) {
          this.put(x, y, v);
          if (mirror) this.put(this.w - 1 - x, y, v);
        }
    return this;
  }
  ellipse(cx, cy, rx, ry, v = 1) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.put(x, y, v);
      }
    return this;
  }
  rect(x, y, w, h, v = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, v);
    return this;
  }
  /** thick line (capsule) */
  capsule(x0, y0, x1, y1, r, v = 1) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const px = x + 0.5, py = y + 0.5;
        let t = ((px - x0) * dx + (py - y0) * dy) / L2;
        t = Math.max(0, Math.min(1, t));
        const qx = x0 + dx * t - px, qy = y0 + dy * t - py;
        if (qx * qx + qy * qy <= r * r) this.put(x, y, v);
      }
    return this;
  }
  ring(cx, cy, r0, r1, v = 1) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d >= r0 && d <= r1) this.put(x, y, v);
      }
    return this;
  }
  sub(m) {
    for (let i = 0; i < this.d.length; i++) if (m.d[i]) this.d[i] = 0;
    return this;
  }
  add(m) {
    for (let i = 0; i < this.d.length; i++) if (m.d[i]) this.d[i] = 1;
    return this;
  }
  mirrorX() {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.has(x, y)) this.put(this.w - 1 - x, y, 1);
    return this;
  }
  bounds() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.has(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x0, y0, x1, y1 };
  }
}
export const mask = (w, h) => new Mask(w, h);

// ------------------------------------------------------------------ shading
/**
 * Paint `m` into `img` with a 4-tone ramp, lit from the top-left.
 * styles: "bevel" (flat panel, light TL edges, dark BR edges), "dome" (sphere), "cyl" (vertical cylinder),
 *         "cylH" (horizontal cylinder), "flat" (mid only)
 */
export function shade(img, m, ramp, style = "bevel", opts = {}) {
  const [s, md, l, h] = ramp;
  const b = m.bounds();
  if (b.x1 < 0) return img;
  const cx = (b.x0 + b.x1 + 1) / 2, cy = (b.y0 + b.y1 + 1) / 2;
  const rx = (b.x1 - b.x0 + 1) / 2, ry = (b.y1 - b.y0 + 1) / 2;
  const L = [-0.55, -0.62, 0.56];
  const ln = Math.hypot(...L);
  const lx = L[0] / ln, ly = L[1] / ln, lz = L[2] / ln;
  const edge = opts.edge ?? true;
  for (let y = b.y0; y <= b.y1; y++) {
    // row extent for cylinders
    let rx0 = -1, rx1 = -1;
    if (style === "cyl") {
      for (let x = b.x0; x <= b.x1; x++) if (m.has(x, y)) { if (rx0 < 0) rx0 = x; rx1 = x; }
    }
    for (let x = b.x0; x <= b.x1; x++) {
      if (!m.has(x, y)) continue;
      let c = md;
      if (style === "dome") {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const d = nx * lx + ny * ly + nz * lz;
        c = d > 0.86 ? h : d > 0.55 ? l : d > 0.12 ? md : s;
      } else if (style === "cyl") {
        const w2 = (rx1 - rx0 + 1) / 2;
        const nx = w2 > 0 ? (x + 0.5 - (rx0 + w2)) / w2 : 0;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx));
        const d = nx * lx + nz * lz * 0.9 + 0.1;
        c = d > 0.9 ? h : d > 0.55 ? l : d > 0.05 ? md : s;
        if (edge && !m.has(x, y - 1) && c !== s) c = c === md ? l : h;
        if (edge && !m.has(x, y + 1)) c = s;
      } else if (style === "cylH") {
        const ny = (y + 0.5 - cy) / ry;
        const nz = Math.sqrt(Math.max(0, 1 - ny * ny));
        const d = ny * ly + nz * lz * 0.9 + 0.1;
        c = d > 0.9 ? h : d > 0.55 ? l : d > 0.05 ? md : s;
      } else if (style === "bevel") {
        const up = m.has(x, y - 1), lf = m.has(x - 1, y), dn = m.has(x, y + 1), rt = m.has(x + 1, y);
        if (!dn || !rt) c = s;
        else if (!up && !lf) c = h;
        else if (!up || !lf) c = l;
        // soft gradient: bottom-right third slightly darker using ordered dither
        if (c === md && opts.grad !== false) {
          const g = ((x - b.x0) / (b.x1 - b.x0 + 1) + (y - b.y0) / (b.y1 - b.y0 + 1)) / 2;
          if (g > 0.72 && bayer(x, y) < (g - 0.72) * 3) c = s;
          else if (g < 0.22 && bayer(x, y) < (0.22 - g) * 3) c = l;
        }
      }
      img.set(x, y, c);
    }
  }
  return img;
}

/** fill mask with one colour */
export function fill(img, m, c) {
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.has(x, y)) img.set(x, y, c);
  return img;
}

/** 1px dark outline around the opaque silhouette (drawn in transparent pixels). */
export function outline(img, color = P.K, diag = false) {
  const src = img.clone();
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      if (src.a(x, y) > 0) continue;
      let n = src.a(x - 1, y) > 128 || src.a(x + 1, y) > 128 || src.a(x, y - 1) > 128 || src.a(x, y + 1) > 128;
      if (!n && diag) n = src.a(x - 1, y - 1) > 128 || src.a(x + 1, y - 1) > 128 || src.a(x - 1, y + 1) > 128 || src.a(x + 1, y + 1) > 128;
      if (n) img.set(x, y, color);
    }
  return img;
}

/** inner outline: darken opaque pixels touching transparency (keeps size) */
export function innerOutline(img, color = P.K) {
  const src = img.clone();
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      if (src.a(x, y) === 0) continue;
      if (src.a(x - 1, y) === 0 || src.a(x + 1, y) === 0 || src.a(x, y - 1) === 0 || src.a(x, y + 1) === 0) img.set(x, y, color);
    }
  return img;
}

/** Remap colour through a lookup by luminance into a ramp (for palette-swaps / tint variants). */
export function rampSwap(img, from, to) {
  return img.map((c) => {
    for (let i = 0; i < from.length; i++) if (from[i][0] === c[0] && from[i][1] === c[1] && from[i][2] === c[2]) return [...to[i].slice(0, 3), c[3]];
    return c;
  });
}

// ------------------------------------------------------------------ derived variants
/** Battle-damaged version: scorch patches, a couple of holes, bent edges. */
export function damaged(img, seed) {
  const r = rng(seed);
  const o = img.clone();
  const m = img.mask();
  const b = m.bounds();
  const spots = 3 + Math.floor(r() * 2);
  for (let i = 0; i < spots; i++) {
    let cx, cy, tries = 0;
    do {
      cx = b.x0 + Math.floor(r() * (b.x1 - b.x0 + 1));
      cy = b.y0 + Math.floor(r() * (b.y1 - b.y0 + 1));
    } while (!m.has(cx, cy) && tries++ < 40);
    const rad = 1 + r() * 1.6;
    for (let y = -2; y <= 2; y++)
      for (let x = -2; x <= 2; x++) {
        const d = Math.hypot(x, y);
        if (d > rad + 0.4) continue;
        const px = cx + x, py = cy + y;
        if (!m.has(px, py)) continue;
        o.set(px, py, d < rad * 0.45 && i === 0 ? P.K : d < rad * 0.8 ? P.G0 : mix(o.get(px, py) ?? P.G0, P.G0, 0.5));
      }
    if (i === 0) o.set(cx, cy - 1, P.Y1);
  }
  return o;
}

/** Burnt wreck: desaturate + darken, holes, embers. */
export function wreck(img, seed) {
  const r = rng(seed);
  const m = img.mask();
  const o = new Img(img.w, img.h);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const c = img.get(x, y);
      if (!c || c[3] < 255) continue;
      const n = vnoise(x, y, 4, 1024, hashStr(String(seed)) & 0xffff);
      const edge = !m.has(x - 1, y) || !m.has(x + 1, y) || !m.has(x, y - 1) || !m.has(x, y + 1);
      if (n < 0.2 && edge) continue; // chewed outline
      const L = lum(c);
      let col = L > 0.6 ? P.G2 : L > 0.3 ? P.G1 : L > 0.1 ? P.G0 : P.K;
      if (n > 0.84) col = P.K;
      else if (n > 0.74 && col !== P.K) col = P.G0;
      else if (n < 0.16 && L > 0.2) col = P.T0;
      o.set(x, y, col);
    }
  // embers
  for (let i = 0; i < Math.max(2, Math.floor((img.w * img.h) / 160)); i++) {
    const x = Math.floor(r() * img.w), y = Math.floor(r() * img.h);
    if (o.get(x, y)) o.set(x, y, r() < 0.5 ? P.Y1 : P.R2);
  }
  return o;
}

/** Scale an image up by integer factor (contact sheets). */
export function upscale(img, s) {
  const o = new Img(img.w * s, img.h * s);
  for (let y = 0; y < o.h; y++)
    for (let x = 0; x < o.w; x++) {
      const i = (Math.floor(y / s) * img.w + Math.floor(x / s)) * 4;
      const j = (y * o.w + x) * 4;
      o.d[j] = img.d[i]; o.d[j + 1] = img.d[i + 1]; o.d[j + 2] = img.d[i + 2]; o.d[j + 3] = img.d[i + 3];
    }
  return o;
}

// ------------------------------------------------------------------ asset registry
export class Registry {
  constructor() {
    this.items = [];
    this.keys = new Set();
  }
  /** frames: Img[] (same size) or a single Img */
  add(key, frames, opts = {}) {
    if (this.keys.has(key)) throw new Error("duplicate sprite key " + key);
    const fr = Array.isArray(frames) ? frames : [frames];
    for (const f of fr) if (f.w !== fr[0].w || f.h !== fr[0].h) throw new Error("frame size mismatch in " + key);
    this.keys.add(key);
    this.items.push({ key, frames: fr, w: fr[0].w, h: fr[0].h, fps: opts.fps, loop: opts.loop, placeholder: opts.placeholder, group: opts.group ?? "misc", atlas: opts.atlas });
    return fr;
  }
  get(key) {
    return this.items.find((i) => i.key === key);
  }
}

/** Finalize an actor sprite: outline + optional extra. */
export function finish(img, opts = {}) {
  outline(img, opts.color ?? P.K, opts.diag ?? false);
  return img;
}
