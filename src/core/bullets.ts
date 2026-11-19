/**
 * Bullet motion + collision passes. Hot path: no allocation, indexed loops, swap-remove from pools.
 */
import { GAME_H, GAME_W, SIM_DT } from "../contracts";
import type { World } from "./world";
import type { Bullet, EnemyRT } from "./types";

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function steer(b: Bullet, tx: number, ty: number, dt: number): void {
  const desired = Math.atan2(ty - b.y, tx - b.x) * R2D;
  let delta = desired - b.angle;
  delta = ((((delta + 180) % 360) + 360) % 360) - 180;
  const m = b.turnRate * dt;
  b.angle += delta < -m ? -m : delta > m ? m : delta;
}

function applyAccel(b: Bullet, dt: number): void {
  if (b.accel !== 0) {
    b.speed += b.accel * dt;
    if (b.speed < 0) b.speed = 0;
    if (b.maxSpeed > 0 && b.speed > b.maxSpeed) b.speed = b.maxSpeed;
  }
}

function trail(w: World, b: Bullet, dt: number): void {
  const v = b.visual;
  if (v.trailEveryMs === undefined || !v.trail) return;
  b.trailT -= dt;
  if (b.trailT <= 0) {
    b.trailT = v.trailEveryMs / 1000;
    w.spawnFxI("smoke", b.x - b.vx * 0.02, b.y - b.vy * 0.02, 0.5, false);
  }
}

// ------------------------------------------------------------------ player bullets

function stepPlayer(w: World, b: Bullet, dt: number): boolean {
  b.age += dt;
  switch (b.motion) {
    case "lobbed": {
      // lands on a point glued to the scrolling ground
      b.ty += w.scrollSpeed * dt;
      const p = b.age >= b.lobT ? 1 : b.age / b.lobT;
      b.x = b.sx + (b.tx - b.sx) * p;
      b.y = b.sy + (b.ty - b.sy) * p;
      if (p >= 1) {
        w.detonate(b);
        return false;
      }
      return true;
    }
    case "homing": {
      if (b.age >= b.armDelay && b.turnRate > 0) {
        let t: EnemyRT | null = b.targetId ? w.findEnemy(b.targetId) : null;
        if (t && (!t.alive || !t.onScreen)) t = null;
        if (!t) {
          b.retargetT -= dt;
          if (b.retargetT <= 0) {
            b.retargetT = 0.12;
            const nt = (b.dmgClass === "air" ? w.pickAirTarget(b.x, b.y, 0) : w.pickGroundTarget(b.x, b.y)) as EnemyRT | null;
            b.targetId = nt ? nt.id : 0;
            t = nt;
          }
        }
        if (t) steer(b, t.x, t.y, dt);
      }
      applyAccel(b, dt);
      w.setVel(b);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      break;
    }
    case "accel": {
      applyAccel(b, dt);
      w.setVel(b);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      break;
    }
    default:
      b.x += b.vx * dt;
      b.y += b.vy * dt;
  }
  trail(w, b, dt);
  if (b.y < -60 || b.y > GAME_H + 60 || b.x < -60 || b.x > GAME_W + 60) return false;
  if (b.age >= b.life) {
    if (b.blastRadius > 0) w.detonate(b);
    return false;
  }
  return true;
}

// ------------------------------------------------------------------ enemy bullets

