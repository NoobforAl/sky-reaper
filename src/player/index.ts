/**
 * Player controller (Engine agent): movement, weapons, flares, damage, death / respawn, pickups.
 * The World owns one PlayerController; `controller.state` is the PlayerState exposed through WorldAPI.player.
 * All tuning constants are exported in PLAYER_TUNING.
 *
 * Ground ordnance fires ONCE PER PRESS on every input (keyboard, gamepad, touch icon): `input.bombPressed` only,
 * holding the key/button never repeats. Ordnance is scarce (5-7 + slow regen), and hold-to-repeat emptied the rack
 * by accident (round-3 feedback, worst on touch where a resting finger counts as "held"). A press made while the
 * ordnance cooldown is still running is buffered for `bombBufferSec`, so quick double-taps are not swallowed.
 */
import { GAME_H, GAME_W, X_SCALE, type AirWeaponId, type GroundWeaponId, type InputState, type PickupKind, type PlayerState, type RunStats } from "../contracts";
import {
  airFireRate,
  fireAir,
  fireGround,
  getWeapon,
  groundCooldown,
  laserHalfWidth,
  laserTickDamage,
  type FireContext,
  type Loadout,
} from "../weapons";

export const PLAYER_TUNING = {
  /** velocity change per second while input is held */
  accel: 3400,
  /** velocity change per second when no input */
  decel: 4600,
  /** touch drag: proportional gain (1/s) toward dragTarget and speed cap multiplier */
  dragGain: 20,
  dragSpeedMul: 2.6,
  /**
   * round 6 item 14: wind drift. The World eases `wind` (setWind scale) over ~0.3 s; the drift velocity is
   * clamp(wind / windFull, -1, 1) * windPushFrac * maxSpeed (horizontal, incl. the wide-field H_SPEED_MUL), added on
   * top of the steering velocity. At full gust the player still counter-steers at 30 % of max speed against it.
   * (Was: wind integrated as acceleration with 1.2/s damping, i.e. terminal drift ax/1.2 = ~15 u/s, about 5 % of speed.)
   */
  windFull: 60,
  windPushFrac: 0.7,
  marginX: 18,
  marginTop: 70,
  marginBottom: 34,
  /** i-frames after a hit that reached the hull (QA #1: 1.2 -> 0.9; BALANCE_SPEC P1: 0.7) */
  hitIframes: 0.7,
  /** i-frames after a hit fully absorbed by the shield (0.7 -> 0.5; BALANCE_SPEC P1: 0.35) */
  shieldOnlyIframes: 0.35,
  flareIframes: 0.4,
  flareRadius: 120,
  respawnDelay: 1.5,
  respawnIframes: 3,
  respawnBombsMin: 2,
  /** one ordnance back every N s while below max (was 25; ordnance-limited objectives, QA #5) */
  bombRegenSec: 18,
  /** a bomb press during the ordnance cooldown is remembered this long */
  bombBufferSec: 0.3,
  rapidMul: 1.4,
  overdriveMul: 2,
  pickupRapid: 10,
  pickupOverdrive: 10,
  pickupMagnet: 12,
  /** BALANCE_SPEC P3 (was 0.35) */
  repairFrac: 0.3,
  /** horizontal speed/accel multiplier on wide (desktop) playfields: clamp(sqrt(X_SCALE), 1, hSpeedMax) */
  hSpeedMax: 1.6,
} as const;

/** signed wind drift as a fraction of the player's max horizontal speed (|result| <= windPushFrac) */
export function windPushFrac(wind: number): number {
  const n = wind / PLAYER_TUNING.windFull;
  return (n > 1 ? 1 : n < -1 ? -1 : n) * PLAYER_TUNING.windPushFrac;
}

/** horizontal speed multiplier for the live playfield width (1 on the 480 portrait field) */
export const H_SPEED_MUL = Math.max(1, Math.min(PLAYER_TUNING.hSpeedMax, Math.sqrt(X_SCALE)));

export interface PlayerHost extends FireContext {
  readonly autoFire: boolean;
  readonly wind: number;
  readonly god: boolean;
  readonly mutStats: RunStats;
  /** hook: player took real damage (reset combo etc.) */
  onPlayerHit(): void;
}

export class PlayerController {
  readonly state: PlayerState;
  loadout: Loadout;
  airCd = 0;
  groundCd = 0;
  shotN = 0;
  groundN = 0;
  beamActive = false;
  beamHalfW = 0;
  private beamTickCd = 0;
  private beamSfxCd = 0;
  private shieldT = 0;
  private deadT = 0;
  private wv = 0;
  private bombRegenT = 0;
  private denyCd = 0;
  private bombBuffer = 0;
  /** enemy id the seeker would lock right now (0 none) */
  lockTargetId = 0;
  /** seconds since the player died (render explosion etc.) */
  get respawning(): boolean {
    return !this.state.alive && this.state.lives > 0;
  }

