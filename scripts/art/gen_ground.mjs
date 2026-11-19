// Ground + naval enemies (top-down, facing DOWN toward the player), turret guns (`_gun`, pointing down,
// pivot = sprite centre) and burnt wrecks (`_dead`).
import { Img, Mask, P, RAMP, shade, outline, wreck, rng } from "./lib.mjs";

const M = (w, h) => new Mask(w, h);

/** caterpillar tread strip (vertical) with animated links */
function tread(im, x, y, w, h, frame) {
  shade(im, M(im.w, im.h).rect(x, y, w, h), RAMP.dark, "bevel", { grad: false });
  for (let j = 0; j < h; j++) {
    const ph = (((j - frame) % 4) + 4) % 4;
    if (ph === 0) for (let i = 0; i < w; i++) im.paint(x + i, y + j, P.K);
    else if (ph === 1) for (let i = 0; i < w; i++) im.paint(x + i, y + j, i === 0 ? P.G2 : P.G3);
  }
  im.paint(x, y, P.G2);
}

/** cylindrical barrel pointing down from (cx, y0) to y1 */
function barrel(im, cx, y0, y1, w = 2, ramp = RAMP.steel) {
  shade(im, M(im.w, im.h).rect(Math.round(cx - w / 2), y0, w, y1 - y0 + 1), ramp, "cyl");
  if (w >= 2) for (let x = Math.round(cx - w / 2); x < Math.round(cx - w / 2) + w; x++) im.set(x, y1, P.G0);
}

function tank(size, frame, ramp, opts = {}) {
  const S = size;
  const im = new Img(S, S);
  const tw = Math.max(3, Math.round(S / 5));
  // opts.part: "base" = chassis + turret ring only, "gun" = rotating turret only (pivot = centre), else full
  const tr = S * (opts.turretR ?? 0.24);
  if (opts.part !== "gun") {
    tread(im, 1, 1, tw, S - 3, frame);
    tread(im, S - 1 - tw, 1, tw, S - 3, frame);
    shade(im, M(S, S).rect(1 + tw - 1, 2, S - 2 * tw, S - 5), ramp, "bevel");
    // engine deck grille at the rear (top, since tank faces down)
    for (let x = tw + 2; x < S - tw - 2; x += 2) im.paint(x, 3, ramp[0]);
  }
  const puff = (img) => {
    if (opts.part === "gun") return img;
    const a = [150, 110, 70, 30][frame % 4];
    const ex = Math.round(S / 2) + (frame % 2 ? 2 : -3);
    img.set(ex, 0, [P.G3[0], P.G3[1], P.G3[2], a]);
    if (frame % 4 < 2) img.set(ex + 1, 0, [P.G2[0], P.G2[1], P.G2[2], a - 20]);
    return img;
  };
  if (opts.part === "base") {
    shade(im, M(S, S).ellipse(S / 2, S / 2, tr + 1, tr + 1), [P.K, P.G0, P.G1, P.G2], "bevel", { grad: false });
    outline(im);
    return puff(im);
  }
  // turret
  const tcx = S / 2, tcy = opts.part === "gun" ? S / 2 : S / 2 - 1;
  barrel(im, tcx, Math.round(tcy), S - 1, opts.twin ? 1 : 2, RAMP.steel);
  if (opts.twin) barrel(im, tcx + 2, Math.round(tcy), S - 2, 1, RAMP.steel);
  shade(im, M(S, S).ellipse(tcx, tcy, tr, tr * 1.05), ramp, "dome");
  im.paint(Math.round(tcx - tr * 0.4), Math.round(tcy - tr * 0.4), ramp[3]);
  if (opts.hatch) im.paint(Math.round(tcx + tr * 0.25), Math.round(tcy - tr * 0.3), P.G0);
  if (opts.star) im.paint(Math.round(tcx), Math.round(tcy + 1), P.R2);
  outline(im);
  return im;
}

