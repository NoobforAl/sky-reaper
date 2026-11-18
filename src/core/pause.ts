/** Simple pause overlay: Resume / Restart / Quit. Mouse, touch (touchToMouse) and keyboard. */
import type { KAPLAYCtx } from "kaplay";
import { FONT, GAME_H, GAME_W } from "../contracts";

export type PauseAction = "resume" | "restart" | "quit";

const ITEMS: Array<{ label: string; action: PauseAction }> = [
  { label: "RESUME", action: "resume" },
  { label: "RESTART", action: "restart" },
  { label: "QUIT TO MENU", action: "quit" },
];

const BTN_W = 280;
const BTN_H = 52;
const BTN_X = GAME_W / 2;
const BTN_Y0 = 380;
const BTN_GAP = 68;

export class PauseMenu {
  open = false;
  sel = 0;
  private openedAt = 0;
  private fontBad = false;
  constructor(
    private k: KAPLAYCtx,
    private onAction: (a: PauseAction) => void,
    private accent: string,
  ) {}

  show(): void {
    this.open = true;
    this.sel = 0;
    this.openedAt = this.k.time();
  }
  hide(): void {
    this.open = false;
  }

  private hit(x: number, y: number): number {
    for (let i = 0; i < ITEMS.length; i++) {
      const cy = BTN_Y0 + i * BTN_GAP;
      if (Math.abs(x - BTN_X) <= BTN_W / 2 && Math.abs(y - cy) <= BTN_H / 2) return i;
    }
    return -1;
  }

  /** call every frame while open */
  update(): void {
    const k = this.k;
    if (k.isKeyPressed("up") || k.isKeyPressed("w")) this.sel = (this.sel + ITEMS.length - 1) % ITEMS.length;
    if (k.isKeyPressed("down") || k.isKeyPressed("s")) this.sel = (this.sel + 1) % ITEMS.length;
    if (k.isKeyPressed("enter") || k.isKeyPressed("space")) this.onAction(ITEMS[this.sel]!.action);
  }

  hover(x: number, y: number): void {
    const i = this.hit(x, y);
    if (i >= 0) this.sel = i;
  }

  click(x: number, y: number): void {
    if (this.k.time() - this.openedAt < 0.15) return;
    const i = this.hit(x, y);
    if (i >= 0) {
      this.sel = i;
      this.onAction(ITEMS[i]!.action);
    }
  }

  private text(t: string, x: number, y: number, size: number, color: [number, number, number]): void {
    const k = this.k;
    const opts = { text: t, pos: k.vec2(x, y), size, anchor: "center" as const, color: k.rgb(color[0], color[1], color[2]) };
    if (!this.fontBad) {
      try {
        k.drawText({ ...opts, font: FONT });
        return;
      } catch {
        this.fontBad = true;
      }
    }
    k.drawText(opts);
  }

  draw(): void {
    const k = this.k;
    k.drawRect({ pos: k.vec2(0, 0), width: GAME_W, height: GAME_H, color: k.rgb(0, 0, 0), opacity: 0.62 });
    this.text("PAUSED", GAME_W / 2, 290, 40, [255, 255, 255]);
    for (let i = 0; i < ITEMS.length; i++) {
      const cy = BTN_Y0 + i * BTN_GAP;
      const on = i === this.sel;
      k.drawRect({ pos: k.vec2(BTN_X, cy), width: BTN_W, height: BTN_H, anchor: "center", color: on ? k.rgb(40, 60, 100) : k.rgb(18, 24, 44), opacity: 0.95, radius: 4 });
      k.drawRect({
        pos: k.vec2(BTN_X, cy),
        width: BTN_W,
        height: BTN_H,
        anchor: "center",
        fill: false,
        outline: { width: on ? 3 : 2, color: on ? k.Color.fromHex(this.accent) : k.rgb(80, 90, 120) },
        radius: 4,
      });
      this.text(ITEMS[i]!.label, BTN_X, cy, 24, on ? [255, 255, 255] : [170, 180, 200]);
    }
    this.text("ESC / P: resume    ARROWS + ENTER: select", GAME_W / 2, GAME_H - 60, 12, [140, 150, 170]);
  }
}
