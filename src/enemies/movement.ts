/**
 * Movement kinds. Each applies the unit's OWN motion to e.x/e.y (and mirrors it into e.vx/e.vy as
 * informational velocity). For anchored ground units the Engine adds scroll on top.
 *
 * Coordinates: +y down, angles in degrees with 0 = right, 90 = down.
 */
import { GAME_H, GAME_W, type Enemy, type MovementDef, type WorldAPI } from "../contracts";

const DEG = Math.PI / 180;

export interface MoveState {
  init: boolean;
  t: number;
  x0: number;
  y0: number;
  stage: number;
  stageT: number;
  heading: number;
  cx: number;
  cy: number;
  ang: number;
  lockX: number;
  lockY: number;
  lvx: number;
  lvy: number;
  /** horizontal direction for strafe/diagonal */
  sx: number;
  /** cached formation leader (re-validated by id + alive every step; pool objects are recycled) */
  leader: Enemy | null;
}

/** O(1) per step after the first lookup (CODE_REVIEW #17: was a find() per follower per step). */
function formationLeader(s: MoveState, leaderId: number, world: WorldAPI): Enemy | undefined {
  const c = s.leader;
  if (c && c.id === leaderId && c.alive) return c;
  s.leader = null;
  const list = world.enemies;
  for (let i = 0; i < list.length; i++) {
    const o = list[i]!;
    if (o.id === leaderId && o.alive) {
      s.leader = o;
      return o;
    }
  }
  return undefined;
}

export function moveState(e: Enemy): MoveState {
  let s = e.data.mv as MoveState | undefined;
  if (!s) {
    s = { init: false, t: 0, x0: e.x, y0: e.y, stage: 0, stageT: 0, heading: 90, cx: e.x, cy: e.y, ang: 0, lockX: 0, lockY: 0, lvx: 0, lvy: 0, sx: 1, leader: null };
    e.data.mv = s;
  }
  return s;
}

const dirOf = (e: Enemy): 1 | -1 => (e.opts?.dir === -1 ? -1 : 1);
const phaseOf = (e: Enemy) => e.opts?.phase ?? 0;

