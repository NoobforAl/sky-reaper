// Aircraft: player planes (nose UP, 3 bank frames + damaged) and air enemies (nose DOWN, animated).
import { Img, Mask, P, RAMP, shade, outline, damaged, mix } from "./lib.mjs";

/**
 * Parametric top-down aircraft.
 * Parts are given for the RIGHT half in (dx, y) coordinates where dx = distance from the centre line,
 * y = 0 at the nose. They are mirrored automatically. Rendering handles bank (squash + per-side tone shift)
 * and nose direction (up for the player, down for enemies) while keeping light from the top-left.
 */
export function buildPlane(spec, { bank = 0, down = false, frame = 0, parallax = 0 } = {}) {
  const { W, H } = spec;
  const img = new Img(W, H);
  const cx = W / 2;
  const sq = bank === 0 ? 1 : spec.bankSquash ?? 0.8;
  const shift = bank * (spec.bankShift ?? 0.6);
  // `parallax` (enemy bank frames only): raised parts (canopy domes, `z` parts) slide further toward the low wing,
  // which reads as a roll instead of a plain sideways shift. Player sprites never pass it (unchanged art).
  let zShift = 0;
  const T = (dx, y) => [cx + dx * sq + shift + zShift, down ? H - y : y];
  const centre = cx + shift;
  const polyMask = (half, mirror = true) => {
    const m = new Mask(W, H);
    m.poly(half.map(([dx, y]) => T(dx, y)));
    if (mirror) m.poly(half.map(([dx, y]) => T(-dx, y)));
    return m;
  };
  const tone = (ramp, c, step) => {
    const i = ramp.findIndex((r) => r[0] === c[0] && r[1] === c[1] && r[2] === c[2]);
    if (i < 0) return c;
    return ramp[Math.max(0, Math.min(3, i + step))];
  };
  const bankAdjust = (m, ramp) => {
    if (bank === 0) return;
    // bank<0 = rolling left: left side dips (darker), right side rises (lighter)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!m.has(x, y)) continue;
        const left = x + 0.5 < centre;
        const dark = bank < 0 ? left : !left;
        const c = img.get(x, y);
        if (!c) continue;
        img.set(x, y, tone(ramp, c, dark ? -1 : 1));
      }
  };
  for (const part of spec.parts) {
    if (part.frames && !part.frames.includes(frame)) continue;
    zShift = bank * parallax * (part.z ?? (part.style === "dome" ? 1 : 0));
    let m;
    if (part.half) m = polyMask(part.half, part.mirror !== false);
    else if (part.ell) {
      m = new Mask(W, H);
      const [dx, y, rx, ry] = part.ell;
      const [x0, y0] = T(dx, y);
      m.ellipse(x0, y0, rx * sq, ry);
      if (dx !== 0 && part.mirror !== false) {
        const [x1] = T(-dx, y);
        m.ellipse(x1, y0, rx * sq, ry);
      }
    } else if (part.capsule) {
      m = new Mask(W, H);
      const [dx0, y0, dx1, y1, r] = part.capsule;
      const a = T(dx0, y0), b = T(dx1, y1);
      m.capsule(a[0], a[1], b[0], b[1], r);
      if (part.mirror !== false && (dx0 !== 0 || dx1 !== 0)) {
        const c = T(-dx0, y0), d = T(-dx1, y1);
        m.capsule(c[0], c[1], d[0], d[1], r);
      }
    }
    const ramp = typeof part.ramp === "string" ? RAMP[part.ramp] : part.ramp;
    shade(img, m, ramp, part.style ?? "bevel", { grad: part.grad });
    if (part.bankTone !== false) bankAdjust(m, ramp);
  }
  zShift = 0;
  // details in transformed space
  const api = {
    img,
    T,
    px(dx, y, c, mirror = true) {
      const [x, yy] = T(dx, y);
      img.paint(Math.floor(x), Math.floor(yy), c);
      if (mirror && dx !== 0) {
        const [x2] = T(-dx, y);
        img.paint(Math.floor(x2), Math.floor(yy), c);
      }
    },
    set(dx, y, c, mirror = true) {
      const [x, yy] = T(dx, y);
      img.set(Math.floor(x), Math.floor(yy), c);
      if (mirror && dx !== 0) {
        const [x2] = T(-dx, y);
        img.set(Math.floor(x2), Math.floor(yy), c);
      }
    },
    bank,
    frame,
    down,
  };
  if (spec.details) spec.details(api);
  outline(img);
  if (spec.post) spec.post(api);
  return img;
}

