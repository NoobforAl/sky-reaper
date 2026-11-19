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
import { applyLocale, initText } from "./i18n";

export { createHud } from "./hud";
export { drawBackdrop, drawScanlines, Gfx, button, slider, toggle, selector } from "./widgets";

export function registerUiScenes(svc: Services): void {
  // round 5: UI language (Settings.language, default English) + the shared Farsi text renderer
  initText(svc.k);
  void applyLocale(svc.save.data.settings.language);
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