  constructor(loadout: Loadout, lives = 3) {
    this.loadout = loadout;
    this.state = {
      x: GAME_W / 2,
      y: GAME_H - 150,
      vx: 0,
      vy: 0,
      hp: loadout.maxHp,
      maxHp: loadout.maxHp,
      shield: loadout.maxShield,
      maxShield: loadout.maxShield,
      bombs: loadout.startBombs,
      maxBombs: loadout.maxBombs,
      power: 1,
      airWeapon: loadout.airWeapons[0] ?? "vulcan",
      groundWeapon: loadout.groundWeapons[0] ?? "bomb",
      aircraft: loadout.aircraft.id,
      skin: loadout.skin ?? "standard",
      invuln: 1.5,
      flareCd: 0,
      rapid: 0,
      overdrive: 0,
      magnet: 0,
      alive: true,
      lives,
      hitRadius: loadout.hitRadius,
      bank: 0,
    };
  }

  /** is the chapter lost (no lives and dead)? */
  get defeated(): boolean {
    return !this.state.alive && this.state.lives <= 0;
  }

  update(dt: number, input: InputState, w: PlayerHost): void {
    const p = this.state;
    const T = PLAYER_TUNING;
    if (p.rapid > 0) p.rapid = Math.max(0, p.rapid - dt);
    if (p.overdrive > 0) p.overdrive = Math.max(0, p.overdrive - dt);
    if (p.magnet > 0) p.magnet = Math.max(0, p.magnet - dt);
    if (p.flareCd > 0) p.flareCd = Math.max(0, p.flareCd - dt);
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (this.denyCd > 0) this.denyCd -= dt;

    if (!p.alive) {
      this.beamActive = false;
      this.lockTargetId = 0;
      if (p.lives > 0) {
        this.deadT -= dt;
        if (this.deadT <= 0) this.respawn(w);
      }
      return;
    }

    // ------------------------------------------------------------ movement
    const maxV = this.loadout.speed;
    if (input.dragTarget) {
      const dx = input.dragTarget.x - p.x;
      const dy = input.dragTarget.y - p.y;
      let dvx = dx * T.dragGain;
      let dvy = dy * T.dragGain;
      const cap = maxV * H_SPEED_MUL * T.dragSpeedMul;
      const m = Math.hypot(dvx, dvy);
      if (m > cap) {
        dvx *= cap / m;
        dvy *= cap / m;
      }
      const k = Math.min(1, dt * 30);
      p.vx += (dvx - p.vx) * k;
      p.vy += (dvy - p.vy) * k;
    } else {
      let mx = input.moveX;
      let my = input.moveY;
      const len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      p.vx = approach(p.vx, mx * maxV * H_SPEED_MUL, (mx !== 0 ? T.accel : T.decel) * H_SPEED_MUL * dt);
      p.vy = approach(p.vy, my * maxV, (my !== 0 ? T.accel : T.decel) * dt);
    }
    // wind: drift velocity from the (already eased) world wind; see PLAYER_TUNING.windFull
    this.wv = windPushFrac(w.wind) * maxV * H_SPEED_MUL;
    p.x += (p.vx + this.wv) * dt;
    p.y += p.vy * dt;
    if (p.x < T.marginX) {
      p.x = T.marginX;
      if (p.vx < 0) p.vx = 0;
    } else if (p.x > GAME_W - T.marginX) {
      p.x = GAME_W - T.marginX;
      if (p.vx > 0) p.vx = 0;
    }
    if (p.y < T.marginTop) {
      p.y = T.marginTop;
      if (p.vy < 0) p.vy = 0;
    } else if (p.y > GAME_H - T.marginBottom) {
      p.y = GAME_H - T.marginBottom;
      if (p.vy > 0) p.vy = 0;
    }
    const tb = Math.max(-1, Math.min(1, p.vx / (maxV * H_SPEED_MUL)));
    p.bank += (tb - p.bank) * Math.min(1, dt * 14);

    // ------------------------------------------------------------ shield regen
    if (this.shieldT > 0) this.shieldT -= dt;
    else if (p.shield < p.maxShield) p.shield = Math.min(p.maxShield, p.shield + this.loadout.shieldRegen * dt);

    // ------------------------------------------------------------ weapon switching
    if (input.weaponNext) this.cycleAir(1, w);
    if (input.weaponPrev) this.cycleAir(-1, w);
    if (input.groundNext) this.cycleGround(w);

    // ------------------------------------------------------------ primary fire
    const firing = input.fire || w.autoFire;
    const rateMul = this.loadout.fireRateMult * (p.rapid > 0 ? T.rapidMul : 1);
    const dmgMul = this.loadout.damageMult * (p.overdrive > 0 ? T.overdriveMul : 1);
    if (this.airCd > 0) this.airCd -= dt;
    if (firing) {
      if (p.airWeapon === "laser") {
        this.beamActive = true;
        this.beamHalfW = laserHalfWidth(p.power);
        this.beamTickCd -= dt;
        const rate = airFireRate("laser", p.power) * rateMul;
        let guard = 3;
        while (this.beamTickCd <= 0 && guard-- > 0) {
          this.beamTickCd += 1 / rate;
          w.beamTick(p.x, this.beamHalfW, p.y - 8, laserTickDamage(p.power) * dmgMul);
        }
        this.beamSfxCd -= dt;
        if (this.beamSfxCd <= 0) {
          this.beamSfxCd = 0.18;
          w.playSfx("shot_laser", { volume: 0.4 });
        }
      } else {
        this.beamActive = false;
        if (this.airCd <= 0) {
          fireAir(w, p.airWeapon, p.power, p.x, p.y, dmgMul, this.shotN++);
          this.airCd += 1 / (airFireRate(p.airWeapon, p.power) * rateMul);
          if (this.airCd < -dt) this.airCd = 0;
        }
      }
    } else {
      this.beamActive = false;
      this.beamTickCd = 0;
      if (this.airCd < 0) this.airCd = 0;
    }

    // ------------------------------------------------------------ ground ordnance
    if (this.groundCd > 0) this.groundCd -= dt;
    if (p.bombs < p.maxBombs) {
      this.bombRegenT += dt;
      if (this.bombRegenT >= T.bombRegenSec) {
        this.bombRegenT = 0;
        p.bombs = Math.min(p.maxBombs, p.bombs + 1);
      }
    } else this.bombRegenT = 0;
    // once per press (edge), never on hold; see the header comment
    if (input.bombPressed) this.bombBuffer = T.bombBufferSec;
    else if (this.bombBuffer > 0) this.bombBuffer -= dt;
    if (this.bombBuffer > 0 && this.groundCd <= 0) {
      this.bombBuffer = 0;
      const wd = getWeapon(p.groundWeapon);
      const cost = wd.ammoCost ?? 1;
      if (p.bombs >= cost) {
        p.bombs -= cost;
        fireGround(w, p.groundWeapon, p.x, p.y, dmgMul, this.groundN++);
        this.groundCd = groundCooldown(p.groundWeapon);
        w.mutStats.bombsUsed += cost;
        w.events.emit("bombUsed", {});
      } else if (this.denyCd <= 0) {
        this.denyCd = 0.4;
        w.playSfx("ui_deny", { volume: 0.5 });
      }
    }
    // seeker lock preview
    if (p.groundWeapon === "pmissile") {
      const t = w.pickGroundTarget(p.x, p.y);
      this.lockTargetId = t ? t.id : 0;
    } else this.lockTargetId = 0;

    // ------------------------------------------------------------ flares
    if (input.specialPressed && p.flareCd <= 0) {
      p.flareCd = this.loadout.flareCooldown;
      p.invuln = Math.max(p.invuln, T.flareIframes);
      w.mutStats.flaresUsed++;
      w.deployFlare(p.x, p.y, T.flareRadius);
      w.events.emit("flareUsed", {});
    }
  }

