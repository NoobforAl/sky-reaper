/**
 * Player weapon fire logic. Pure functions that push projectiles into the world through FireContext.
 * Hot path: uses ONE reusable scratch spec (no per-shot allocation); World copies fields into pooled bullets.
 * Angles in degrees, -90 = straight up.
 */
import type { AirWeaponId, BulletVisual, GroundWeaponId } from "../contracts";
import type { FireContext, PlayerBulletSpawn } from "./types";

const V = (sprite: string, color: [number, number, number], radius: number, rotate = true, scale = 1): BulletVisual => ({
  sprite,
  color,
  radius,
  rotate,
  scale,
});

const VIS = {
  vulcan: V("bullet_player_vulcan", [255, 240, 130], 4, true),
  spread: V("bullet_player_spread", [120, 255, 255], 4, true),
  homing: V("bullet_player_missile", [255, 200, 90], 5, true),
  bomb: V("bullet_player_bomb", [255, 150, 60], 6, false),
  rocket: V("bullet_player_rocket", [255, 220, 120], 5, true),
  pmissile: V("bullet_player_pmissile", [255, 90, 200], 5, true),
  heavy: V("bullet_player_heavy", [255, 80, 50], 8, false),
};

/** reusable scratch spec; every field is reset by begin() */
const S: PlayerBulletSpawn = {
  x: 0,
  y: 0,
  damageClass: "air",
  damage: 1,
  speed: 100,
  angle: -90,
  visual: VIS.vulcan,
};

function begin(
  kind: string,
  vis: BulletVisual,
  cls: "air" | "ground",
  x: number,
  y: number,
  angle: number,
  speed: number,
  damage: number,
  life: number,
): PlayerBulletSpawn {
  S.x = x;
  S.y = y;
  S.damageClass = cls;
  S.damage = damage;
  S.speed = speed;
  S.angle = angle;
  S.visual = vis;
  S.life = life;
  S.motion = "linear";
  S.turnRate = 0;
  S.armDelay = 0;
  S.accel = 0;
  S.maxSpeed = 0;
  S.blastRadius = 0;
  S.blastDelay = 0;
  S.blastHitsAir = false;
  S.hitsAir = false;
  S.hitsGround = cls === "ground";
  S.pierce = 0;
  S.tx = 0;
  S.ty = 0;
  S.targetId = 0;
  S.kind = kind;
  S.hp = 0;
  S.decoyable = false;
  S.isMissile = false;
  S.ownerId = 0;
  return S;
}

// ------------------------------------------------------------------ air weapons

/** volleys per second at a given power level (before loadout / rapid multipliers) */
export function airFireRate(id: AirWeaponId, level: number): number {
  const l = clampLevel(level);
  switch (id) {
    case "vulcan":
      return [12, 13, 14, 15, 16][l - 1]!;
    case "spread":
      return [5, 5.5, 6, 6.5, 7][l - 1]!;
    case "homing":
      return [3, 2.6, 3.2, 3, 3.5][l - 1]!;
    case "laser":
      return [10, 11, 12, 13, 15][l - 1]!; // beam tick rate
  }
}

/** seconds between ground weapon uses */
export function groundCooldown(id: GroundWeaponId): number {
  switch (id) {
    case "bomb":
      return 0.45;
    case "rocket":
      return 0.55;
    case "pmissile":
      return 0.8;
    case "heavy":
      return 1.8;
  }
}

function clampLevel(l: number): number {
  return l < 1 ? 1 : l > 5 ? 5 : Math.floor(l);
}

const VULCAN_DMG = [3, 3.4, 3.6, 3.8, 4.2];
const VULCAN_X: number[][] = [[-7, 7], [-7, 7], [-10, 0, 10], [-12, -4, 4, 12], [-12, -4, 4, 12]];

const SPREAD_N = [3, 4, 5, 6, 7];
const SPREAD_ARC = [18, 26, 34, 42, 52];
const SPREAD_DMG = [3, 3.2, 3.4, 3.6, 3.8];

const HOMING_DMG = [9, 9, 10, 10, 11];

/** beam parameters per level */
export const LASER_HALF_W = [5, 7, 9, 11, 14];
export const LASER_DMG = [5, 6, 7.5, 9, 11.5];

export function laserHalfWidth(level: number): number {
  return LASER_HALF_W[clampLevel(level) - 1]!;
}
export function laserTickDamage(level: number): number {
  return LASER_DMG[clampLevel(level) - 1]!;
}