function armored(frame) {
  // 16x24 8-wheel APC with small turret
  const im = new Img(16, 24);
  for (let i = 0; i < 4; i++) {
    const y = 4 + i * 4 + (frame && i % 2 ? 0 : 0);
    for (const x of [1, 12]) {
      shade(im, M(16, 24).rect(x, y, 3, 3), RAMP.dark, "dome");
      const ph = (frame + i) % 4;
      im.paint(x + [0, 1, 2, 1][ph], y + [1, 0, 1, 2][ph], P.G3);
    }
  }
  shade(im, M(16, 24).poly([[3, 3], [13, 3], [13, 20], [11, 23], [5, 23], [3, 20]]), RAMP.olive, "bevel");
  shade(im, M(16, 24).ellipse(8, 11, 3, 3), RAMP.olive, "dome");
  barrel(im, 8, 12, 22, 1, RAMP.dsteel);
  im.paint(5, 19, P.O3);
  im.paint(10, 19, P.O3);
  im.paint(6, 5, P.O0);
  im.paint(9, 5, P.O0);
  im.paint(7, 15, frame % 2 ? P.Y3 : P.Y1);
  outline(im);
  return im;
}

function aaBase(ramp = RAMP.tan, accent = P.O1) {
  // sandbag octagon with a round concrete pivot
  const im = new Img(16, 16);
  const oct = M(16, 16).poly([[5, 1], [11, 1], [15, 5], [15, 11], [11, 15], [5, 15], [1, 11], [1, 5]]);
  shade(im, oct, ramp, "bevel");
  // sandbag seams
  for (let a = 0; a < 16; a++) {
    const r = (a / 16) * Math.PI * 2;
    im.paint(Math.round(8 + Math.cos(r) * 6.3 - 0.5), Math.round(8 + Math.sin(r) * 6.3 - 0.5), ramp[0]);
  }
  shade(im, M(16, 16).ellipse(8, 8, 4.6, 4.6), RAMP.dsteel, "bevel");
  im.paint(4, 12, accent);
  im.paint(11, 12, accent);
  outline(im);
  return im;
}

function aaGun(ramp = RAMP.olive, twin = true, len = 15) {
  const im = new Img(16, 16);
  if (twin) {
    barrel(im, 6.5, 8, len, 1, RAMP.steel);
    barrel(im, 9.5, 8, len, 1, RAMP.steel);
  } else barrel(im, 8, 8, len, 2, RAMP.steel);
  shade(im, M(16, 16).poly([[5, 4.5], [11, 4.5], [12, 9.5], [10, 11.5], [6, 11.5], [4, 9.5]]), ramp, "bevel");
  im.paint(8, 6, ramp[3]);
  im.paint(7, 7, P.C1);
  outline(im);
  return im;
}

function launcher(frame = 0) {
  // 20x20 SAM launcher: tracked chassis + 2x2 missile tubes pointing down
  const im = new Img(20, 20);
  tread(im, 1, 2, 3, 16, 0);
  tread(im, 16, 2, 3, 16, 0);
  shade(im, M(20, 20).rect(3, 2, 14, 16), RAMP.olive, "bevel");
  shade(im, M(20, 20).rect(5, 6, 10, 12), RAMP.dsteel, "bevel");
  for (const [x, y] of [[6, 7], [10, 7], [6, 12], [10, 12]]) {
    shade(im, M(20, 20).rect(x, y, 4, 5), RAMP.lsteel, "cyl");
    im.paint(x + 1, y + 4, frame ? P.R3 : P.R2);
    im.paint(x + 2, y + 4, frame ? P.R3 : P.R2);
    im.paint(x + 1, y + 3, P.R1);
  }
  im.paint(4, 3, P.Y2);
  im.paint(15, 3, P.Y2);
  outline(im);
  return im;
}

function radar(frame) {
  // 24x24 concrete pad + control hut + rotating dish
  const im = new Img(24, 24);
  shade(im, M(24, 24).rect(1, 1, 22, 22), RAMP.steel, "bevel");
  for (let x = 3; x < 21; x += 3) im.paint(x, 21, P.Y2), im.paint(x + 1, 21, P.K);
  shade(im, M(24, 24).rect(3, 14, 8, 6), RAMP.olive, "bevel"); // hut
  im.paint(5, 16, P.C1);
  im.paint(8, 16, P.C1);
  shade(im, M(24, 24).ellipse(12, 11, 3, 3), RAMP.dsteel, "dome"); // mount
  // dish: an elongated curved plate rotating around (12,11)
  const a = (frame * Math.PI) / 4;
  im.paint(4, 15, frame % 4 < 2 ? P.R3 : P.R0);
  const dm = M(24, 24);
  for (let t = -7; t <= 7; t += 0.25) {
    const bow = (t * t) / 18;
    const x = 12 + Math.cos(a) * t - Math.sin(a) * (bow - 2);
    const y = 11 + Math.sin(a) * t + Math.cos(a) * (bow - 2);
    dm.rect(Math.floor(x), Math.floor(y), 1, 1);
    dm.rect(Math.floor(x - Math.sin(a) * 0.9), Math.floor(y + Math.cos(a) * 0.9), 1, 1);
  }
  shade(im, dm, RAMP.lsteel, "bevel");
  const fx = 12 + Math.sin(a) * 3, fy = 11 - Math.cos(a) * 3;
  im.set(Math.round(fx), Math.round(fy), P.R2);
  outline(im);
  return im;
}