/** jet exhaust glow drawn after outline. len 1..3 */
function flame(api, dx, y, len, mirror = true, wide = false) {
  const cols = [P.W, P.Y3, P.Y2, P.Y1];
  for (let i = 0; i < len; i++) {
    api.set(dx, y + i, cols[Math.min(3, i + (len > 2 ? 0 : 1))], mirror);
    if (wide) api.set(dx + 1, y + i, cols[Math.min(3, i + 1)], mirror);
  }
}
const AL = (c, a) => [c[0], c[1], c[2], a];
/** afterburner flicker for 4-frame loops: core length + colour + translucent glow tail vary per phase */
const BURN = [
  { len: 2, cols: [P.W, P.Y2], tail: 150 },
  { len: 3, cols: [P.W, P.Y3, P.Y1], tail: 110 },
  { len: 2, cols: [P.Y3, P.Y1], tail: 90 },
  { len: 3, cols: [P.W, P.Y2, P.R2], tail: 140 },
];
function burner(api, dx, y, phase, mirror = true, maxLen = 3) {
  const b = BURN[phase % 4];
  const n = Math.min(maxLen, b.len);
  for (let i = 0; i < n; i++) api.set(dx, y + i, b.cols[i], mirror);
  api.set(dx, y + n, AL(P.Y1, b.tail), mirror);
  api.set(dx - 1, y, AL(P.Y2, 70), mirror);
  api.set(dx + 1, y, AL(P.Y2, 70), mirror);
}
/** spinning propeller disc (top-down): translucent blur disc + one blade at angle; 4-frame loop over 180deg */
function prop(img, cx, cy, r, frame, n = 4) {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) / 0.55);
      if (d <= r + 0.3 && !img.get(x, y)) img.set(x, y, AL(P.G3, d > r - 0.8 ? 120 : 60));
    }
  const a = (frame / n) * Math.PI;
  for (let t = -r; t <= r; t += 0.5) {
    const x = Math.floor(cx + Math.cos(a) * t), y = Math.floor(cy + Math.sin(a) * t * 0.55);
    img.set(x, y, Math.abs(t) > r - 1 ? P.G4 : P.G2);
  }
  img.set(Math.floor(cx), Math.floor(cy), P.G4);
}

// ======================================================================== PLAYER
// 24x24, nose at y=0. dx relative to centre (12).
const FALCON = {
  W: 24,
  H: 24,
  parts: [
    { half: [[1.5, 9], [9.5, 15.5], [11, 16.5], [11, 17.5], [1.5, 16.5]], ramp: "navy" }, // wings
    { half: [[1.4, 18], [5.6, 21.2], [5.6, 22.4], [1.4, 22]], ramp: "navy" }, // tailplanes
    { half: [[0, 0.5], [0.9, 2], [1.8, 5], [2.2, 9], [2.3, 15], [2, 20], [1.4, 22.6], [0, 22.6]], ramp: "sky", style: "cyl" }, // fuselage
    { half: [[2.1, 9], [3.2, 10], [3.2, 13.5], [2.2, 14]], ramp: "steel" }, // intakes
    { ell: [0, 6.6, 1.3, 2.6], ramp: "glass", style: "dome" }, // canopy
  ],
  details(a) {
    // wingtip red, nose cone, tail fin, missiles
    a.px(10.5, 16.6, P.R2);
    a.px(9.6, 15.8, P.R1);
    a.px(0, 1, P.G3, false);
    for (let y = 17; y <= 21; y++) a.px(0, y, y === 17 ? P.G4 : P.G2, false);
    a.px(0, 22, P.G1, false);
    // roundels
    a.px(6, 14.6, P.W);
    a.px(5.4, 14.6, P.R2);
    // panel line
    a.px(1.6, 12, P.B1);
  },
  post(a) {
    a.set(0, 23, a.bank === 0 ? P.W : P.Y3, false);
    a.set(-1, 23, AL(P.Y2, a.bank === 0 ? 120 : 70), false);
    a.set(1, 23, AL(P.Y2, a.bank === 0 ? 120 : 70), false);
  },
};