  private cycleAir(dir: number, w: PlayerHost): void {
    const list = this.loadout.airWeapons;
    if (list.length < 2) return;
    const i = list.indexOf(this.state.airWeapon);
    this.state.airWeapon = list[(i + dir + list.length) % list.length] as AirWeaponId;
    this.airCd = Math.max(this.airCd, 0.1);
    this.beamTickCd = 0;
    w.playSfx("ui_move", { volume: 0.6 });
    w.events.emit("weaponChanged", { air: this.state.airWeapon, ground: this.state.groundWeapon });
  }

  private cycleGround(w: PlayerHost): void {
    const list = this.loadout.groundWeapons;
    if (list.length < 2) return;
    const i = list.indexOf(this.state.groundWeapon);
    this.state.groundWeapon = list[(i + 1) % list.length] as GroundWeaponId;
    this.groundCd = Math.max(this.groundCd, 0.1);
    w.playSfx("ui_move", { volume: 0.6, pitch: 0.85 });
    w.events.emit("weaponChanged", { air: this.state.airWeapon, ground: this.state.groundWeapon });
  }

  /** Apply damage through invuln / shield / hull. Returns true when damage actually landed. */
  hurt(amount: number, source: string, w: PlayerHost): boolean {
    const p = this.state;
    if (!p.alive || p.invuln > 0 || w.god || amount <= 0) return false;
    const T = PLAYER_TUNING;
    w.mutStats.damageTaken += amount;
    this.shieldT = this.loadout.shieldDelay;
    let rest = amount;
    if (p.shield > 0) {
      const ab = Math.min(p.shield, rest);
      p.shield -= ab;
      rest -= ab;
      w.playSfx("shield_hit", { volume: 0.7 });
      w.spawnFx("ring", p.x, p.y, { scale: 0.8 });
    }
    if (rest > 0) {
      p.hp -= rest;
      w.playSfx("player_hit");
      w.shake(6, 220);
      w.flash([255, 40, 40], 160);
      p.invuln = T.hitIframes;
    } else {
      p.invuln = T.shieldOnlyIframes;
      w.shake(2.5, 120);
    }
    w.events.emit("playerHit", { damage: amount, source });
    w.onPlayerHit();
    if (p.hp <= 0) {
      p.hp = 0;
      this.die(w);
    }
    return true;
  }

