/**
 * Chapter 2 boss: HEAVY GUNSHIP "HORNET KING" (air).
 *  P1  gunpods: aimed bursts | missilepods: single missiles | body armoured (shielded)
 *  P2  body exposed: rocket fan (telegraphed) | gunpods: sweeps | missile pairs | calls kamikaze drones
 *  P3  body: spiral | strafing dash run (1 s telegraph) | faster pods
 *  Parts change attacks: gunpods gone -> chin needle gun; missilepods gone -> heavy orbs; tail gone -> the gunship
 *  loses stability: wobbles and fires rotating crosses while spinning.
 */
import { GAME_W, X_SCALE, type WorldAPI } from "../contracts";
import { BP } from "./attacks";
import { BossBase, roam, type PartRT } from "./framework";

export class HeliGunshipBoss extends BossBase {
  readonly displayName = "GUNSHIP HORNET KING";
  private ang = 0;
  private dash = 0; // >0 while dashing (seconds left)
  private dashDir = 1;
  private tailLost = false;

  constructor(world: WorldAPI) {
    super("heli_gunship", world);
    this.holdY = 190;
    this.entrySec = 3;
    this.addPart("body", "body", 0, 0, true);
    this.addPart("tail", "tail", 0, -104);
    this.addPart("gunpod", "gunpod_l", -76, 14);
    this.addPart("gunpod", "gunpod_r", 76, 14);
    this.addPart("missilepod", "missilepod_l", -60, -46);
    this.addPart("missilepod", "missilepod_r", 60, -46);
    this.addPart("rotor", "rotor", 0, -6);

    const pick = (kind: string): PartRT | null => {
      const a = this.aliveParts(kind);
      return a.length ? a[Math.floor(this.world.rng() * a.length)]! : null;
    };

    this.moves = [
      { id: "g_burst", phases: [1], cd: 1.5, first: 0.5, needs: ["gunpod"], fire: (b) => b.fire(BP.burst3, pick("gunpod")) },
      { id: "m1", phases: [1], cd: 6, first: 2.5, needs: ["missilepod"], fire: (b) => b.fire(BP.missile1, pick("missilepod")) },
      { id: "g_sweep", phases: [2, 3], cd: 2.6, needs: ["gunpod"], fire: (b) => b.fire(BP.sweep, pick("gunpod")) },
      { id: "rockets", phases: [2], cd: 4.2, first: 1, big: 1.6, needs: ["body"], fire: (b) => b.fire({ ...BP.fan5Down, telegraphMs: 900 }, "body") },
      { id: "m2", phases: [2, 3], cd: 7, first: 3.5, needs: ["missilepod"], fire: (b) => b.fire(BP.missile2, pick("missilepod")) },
      { id: "drones", phases: [2, 3], cd: 12, first: 6, fire: (b) => this.callDrones(b) },
      { id: "spiral", phases: [3], cd: 6, first: 1.5, big: 3, needs: ["body"], fire: (b) => b.fire(BP.spiral, "body") },
      { id: "dash", phases: [3], cd: 9, first: 5, big: 2.5, needs: ["body"], fire: (b) => this.startDash(b) },
      // part-loss substitutes
      { id: "chin", phases: [1, 2, 3], cd: 1.4, needs: ["body"], fire: (b) => { if (!b.alive("gunpod")) b.fire(BP.needle, "body"); } },
      { id: "orbs", phases: [2, 3], cd: 5, first: 2.5, needs: ["body"], fire: (b) => { if (!b.alive("missilepod")) b.fire(BP.bigOrbs, "body"); } },
      { id: "spin", phases: [2, 3], cd: 5.5, first: 3, needs: ["body"], fire: (b) => { if (this.tailLost) b.fire(BP.cross, "body"); } },
    ];
  }

  private callDrones(b: BossBase): void {
    b.world.events.emit("banner", { text: "DRONES INBOUND", ms: 1200 });
    b.summon("drone_kamikaze", 60, -20);
    b.summon("drone_kamikaze", GAME_W - 60, -20);
  }

  private startDash(b: BossBase): void {
    this.dashDir = this.x < GAME_W / 2 ? 1 : -1;
    b.world.events.emit("banner", { text: "STRAFING RUN", ms: 1000 });
    b.telegraph("body", 1000, () => {
      this.dash = 1.6;
      b.fire(BP.ring12, "body");
    }, 2);
  }

  protected onPartLost(p: PartRT): void {
    if (p.kind === "tail") {
      this.tailLost = true;
      this.world.events.emit("banner", { text: "TAIL ROTOR DOWN", subtext: "IT'S SPINNING OUT", ms: 1600 });
    }
  }

  protected move(dt: number): void {
    if (this.dash > 0) {
      // fast horizontal strafing pass at player height band
      this.dash -= dt;
      const tx = this.dashDir > 0 ? GAME_W - 90 : 90;
      // same pass duration on any width: ease rate drops on wide fields so the body stays readable/dodgeable
      this.glide(tx, this.holdY + 200, dt, 2.2 / Math.sqrt(X_SCALE));
      return;
    }
    this.ang += dt * (this.phase === 1 ? 0.6 : this.phase === 2 ? 0.8 : 1.0);
    const amp = this.phase === 1 ? 110 : 140;
    let tx = GAME_W / 2 + Math.sin(this.ang) * roam(amp);
    let ty = this.holdY + Math.sin(this.ang * 2) * 26;
    if (this.tailLost) {
      tx += Math.sin(this.t * 3.1) * 22;
      ty += Math.cos(this.t * 2.3) * 14;
    }
    this.glide(tx, ty, dt, 2);
  }
}
