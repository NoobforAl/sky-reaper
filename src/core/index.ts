// STUB (Orchestrator) - Engine agent replaces with the full game scene.
import { GAME_H, GAME_W, SCENES, type Services } from "../contracts";

export function registerGameScene(svc: Services): void {
  const { k } = svc;
  k.scene(SCENES.game, () => {
    k.onDraw(() =>
      k.drawText({ text: "GAME SCENE (stub)", pos: k.vec2(GAME_W / 2, GAME_H / 2), anchor: "center", size: 20, color: k.rgb(255, 255, 255) }),
    );
    k.onKeyPress("escape", () => k.go(SCENES.menu));
  });
}