const RAPTOR = {
  W: 24,
  H: 24,
  bankShift: 0.7,
  parts: [
    { half: [[1.5, 7], [6, 12], [11, 17], [10.5, 18.5], [6.5, 17], [1.5, 17]], ramp: "dsteel" }, // forward-chined delta
    { half: [[1.5, 18.5], [6, 21.8], [5, 23.2], [1.5, 22.6]], ramp: "dsteel" }, // tailplanes
    { half: [[2.6, 15], [3.9, 18.5], [3.4, 19.5], [2.6, 18]], ramp: "steel" }, // canted fins
    { half: [[0, 0.3], [0.8, 2], [1.7, 5], [2.4, 9], [2.6, 16], [2.2, 22], [1.2, 23], [0, 23]], ramp: "steel", style: "cyl" },
    { ell: [0, 6.2, 1.1, 2.6], ramp: "glass", style: "dome" },
  ],
  details(a) {
    a.px(10.4, 17.4, P.C2);
    a.px(9.4, 16.4, P.C1);
    a.px(2.8, 10, P.C1);
    a.px(2.6, 11, P.C0);
    a.px(0, 1, P.G4, false);
    a.px(1.6, 14, P.G1);
    a.px(6, 15.5, P.C1);
  },
  post(a) {
    a.set(1, 23, a.bank === 0 ? P.C2 : P.W);
    a.set(0, 23, AL(P.C1, a.bank === 0 ? 140 : 80), false);
  },
};

const BULWARK = {
  W: 24,
  H: 24,
  bankSquash: 0.82,
  parts: [
    { half: [[1.6, 9], [11.3, 10], [11.3, 13], [1.6, 13.2]], ramp: "olive" }, // straight wings
    { half: [[1.4, 19.5], [6.6, 19.5], [6.6, 21.8], [1.4, 21.8]], ramp: "olive" }, // tailplane
    { half: [[5, 18.5], [6.6, 18.5], [6.6, 23], [5, 23]], ramp: "dsteel" }, // twin tails
    { half: [[0, 1], [1.2, 2], [2.2, 4.5], [2.5, 10], [2.2, 17], [1.5, 22], [0, 22]], ramp: "olive", style: "cyl" },
    { ell: [3.6, 16, 1.6, 2.8], ramp: "steel", style: "cyl" }, // engine pods
    { ell: [0, 5, 1.3, 1.9], ramp: "glass", style: "dome" },
  ],
  details(a) {
    // gun barrel at nose, yellow stripes, under-wing pylons
    a.set(0, 0, P.G2, false);
    a.px(10.6, 10.4, P.Y2);
    a.px(10.6, 12.2, P.Y1);
    a.px(7, 13.2, P.G1);
    a.px(8, 13.2, P.G1);
    a.px(4, 13.2, P.G1);
    a.px(3.6, 14, P.G3);
    a.px(2, 7.4, P.Y2);
    a.px(0, 8.5, P.O3, false);
    a.px(9, 11.5, P.O0);
  },
  post(a) {
    a.set(3.6, 19, a.bank === 0 ? P.Y3 : P.Y2);
    a.set(3.6, 20, AL(P.Y1, a.bank === 0 ? 130 : 70));
  },
};