function base() {
  // 48x48 compound: perimeter wall, two barracks, command bunker, helipad
  const im = new Img(48, 48);
  const r = rng("base");
  shade(im, M(48, 48).rect(1, 1, 46, 46), RAMP.tan, "bevel"); // ground pad
  for (let i = 0; i < 70; i++) im.paint(2 + Math.floor(r() * 44), 2 + Math.floor(r() * 44), r() < 0.5 ? P.T1 : P.T3);
  // wall
  const wall = M(48, 48).rect(1, 1, 46, 3).rect(1, 44, 46, 3).rect(1, 1, 3, 46).rect(44, 1, 3, 46).sub(M(48, 48).rect(20, 44, 8, 3));
  shade(im, wall, RAMP.steel, "bevel", { grad: false });
  // corner watchtowers
  for (const [x, y] of [[1, 1], [41, 1], [1, 41], [41, 41]]) {
    shade(im, M(48, 48).rect(x, y, 6, 6), RAMP.dsteel, "bevel");
    im.paint(x + 2, y + 2, P.Y2);
  }
  // barracks (long roofs with ridge)
  for (const [x, y] of [[8, 8], [8, 18]]) {
    shade(im, M(48, 48).rect(x, y, 16, 7), RAMP.olive, "cylH");
    for (let i = 0; i < 16; i += 3) im.paint(x + i, y + 6, P.O0);
  }
  // command bunker (dome)
  shade(im, M(48, 48).ellipse(34, 15, 8, 7), RAMP.steel, "dome");
  im.paint(34, 15, P.G0);
  im.paint(35, 15, P.G0);
  shade(im, M(48, 48).rect(32, 21, 5, 3), RAMP.dsteel, "bevel");
  // antenna
  im.line(40, 8, 43, 5, P.G3);
  im.set(43, 5, P.R2);
  // helipad
  shade(im, M(48, 48).ellipse(16, 34, 7, 7), RAMP.dsteel, "bevel", { grad: false });
  for (const [x, y] of [[13, 31], [13, 32], [13, 33], [13, 34], [13, 35], [13, 36], [14, 34], [15, 34], [16, 34], [17, 34], [18, 31], [18, 32], [18, 33], [18, 34], [18, 35], [18, 36]]) im.paint(x, y, P.Y2);
  // fuel drums + crates
  for (const [x, y] of [[30, 30], [33, 30], [30, 33]]) shade(im, M(48, 48).ellipse(x + 1, y + 1, 1.6, 1.6), RAMP.red, "dome");
  for (const [x, y] of [[36, 32], [36, 36], [40, 34]]) {
    shade(im, M(48, 48).rect(x, y, 4, 4), RAMP.tan, "bevel");
    im.paint(x + 1, y + 1, P.T1);
  }
  // flag
  im.vline(26, 28, 33, P.G3);
  im.rect(27, 28, 4, 3, P.R2);
  im.set(27, 30, P.R1);
  outline(im);
  return im;
}

function gunboat(frame) {
  const im = new Img(16, 32);
  // wake behind (top) — boat faces down
  for (let y = 0; y < 7; y++) {
    const s = 3 + Math.floor((7 - y) / 2);
    const ph = (y + frame) % 4;
    if (ph === 0) { im.set(8 - s, y, A(P.W, 190)); im.set(7 + s, y, A(P.W, 190)); im.set(9 - s, y, A(P.C2, 110)); im.set(6 + s, y, A(P.C2, 110)); }
    else if (ph === 1) { im.set(8 - s, y, A(P.C2, 90)); im.set(7 + s, y, A(P.C2, 90)); }
    im.set(7, y, A(ph % 2 ? P.C2 : P.W, 110 + y * 10));
    im.set(8, y, A(ph % 2 ? P.W : P.C2, 140 + y * 8));
  }
  const hull = M(16, 32).poly([[3, 6], [13, 6], [13, 22], [8, 31], [3, 22]]);
  shade(im, hull, RAMP.steel, "bevel");
  shade(im, M(16, 32).poly([[4.5, 8], [11.5, 8], [11.5, 21], [8, 27], [4.5, 21]]), RAMP.lsteel, "bevel", { grad: false });
  shade(im, M(16, 32).rect(5, 11, 6, 6), RAMP.steel, "bevel"); // cabin
  im.paint(6, 15, P.C1);
  im.paint(9, 15, P.C1);
  shade(im, M(16, 32).ellipse(8, 21.5, 2.2, 2.2), RAMP.dsteel, "dome");
  barrel(im, 8, 22, 27, 1, RAMP.dark);
  im.paint(5, 7, P.R2);
  im.paint(10, 7, P.R2);
  outline(im);
  // bow spray
  im.set(8, 31, frame % 2 ? P.W : P.C2);
  im.set(frame % 2 ? 6 : 10, 30, A(P.W, 160));
  return im;
}

