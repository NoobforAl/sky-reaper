/**
 * Chapter 1 boss: CARRIER "LEVIATHAN" (naval, ground layer). Teaching boss.
 *  P1  turrets: aimed bursts | AA: flak | launchers: single missile (flares!) | bridge shielded
 *  P2  bridge opens: telegraphed orb ring | turrets: fans | launchers: missile pairs | deck launches fighters
 *  P3  bridge: spiral | broadside (all turrets, 1 s telegraph) | missile salvo | carrier swings wider
 *  Parts change attacks: no launchers -> no missiles; no turrets -> bridge gains aimed needles.
 */
import { GAME_W, WIDE, type WorldAPI } from "../contracts";
import { BP } from "./attacks";
import { BossBase, roam, type PartRT } from "./framework";

export class CarrierBoss extends BossBase {
  readonly displayName = "CARRIER LEVIATHAN";

  constructor(world: WorldAPI) {
    // round 5 B1: 0.85 -> 1.6; round 6 (QA R5-3): portrait boss pass ran 37.3 s (< 40 s). +0.1 was not enough (37.5 s:
    // P1 / P2 sit on the 10 s phase floor, only P3 grows; 1.95 gave 38.6 s) -> 2.2 on the 480 field
    // round 7 (QA R6-7): portrait ran 39.5 s (just under 40) -> 2.45; wide phase 1 was gate-held up to 4.3 s -> P1 holds
    // 35 % of the HP on wide (phaseAt [0.65, 0.4])
    super("carrier", world, WIDE ? 1.6 : 2.45);
    if (WIDE) this.phaseAt = [0.65, 0.4];
    this.holdY = 250;
    this.entrySec = 4;
    this.y = -320;
    this.addPart("hull", "hull", 0, 0);
    this.addPart("launcher", "launcher_l", -46, -40);
    this.addPart("launcher", "launcher_r", 46, -40);
    this.addPart("turret", "turret_fl", -60, -165);
    this.addPart("turret", "turret_fr", 60, -165);
    this.addPart("turret", "turret_bl", -60, 120);
    this.addPart("turret", "turret_br", 60, 120);
    this.addPart("aa", "aa", -40, 200);
    this.addPart("bridge", "bridge", 58, 10, true);

    const pick = (kind: string): PartRT | null => {
      const a = this.aliveParts(kind);
      return a.length ? a[Math.floor(this.world.rng() * a.length)]! : null;
    };

    this.moves = [
      // ---------------- phase 1
      { id: "t_burst", phases: [1], cd: 1.4, first: 0.6, needs: ["turret"], fire: (b) => b.fire(BP.burst3, pick("turret")) },
      { id: "aa_flak", phases: [1, 2, 3], cd: 3, needs: ["aa"], fire: (b) => b.fire(BP.flak, "aa") },
      { id: "missile1", phases: [1], cd: 7, first: 3, needs: ["launcher"], fire: (b) => b.fire(BP.missile1, pick("launcher")) },
      // ---------------- phase 2
      { id: "t_fan", phases: [2], cd: 2.2, needs: ["turret"], fire: (b) => { b.fire(BP.fan3, pick("turret")); b.fire(BP.fan3, pick("turret")); } },
      { id: "ring", phases: [2], cd: 4, first: 1, big: 1.5, needs: ["bridge"], fire: (b) => b.fire(BP.ring12, "bridge") },
      { id: "missile2", phases: [2], cd: 7.5, first: 4, needs: ["launcher"], fire: (b) => b.fire(BP.missile2, pick("launcher")) },
      { id: "deck", phases: [2, 3], cd: 10, first: 5, fire: (b) => this.launchFighters(b) },
      // ---------------- phase 3
      { id: "spiral", phases: [3], cd: 6.5, first: 1.5, big: 3, needs: ["bridge"], fire: (b) => b.fire(BP.spiral, "bridge") },
      { id: "broadside", phases: [3], cd: 7, first: 4.5, big: 2, needs: ["turret"], fire: (b) => this.broadside(b) },
      { id: "missile4", phases: [3], cd: 9, first: 6, needs: ["launcher"], fire: (b) => b.fire(BP.missile4, pick("launcher")) },
      { id: "t_aim", phases: [3], cd: 1.6, needs: ["turret"], fire: (b) => b.fire(BP.aimed, pick("turret")) },
      // no turrets left: the bridge defends itself
      { id: "needle", phases: [2, 3], cd: 1.3, needs: ["bridge"], fire: (b) => { if (!b.alive("turret")) b.fire(BP.needle, "bridge"); } },
    ];
  }

  private launchFighters(b: BossBase): void {
    const hull = b.part("hull");
    if (!hull) return;
    b.world.spawnFx("ring", hull.e.x, hull.e.y - 200, { scale: 1.2 });
    b.summon("fighter_basic", hull.e.x - 30, Math.max(-20, hull.e.y - 250));
    b.summon("fighter_basic", hull.e.x + 30, Math.max(-20, hull.e.y - 270));
  }

  private broadside(b: BossBase): void {
    for (const t of b.aliveParts("turret")) b.telegraph(t, 1000, () => b.fire(BP.fan5Down, t, 90), 1.2);
  }

  private ang = 0;
  protected move(dt: number): void {
    const amp = this.phase === 3 ? 70 : 40;
    this.ang += dt * (this.phase === 3 ? 0.55 : 0.35);
    this.glide(GAME_W / 2 + Math.sin(this.ang) * roam(amp), this.holdY + Math.sin(this.t * 0.5) * 8, dt);
  }
}