/** wrap an angle into [-180, 180) */
export function normAngle(a: number): number {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

/** step `cur` toward `target` by at most `maxStep` deg along the SHORT way; result normalised to [-180, 180) */
export function turnToward(cur: number, target: number, maxStep: number): number {
  let d = normAngle(target - cur);
  if (d > maxStep) d = maxStep;
  if (d < -maxStep) d = -maxStep;
  return normAngle(cur + d);
}

function apply(e: Enemy, nx: number, ny: number, dt: number) {
  if (dt > 0) {
    e.vx = (nx - e.x) / dt;
    e.vy = (ny - e.y) / dt;
  }
  e.x = nx;
  e.y = ny;
}

function headingOfVel(e: Enemy, fallback: number): number {
  if (Math.abs(e.vx) + Math.abs(e.vy) < 1) return fallback;
  return Math.atan2(e.vy, e.vx) / DEG;
}

function playerPos(world: WorldAPI, e: Enemy): [number, number] {
  const p = world.player;
  if (!p || !p.alive) return [e.x, GAME_H + 200];
  return [p.x, p.y];
}

/** Apply one step of movement. Returns nothing; mutates e. */
export function stepMovement(e: Enemy, m: MovementDef, dt: number, world: WorldAPI): void {
  const s = moveState(e);
  const dir = dirOf(e);
  if (!s.init) {
    s.init = true;
    s.x0 = e.x;
    s.y0 = e.y;
    s.cx = e.x;
    s.cy = e.y;
    s.sx = dir;
    s.heading = m.angle ?? 90;
    s.ang = phaseOf(e) * 360;
  }
  s.t += dt;
  s.stageT += dt;
  const sp = m.speed;
  const ground = e.def.layer === "ground";

  switch (m.kind) {
    case "straight": {
      const a = m.angle ?? 90;
      const ax = dir === -1 ? 180 - a : a;
      apply(e, e.x + Math.cos(ax * DEG) * sp * dt, e.y + Math.sin(ax * DEG) * sp * dt, dt);
      if (!ground) e.facing = 90;
      break;
    }
    case "sine": {
      const amp = m.amp ?? 50;
      const f = m.freq ?? 0.5;
      const nx = s.x0 + Math.sin((s.t * f + phaseOf(e)) * Math.PI * 2) * amp * dir;
      apply(e, nx, e.y + sp * dt, dt);
      if (!ground) e.facing = 90;
      break;
    }
    case "diagonal": {
      // heading mirrored by dir; bounces off side walls
      if (s.stage === 0) {
        const a = m.angle ?? 60;
        s.heading = dir === -1 ? 180 - a : a;
        s.stage = 1;
      }
      let vx = Math.cos(s.heading * DEG) * sp;
      const vy = Math.sin(s.heading * DEG) * sp;
      let nx = e.x + vx * dt;
      const margin = Math.max(12, (e.def.size[0] || 16));
      if ((nx < margin && vx < 0) || (nx > GAME_W - margin && vx > 0)) {
        s.heading = 180 - s.heading;
        vx = -vx;
        nx = e.x + vx * dt;
      }
      apply(e, nx, e.y + vy * dt, dt);
      if (!ground) e.facing = 90;
      else e.facing = s.heading;
      break;
    }
    case "circular": {
      const r = m.radius ?? 60;
      const w = (m.freq ?? 0.35) * 360 * dir;
      s.cy += sp * dt;
      s.ang += w * dt;
      // start on the circle so there is no jump: centre offset from spawn
      if (s.stage === 0) {
        s.cx = e.x - Math.cos(s.ang * DEG) * r;
        s.cy = e.y - Math.sin(s.ang * DEG) * r;
        s.stage = 1;
      }
      apply(e, s.cx + Math.cos(s.ang * DEG) * r, s.cy + Math.sin(s.ang * DEG) * r, dt);
      if (!ground) e.facing = 90;
      break;
    }
    case "follow": {
      // limited-turn pursuit; gives up steering after 5 s (keeps flying) so it eventually leaves
      const [px, py] = playerPos(world, e);
      if (s.t < 5) {
        const want = Math.atan2(py - e.y, px - e.x) / DEG;
        s.heading = turnToward(s.heading, want, (m.turnRate ?? 60) * dt);
      }
      apply(e, e.x + Math.cos(s.heading * DEG) * sp * dt, e.y + Math.sin(s.heading * DEG) * sp * dt, dt);
      e.facing = s.heading;
      break;
    }
    case "formation": {
      const f = e.opts?.formation;
      const leader = f && s.stage === 0 ? formationLeader(s, f.leaderId, world) : undefined;
      if (f && leader && leader !== e && s.stage === 0) {
        apply(e, leader.x + f.dx, leader.y + f.dy, dt);
        s.lvx = e.vx;
        s.lvy = e.vy;
        e.facing = leader.facing;
      } else {
        // lone survivor: keep momentum briefly, then peel off downward with a gentle weave
        if (s.stage === 0) {
          s.stage = 1;
          s.stageT = 0;
          s.x0 = e.x;
          if (Math.abs(s.lvx) + Math.abs(s.lvy) < 1) s.lvy = sp;
        }
        const k = Math.min(1, s.stageT / 0.8);
        const tvx = Math.sin(s.stageT * 2.4) * 40 * dir;
        const tvy = Math.max(sp, 60);
        const vx = s.lvx * (1 - k) + tvx * k;
        const vy = s.lvy * (1 - k) + tvy * k;
        apply(e, e.x + vx * dt, e.y + vy * dt, dt);
        e.facing = 90;
      }
      break;
    }
    case "strafe": {
      const holdY = m.holdY ?? 170;
      const holdTime = m.holdTime ?? 3.5;
      if (s.stage === 0) {
        // enter with ease-out
        const ny = e.y + Math.max(30, Math.min(sp, (holdY - e.y) * 2.5)) * dt;
        apply(e, e.x, Math.min(holdY, ny), dt);
        if (e.y >= holdY - 0.5) {
          s.stage = 1;
          s.stageT = 0;
        }
      } else if (s.stage === 1) {
        const margin = 40;
        let nx = e.x + s.sx * sp * 0.9 * dt;
        if (nx < margin) {
          s.sx = 1;
          nx = margin;
        } else if (nx > GAME_W - margin) {
          s.sx = -1;
          nx = GAME_W - margin;
        }
        apply(e, nx, holdY + Math.sin(s.stageT * 2) * 6, dt);
        if (s.stageT >= holdTime) {
          s.stage = 2;
          s.stageT = 0;
        }
      } else {
        // leave: accelerate sideways & up-ish off-screen
        const a = Math.min(1, s.stageT);
        apply(e, e.x + s.sx * sp * (1 + a) * dt, e.y - sp * 0.5 * a * dt, dt);
      }
      e.facing = 90;
      break;
    }
    case "stationary": {
      if (dt > 0) {
        e.vx = 0;
        e.vy = 0;
      }
      if (!ground && !e.def.rotatesToPlayer) e.facing = 90;
      break;
    }
    case "dive": {
      const holdY = m.holdY ?? 170;
      if (s.stage === 0) {
        // slow approach, weaving slightly
        const nx = e.x + Math.sin(s.t * 3 + phaseOf(e) * 6) * 30 * dt;
        apply(e, nx, e.y + sp * 0.6 * dt, dt);
        e.facing = 90;
        if ((e.y >= holdY || s.t > 2.6) && e.y > 10) {
          s.stage = 1;
          s.stageT = 0;
          try {
            world.spawnFx("ring", e.x, e.y, { scale: 0.7 });
            world.playSfx("lock_on", { volume: 0.35 });
          } catch {
            /* ignore */
          }
        }
      } else if (s.stage === 1) {
        // telegraph: hover & shake, nose turns to the player (>= 0.6 s)
        const [px, py] = playerPos(world, e);
        s.heading = Math.atan2(py - e.y, px - e.x) / DEG;
        e.facing = s.heading;
        apply(e, e.x + Math.sin(s.stageT * 60) * 0.6, e.y, dt);
        if (s.stageT >= 0.6) {
          s.stage = 2;
          s.stageT = 0;
          s.lockX = px;
          s.lockY = py;
        }
      } else {
        const fast = Math.min(380, sp * 3.4);
        if (s.stageT < 0.9) {
          const [px, py] = playerPos(world, e);
          const want = Math.atan2(py - e.y, px - e.x) / DEG;
          s.heading = turnToward(s.heading, want, (m.turnRate ?? 45) * dt);
        }
        const v = Math.min(fast, fast * (0.4 + s.stageT * 2));
        apply(e, e.x + Math.cos(s.heading * DEG) * v * dt, e.y + Math.sin(s.heading * DEG) * v * dt, dt);
        e.facing = s.heading;
      }
      break;
    }
    case "hover": {
      const holdY = m.holdY ?? 180;
      const holdTime = m.holdTime ?? 6;
      if (s.stage === 0) {
        const ny = e.y + Math.max(25, Math.min(sp, (holdY - e.y) * 2)) * dt;
        apply(e, e.x, Math.min(holdY, ny), dt);
        if (e.y >= holdY - 0.5) {
          s.stage = 1;
          s.stageT = 0;
          s.x0 = e.x;
        }
      } else if (s.stage === 1) {
        // lazy drift toward the player's column, bounded
        const [px] = playerPos(world, e);
        const drift = Math.max(-1, Math.min(1, (px - e.x) / 120)) * sp * 0.35;
        const nx = Math.max(30, Math.min(GAME_W - 30, e.x + drift * dt));
        apply(e, nx, holdY + Math.sin(s.stageT * 1.6) * 8, dt);
        if (s.stageT >= holdTime) {
          s.stage = 2;
          s.stageT = 0;
        }
      } else {
        const a = Math.min(1, s.stageT / 1.2);
        apply(e, e.x, e.y + sp * (0.3 + a) * dt, dt);
      }
      e.facing = 90;
      break;
    }
    case "scripted":
    default:
      break;
  }

  if (e.def.rotatesToPlayer) {
    const p = world.player;
    if (p && p.alive) {
      const want = Math.atan2(p.y - e.y, p.x - e.x) / DEG;
      e.facing = turnToward(e.facing ?? 90, want, 140 * dt);
    }
  } else if (ground && m.kind !== "diagonal") {
    e.facing = headingOfVel(e, e.facing ?? 90);
  }
}