function destroyer(frame) {
  const W = 24, H = 64;
  const im = new Img(W, H);
  for (let y = 0; y < 8; y++) {
    const s = 4 + Math.floor((8 - y) / 2);
    const ph = (y + frame) % 4;
    if (ph === 0) { im.set(12 - s, y, A(P.W, 190)); im.set(11 + s, y, A(P.W, 190)); im.set(13 - s, y, A(P.C2, 110)); im.set(10 + s, y, A(P.C2, 110)); }
    else if (ph === 1) { im.set(12 - s, y, A(P.C2, 90)); im.set(11 + s, y, A(P.C2, 90)); }
    for (const x of [10, 11, 12, 13]) im.set(x, y, A((x + y + frame) % 3 ? P.C2 : P.W, 100 + y * 12));
  }
  shade(im, M(W, H).poly([[4, 8], [20, 8], [21, 20], [21, 46], [12, 63], [3, 46], [3, 20]]), RAMP.steel, "bevel");
  shade(im, M(W, H).poly([[6, 10], [18, 10], [19, 20], [19, 45], [12, 58], [5, 45], [5, 20]]), RAMP.dsteel, "bevel", { grad: false });
  // superstructure
  shade(im, M(W, H).rect(8, 24, 8, 14), RAMP.lsteel, "bevel");
  shade(im, M(W, H).rect(9, 34, 6, 5), RAMP.steel, "bevel"); // bridge
  im.paint(10, 38, P.C1); im.paint(13, 38, P.C1);
  shade(im, M(W, H).ellipse(12, 28, 2.2, 2.6), RAMP.dark, "dome"); // funnel
  im.paint(12, 28, P.K);
  // radar mast
  im.hline(9, 15, 32, P.G4);
  im.set(12, 31, P.R2);
  // turrets
  for (const [y, ln] of [[46, 6], [16, -5]]) {
    shade(im, M(W, H).ellipse(12, y, 3, 3), RAMP.steel, "dome");
    if (ln > 0) { barrel(im, 11, y + 2, y + ln, 1, RAMP.dark); barrel(im, 13, y + 2, y + ln, 1, RAMP.dark); }
    else { im.vline(11, y - 2, y + ln, P.G1); im.vline(13, y - 2, y + ln, P.G1); }
  }
  // AA mounts + deck markings
  for (const [x, y] of [[6, 22], [17, 22], [6, 40], [17, 40]]) shade(im, M(W, H).ellipse(x + 0.5, y + 0.5, 1.4, 1.4), RAMP.olive, "dome");
  im.paint(12, 54, P.W);
  im.paint(12, 55, P.W);
  im.paint(12, 31, frame % 4 < 2 ? P.R3 : P.R1); // mast beacon
  outline(im);
  im.set(12, 63, frame % 2 ? P.W : P.C2);
  im.set(frame % 2 ? 9 : 15, 61, A(P.W, 170));
  return im;
}

function oilTank() {
  const S = 28;
  const im = new Img(S, S);
  shade(im, M(S, S).rect(1, 1, 26, 26), RAMP.tan, "bevel", { grad: false }); // berm
  for (let x = 2; x < 26; x += 4) im.paint(x, 25, P.T1);
  shade(im, M(S, S).ellipse(14, 14, 11, 11), RAMP.lsteel, "dome");
  for (const r of [7.5, 4]) {
    const ring = M(S, S).ring(14, 14, r - 0.5, r + 0.3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (ring.has(x, y)) im.paint(x, y, P.G2);
  }
  // hazard stripe band + valve
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    im.paint(Math.round(14 + Math.cos(t) * 10 - 0.5), Math.round(14 + Math.sin(t) * 10 - 0.5), a % 2 ? P.Y2 : P.K);
  }
  shade(im, M(S, S).ellipse(14, 14, 2, 2), RAMP.red, "dome");
  im.line(18, 19, 25, 26, P.G1); // pipe
  outline(im);
  return im;
}