/** Fire one volley of the primary weapon. (Laser is handled per tick by the player controller.) */
export function fireAir(ctx: FireContext, id: AirWeaponId, level: number, px: number, py: number, dmgMul: number, shotN: number): void {
  const l = clampLevel(level) - 1;
  const y = py - 18;
  switch (id) {
    case "vulcan": {
      const xs = VULCAN_X[l]!;
      const dmg = VULCAN_DMG[l]! * dmgMul;
      for (let i = 0; i < xs.length; i++) {
        begin("vulcan", VIS.vulcan, "air", px + xs[i]!, y + (i % 2 === 0 ? 0 : -3), -90, 820, dmg, 1.15);
        ctx.spawnPlayerBullet(S);
      }
      if (l === 4) {
        // wing guns, angled
        begin("vulcan", VIS.vulcan, "air", px - 20, y + 6, -100, 800, dmg * 0.8, 1.0);
        ctx.spawnPlayerBullet(S);
        begin("vulcan", VIS.vulcan, "air", px + 20, y + 6, -80, 800, dmg * 0.8, 1.0);
        ctx.spawnPlayerBullet(S);
      }
      if (shotN % 2 === 0) ctx.playSfx("shot_vulcan", { volume: 0.5, pitch: 1 + (l % 3) * 0.04 });
      return;
    }
    case "spread": {
      const n = SPREAD_N[l]!;
      const arc = SPREAD_ARC[l]!;
      const dmg = SPREAD_DMG[l]! * dmgMul;
      for (let i = 0; i < n; i++) {
        const a = -90 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * arc);
        const sp = 640 + ((i % 2) * 40);
        begin("spread", VIS.spread, "air", px, y, a, sp, dmg, 0.55);
        ctx.spawnPlayerBullet(S);
      }
      ctx.playSfx("shot_spread", { volume: 0.55 });
      return;
    }
    case "homing": {
      const dmg = HOMING_DMG[l]! * dmgMul;
      // launch layouts per level: [xOffset, launchAngle]
      const count = [1, 2, 2, 3, 4][l]!;
      for (let i = 0; i < count; i++) {
        let ox: number;
        let ang: number;
        if (count === 1) {
          ox = shotN % 2 === 0 ? -10 : 10;
          ang = shotN % 2 === 0 ? -115 : -65;
        } else if (count === 2) {
          ox = i === 0 ? -10 : 10;
          ang = i === 0 ? -112 : -68;
        } else if (count === 3) {
          ox = i === 0 ? -12 : i === 1 ? 12 : 0;
          ang = i === 0 ? -120 : i === 1 ? -60 : -90;
        } else {
          ox = i % 2 === 0 ? -10 - (i > 1 ? 8 : 0) : 10 + (i > 1 ? 8 : 0);
          ang = i === 0 ? -108 : i === 1 ? -72 : i === 2 ? -132 : -48;
        }
        begin("homing", VIS.homing, "air", px + ox, y + 4, ang, 230, dmg, 2.6);
        S.motion = "homing";
        S.turnRate = 280;
        S.armDelay = 0.12;
        S.accel = 700;
        S.maxSpeed = 540;
        const tgt = ctx.pickAirTarget(px, py, i + (shotN & 1));
        S.targetId = tgt ? tgt.id : 0;
        ctx.spawnPlayerBullet(S);
      }
      ctx.playSfx("shot_missile", { volume: 0.55 });
      return;
    }
    case "laser":
      return;
  }
}

// ------------------------------------------------------------------ ground weapons

/** Fire ground ordnance. Caller has already paid the ammo cost. */
export function fireGround(ctx: FireContext, id: GroundWeaponId, px: number, py: number, dmgMul: number, shotN: number): void {
  switch (id) {
    case "bomb": {
      const ty = Math.max(70, py - 220);
      const dist = py - 10 - ty;
      begin("bomb", VIS.bomb, "ground", px, py - 10, -90, dist / 0.6, 75 * dmgMul, 1.2);
      S.motion = "lobbed";
      S.tx = px;
      S.ty = ty;
      S.blastRadius = 44;
      S.hitsGround = true;
      ctx.spawnPlayerBullet(S);
      ctx.playSfx("bomb_drop", { volume: 0.7 });
      return;
    }
    case "rocket": {
      for (let i = 0; i < 2; i++) {
        const sx = i === 0 ? -13 : 13;
        begin("rocket", VIS.rocket, "ground", px + sx, py - 8, -90 + (i === 0 ? -1.5 : 1.5), 380, 18 * dmgMul, 1.3);
        S.motion = "accel";
        S.accel = 1400;
        S.maxSpeed = 900;
        S.blastRadius = 26;
        S.hitsAir = true;
        S.hitsGround = true;
        S.blastHitsAir = true;
        ctx.spawnPlayerBullet(S);
      }
      ctx.playSfx("rocket", { volume: 0.7 });
      return;
    }
    case "pmissile": {
      const tgt = ctx.pickGroundTarget(px, py);
      const left = shotN % 2 === 0;
      begin("pmissile", VIS.pmissile, "ground", px + (left ? -12 : 12), py - 8, left ? -125 : -55, 250, 100 * dmgMul, 3.2);
      S.motion = "homing";
      S.turnRate = 200;
      S.armDelay = 0.1;
      S.accel = 520;
      S.maxSpeed = 560;
      S.blastRadius = 34;
      S.hitsGround = true;
      S.targetId = tgt ? tgt.id : 0;
      ctx.spawnPlayerBullet(S);
      ctx.playSfx("shot_missile", { volume: 0.6, pitch: 0.8 });
      return;
    }
    case "heavy": {
      const ty = Math.max(80, py - 170);
      const dist = py - 10 - ty;
      begin("heavy", VIS.heavy, "ground", px, py - 10, -90, dist / 0.85, 240 * dmgMul, 1.6);
      S.motion = "lobbed";
      S.tx = px;
      S.ty = ty;
      S.blastRadius = 90;
      S.blastDelay = 0.5;
      S.blastHitsAir = true;
      S.hitsGround = true;
      ctx.spawnPlayerBullet(S);
      ctx.playSfx("bomb_drop", { volume: 0.9, pitch: 0.7 });
      return;
    }
  }
}
