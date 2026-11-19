/**
 * UI module (UI/UX agent): menu, chapters, shop (hangar), settings, results scenes + in-game HUD.
 */
import type { Services } from "../contracts";
import { applyReducedMotion } from "./backdrop";
import { registerChapters } from "./chapters";
import { registerMenu } from "./menu";
import { registerResults } from "./results";
import { applyAudio, registerSettings } from "./settings";
import { registerShop } from "./shop";

export { createHud } from "./hud";
export { drawBackdrop, drawScanlines, Gfx, button, slider, toggle, selector } from "./widgets";

export function registerUiScenes(svc: Services): void {
  registerMenu(svc);
  registerChapters(svc);
  registerShop(svc);
  registerSettings(svc);
  registerResults(svc);
  // make sure persisted audio settings are applied at boot and on every change
  applyAudio(svc);
  applyReducedMotion();
  svc.save.onSettingsChanged(() => applyAudio(svc));
}
