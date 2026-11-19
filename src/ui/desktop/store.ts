/**
 * Small helpers shared by the canvas UI scenes and the HUD: control wording mode + shop item info shape.
 */
import type { Services } from "../../contracts";
import { isSkyInput } from "../../input";

/** item description shown in the hangar details panel / tooltip */
export interface ShopFocus {
  title: string;
  kind: string;
  lines: string[];
  cost?: number;
  state?: string;
}

export type HintMode = "kb" | "pad" | "touch";

/** which control wording to show: keyboard/mouse, gamepad or touch (follows the last device used) */
export function hintMode(svc: Services): HintMode {
  const inp = svc.input;
  if (isSkyInput(inp)) {
    if (inp.lastDevice === "touch") return "touch";
    if (inp.lastDevice === "gamepad") return "pad";
    if (inp.lastDevice === "keyboard" || inp.lastDevice === "mouse") {
      // a phone/tablet starts with lastDevice "keyboard" before any input: prefer touch wording there
      if (inp.touchActive && !inp.keyboardUsed) return "touch";
      return "kb";
    }
  }
  return inp.touchActive ? "touch" : "kb";
}
