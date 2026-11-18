import kaplay from "kaplay";
import { GAME_H, GAME_W, SCENES, type Services, type SkyDebug } from "./contracts";
import { createSaveService } from "./save";
import { createInputService } from "./input";
import { createAudioService, loadAssets } from "./assets";
import { registerUiScenes } from "./ui";
import { registerGameScene } from "./core";

declare global {
  interface Window {
    __sky: SkyDebug;
  }
}

async function boot() {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const k = kaplay({
    canvas,
    width: GAME_W,
    height: GAME_H,
    letterbox: true,
    crisp: true,
    texFilter: "nearest",
    global: false,
    background: [8, 12, 24],
    pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
    touchToMouse: true,
    debug: false,
    loadingScreen: true,
  });

  const errors: string[] = [];
  window.addEventListener("error", (e) => errors.push(String(e.message)));
  window.addEventListener("unhandledrejection", (e) => errors.push(String((e as PromiseRejectionEvent).reason)));

  const save = createSaveService();
  const audio = createAudioService(save);
  const input = createInputService(k, save);
  const sprites = await loadAssets(k);
  const svc: Services = { k, save, audio, input, sprites };

  const unlock = () => audio.unlock();
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  registerUiScenes(svc);
  registerGameScene(svc);

  const dbg: SkyDebug = {
    scene: SCENES.menu,
    fps: 0,
    errors,
    services: svc,
    goto: (scene, params) => {
      dbg.scene = scene;
      k.go(scene, params);
    },
  };
  window.__sky = dbg;
  k.onUpdate(() => {
    dbg.fps = Math.round(1 / Math.max(k.dt(), 0.0001));
  });

  k.go(SCENES.menu);
}

boot().catch((e) => {
  console.error(e);
  (window as unknown as { __skyBootError: string }).__skyBootError = String(e);
});