function hangar() {
  const W = 48, H = 32;
  const im = new Img(W, H);
  shade(im, M(W, H).rect(1, 1, 46, 28), RAMP.steel, "cylH"); // arched roof (runs horizontally)
  for (let x = 4; x < 46; x += 5) for (let y = 2; y < 28; y++) im.paint(x, y, (y & 1) ? P.G1 : P.G2);
  // front doors (bottom edge, facing the player)
  shade(im, M(W, H).rect(8, 26, 32, 5), RAMP.dsteel, "bevel");
  for (let x = 9; x < 39; x += 4) im.paint(x, 28, P.Y2), im.paint(x + 1, 28, P.K);
  // roof markings
  for (let x = 18; x < 30; x++) im.paint(x, 13, P.W);
  im.paint(23, 11, P.R2); im.paint(24, 11, P.R2); im.paint(23, 12, P.R2); im.paint(24, 12, P.R2);
  // vents
  for (const x of [6, 40]) shade(im, M(W, H).rect(x, 6, 3, 3), RAMP.dark, "bevel");
  outline(im);
  return im;
}

function iceBase() {
  const im = aaBase([P.G2, P.G3, P.G4, P.W], P.B2);
  return im;
}

function citadelBase() {
  const S = 20;
  const im = new Img(S, S);
  shade(im, M(S, S).poly([[6, 1], [14, 1], [19, 6], [19, 14], [14, 19], [6, 19], [1, 14], [1, 6]]), RAMP.dsteel, "bevel");
  shade(im, M(S, S).ellipse(10, 10, 6, 6), RAMP.dark, "bevel");
  for (const [x, y] of [[3, 9], [16, 9], [9, 3], [9, 16]]) { im.paint(x, y, P.R2); im.paint(x + 1, y + 1, P.R1); }
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2;
    if (a % 3 === 0) im.paint(Math.round(10 + Math.cos(t) * 7.6 - 0.5), Math.round(10 + Math.sin(t) * 7.6 - 0.5), P.M2);
  }
  outline(im);
  return im;
}
function citadelGun() {
  const S = 20;
  const im = new Img(S, S);
  barrel(im, 8, 10, 19, 2, RAMP.dsteel);
  barrel(im, 12, 10, 19, 2, RAMP.dsteel);
  im.set(8, 19, P.R2); im.set(9, 19, P.R2); im.set(12, 19, P.R2); im.set(13, 19, P.R2);
  shade(im, M(S, S).ellipse(10, 9.5, 5, 5), RAMP.steel, "dome");
  shade(im, M(S, S).ellipse(10, 10, 2, 2), [P.R0, P.R1, P.R2, P.R3], "dome");
  im.set(10, 10, P.W);
  outline(im);
  return im;
}

function samSite() {
  // 20x20 sandbagged pad with twin missile rails (missiles point up toward the sky = toward top of screen)
  const S = 20;
  const im = new Img(S, S);
  shade(im, M(S, S).poly([[5, 1], [15, 1], [19, 5], [19, 15], [15, 19], [5, 19], [1, 15], [1, 5]]), RAMP.tan, "bevel");
  for (let a = 0; a < 20; a++) {
    const t = (a / 20) * Math.PI * 2;
    im.paint(Math.round(10 + Math.cos(t) * 8 - 0.5), Math.round(10 + Math.sin(t) * 8 - 0.5), P.T1);
  }
  shade(im, M(S, S).rect(5, 5, 10, 10), RAMP.olive, "bevel");
  for (const x of [6, 11]) {
    shade(im, M(S, S).rect(x, 3, 3, 12), RAMP.lsteel, "cyl");
    im.paint(x + 1, 3, P.R2);
    im.paint(x, 4, P.R1);
    im.paint(x + 2, 4, P.R1);
  }
  im.paint(9, 13, P.O0);
  im.paint(10, 13, P.O0);
  outline(im);
  return im;
}
function blink(img, pts, on, off) {
  return [0, 1].map((f) => { const o = img.clone(); for (const [x, y] of pts) o.set(x, y, f ? off : on); return o; });
}