export const PLAYER_SPECS = { falcon: FALCON, raptor: RAPTOR, bulwark: BULWARK };

export function genPlayers(reg) {
  for (const [id, spec] of Object.entries(PLAYER_SPECS)) {
    const fr = [0, -1, 1].map((b) => buildPlane(spec, { bank: b }));
    reg.add("player_" + id, fr, { group: "player", fps: 0, loop: false });
    reg.add("player_" + id + "_dmg", fr.map((f) => damaged(f, "dmg_" + id)), { group: "player", fps: 0, loop: false });
  }
}

// ======================================================================== ENEMIES (nose down)
const FIGHTER_BASIC = {
  W: 20,
  H: 20,
  parts: [
    { half: [[1.3, 8], [8.6, 13.5], [8.6, 14.6], [1.3, 14]], ramp: "steel" },
    { half: [[1, 16], [4.6, 18.4], [4.6, 19.2], [1, 19]], ramp: "steel" },
    { half: [[0, 0.6], [1, 2.4], [1.8, 6], [1.9, 14], [1.5, 19], [0, 19]], ramp: "lsteel", style: "cyl" },
    { ell: [0, 5.4, 1, 2], ramp: "glass", style: "dome" },
  ],
  details(a) {
    a.px(0, 1, P.R2, false);
    a.px(0, 2, P.R1, false);
    a.px(8, 13.8, P.R2);
    a.px(7, 13.4, P.R1);
    for (let y = 14; y <= 18; y++) a.px(0, y, P.G1, false);
    a.px(4.5, 12.4, P.R2);
  },
  post(a) {
    burner(a, 0, 19.6, a.frame, false, 1);
    // nav lights: port red / starboard green blink
    const on = a.frame < 2;
    a.set(-8.4, 13.8, on ? P.R3 : P.R1, false);
    a.set(8.4, 13.8, on ? P.O3 : P.O1, false);
  },
};

const INTERCEPTOR = {
  W: 16,
  H: 24,
  parts: [
    { half: [[1.2, 10], [6.6, 18], [6.6, 19.4], [1.2, 18.6]], ramp: "dsteel" },
    { half: [[0.8, 20], [3.6, 22.3], [3.6, 23], [0.8, 23]], ramp: "dsteel" },
    { half: [[0, 0.3], [0.8, 3], [1.6, 8], [1.7, 18], [1.3, 23.2], [0, 23.2]], ramp: "steel", style: "cyl" },
    { half: [[0.6, 1.8], [2.4, 6.5], [2.4, 7.4], [0.8, 5]], ramp: "dsteel" }, // canards
    { ell: [0, 8.2, 0.9, 2], ramp: "glass", style: "dome" },
  ],
  details(a) {
    a.px(0, 1, P.R2, false);
    a.px(6, 18.6, P.R2);
    a.px(5, 17.6, P.R1);
    a.px(1.6, 13, P.R1);
    a.px(0, 20, P.G1, false);
    a.px(0, 21, P.G1, false);
  },
  post(a) {
    a.set(0, 23.6, [P.W, P.Y3, P.Y2, P.W][a.frame], false);
    a.set(-1, 23.6, AL(P.Y1, [120, 60, 30, 90][a.frame]), false);
    a.set(1, 23.6, AL(P.Y1, [120, 60, 30, 90][a.frame]), false);
    if (a.frame === 0 || a.frame === 3) a.set(6.4, 18.8, P.R3); // wingtip strobes
  },
};

