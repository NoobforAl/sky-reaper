/** Simple pause overlay: Resume / Restart / Quit. Mouse, touch (touchToMouse), keyboard and gamepad (input.menuPad()). */
import type { KAPLAYCtx } from "kaplay";
import { FONT, GAME_H, GAME_W } from "../contracts";

export type PauseAction = "resume" | "restart" | "quit";

/** edge-triggered menu buttons (subset of the input service's MenuPad) */
export interface PausePad {
  up?: boolean;
  down?: boolean;
  confirm?: boolean;
  back?: boolean;
  start?: boolean;
}

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
    /** optional gamepad menu reader (svc.input.menuPad when the input service provides it) */
    private pad?: () => PausePad | null,
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
    let mp: PausePad | null = null;
    try {
      mp = this.pad ? this.pad() : null;
    } catch {
      mp = null;
    }
    const opened = k.time() - this.openedAt >= 0.15;
    if (k.isKeyPressed("up") || k.isKeyPressed("w") || mp?.up) this.sel = (this.sel + ITEMS.length - 1) % ITEMS.length;
    if (k.isKeyPressed("down") || k.isKeyPressed("s") || mp?.down) this.sel = (this.sel + 1) % ITEMS.length;
    if (!opened) return;
    if (mp?.back || mp?.start) this.onAction("resume");
    else if (k.isKeyPressed("enter") || k.isKeyPressed("space") || mp?.confirm) this.onAction(ITEMS[this.sel]!.action);
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
    // hint sits under the buttons (the HUD owns the bottom corners on wide screens)
    this.text("ESC / P / START: resume", GAME_W / 2, BTN_Y0 + ITEMS.length * BTN_GAP + 6, 12, [140, 150, 170]);
    this.text("ARROWS / D-PAD + ENTER / A: select", GAME_W / 2, BTN_Y0 + ITEMS.length * BTN_GAP + 26, 12, [140, 150, 170]);
  }
}