/** big knobbly off-road tyre (vertical), tread knobs scroll with `frame` */
function tyre(im, x, y, w, h, frame) {
  shade(im, M(im.w, im.h).rect(x, y, w, h).sub(M(im.w, im.h).rect(x, y, 1, 1).rect(x + w - 1, y, 1, 1).rect(x, y + h - 1, 1, 1).rect(x + w - 1, y + h - 1, 1, 1)), [P.K, P.G0, P.G1, P.G2], "cyl");
  // chevron cleats roll toward the rear (top) as the vehicle drives down
  for (let j = 0; j < h; j++) {
    const ph = (((j - frame) % 3) + 3) % 3;
    if (ph === 0) for (let i = 0; i < w; i++) im.paint(x + i, y + j, i === 0 || i === w - 1 ? P.G1 : P.G2);
  }
  im.paint(x + 1, y + 1, P.G3);
}

function sandCrawler(frame) {
  // 20x24 six-wheeled desert raider: rear engine block, open roll-cage cab with two crew,
  // pintle gun pointing down (toward the player), dozer ram, sand camo; frames roll the tyres + kick dust
  const W = 20, H = 24;
  const im = new Img(W, H);
  const sandR = [P.T0, P.T1, P.T2, P.T3];
  for (const y of [3, 10, 17]) {
    tyre(im, 0, y, 4, 5, frame);
    tyre(im, 16, y, 4, 5, frame);
  }
  // axles
  for (const y of [5, 12, 19]) { im.set(4, y, P.G0); im.set(15, y, P.G0); }
  const hull = M(W, H).poly([[5, 1.5], [15, 1.5], [16.5, 5], [16.5, 18], [14.5, 21.5], [5.5, 21.5], [3.5, 18], [3.5, 5]]);
  shade(im, hull, sandR, "bevel");
  // camo blotches (olive + dark sand) clipped to the hull
  for (let y = 2; y < 21; y++) for (let x = 4; x < 16; x++) {
    const n = (Math.sin(x * 1.7 + y * 0.9) + Math.sin(x * 0.6 - y * 1.3)) * 0.5;
    if (n > 0.62 && hull.has(x, y) && hull.has(x + 1, y + 1)) im.set(x, y, P.O2);
    else if (n < -0.72 && hull.has(x, y) && hull.has(x + 1, y + 1)) im.set(x, y, P.T1);
  }
  // rear engine deck: radiator grille + twin exhausts + jerrycans
  shade(im, M(W, H).rect(6, 2, 8, 4), RAMP.dsteel, "bevel");
  for (let x = 7; x < 13; x += 2) im.vline(x, 3, 4, P.G0);
  im.set(6, 1, P.G1); im.set(13, 1, P.G1); im.set(6, 0, P.G0); im.set(13, 0, P.G0);
  shade(im, M(W, H).rect(4, 6, 2, 3), RAMP.olive, "bevel", { grad: false });
  shade(im, M(W, H).rect(14, 6, 2, 3), RAMP.olive, "bevel", { grad: false });
  // open cab floor + roll cage
  shade(im, M(W, H).rect(6, 7, 8, 8), [P.G0, P.G1, P.G1, P.G2], "bevel", { grad: false });
  im.hline(6, 13, 7, P.G2); im.hline(6, 13, 14, P.G2); im.vline(6, 7, 14, P.G2); im.vline(13, 7, 14, P.G2);
  im.line(6, 7, 13, 14, P.G1);
  im.set(6, 7, P.G4); im.set(13, 7, P.G3);
  // crew helmets (lit top-left)
  for (const cx of [8, 11]) {
    shade(im, M(W, H).ellipse(cx + 0.5, 10.5, 1.4, 1.4), RAMP.olive, "dome");
    im.set(cx, 9, P.O3);
  }
  // pintle gun on a ring mount at the front of the cab, barrel down
  shade(im, M(W, H).ellipse(10, 15.5, 2, 1.6), RAMP.dsteel, "dome");
  barrel(im, 10, 15, 22, 1, RAMP.steel);
  im.set(10, 23, P.G0);
  // dozer ram + headlights
  shade(im, M(W, H).rect(5, 20, 10, 2), RAMP.steel, "bevel", { grad: false });
  for (let x = 6; x < 14; x += 2) im.set(x, 21, P.G1);
  im.set(5, 19, P.Y3); im.set(14, 19, P.Y3);
  im.set(5, 18, P.Y1); im.set(14, 18, P.Y1);
  outline(im);
  // dust plume kicked up behind the rear tyres (alternating puffs, translucent, no outline)
  const dust = A(P.T3, 150), dust2 = A(P.T2, 110);
  const pts = [[[1, 1, dust], [2, 0, dust2], [17, 2, dust2], [18, 0, dust]], [[1, 2, dust2], [0, 0, dust], [18, 1, dust], [17, 0, dust2]], [[2, 1, dust], [1, 0, dust], [18, 2, dust2], [19, 0, dust2]], [[0, 2, dust2], [3, 0, dust2], [17, 1, dust], [16, 0, dust]]][frame % 4];
  for (const [x, y, c] of pts) if (!im.get(x, y)) im.set(x, y, c);
  return im;
}