function stepEnemy(w: World, b: Bullet, dt: number): boolean {
  b.age += dt;
  const p = w.pc.state;
  switch (b.motion) {
    case "homing": {
      if (b.age >= b.armDelay && b.turnRate > 0) {
        if (b.divert > 0) {
          b.divert -= dt;
          if (b.divert <= 0) {
            // decoy burned out: the seeker has lost the player for good
            b.divert = -1;
            b.turnRate = 0;
          }
          const f = w.flare;
          if (f.active) {
            steer(b, f.x, f.y, dt);
            const dx = f.x - b.x;
            const dy = f.y - b.y;
            if (dx * dx + dy * dy < 22 * 22) {
              w.spawnFxI("explosion_s", b.x, b.y, 1, false);
              w.playSfx("explode_s", { volume: 0.5 });
              return false;
            }
          }
          if (b.locked) {
            b.locked = false;
            if (w.bus.has("missileLock")) w.events.emit("missileLock", { id: b.id, active: false });
          }
        } else if (p.alive) {
          steer(b, p.x, p.y, dt);
          if (b.isMissile && !b.locked) {
            b.locked = true;
            if (w.bus.has("missileLock")) w.events.emit("missileLock", { id: b.id, active: true });
            if (w.lockSoundCd <= 0) {
              w.lockSoundCd = 0.5;
              w.playSfx("lock_on", { volume: 0.7 });
            }
          }
        }
      }
      applyAccel(b, dt);
      w.setVel(b);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      break;
    }
    case "accel": {
      applyAccel(b, dt);
      w.setVel(b);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      break;
    }
    case "sine": {
      b.bx += b.vx * dt;
      b.by += b.vy * dt;
      const off = b.sineAmp * Math.sin(b.age * b.sineFreq * 6.2831853);
      b.x = b.bx + b.nx * off;
      b.y = b.by + b.ny * off;
      break;
    }
    case "lobbed": {
      const pr = b.age >= b.lobT ? 1 : b.age / b.lobT;
      b.x = b.sx + (b.tx - b.sx) * pr;
      b.y = b.sy + (b.ty - b.sy) * pr;
      if (pr >= 1) {
        if (b.blastRadius > 0) w.detonate(b);
        return false;
      }
      return true;
    }
    default:
      b.x += b.vx * dt;
      b.y += b.vy * dt;
  }
  trail(w, b, dt);
  if (b.x < -70 || b.x > GAME_W + 70 || b.y < -90 || b.y > GAME_H + 70) return false;
  if (b.age >= b.life) {
    if (b.blastRadius > 0) w.detonate(b);
    return false;
  }
  return true;
}

export function updateBullets(w: World, dt: number): void {
  const pb = w.pBullets.items;
  for (let i = pb.length - 1; i >= 0; i--) {
    if (!stepPlayer(w, pb[i]!, dt)) w.pBullets.releaseAt(i);
  }
  // stepEnemy can detonate -> enemyBlast -> pc.hurt -> die -> clearEnemyBullets. During the pass that only marks
  // bullets `dead` (World.eBulletPass), so indices stay valid; marked bullets are skipped and swept afterwards.
  const eb = w.eBullets.items;
  w.eBulletPass++;
  try {
    for (let i = eb.length - 1; i >= 0; i--) {
      const b = eb[i]!;
      if (b.dead || !stepEnemy(w, b, dt)) w.freeEnemyBullet(i, b);
    }
  } finally {
    w.eBulletPass--;
  }
  w.sweepDeadEnemyBullets();
  // flare decoy bookkeeping happens in World.updateFx
}

// ------------------------------------------------------------------ collisions

function alreadyHit(b: Bullet, id: number): boolean {
  for (let i = 0; i < b.hitN; i++) if (b.hitIds[i] === id) return true;
  return false;
}

