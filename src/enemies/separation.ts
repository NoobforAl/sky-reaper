/**
 * Cheap enemy separation (round3 #7: tanks drove through each other, planes of one flight stacked on top of each other).
 *
 *  - A uniform grid over the playfield (+ spawn margins) is rebuilt once per sim step from `world.enemies` into
 *    preallocated Int32Array linked lists (no allocation per frame, no O(n^2) over all enemies).
 *  - AIR units of the same layer get a soft, capped push apart. The push is stored as a persistent offset on the unit's
 *    MoveState (`ox`/`oy`), which `withOffset*` removes before and re-adds after the movement step, so movement kinds that
 *    compute absolute positions (sine, circular, hover hold, strafe sweep, formation slot) keep their authored path and
 *    only gain the small offset. The offset is capped (`AIR_MAX_OFFSET`), so scripted paths are not noticeably changed.
 *  - GROUND units never move sideways (no pushing through buildings or off roads): a moving unit that would close on a
 *    unit ahead of it in its own lane (moving slower, or parked) only advances until it keeps `GROUND_GAP`; it waits
 *    otherwise. Parked structures already overlapping a unit (authored that way) do not block it.
 *  - Exempt: bosses and boss parts (`bossId` / `data.part`), `scripted` movement, kamikaze drones once they start their
 *    dive telegraph, stationary air units, and any spawn with `opts.data.noSeparate === true` (escape hatch for levels).
 */
import { GAME_H, GAME_W, PIXEL_SCALE, type Enemy, type WorldAPI } from "../contracts";
import type { MoveState } from "./movement";

export const SEPARATION_TUNING = {
  /** master switch (QA A/B: `window.__skySeparation.enabled = false`) */
  enabled: true,
  /** grid cell (game units) */
  cell: 64,
  /** air: centre distance kept = (rA + rB), r = min(sprite w, h) * PIXEL_SCALE * airRadiusFrac */
  airRadiusFrac: 0.42,
  /** air: fraction of the overlap removed per second */
  airStiffness: 5,
  /** air: max push speed (u/s) */
  airMaxPushSpeed: 38,
  /** air: max accumulated offset from the authored path (u) */
  airMaxOffset: 46,
  /** ground: bumper gap between vehicles in a lane (u) */
  groundGap: 5,
  /** ground: lanes overlap when the lateral distance is below this fraction of the summed half-widths */
  groundLaneFrac: 0.8,
};

// QA hook (tuning object only; read by tests, never by gameplay code)
if (typeof window !== "undefined") (window as unknown as { __skySeparation?: unknown }).__skySeparation = SEPARATION_TUNING;

const CAT_NONE = 0;
const CAT_AIR = 1;
const CAT_GROUND_MOVER = 2;
const CAT_GROUND_STATIC = 3;

// ------------------------------------------------------------------------------------------ grid (preallocated)

const MARGIN_X = 192;
const MARGIN_TOP = 448;
const MARGIN_BOTTOM = 192;
let cols = 0;
let rows = 0;
let head: Int32Array = new Int32Array(0);
let next: Int32Array = new Int32Array(0);
let cat: Uint8Array = new Uint8Array(0);
let lastWorld: WorldAPI | null = null;
let lastTime = Number.NaN;
let maxAirR = 0;
let maxGroundExt = 0;

function ensureGrid(n: number): void {
  if (cols === 0) {
    const C = SEPARATION_TUNING.cell;
    cols = Math.ceil((GAME_W + MARGIN_X * 2) / C);
    rows = Math.ceil((GAME_H + MARGIN_TOP + MARGIN_BOTTOM) / C);
    head = new Int32Array(cols * rows);
  }
  if (next.length < n) {
    // grows only if the enemy pool grows (fixed at 160 today): a one-off allocation, never per frame
    const cap = Math.max(n, 160);
    next = new Int32Array(cap);
    cat = new Uint8Array(cap);
  }
}

function cellX(x: number): number {
  const c = Math.floor((x + MARGIN_X) / SEPARATION_TUNING.cell);
  return c < 0 ? 0 : c >= cols ? cols - 1 : c;
}
function cellY(y: number): number {
  const c = Math.floor((y + MARGIN_TOP) / SEPARATION_TUNING.cell);
  return c < 0 ? 0 : c >= rows ? rows - 1 : c;
}

