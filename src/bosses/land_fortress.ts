/**
 * Chapter 3 boss: LAND FORTRESS "SAND TYRANT" (ground). Bombs matter: treads are bomb-only (orange brackets).
 *  P1  small turrets: aimed fans | big turret: telegraphed heavy orbs | core shielded
 *  P2  core exposed: orb ring | big turret: artillery (1.1 s ground markers) | small turrets: sweeps | deploys light tanks
 *  P3  core: 4-arm spiral | carpet bombing walk | RAM: if any tread is intact the fortress lurches forward (1 s telegraph)
 *  Parts change attacks: both treads destroyed -> immobile, no ram; big turret destroyed -> core takes over artillery.
 */
import { GAME_W, type WorldAPI } from "../contracts";
import { tr } from "../levels/i18n";
import { BP } from "./attacks";
import { BossBase, roam, type PartRT } from "./framework";

export class LandFortressBoss extends BossBase {
  readonly displayName = "LAND FORTRESS SAND TYRANT";
  private ang = 0;
  private ram = 0; // seconds of ram remaining
  private immobile = false;

  constructor(world: WorldAPI) {
    super("land_fortress", world, 1.75); // round 5 B1: 1 -> 1.75
    this.holdY = 220;
    this.entrySec = 4.5;
    this.addPart("tread", "tread_l", -128, 0);
    this.addPart("tread", "tread_r", 128, 0);
    this.addPart("body", "body", 0, 0);
    this.addPart("turret_big", "turret_big", 0, -64);
    this.addPart("turret_small", "ts_fl", -78, -128);
    this.addPart("turret_small", "ts_fr", 78, -128);
    this.addPart("turret_small", "ts_bl", -78, 100);
    this.addPart("turret_small", "ts_br", 78, 100);
    this.addPart("core", "core", 0, 62, true);

    const pick = (kind: string): PartRT | null => {
      const a = this.aliveParts(kind);
      return a.length ? a[Math.floor(this.world.rng() * a.length)]! : null;
    };

    this.moves = [
      { id: "s_fan", phases: [1], cd: 1.5, first: 0.5, needs: ["turret_small"], fire: (b) => b.fire(BP.fan3, pick("turret_small")) },
      { id: "big_orbs", phases: [1], cd: 4, first: 2, big: 1.5, needs: ["turret_big"], fire: (b) => b.fire(BP.bigOrbs, "turret_big") },
      { id: "ring", phases: [2], cd: 4.5, first: 1, big: 1.5, needs: ["core"], fire: (b) => b.fire(BP.ring12, "core") },
      { id: "artillery", phases: [2, 3], cd: 5.5, first: 2.5, needs: ["turret_big"], fire: (b) => b.fire(BP.artillery, "turret_big") },
      { id: "s_sweep", phases: [2, 3], cd: 2.4, needs: ["turret_small"], fire: (b) => b.fire(BP.sweep, pick("turret_small")) },
      { id: "tanks", phases: [2, 3], cd: 12, first: 5, fire: (b) => this.deployTanks(b) },
      { id: "spiral", phases: [3], cd: 6.5, first: 1.5, big: 3, needs: ["core"], fire: (b) => b.fire(BP.spiral4, "core") },
      { id: "carpet", phases: [3], cd: 7.5, first: 4, fire: (b) => b.fire(BP.carpet, b.part("core") ?? null) },
      { id: "ram", phases: [3], cd: 10, first: 6, big: 3, needs: ["tread"], fire: (b) => this.startRam(b) },
      // substitutes
      { id: "core_art", phases: [2, 3], cd: 6, first: 3, needs: ["core"], fire: (b) => { if (!b.alive("turret_big")) b.fire(BP.artillery, "core"); } },
      { id: "core_aim", phases: [1, 2, 3], cd: 1.6, needs: ["core"], fire: (b) => { if (!b.alive("turret_small")) b.fire(BP.burst3, "core"); } },
    ];
  }

  private deployTanks(b: BossBase): void {
    b.summon("tank_light", this.x - 150, this.y + 40);
    b.summon("tank_light", this.x + 150, this.y + 40);
  }

  private startRam(b: BossBase): void {
    b.world.events.emit("banner", { text: tr("bossBanner.fortress.ramming", "RAMMING SPEED"), subtext: tr("bossBanner.fortress.ramming.sub", "GET CLEAR"), ms: 1200 });
    b.world.shake(4, 900);
    // crush zone: where the fortress front edge will land
    const fy = this.holdY + 230 + 165;
    for (const ox of [-112, -38, 38, 112]) b.blast(this.x + ox, fy, 42, 1900, 24, [255, 140, 40]);
    b.telegraph("core", 1000, () => {
      this.ram = 2.2;
    }, 2.4);
  }

  protected onPartLost(p: PartRT): void {
    if (p.kind === "tread" && !this.alive("tread")) {
      this.immobile = true;
      this.world.events.emit("banner", { text: tr("bossBanner.fortress.immobilised", "FORTRESS IMMOBILISED"), ms: 1600 });
    }
  }

  protected move(dt: number): void {
    if (this.immobile) {
      this.glide(this.x, this.holdY, dt, 1);
      return;
    }
    if (this.ram > 0) {
      this.ram -= dt;
      const forward = this.ram > 1.1;
      this.glide(this.x, forward ? this.holdY + 230 : this.holdY, dt, forward ? 1.8 : 1.4);
      return;
    }
    this.ang += dt * 0.3;
    this.glide(GAME_W / 2 + Math.sin(this.ang) * roam(34), this.holdY + Math.sin(this.ang * 1.7) * 14, dt, 1.5);
  }
}