const A = (c, a) => [c[0], c[1], c[2], a];
const SNOWR = [P.G2, P.G3, P.G4, P.W]; // winter-white armour
const ICEAR = [P.B1, P.G3, P.G4, P.W];
function iceWalker(frame) {
  // 24x24 bipedal "chicken walker", top-down: hip block in the centre, hydraulic thighs out to the sides,
  // splayed three-toed feet that alternate forward/back each frame (the torso + guns are the `_gun` overlay)
  const S = 24;
  const im = new Img(S, S);
  const st = [1, 0, -1, 0][frame % 4];
  const lift = [0, 1, 0, -1][frame % 4]; // +1: left foot in the air, -1: right foot in the air
  for (const side of [-1, 1]) {
    const up = lift === side;
    const fy = 11 + 7 * st * side + (up ? -1 : 0); // foot y: one leg forward (down), the other back
    const kx = 12 + side * 9.8, ky = 11 + 3.5 * st * side; // knee (outside the pod)
    const fx = 12 + side * (up ? 8.5 : 8);
    // thigh + shin (capsules, dark steel), piston highlight
    shade(im, M(S, S).capsule(12 + side * 4, 11, kx, ky, 1.6), RAMP.dsteel, "bevel");
    shade(im, M(S, S).capsule(kx, ky, fx, fy, 1.3), RAMP.steel, "bevel");
    im.paint(Math.round((12 + side * 4 + kx) / 2), Math.round((11 + ky) / 2) - 1, P.G4);
    // knee joint
    shade(im, M(S, S).ellipse(kx, ky, 1.8, 1.8), ICEAR, "dome");
    // foot pad with three toes (pointing down = forward) and a rear spur
    const fs = up ? 1.2 : 1;
    const foot = M(S, S).ellipse(fx, fy, 2.6 * fs, 1.8 * fs);
    for (const tx of [-2, 0, 2]) foot.capsule(fx, fy, fx + tx * fs, fy + 3.2 * fs, 0.7);
    foot.capsule(fx, fy, fx, fy - 2.6, 0.6);
    shade(im, foot, up ? [P.G3, P.G4, P.W, P.W] : SNOWR, "bevel");
    im.paint(Math.round(fx - 1), Math.round(fy - 1), P.W);
    for (const tx of [-2, 0, 2]) im.paint(Math.round(fx + tx), Math.round(fy + 3), P.G1); // claw tips
  }
  // footprints / snow puffs where the planted foot lands
  if (st !== 0) for (const side of [-1, 1]) if (lift !== side) im.set(Math.round(12 + side * 7), Math.round(11 + 7 * st * side + 4), A(P.W, 150));
  // hip block with hydraulic rams
  shade(im, M(S, S).rect(8, 9, 8, 7), RAMP.dsteel, "bevel");
  shade(im, M(S, S).ellipse(12, 12.5, 3.2, 3.2), [P.K, P.G0, P.G1, P.G2], "bevel", { grad: false });
  im.set(9, 10, P.G3); im.set(14, 14, P.G0);
  outline(im);
  return im;
}
function iceWalkerGun() {
  // compact armoured cockpit pod (rotates; points DOWN at 0deg, pivot = centre): wedge hull, twin long cannons with
  // muzzle brakes, small shoulder missile pods, visor at the front (down), antenna - small enough that the legs show
  const S = 24;
  const im = new Img(S, S);
  for (const bx of [9.5, 14.5]) {
    barrel(im, bx, 12, 22, 1, RAMP.dsteel);
    shade(im, M(S, S).rect(Math.round(bx - 1), 20, 2, 2), RAMP.steel, "bevel", { grad: false });
  }
  for (const x of [5, 16]) {
    shade(im, M(S, S).rect(x, 8, 3, 5), RAMP.olive, "bevel");
    im.paint(x + 1, 12, P.R2);
    im.paint(x + 1, 10, P.R1);
  }
  const pod = M(S, S).poly([[9, 6], [15, 6], [16.5, 9], [16, 14], [13.5, 16.5], [10.5, 16.5], [8, 14], [7.5, 9]]);
  shade(im, pod, SNOWR, "bevel");
  im.hline(9, 14, 9, P.G2);
  for (const [x, y] of [[9, 7], [14, 7]]) im.paint(x, y, P.G1);
  for (const [x, y] of [[10, 11], [11, 11], [14, 12]]) im.paint(x, y, ICEAR[0]);
  shade(im, M(S, S).poly([[10, 13.5], [14, 13.5], [13.5, 15.5], [10.5, 15.5]]), RAMP.glass, "bevel", { grad: false });
  im.paint(10, 13, P.W);
  im.set(12, 5, P.G3); im.set(12, 4, P.R3);
  outline(im);
  return im;
}