const FIGHTER_HEAVY = {
  W: 32,
  H: 32,
  parts: [
    { half: [[2.5, 11], [12, 18], [14.5, 20.5], [14.5, 22], [2.5, 21]], ramp: "olive" },
    { half: [[2.2, 25], [8.5, 28.5], [8.5, 30], [2.2, 30]], ramp: "olive" },
    { half: [[3.4, 21], [4.8, 21], [5.4, 29], [3.6, 29]], ramp: "dsteel" }, // twin fins
    { ell: [2.4, 20, 1.8, 9], ramp: "steel", style: "cyl" }, // twin engines
    { half: [[0, 0.8], [1.3, 3], [2.4, 8], [2.6, 18], [2, 25], [0, 25]], ramp: "olive", style: "cyl" },
    { ell: [0, 7.5, 1.4, 3], ramp: "glass", style: "dome" },
  ],
  details(a) {
    a.px(0, 1.4, P.G2, false);
    a.px(13.6, 21, P.R2);
    a.px(12.6, 20.2, P.R1);
    a.px(8, 19.6, P.R2);
    a.px(7.6, 19.6, P.W);
    a.px(9, 21, P.O0);
    a.px(6, 21, P.O0);
    a.px(10, 21.4, P.G1); // missiles
    a.px(10, 22.4, P.R2);
    a.px(0, 13, P.O0, false);
    a.px(0, 16, P.O0, false);
  },
  post(a) {
    burner(a, 2.4, 29.2, a.frame, true, 2);
    if (a.frame % 2 === 0) a.set(13.6, 21, P.R3);
  },
};

const BOMBER = {
  W: 40,
  H: 32,
  bankTone: false,
  parts: [
    { half: [[2.5, 10], [18.6, 13], [19.4, 14], [19.4, 16], [2.5, 17]], ramp: "tan" }, // big straight wing
    { half: [[2, 25], [8.6, 26.5], [8.6, 28.6], [2, 29]], ramp: "tan" },
    { ell: [7.5, 12.5, 1.6, 3.6], ramp: "steel", style: "cyl" }, // inner engines
    { ell: [13.5, 12.8, 1.5, 3.4], ramp: "steel", style: "cyl" }, // outer engines
    { half: [[0, 1], [1.6, 2.6], [3, 6], [3.2, 20], [2.4, 28], [1, 31], [0, 31]], ramp: "tan", style: "cyl" },
    { ell: [0, 4.2, 1.6, 1.8], ramp: "glass", style: "dome" },
  ],
  details(a) {
    // glazed nose rings, tail gunner, markings
    a.px(0, 30, P.C1, false);
    a.px(1.4, 6, P.T0);
    a.px(18.6, 14.2, P.R2);
    a.px(17.6, 14, P.R1);
    a.px(11, 15.2, P.R2);
    a.px(11, 14.4, P.W);
    for (let y = 9; y <= 24; y += 3) a.px(0, y, P.T1, false);
    a.px(4, 15, P.T0);
    a.px(4, 12, P.T0);
    a.px(16, 15, P.T0);
  },
  post(a) {
    for (const dx of [-13.5, -7.5, 7.5, 13.5]) {
      const [x, y] = a.T(dx, 8.4);
      prop(a.img, x, y + 0.5, 3.4, (a.frame + (dx > 0 ? 0 : 1)) % 4);
    }
    a.set(0, 31, a.frame % 2 ? P.C2 : P.C1, false); // tail gunner glint
  },
};

const DRONE = {
  W: 12,
  H: 12,
  parts: [
    { half: [[0, 1], [5, 9], [5, 10.4], [1.5, 9], [0, 10]], ramp: "dsteel" },
    { half: [[0, 1.5], [1.1, 3], [1.4, 7.5], [0.6, 10], [0, 10]], ramp: "steel", style: "cyl" },
  ],
  details(a) {
    a.px(0, 2, P.R2, false);
    a.px(4.4, 9.4, P.R1);
  },
  post(a) {
    // blinking warhead light + exhaust
    a.set(0, 1, [P.R3, P.W, P.R3, P.R1][a.frame], false);
    a.set(0, 11, [P.W, P.Y2, P.Y3, P.Y1][a.frame], false);
    a.set(4.4, 9.4, a.frame % 2 ? P.R3 : P.R1);
  },
};