function airR(e: Enemy): number {
  const s = e.def.size;
  return Math.min(s[0], s[1]) * PIXEL_SCALE * SEPARATION_TUNING.airRadiusFrac;
}

function classify(e: Enemy): number {
  if (!e.alive || e.bossId || e.data.part !== undefined) return CAT_NONE;
  const od = e.opts?.data;
  if (od && od.noSeparate === true) return CAT_NONE;
  const kind = e.def.movement.kind;
  if (kind === "scripted") return CAT_NONE;
  if (e.def.layer === "ground") return kind === "stationary" ? CAT_GROUND_STATIC : CAT_GROUND_MOVER;
  if (kind === "stationary") return CAT_NONE;
  if (kind === "dive") {
    const mv = e.data.mv as MoveState | undefined;
    if (mv && mv.stage >= 1) return CAT_NONE; // kamikaze telegraph / dive: never deflect it
  }
  return CAT_AIR;
}

/** Rebuild the grid once per sim step (first enemy update of the step). */
function beginStep(world: WorldAPI): void {
  if (world === lastWorld && world.time === lastTime) return;
  lastWorld = world;
  lastTime = world.time;
  const list = world.enemies;
  const n = list.length;
  ensureGrid(n);
  head.fill(-1);
  maxAirR = 0;
  maxGroundExt = 0;
  for (let i = 0; i < n; i++) {
    const e = list[i]!;
    const c = classify(e);
    cat[i] = c;
    if (c === CAT_NONE) continue;
    const k = cellY(e.y) * cols + cellX(e.x);
    next[i] = head[k]!;
    head[k] = i;
    if (c === CAT_AIR) {
      const r = airR(e);
      if (r > maxAirR) maxAirR = r;
    } else {
      const s = e.def.size;
      const ext = Math.max(s[0], s[1]) * PIXEL_SCALE * 0.5;
      if (ext > maxGroundExt) maxGroundExt = ext;
    }
  }
}

// ------------------------------------------------------------------------------------------ public API (enemies/index.ts)

/** Before `stepMovement`: start the step's grid and take the separation offset out of the position. */
export function withOffsetBegin(e: Enemy, s: MoveState, world: WorldAPI): void {
  beginStep(world);
  if (s.ox !== 0 || s.oy !== 0) {
    e.x -= s.ox;
    e.y -= s.oy;
  }
}

/** After `stepMovement`: put the offset back, then separate. `preX/preY` = position before the movement step. */
export function withOffsetEnd(e: Enemy, s: MoveState, world: WorldAPI, dt: number, preX: number, preY: number): void {
  if (s.ox !== 0 || s.oy !== 0) {
    e.x += s.ox;
    e.y += s.oy;
  }
  if (dt <= 0 || !SEPARATION_TUNING.enabled) return;
  const c = classify(e);
  if (c === CAT_AIR) separateAir(e, s, world, dt);
  else if (c === CAT_GROUND_MOVER) separateGround(e, world, dt, preX, preY);
}

function separateAir(e: Enemy, s: MoveState, world: WorldAPI, dt: number): void {
  const T = SEPARATION_TUNING;
  const list = world.enemies;
  const n = Math.min(list.length, next.length);
  const rA = airR(e);
  const reach = rA + maxAirR + 8;
  const rc = Math.min(3, Math.ceil(reach / T.cell));
  const cx = cellX(e.x);
  const cy = cellY(e.y);
  let px = 0;
  let py = 0;
  for (let gy = Math.max(0, cy - rc); gy <= Math.min(rows - 1, cy + rc); gy++) {
    for (let gx = Math.max(0, cx - rc); gx <= Math.min(cols - 1, cx + rc); gx++) {
      for (let i = head[gy * cols + gx]!; i >= 0; i = next[i]!) {
        if (i >= n || cat[i] !== CAT_AIR) continue;
        const o = list[i]!;
        if (o === e || !o.alive || o.def.layer !== e.def.layer) continue;
        const minD = rA + airR(o);
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD) continue;
        const d = Math.sqrt(d2);
        // each unit of the pair removes half of the overlap
        const ov = (minD - d) * 0.5;
        if (d > 0.001) {
          px += (dx / d) * ov;
          py += (dy / d) * ov;
        } else {
          px += e.id > o.id ? ov : -ov; // exactly stacked: split sideways, deterministic
        }
      }
    }
  }
  if (px === 0 && py === 0) return;
  // remove a fraction of the overlap per second, capped in speed and in total offset from the path
  let mx = px * Math.min(1, T.airStiffness * dt);
  let my = py * Math.min(1, T.airStiffness * dt);
  const maxStep = T.airMaxPushSpeed * dt;
  const m2 = mx * mx + my * my;
  if (m2 > maxStep * maxStep) {
    const k = maxStep / Math.sqrt(m2);
    mx *= k;
    my *= k;
  }
  let nox = s.ox + mx;
  let noy = s.oy + my;
  const o2 = nox * nox + noy * noy;
  if (o2 > T.airMaxOffset * T.airMaxOffset) {
    const k = T.airMaxOffset / Math.sqrt(o2);
    nox *= k;
    noy *= k;
  }
  e.x += nox - s.ox;
  e.y += noy - s.oy;
  s.ox = nox;
  s.oy = noy;
}