export function genGroundEnemies(reg) {
  const add = (key, frames, opts = {}) => {
    reg.add("enemy_" + key, frames, { group: "enemy_ground", ...opts });
    if (!opts.noWreck) reg.add("enemy_" + key + "_dead", wreck(frames[0], key), { group: "wrecks" });
  };
  // tanks rotate their turret toward the player: chassis (+ turret ring) and a separate `_gun` overlay
  const TL = { turretR: 0.21, star: true };
  const TH = { turretR: 0.22, hatch: true, star: true };
  const sand = [P.T0, P.T1, P.T2, P.T3];
  reg.add("enemy_tank_light", [0, 1, 2, 3].map((f) => tank(16, f, RAMP.olive, { ...TL, part: "base" })), { group: "enemy_ground", fps: 10 });
  reg.add("enemy_tank_light_gun", tank(16, 0, RAMP.olive, { ...TL, part: "gun" }), { group: "enemy_ground" });
  reg.add("enemy_tank_light_dead", wreck(tank(16, 0, RAMP.olive, TL), "tank_light"), { group: "wrecks" });
  reg.add("enemy_tank_heavy", [0, 1, 2, 3].map((f) => tank(24, f, sand, { ...TH, part: "base" })), { group: "enemy_ground", fps: 7 });
  reg.add("enemy_tank_heavy_gun", tank(24, 0, sand, { ...TH, part: "gun" }), { group: "enemy_ground" });
  reg.add("enemy_tank_heavy_dead", wreck(tank(24, 0, sand, TH), "tank_heavy"), { group: "wrecks" });
  // requested extras (docs/ASSET_REQUESTS.md)
  add("sam_site", [samSite()]);
  add("sand_crawler", [0, 1, 2, 3].map(sandCrawler), { fps: 12 });
  add("ice_walker", [0, 1, 2, 3].map(iceWalker), { fps: 5 });
  reg.add("enemy_ice_walker_gun", iceWalkerGun(), { group: "enemy_ground" });
  add("aa_turret", [aaBase()]);
  reg.add("enemy_aa_turret_gun", aaGun(), { group: "enemy_ground" });
  add("missile_launcher", [0, 1].map(launcher), { fps: 3 });
  add("radar_station", [0, 1, 2, 3, 4, 5, 6, 7].map(radar), { fps: 8 });
  { const b0 = base(); reg.add("enemy_military_base", blink(b0, [[43, 5], [3, 3], [44, 3]], P.R3, P.R0), { group: "enemy_ground", fps: 2 }); reg.add("enemy_military_base_dead", wreck(b0, "military_base"), { group: "wrecks" }); }
  add("armored_vehicle", [0, 1, 2, 3].map(armored), { fps: 10 });
  add("gunboat", [0, 1, 2, 3].map(gunboat), { fps: 8 });
  add("destroyer", [0, 1, 2, 3].map(destroyer), { fps: 6 });
  add("oil_tank", [oilTank()]);
  { const h0 = hangar(); reg.add("enemy_hangar", blink(h0, [[9, 27], [38, 27], [24, 2]], P.Y3, P.Y0), { group: "enemy_ground", fps: 2 }); reg.add("enemy_hangar_dead", wreck(h0, "hangar"), { group: "wrecks" }); }
  add("ice_turret", [iceBase()]);
  reg.add("enemy_ice_turret_gun", aaGun([P.B1, P.B2, P.G4, P.W], false, 15), { group: "enemy_ground" });
  add("citadel_turret", [citadelBase()]);
  reg.add("enemy_citadel_turret_gun", citadelGun(), { group: "enemy_ground" });
}

export { tank, barrel, tread, aaGun, aaBase };