const MISSILE_CARRIER = {
  W: 40,
  H: 40,
  parts: [
    { half: [[0, 3], [8, 12], [19, 26], [19, 29], [12, 30], [6, 27], [0, 33]], ramp: "dsteel" }, // flying wing
    { half: [[0, 4], [2.6, 8], [3.5, 18], [3, 30], [0, 34]], ramp: "steel", style: "cyl" },
    // missiles hanging under wing (bright tips)
    { half: [[6.2, 12], [7.4, 13], [7.4, 22], [6.2, 22]], ramp: "lsteel" },
    { half: [[10.2, 16], [11.4, 17], [11.4, 25], [10.2, 25]], ramp: "lsteel" },
    { half: [[14.2, 20], [15.4, 21], [15.4, 27], [14.2, 27]], ramp: "lsteel" },
    { ell: [0, 9.5, 1.6, 3], ramp: "glass", style: "dome" },
  ],
  details(a) {
    for (const [dx, y] of [[6.8, 12.3], [10.8, 16.3], [14.8, 20.3]]) {
      a.px(dx, y, P.R2);
      a.px(dx, y + 1, P.R1);
    }
    a.px(17, 27.4, P.R2);
    a.px(18, 28.2, P.R2);
    a.px(0, 20, P.G0, false);
    a.px(0, 24, P.G0, false);
    a.px(4, 26, P.R1);
  },
  post(a) {
    burner(a, 2, 31.6, a.frame % 4, true, 2);
    // belly bay doors: closed (0-1) -> opening (2) -> open (3-5, warheads glow) -> closing (6) -> closed (7)
    const open = [0, 0, 1, 2, 2, 2, 1, 0][a.frame];
    for (let y = 14; y <= 22; y++) {
      if (open === 0) { a.set(0, y, y % 3 === 0 ? P.G1 : P.G2, false); continue; }
      a.set(0, y, P.K, false);
      a.set(1, y, open === 2 ? P.K : P.G1);
      if (open === 2) a.set(2, y, P.G4);
    }
    if (open === 2) for (const y of [15, 18, 21]) a.set(0, y, a.frame === 4 ? P.R3 : P.R2, false);
    for (const [dx, y] of [[6.8, 12.3], [10.8, 16.3], [14.8, 20.3]]) if ((a.frame >> 1) % 2 === 0) a.set(dx, y, P.R3);
  },
};

/**
 * Main rotor seen from above (2 blades, 6-frame loop = 180deg): faint translucent disc, a rim whose bright dashes
 * travel with the blades, two solid blades with light tips and two fading smear copies behind each blade.
 */
function rotorDisc(img, hx, hy, R, frame, n = 6) {
  const ang = (frame / n) * Math.PI;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const dx = x + 0.5 - hx, dy = y + 0.5 - hy;
      const d = Math.hypot(dx, dy);
      if (d > R + 0.5) continue;
      if (d > R - 0.6) {
        const th = Math.atan2(dy, dx) - ang;
        const bucket = (((Math.floor((th / Math.PI) * 6) % 6) + 6) % 6);
        img.set(x, y, AL(P.G3, bucket % 3 === 0 ? 150 : 80));
      } else if (d > 2 && img.a(x, y) === 0) img.set(x, y, AL(P.G3, 30));
    }
  for (const off of [0, Math.PI]) {
    for (const [lag, alpha, col] of [[0.5, 55, P.G3], [0.26, 120, P.G2]]) {
      const a = ang + off - lag;
      for (let r = 3; r <= R - 0.5; r += 0.5) img.set(Math.floor(hx + Math.cos(a) * r), Math.floor(hy + Math.sin(a) * r), AL(col, alpha));
    }
    const a = ang + off;
    for (let r = 1; r <= R; r += 0.5) img.set(Math.floor(hx + Math.cos(a) * r), Math.floor(hy + Math.sin(a) * r), r > R - 2.5 ? P.G4 : P.G0);
  }
  const ix = Math.floor(hx - 0.5), iy = Math.floor(hy - 0.5);
  img.set(ix, iy, P.G4);
  img.set(ix + 1, iy, P.G2);
  img.set(ix, iy + 1, P.G2);
  img.set(ix + 1, iy + 1, P.G1);
}