  die(w: PlayerHost): void {
    const p = this.state;
    if (!p.alive) return;
    p.alive = false;
    p.lives = Math.max(0, p.lives - 1);
    p.power = Math.max(1, p.power - 1);
    p.vx = p.vy = 0;
    this.beamActive = false;
    this.deadT = PLAYER_TUNING.respawnDelay;
    w.mutStats.deaths++;
    w.spawnFx("explosion_l", p.x, p.y, { scale: 0.9 });
    w.spawnFx("explosion_m", p.x - 14, p.y + 8, { delay: 0.12 });
    w.spawnFx("explosion_m", p.x + 14, p.y - 6, { delay: 0.2 });
    w.playSfx("player_die");
    w.shake(14, 500);
    w.flash([255, 255, 255], 220);
    w.clearEnemyBullets(p.x, p.y, 70);
    w.events.emit("playerDied", { lives: p.lives });
  }

  respawn(w: PlayerHost): void {
    const p = this.state;
    p.alive = true;
    p.x = GAME_W / 2;
    p.y = GAME_H - 150;
    p.vx = p.vy = 0;
    p.hp = p.maxHp;
    p.shield = p.maxShield;
    p.invuln = PLAYER_TUNING.respawnIframes;
    p.bombs = Math.max(p.bombs, Math.min(p.maxBombs, PLAYER_TUNING.respawnBombsMin));
    p.rapid = p.overdrive = p.magnet = 0;
    this.airCd = this.groundCd = 0;
    this.bombBuffer = 0;
    this.shieldT = 0;
    w.clearEnemyBullets(p.x, p.y, 150);
    w.events.emit("playerRespawned", {});
  }

  collect(kind: PickupKind, w: PlayerHost): void {
    const p = this.state;
    const T = PLAYER_TUNING;
    const st: RunStats = w.mutStats;
    switch (kind) {
      case "coin":
        st.coins++;
        st.score += 25;
        w.playSfx("pickup_coin", { volume: 0.6, pitch: 1 + (st.coins % 5) * 0.03 });
        break;
      case "power":
        if (p.power < 5) {
          p.power++;
          w.playSfx("pickup_power");
          w.spawnFx("ring", p.x, p.y, { scale: 1.1 });
        } else {
          st.score += 500;
          w.playSfx("pickup_power", { pitch: 1.3 });
        }
        break;
      case "bomb":
        if (p.bombs < p.maxBombs) p.bombs++;
        else st.score += 200;
        w.playSfx("pickup_misc");
        break;
      case "repair":
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * T.repairFrac);
        w.playSfx("pickup_misc");
        w.spawnFx("ring", p.x, p.y, { scale: 0.9 });
        break;
      case "shield":
        p.shield = p.maxShield;
        this.shieldT = 0;
        w.playSfx("shield_up");
        w.spawnFx("ring", p.x, p.y, { scale: 1.2 });
        break;
      case "rapid":
        p.rapid = T.pickupRapid;
        w.playSfx("pickup_misc", { pitch: 1.2 });
        break;
      case "overdrive":
        p.overdrive = T.pickupOverdrive;
        w.playSfx("pickup_misc", { pitch: 0.9 });
        break;
      case "magnet":
        p.magnet = T.pickupMagnet;
        w.playSfx("pickup_misc", { pitch: 1.1 });
        break;
    }
    w.events.emit("pickup", { kind });
  }

  /** debug: add some unlocked weapons? no. Heal & refill (cheats). */
  refillAll(): void {
    const p = this.state;
    p.hp = p.maxHp;
    p.shield = p.maxShield;
    p.bombs = p.maxBombs;
  }
}

function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}