/** half extents of a ground unit's box projected on (along, across) the direction (ux, uy) */
function extAlong(e: Enemy, ux: number, uy: number): number {
  const s = e.def.size;
  return (Math.abs(ux) * s[0] + Math.abs(uy) * s[1]) * PIXEL_SCALE * 0.5;
}
function extAcross(e: Enemy, ux: number, uy: number): number {
  const s = e.def.size;
  return (Math.abs(uy) * s[0] + Math.abs(ux) * s[1]) * PIXEL_SCALE * 0.5;
}

function separateGround(e: Enemy, world: WorldAPI, dt: number, preX: number, preY: number): void {
  const T = SEPARATION_TUNING;
  const mdx = e.x - preX;
  const mdy = e.y - preY;
  const len2 = mdx * mdx + mdy * mdy;
  if (len2 < 1e-8) return;
  const len = Math.sqrt(len2);
  const ux = mdx / len;
  const uy = mdy / len;
  const vA = len / dt;
  const lonA = extAlong(e, ux, uy);
  const latA = extAcross(e, ux, uy);
  const list = world.enemies;
  const n = Math.min(list.length, next.length);
  const reach = lonA + maxGroundExt + T.groundGap + 8;
  const rc = Math.min(3, Math.ceil(reach / T.cell));
  const cx = cellX(e.x);
  const cy = cellY(e.y);
  let allowed = len;
  for (let gy = Math.max(0, cy - rc); gy <= Math.min(rows - 1, cy + rc); gy++) {
    for (let gx = Math.max(0, cx - rc); gx <= Math.min(cols - 1, cx + rc); gx++) {
      for (let i = head[gy * cols + gx]!; i >= 0; i = next[i]!) {
        if (i >= n) continue;
        const ci = cat[i]!;
        if (ci !== CAT_GROUND_MOVER && ci !== CAT_GROUND_STATIC) continue;
        const o = list[i]!;
        if (o === e || !o.alive || o.def.layer !== "ground") continue;
        const rx = o.x - e.x;
        const ry = o.y - e.y;
        const proj = rx * ux + ry * uy;
        // same lane?
        const lat = Math.abs(rx * uy - ry * ux);
        if (lat >= (latA + extAcross(o, ux, uy)) * T.groundLaneFrac) continue;
        const lonSum = lonA + extAlong(o, ux, uy) + T.groundGap;
        if (proj >= lonSum) continue;
        // only units AHEAD block; exactly side by side (spawned stacked): the later spawn waits
        if (proj < 0 || (proj < 0.5 && e.id < o.id)) continue;
        if (ci === CAT_GROUND_STATIC) {
          if (proj < lonSum * 0.5) continue; // authored on top of a structure: let it drive out
        } else {
          const vB = o.vx * ux + o.vy * uy; // o's own motion along our heading
          if (vB >= vA * 0.98) continue; // it pulls away at least as fast
        }
        const a = len - (lonSum - proj);
        if (a < allowed) allowed = a;
      }
    }
  }
  if (allowed >= len) return;
  if (allowed < 0) allowed = 0; // wait, never reverse
  const f = allowed / len;
  e.x = preX + mdx * f;
  e.y = preY + mdy * f;
  e.vx = (mdx * f) / dt;
  e.vy = (mdy * f) / dt;
}
