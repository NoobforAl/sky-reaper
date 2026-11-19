// Aircraft skins (paint schemes): `player_<aircraft>_<skin>` (+ `_dmg`), same 24x24 x 3 frames (level / bank L / bank R)
// as the standard `player_<aircraft>` sprite, plus 12x12 `ui_skin_<skin>` swatch icons for the shop / hangar UI.
//
// How it works: the standard plane spec is rebuilt with its paint parts (wings = primary, fuselage = secondary,
// canopy) swapped to the skin's 4-tone ramps, so shading / bank lighting stay correct. A second "role map" build
// (marker colours instead of ramps) tells which pixel belongs to which paint part and tone, and the skin's pattern
// (camo, stripes, trim) is then overlaid tone-for-tone in un-banked aircraft space so it stays put across frames.
import { Img, Mask, P, shade, outline, damaged, vnoise, hashStr } from "./lib.mjs";
import { buildPlane, PLAYER_SPECS } from "./gen_air.mjs";

/** paint role of each part (index into spec.parts): P primary (wings/tail), S secondary (fuselage), C canopy, null keep */
const ROLES = {
  falcon: ["P", "P", "S", null, "C"],
  raptor: ["P", "P", "S", "S", "C"],
  bulwark: ["P", "P", null, "S", null, "C"],
};
const BANK = { falcon: [1, 0.6], raptor: [1, 0.7], bulwark: [1, 0.6] };

const R = {
  snow: [P.G2, P.G3, P.G4, P.W],
  ice: [P.B1, P.B2, P.B3, P.G4],
  sand: [P.T0, P.T1, P.T2, P.T3],
  brown: [P.R0, P.T0, P.T1, P.T2],
  pale: [P.T1, P.T2, P.T3, P.Y3],
  night: [P.K, P.G0, P.G1, P.G2],
  night2: [P.G0, P.G1, P.G2, P.G3],
  neon: [P.M0, P.M1, P.M2, P.W],
  red: [P.R0, P.R1, P.R2, P.R3],
  white: [P.G2, P.G3, P.G4, P.W],
  orange: [P.R1, P.Y0, P.Y1, P.Y2],
  black: [P.K, P.K, P.G0, P.G0],
  gold: [P.Y0, P.Y1, P.Y2, P.Y3],
  gold2: [P.Y1, P.Y2, P.Y3, P.W],
  visorGold: [P.Y0, P.Y1, P.Y3, P.W],
  visorDark: [P.K, P.B0, P.B1, P.B3],
  glass: [P.C0, P.C1, P.C2, P.W],
};

const h01 = (a, b, s) => (hashStr(`${a},${b},${s}`) % 1000) / 1000;

/**
 * Skin definitions. pattern(u, v, role, tone) -> ramp | null : u = signed distance from the centre line in un-banked
 * px (negative = left wing), v = px from the nose. Returning a ramp repaints that pixel with ramp[tone].
 */
export const SKINS_ART = {
  arctic: {
    P: R.snow, S: R.snow, C: R.glass, swatch: [R.snow, R.ice],
    // angular splinter camo: two crossed band lattices hashed into patches
    pattern(u, v) {
      const a = Math.floor((Math.abs(u) * 0.8 + v * 0.55) / 3.2), b = Math.floor((-Math.abs(u) * 0.5 + v * 0.9) / 3.6);
      return h01(a, b, 7) < 0.38 ? R.ice : null;
    },
  },
  desert: {
    P: R.sand, S: R.sand, C: R.glass, swatch: [R.sand, R.brown],
    // soft two-colour blotch camo (mirrored so the plane reads symmetric)
    pattern(u, v) {
      const n = vnoise(Math.abs(u) + 40, v, 3, 4096, 2101);
      return n > 0.64 ? R.brown : n < 0.26 ? R.pale : null;
    },
  },
  nightfall: {
    P: R.night, S: R.night2, C: R.visorGold, swatch: [R.night, R.neon],
    // stealth black with a magenta chevron across the wings and a thin spine line
    pattern(u, v, role) {
      const au = Math.abs(u);
      if (role === "P" && Math.abs(v - au * 0.62 - 12.2) < 0.6 && au > 2) return R.neon;
      if (role === "S" && au < 0.6 && v > 10 && v < 20 && v % 3 < 1.5) return R.neon;
      return null;
    },
  },
  crimson: {
    P: R.red, S: R.red, C: R.visorDark, swatch: [R.red, R.white],
    // racing red: twin white stripes down the spine + white wingtip bands
    pattern(u, v, role) {
      const au = Math.abs(u);
      if (role === "S" && au > 0.3 && au < 1.3 && v > 3) return R.white;
      if (role === "P" && au > 8.6) return R.white;
      return null;
    },
  },
  tiger: {
    P: R.orange, S: R.orange, C: R.glass, swatch: [R.orange, R.black],
    // tiger stripes: wavy black bands across the span, tapering toward the centre line
    pattern(u, v) {
      const au = Math.abs(u);
      const w = Math.sin(v * 1.05 + au * 0.75 + vnoise(au, v, 2, 4096, 2201) * 2.2);
      return w > 0.3 + (au < 1.5 ? 0.45 : 0) ? R.black : null;
    },
  },
  gold: {
    P: R.gold, S: R.gold2, C: R.visorDark, swatch: [R.gold, R.black],
    // parade gold: black leading-edge trim + panel line down the spine
    pattern(u, v, role, tone, edgeUp) {
      if (role === "P" && edgeUp) return R.black;
      if (role === "S" && Math.abs(u) < 0.5 && v > 9 && v < 21) return [P.Y0, P.Y0, P.Y1, P.Y1];
      return null;
    },
    sparkle: true,
  },
};
export const SKIN_KEYS = Object.keys(SKINS_ART);