export function collideAll(w: World, dt: number): void {
  const en = w.enemyPool.items;
  const pb = w.pBullets.items;

  // ---- player bullets vs enemies / shootable enemy bullets
  for (let i = pb.length - 1; i >= 0; i--) {
    const b = pb[i]!;
    if (b.motion === "lobbed") continue;
    const rad = b.radius + (b.speed > 500 ? b.speed * SIM_DT * 0.35 : 0);
    const rr = rad * rad;
    let consumed = false;
    for (let j = 0; j < en.length; j++) {
      const e = en[j]!;
      if (!e.alive || !e.onScreen) continue;
      const dx = Math.max(Math.abs(b.x - e.x) - e.hw, 0);
      const dy = Math.max(Math.abs(b.y - e.y) - e.hh, 0);
      if (dx * dx + dy * dy > rr) continue;
      if (b.hitN > 0 && alreadyHit(b, e.id)) continue;
      if (w.canHurt(b.dmgClass, b.hitsAir, e)) {
        if (b.blastRadius > 0) {
          w.detonate(b);
          consumed = true;
          break;
        }
        w.hitEnemy(e, b.damage, b.dmgClass === "air" ? "air" : "ground", b.x, b.y);
        if (b.pierce > 0) {
          b.pierce--;
          if (b.hitN < b.hitIds.length) b.hitIds[b.hitN++] = e.id;
        } else {
          consumed = true;
          break;
        }
      } else {
        const hardImmune = e.invuln || e.def.destructible === false;
        if (e.def.layer === "ground" || hardImmune) w.pingImmune(e, b.dmgClass === "air" ? "air" : "ground", b.x, b.y);
        // bullets fly over ground units; air units that cannot be hurt by this class are passed silently
        const passes = e.def.layer === "ground" || (b.dmgClass === "ground" && !hardImmune);
        if (!passes) {
          consumed = true;
          break;
        }
      }
    }
    if (!consumed && w.shootables > 0 && b.dmgClass === "air" && b.blastRadius === 0) {
      const eb = w.eBullets.items;
      for (let k = eb.length - 1; k >= 0; k--) {
        const t = eb[k]!;
        if (t.hp <= 0) continue;
        const dx = t.x - b.x;
        const dy = t.y - b.y;
        const r = t.radius + b.radius;
        if (dx * dx + dy * dy > r * r) continue;
        t.hp -= b.damage;
        w.spawnFxI("hit", b.x, b.y, 1, false);
        if (t.hp <= 0) w.destroyShot(k, t);
        consumed = true;
        break;
      }
    }
    if (consumed) w.pBullets.releaseAt(i);
  }

  // ---- enemy bullets + bodies vs player
  const p = w.pc.state;
  if (!p.alive || w.god) return;
  const eb = w.eBullets.items;
  // pc.hurt / detonate can kill the player -> clearEnemyBullets: deferred while eBulletPass > 0 (see updateBullets)
  w.eBulletPass++;
  try {
    for (let i = eb.length - 1; i >= 0; i--) {
      if (p.invuln > 0 || !p.alive) break;
      const b = eb[i]!;
      if (b.dead) continue;
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const r = (b.blastRadius > 0 ? Math.max(b.radius, b.blastRadius * 0.45) : b.radius * 0.9) + p.hitRadius;
      if (dx * dx + dy * dy > r * r) continue;
      if (b.blastRadius > 0) w.detonate(b);
      else {
        w.pc.hurt(b.damage, b.isMissile ? "missile" : "bullet", w);
        w.spawnFxI("hit", b.x, b.y, 1, false);
      }
      w.freeEnemyBullet(i, b);
    }
  } finally {
    w.eBulletPass--;
  }
  w.sweepDeadEnemyBullets();
  if (p.invuln > 0 || !p.alive) return;
  for (let j = 0; j < en.length; j++) {
    const e = en[j]!;
    if (!e.alive || e.def.layer !== "air" || e.def.contactDamage <= 0 || !e.onScreen) continue;
    const dx = Math.max(Math.abs(p.x - e.x) - e.hw, 0);
    const dy = Math.max(Math.abs(p.y - e.y) - e.hh, 0);
    const r = p.hitRadius + 2;
    if (dx * dx + dy * dy > r * r) continue;
    w.pc.hurt(e.def.contactDamage * w.dmgScale, e.def.id, w);
    if (e.def.movement.kind === "dive" || (e.def.tags && e.def.tags.includes("kamikaze"))) w.killEnemy(e, false);
    if (p.invuln > 0) break;
  }
}
