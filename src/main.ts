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

/**
 * Back-buffer density (buffer px per CSS px).
 *  - at least 1 game unit per buffer pixel when the device has the pixels (phones: ~1.16 instead of DPR 2-3),
 *    so thin pixel art / glyphs are never minified away (src/ui/glfix.ts handles the remaining case where
 *    the window itself is smaller than the field, e.g. 1366x768);
 *  - never above the device DPR, and never more than needed (no 2-3x DPR fill cost on phones);
 *  - at least 1x CSS pixels on desktop so text stays crisp (GPU measured at display refresh at 1920x1080).
 * `?density=<n>` overrides for testing.
 */
function renderDensity(): number {
  const q = new URLSearchParams(window.location.search).get("density");
  if (q && Number.isFinite(Number(q))) return Math.min(3, Math.max(0.25, Number(q)));
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H); // letterbox CSS px per unit
  return Math.max(1, Math.min(dpr, 1 / scale));
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
    // Pixel art: never render the back buffer above the game's own resolution; CSS `image-rendering: pixelated`
    // upscales crisply. Rendering at device DPR (2-3x on phones) or at a 1920x1080 window size multiplies fill cost
    // (measured: Pixel 7 emulation 22 -> 51 FPS) without adding detail, since art pixels are PIXEL_SCALE game units.
    pixelDensity: renderDensity(),
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
  // FPS for QA: a rAF loop instead of k.onUpdate, because KAPLAY clears global handlers on every scene change.
  let lastT = performance.now();
  let acc = 0;
  let frames = 0;
  const tick = (t: number) => {
    acc += t - lastT;
    lastT = t;
    frames++;
    if (acc >= 500) {
      dbg.fps = Math.round((frames * 1000) / acc);
      acc = 0;
      frames = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  k.go(SCENES.menu);
}

boot().catch((e) => {
  console.error(e);
  (window as unknown as { __skyBootError: string }).__skyBootError = String(e);
});
