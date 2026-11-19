/**
 * Chapter 5 final boss: CITADEL CORE "THE HEART" (air). A rotating ring carries 2 cannons + 2 shield generators.
 *  P1  cannons: aimed fans from the orbit | core: rotating cross (even while shielded) | emitter: BEAM column
 *      (1.1 s ground markers) | core shielded while any shield generator lives (overload after 90 s)
 *  P2  ring spins faster | core: 4-arm spiral | cannons: needle bursts | emitter: double beam | drone swarms
 *  P3  ring at full speed | core: 8-way cross / 16-ring alternating + missile pairs | emitter: sweeping beam
 *  Parts change attacks: emitter gone -> core fires double cyan rings; cannons gone -> core bursts; shieldgens gone -> core open.
 */
import { GAME_H, GAME_W, type WorldAPI } from "../contracts";
import { BP } from "./attacks";
import { BossBase, roam, type PartRT } from "./framework";

const MOUNT_R = 128;

export class CitadelCoreBoss extends BossBase {
  readonly displayName = "CITADEL CORE";
  private ringAng = 0;
  private ang = 0;
  private mount = new Map<string, number>();
  private altFlip = false;

  constructor(world: WorldAPI) {
    super("citadel_core", world);
    this.holdY = 230;
    this.entrySec = 4.5;
    this.addPart("emitter", "emitter", 0, 150);
    this.addPart("core", "core", 0, 0, true);
    this.addPart("ring", "ring", 0, 0);
    this.addPart("shieldgen", "shieldgen_a", 0, 0);
    this.addPart("shieldgen", "shieldgen_b", 0, 0);
    this.addPart("cannon", "cannon_a", 0, 0);
    this.addPart("cannon", "cannon_b", 0, 0);
    this.mount.set("cannon_a", 0).set("cannon_b", 180).set("shieldgen_a", 90).set("shieldgen_b", 270);

    const pick = (kind: string): PartRT | null => {
      const a = this.aliveParts(kind);
      return a.length ? a[Math.floor(this.world.rng() * a.length)]! : null;
    };

    this.moves = [
      { id: "c_fan", phases: [1], cd: 2, first: 0.8, needs: ["cannon"], fire: (b) => b.fire(BP.fan5, pick("cannon")) },
      { id: "cross", phases: [1], cd: 4.5, first: 2, needs: ["core"], fire: (b) => b.fire(BP.cross, "core") },
      { id: "beam", phases: [1], cd: 8, first: 4, big: 2.5, needs: ["emitter"], fire: () => this.beam([0]) },
      { id: "spiral", phases: [2], cd: 5.5, first: 1, big: 3, needs: ["core"], fire: (b) => b.fire(BP.spiral4, "core") },
      { id: "c_burst", phases: [2, 3], cd: 2.4, needs: ["cannon"], fire: (b) => b.fire(BP.burst5, pick("cannon")) },
      { id: "beam2", phases: [2], cd: 8, first: 4, big: 2.5, needs: ["emitter"], fire: () => this.beam([-80, 80]) },
      { id: "drones", phases: [2, 3], cd: 10, first: 5, fire: (b) => { for (const x of [80, GAME_W / 2, GAME_W - 80]) b.summon("drone_kamikaze", x, -20); } },
      { id: "alt", phases: [3], cd: 3.6, first: 1.2, big: 2, needs: ["core"], fire: (b) => { this.altFlip = !this.altFlip; b.fire(this.altFlip ? BP.xcross : BP.ring16, "core"); } },
      { id: "sweepbeam", phases: [3], cd: 7.5, first: 4, big: 3, needs: ["emitter"], fire: () => this.sweepBeam() },
      { id: "missiles", phases: [3], cd: 8.5, first: 6, needs: ["core"], fire: (b) => b.fire(BP.missile2, "core") },
      // substitutes
      { id: "rings", phases: [2, 3], cd: 5, first: 2.5, needs: ["core"], fire: (b) => { if (!b.alive("emitter")) b.fire(BP.ringCyan, "core"); } },
      { id: "core_burst", phases: [1, 2, 3], cd: 2, needs: ["core"], fire: (b) => { if (!b.alive("cannon")) b.fire(BP.burst3, "core"); } },
    ];
  }

  protected coreShieldExtra(): boolean {
    return this.alive("shieldgen") && this.t < 90;
  }

  protected onPartLost(p: PartRT): void {
    if (p.kind === "shieldgen" && !this.alive("shieldgen")) this.world.events.emit("banner", { text: "SHIELD GENERATORS DOWN", ms: 1600 });
    if (p.kind === "emitter") this.world.events.emit("banner", { text: "EMITTER DESTROYED", ms: 1400 });
  }

  /** vertical beam columns at the player's x (+ offsets): ground markers first, then the strike */
  private beam(offsets: number[]): void {
    const e = this.part("emitter");
    if (!e) return;
    const px = this.world.player.x;
    this.telegraph(e, 1000, () => this.world.playSfx("shot_laser"), 2.2);
    for (const off of offsets) {
      const x = Math.max(30, Math.min(GAME_W - 30, px + off));
      for (let y = e.e.y + 70; y < GAME_H + 20; y += 56) this.blast(x, y, 28, 1150, 22, [255, 60, 160]);
    }
  }

  private sweepBeam(): void {
    const e = this.part("emitter");
    if (!e) return;
    const px = this.world.player.x;
    const dir = px < GAME_W / 2 ? 1 : -1;
    this.telegraph(e, 1000, () => this.world.playSfx("shot_laser"), 2.2);
    for (let i = 0; i < 4; i++) {
      const x = Math.max(30, Math.min(GAME_W - 30, px - dir * 140 + dir * i * 92));
      for (let y = e.e.y + 70; y < GAME_H + 20; y += 60) this.blast(x, y, 28, 1100 + i * 330, 22, [255, 60, 160]);
    }
  }

  protected offsetOf(p: PartRT, out: { x: number; y: number }): void {
    const m = this.mount.get(p.name);
    if (m === undefined) {
      out.x = p.ox;
      out.y = p.oy;
      return;
    }
    const a = ((this.ringAng + m) * Math.PI) / 180;
    out.x = Math.cos(a) * MOUNT_R;
    out.y = Math.sin(a) * MOUNT_R * 0.92;
  }

  protected move(dt: number): void {
    const spin = this.phase === 1 ? 22 : this.phase === 2 ? 36 : 54;
    this.ringAng = (this.ringAng + spin * dt) % 360;
    const ring = this.part("ring");
    if (ring) ring.e.facing = this.ringAng + 90;
    for (const p of this.parts) {
      if (p.dead) continue;
      const m = this.mount.get(p.name);
      if (m !== undefined) p.e.facing = this.ringAng + m;
    }
    this.ang += dt * 0.3;
    this.glide(GAME_W / 2 + Math.sin(this.ang) * roam(50), this.holdY + Math.sin(this.ang * 1.5) * 16, dt, 1.4);
  }
}