/** tail rotor (spins in a vertical plane): top-down it is a short blade along the boom whose length pulses */
function tailRotor(a, dx, y, frame, half = 2.5) {
  const [x0, y0] = a.T(dx, y);
  const hx = Math.floor(x0), hy = Math.floor(y0);
  for (let k = -Math.ceil(half); k <= Math.ceil(half); k++) if (!a.img.get(hx, hy + k)) a.img.set(hx, hy + k, AL(P.G3, 70));
  const L = Math.round(Math.abs(Math.cos((frame * Math.PI) / 3)) * half);
  for (let k = -L; k <= L; k++) a.img.set(hx, hy + k, Math.abs(k) === L && L > 0 ? P.G4 : P.G1);
  a.img.set(hx, hy, P.G3);
}

function helicopter(frame, bank = 0) {
  // 32x32, nose down, 6-frame rotor
  const spec = {
    W: 32,
    H: 32,
    bankSquash: 0.86,
    parts: [
      { half: [[0.8, 14], [1.4, 14], [1.6, 30], [0, 31]], ramp: "olive" }, // tail boom
      { half: [[0, 29], [3.5, 28.5], [3.5, 30.5], [0, 30.5]], ramp: "olive" }, // tail stabilizer
      { half: [[3.2, 13], [7.2, 13], [7.2, 15.5], [3.2, 15.5]], ramp: "dsteel" }, // stub wings
      { half: [[5.5, 11.5], [7.6, 11.5], [7.6, 17], [5.5, 17]], ramp: "steel", style: "cyl" }, // rocket pods
      { half: [[0, 3], [2.4, 4], [3.8, 8], [3.8, 15], [2.6, 19], [0, 20]], ramp: "olive", style: "cyl" }, // body
      { ell: [0, 6, 2, 2.6], ramp: "glass", style: "dome" },
    ],
    details(a) {
      a.px(0, 3, P.G1, false); // chin gun
      a.px(6.5, 11.6, P.R2);
      a.px(0, 26, P.O0, false);
      a.px(3, 29.5, P.R2);
      a.px(2, 15, P.O0);
    },
    post(a) {
      tailRotor(a, 2.6, 29.6, a.frame);
      if (a.frame < 3) a.set(0, 26, P.R3, false); // beacon
    },
  };
  const img = buildPlane(spec, { down: true, frame, bank, parallax: 0.6 });
  rotorDisc(img, 16 + bank * 0.6, 12, 15, frame);
  return img;
}

const MINE_LAYER = {
  W: 28,
  H: 28,
  parts: [
    { half: [[2, 7], [13, 8], [13.5, 9], [13.5, 12], [2, 12]], ramp: "tan" }, // straight wing
    { half: [[5.4, 6], [7.4, 6], [7.4, 25], [5.4, 25]], ramp: "tan", style: "cyl" }, // twin booms
    { half: [[0, 23], [8, 23], [8, 25.5], [0, 25.5]], ramp: "tan" }, // tail bar
    { half: [[0, 2], [2.4, 3.5], [3, 8], [3, 17], [1.8, 20], [0, 20]], ramp: "olive", style: "cyl" }, // cargo pod
    { ell: [0, 4.5, 1.6, 1.6], ramp: "glass", style: "dome" },
  ],
  details(a) {
    a.px(12.6, 10.5, P.R2);
    a.px(0, 19, P.K, false); // mine chute
    a.px(0, 18, P.Y2, false);
    a.px(0, 12, P.O0, false);
    a.px(3.5, 10, P.T1);
  },
  post(a) {
    for (const dx of [-6.4, 6.4]) {
      const [x, y] = a.T(dx, 4.6);
      prop(a.img, x, y, 2.8, (a.frame + (dx > 0 ? 0 : 2)) % 4);
    }
    if (a.frame % 2) a.set(0, 18, P.Y3, false);
  },
};