const MARK = { P: 10, S: 20, C: 30 };
const markerRamp = (role) => [0, 1, 2, 3].map((i) => [MARK[role] + i, 77, 133, 255]);

function swapSpec(spec, roles, rampFor) {
  return { ...spec, parts: spec.parts.map((p, i) => (roles[i] ? { ...p, ramp: rampFor(roles[i], p) } : p)) };
}

function skinnedFrame(id, skin, bank) {
  const spec = PLAYER_SPECS[id];
  const roles = ROLES[id];
  const img = buildPlane(swapSpec(spec, roles, (r) => skin[r]), { bank });
  // role map: same build with marker ramps (details/outline drawn on top in their normal colours)
  const map = buildPlane(swapSpec(spec, roles, (r) => markerRamp(r)), { bank });
  const shiftK = BANK[id][1];
  const sq = bank === 0 ? 1 : spec.bankSquash ?? 0.8;
  const centre = spec.W / 2 + bank * shiftK;
  const roleAt = (x, y) => {
    const c = map.get(x, y);
    if (!c || c[1] !== 77 || c[2] !== 133) return null;
    const role = c[0] >= 30 ? "C" : c[0] >= 20 ? "S" : c[0] >= 10 ? "P" : null;
    return role ? { role, tone: c[0] % 10 } : null;
  };
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const r = roleAt(x, y);
      if (!r || r.role === "C") continue;
      const u = (x + 0.5 - centre) / sq;
      const edgeUp = (!roleAt(x, y - 1) || !roleAt(x, y - 2)) && !!roleAt(x, y + 1);
      const ramp = skin.pattern(u, y + 0.5, r.role, r.tone, edgeUp);
      if (ramp) img.set(x, y, ramp[r.tone]);
    }
  if (skin.sparkle) {
    // specular glints on the lit (upper-left) highlights
    for (let y = 0; y < img.h; y++)
      for (let x = 0; x < img.w; x++) {
        const r = roleAt(x, y);
        if (r && r.role !== "C" && r.tone === 3 && (x * 5 + y * 3) % 11 === 0) img.set(x, y, P.W);
      }
  }
  return img;
}

function swatch(skin) {
  // 12x12 rounded badge: primary paint, pattern, a white highlight bevel
  const S = 12;
  const im = new Img(S, S);
  const m = new Mask(S, S).poly([[2, 0.5], [10, 0.5], [11.5, 2], [11.5, 10], [10, 11.5], [2, 11.5], [0.5, 10], [0.5, 2]]);
  const [a, b] = skin.swatch;
  shade(im, m, a, "bevel");
  for (let y = 1; y < S - 1; y++)
    for (let x = 1; x < S - 1; x++) {
      if (!m.has(x, y) || !m.has(x + 1, y + 1) || !m.has(x - 1, y - 1)) continue;
      // sample the skin pattern over a stretched plane-like space so the badge shows the scheme
      const u = (x - 5.5) * 1.6, v = 4 + y * 1.4;
      const ramp = skin.pattern(u, v, x < 4 || x > 7 ? "P" : "S", 1, false);
      if (ramp && ramp !== a) im.set(x, y, ((x + y) & 3) === 0 ? ramp[2] : ramp[1]);
    }
  im.set(2, 2, P.W);
  im.set(3, 2, b[3]);
  outline(im);
  return im;
}

export function genSkins(reg) {
  for (const id of Object.keys(PLAYER_SPECS)) {
    for (const k of SKIN_KEYS) {
      const fr = [0, -1, 1].map((b) => skinnedFrame(id, SKINS_ART[k], b));
      reg.add(`player_${id}_${k}`, fr, { group: "skins", fps: 0, loop: false });
      reg.add(`player_${id}_${k}_dmg`, fr.map((f) => damaged(f, `dmg_${id}_${k}`)), { group: "skins", fps: 0, loop: false });
    }
  }
  // standard swatch uses each aircraft's stock blue so the UI can show all 7 options uniformly
  reg.add("ui_skin_standard", swatch({ swatch: [[P.B0, P.B1, P.B2, P.B3], [P.B1, P.B2, P.B3, P.W]], pattern: () => null }), { group: "ui" });
  for (const k of SKIN_KEYS) reg.add(`ui_skin_${k}`, swatch(SKINS_ART[k]), { group: "ui" });
}
