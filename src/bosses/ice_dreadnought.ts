/**
 * Chapter 4 boss: ICE DREADNOUGHT "WINTER'S MAW" (flying ship). Bow (drill) faces the player.
 *  P1  cannons: telegraphed heavy orbs | engines: drifting ice mines (shootable) | drill RAM (1 s telegraph) | core shielded
 *  P2  core exposed: double cyan ring | cannons: wide sweeps | interceptor escorts
 *  P3  core: rotating 8-way cross | frost carpet walking at you | cannons: 7-fans | rams more often
 *  Parts change attacks: engines destroyed -> slower, no mines; drill destroyed -> no ram, core needles instead.
 */
import { GAME_W, type WorldAPI } from "../contracts";
import { tr } from "../levels/i18n";
import { BP } from "./attacks";
import { BossBase, roam, type PartRT } from "./framework";

export class IceDreadnoughtBoss extends BossBase {
  readonly displayName = "ICE DREADNOUGHT WINTER'S MAW";
  private ang = 0;
  private ram = 0;

  constructor(world: WorldAPI) {
    super("ice_dreadnought", world, 2.2); // round 5 B1: 0.85 -> 2.2
    this.holdY = 200;
    this.entrySec = 4;
    this.addPart("hull", "hull", 0, 0);
    this.addPart("engine", "engine_l", -58, -150);
    this.addPart("engine", "engine_r", 58, -150);
    this.addPart("cannon", "cannon_l", -74, 14);
    this.addPart("cannon", "cannon_r", 74, 14);
    this.addPart("core", "core", 0, -64, true);
    this.addPart("drill", "drill", 0, 205);

    const pick = (kind: string): PartRT | null => {
      const a = this.aliveParts(kind);
      return a.length ? a[Math.floor(this.world.rng() * a.length)]! : null;
    };

    this.moves = [
      { id: "c_orbs", phases: [1], cd: 2.8, first: 1, big: 1.2, needs: ["cannon"], fire: (b) => b.fire(BP.bigOrbs, pick("cannon")) },
      { id: "mines", phases: [1, 2], cd: 3.8, first: 2, needs: ["engine"], fire: (b) => b.fire(BP.mines, pick("engine"), 90) },
      { id: "ram", phases: [1, 2, 3], cd: 10, first: 6, big: 3, needs: ["drill"], fire: (b) => this.startRam(b) },
      { id: "c_burst", phases: [1, 2, 3], cd: 2.2, needs: ["cannon"], fire: (b) => b.fire(BP.burst3, pick("cannon")) },
      { id: "ring", phases: [2], cd: 4.6, first: 1, big: 1.8, needs: ["core"], fire: (b) => b.fire(BP.ringCyan, "core") },
      { id: "c_sweep", phases: [2], cd: 3.8, first: 2, needs: ["cannon"], fire: (b) => b.fire(BP.sweepWide, pick("cannon")) },
      { id: "escort", phases: [2, 3], cd: 13, first: 5, fire: (b) => { b.summon("interceptor", 70, -30); b.summon("interceptor", GAME_W - 70, -30); } },
      { id: "xcross", phases: [3], cd: 6, first: 1.5, big: 3, needs: ["core"], fire: (b) => b.fire(BP.xcross, "core") },
      { id: "frost", phases: [3], cd: 7, first: 4, fire: (b) => b.fire({ ...BP.carpet, hazard: { ...BP.carpet.hazard, color: [120, 220, 255] } }, b.part("core") ?? null) },
      { id: "c_fan7", phases: [3], cd: 3.2, first: 2, needs: ["cannon"], fire: (b) => b.fire(BP.fan7, pick("cannon")) },
      // substitute
      { id: "needle", phases: [2, 3], cd: 1.4, needs: ["core"], fire: (b) => { if (!b.alive("drill")) b.fire(BP.needle, "core"); } },
    ];
  }

  private startRam(b: BossBase): void {
    b.world.events.emit("banner", { text: tr("bossBanner.ice.drill", "DRILL CHARGE"), subtext: tr("bossBanner.ice.drill.sub", "MOVE ASIDE"), ms: 1200 });
    const d = b.part("drill");
    // the lane it will plough through
    if (d) for (let i = 0; i < 4; i++) b.blast(this.x, d.e.y + 70 + i * 70, 34, 1100 + i * 120, 20, [140, 220, 255]);
    b.telegraph("drill", 1000, () => {
      this.ram = 1.8;
    }, 2);
  }

  protected onPartLost(p: PartRT): void {
    if (p.kind === "engine" && !this.alive("engine")) this.world.events.emit("banner", { text: tr("bossBanner.ice.engines", "ENGINES DOWN"), subtext: tr("bossBanner.ice.engines.sub", "IT'S SLOWING"), ms: 1500 });
    if (p.kind === "drill") this.ram = Math.min(this.ram, 0.6);
  }

  protected move(dt: number): void {
    if (this.ram > 0) {
      this.ram -= dt;
      const fwd = this.ram > 0.9;
      this.glide(this.x, fwd ? this.holdY + 250 : this.holdY, dt, fwd ? 2.6 : 1.6);
      return;
    }
    const engines = this.aliveParts("engine").length;
    const sp = engines === 2 ? 0.45 : engines === 1 ? 0.32 : 0.2;
    this.ang += dt * sp * (this.phase === 3 ? 1.3 : 1);
    this.glide(GAME_W / 2 + Math.sin(this.ang) * roam(90), this.holdY + Math.sin(this.ang * 2) * 18, dt, 1.6);
  }
}