function shieldDrone(frame) {
  const S = 16;
  const im = new Img(S, S);
  shade(im, new Mask(S, S).ellipse(8, 8, 7, 7), RAMP.steel, "dome");
  shade(im, new Mask(S, S).ring(8, 8, 4.4, 5.6), RAMP.dsteel, "bevel");
  const r = [2.8, 3.3, 3.7, 3.3][frame];
  shade(im, new Mask(S, S).ellipse(8, 8, r, r), [P.C0, P.C1, P.C2, P.W], "dome");
  const pts = [[1, 8], [3, 3], [8, 1], [12, 3], [14, 8], [12, 12], [8, 14], [3, 12]];
  pts.forEach(([x, y], i) => im.set(x, y, (i + frame * 2) % 8 < 2 ? P.W : i % 2 ? P.G3 : P.C1));
  outline(im);
  return im;
}

function gunshipLight(frame, bank = 0) {
  // 28x32 light attack helicopter (nose down), 6-frame rotor
  const spec = {
    W: 28,
    H: 32,
    bankSquash: 0.86,
    parts: [
      { half: [[0.7, 13], [1.2, 13], [1.3, 29], [0, 30]], ramp: "tan" },
      { half: [[0, 28], [3, 27.6], [3, 29.4], [0, 29.4]], ramp: "tan" },
      { half: [[2.6, 12], [6, 12], [6, 14], [2.6, 14]], ramp: "dsteel" },
      { half: [[4.6, 11], [6.2, 11], [6.2, 15.5], [4.6, 15.5]], ramp: "lsteel", style: "cyl" },
      { half: [[0, 4], [1.6, 4.6], [2.6, 8], [2.8, 14], [1.8, 17.5], [0, 18]], ramp: "tan", style: "cyl" },
      { ell: [0, 6.6, 1.3, 2.4], ramp: "glass", style: "dome" },
    ],
    details(a) {
      a.px(5.4, 11.2, P.R2);
      a.px(0, 4, P.G1, false);
      a.px(2.6, 28.6, P.R2);
    },
    post(a) {
      tailRotor(a, 2.2, 28.6, a.frame, 2);
    },
  };
  const img = buildPlane(spec, { down: true, frame, bank, parallax: 0.6 });
  rotorDisc(img, 14 + bank * 0.6, 11, 12.5, frame);
  return img;
}

export const ENEMY_AIR = {
  mine_layer: { spec: MINE_LAYER, frames: 4, fps: 16 },
  fighter_basic: { spec: FIGHTER_BASIC, frames: 4, fps: 14 },
  interceptor: { spec: INTERCEPTOR, frames: 4, fps: 16 },
  fighter_heavy: { spec: FIGHTER_HEAVY, frames: 4, fps: 12 },
  bomber: { spec: BOMBER, frames: 4, fps: 16 },
  drone_kamikaze: { spec: DRONE, frames: 4, fps: 10 },
  missile_carrier: { spec: MISSILE_CARRIER, frames: 8, fps: 6 },
};

export function genAirEnemies(reg) {
  for (const [id, e] of Object.entries(ENEMY_AIR)) {
    const fr = [];
    for (let f = 0; f < e.frames; f++) fr.push(buildPlane(e.spec, { down: true, frame: f }));
    reg.add("enemy_" + id, fr, { fps: e.fps, loop: true, group: "enemy_air" });
  }
  const six = [0, 1, 2, 3, 4, 5];
  reg.add("enemy_helicopter", six.map(helicopter), { fps: 20, loop: true, group: "enemy_air" });
  reg.add("enemy_gunship_light", six.map(gunshipLight), { fps: 22, loop: true, group: "enemy_air" });
  reg.add("enemy_shield_drone", [0, 1, 2, 3].map(shieldDrone), { fps: 8, loop: true, group: "enemy_air" });
}

export { flame, mix, burner, prop, helicopter, gunshipLight };
