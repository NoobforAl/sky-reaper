// STUB (Orchestrator) - UI agent replaces with menus, HUD, shop, settings, results.
import { GAME_H, GAME_W, SCENES, type HudRenderer, type Services } from "../contracts";

export function registerUiScenes(svc: Services): void {
  const { k } = svc;
  for (const s of [SCENES.menu, SCENES.chapters, SCENES.shop, SCENES.settings, SCENES.results]) {
    k.scene(s, () => {
      k.onDraw(() =>
        k.drawText({ text: s.toUpperCase() + " (stub)", pos: k.vec2(GAME_W / 2, GAME_H / 3), anchor: "center", size: 24, color: k.rgb(255, 255, 255) }),
      );
      k.onKeyPress("enter", () => k.go(SCENES.game, { chapterId: "pacific" }));
    });
  }
}

export function createHud(_svc: Services): HudRenderer {
  return { draw() {} };
}
