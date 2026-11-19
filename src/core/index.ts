/**
 * Engine entry point: registers the 'game' scene.
 * Fixed-step simulation (SIM_DT) driven from k.onUpdate; one onDraw pass through the Renderer.
 */
import { GAME_H, GAME_W, SCENES, SIM_DT, type GameSceneParams, type Services } from "../contracts";
import { enemySystem } from "../enemies";
import { patternRunner } from "../patterns";
import { levels } from "../levels";
import { bosses } from "../bosses";
import { createHud } from "../ui";
import { composeEnemySystem, createDemoRunner, demoBosses } from "./devdemo";
import { PauseMenu, type PauseAction, type PausePad } from "./pause";
import { Renderer } from "./render";
import { abortRun, finishRun } from "./results";
import { World } from "./world";

export { World } from "./world";
export { WORLD_TUNING } from "./world";

void patternRunner; // patterns are driven by enemies/bosses; imported so the module graph stays complete

export function registerGameScene(svc: Services): void {
  const { k } = svc;

  k.scene(SCENES.game, (raw?: GameSceneParams) => {
    const params: GameSceneParams = raw && raw.chapterId ? raw : { chapterId: "pacific" };

    // ---- content selection: real modules, or the DEV demo when they are still stubs
    const realEnemies = Object.keys(enemySystem.defs).length > 0;
    const realLevels = levels.chapters.length > 0;
    const demo = !realLevels;
    const chapterDef = realLevels ? (levels.chapters.find((c) => c.id === params.chapterId) ?? levels.chapters[0]!) : undefined;
    const runner = demo ? createDemoRunner(realEnemies) : levels.createRunner(chapterDef!.id);
    const chapter = demo ? runner.chapter : chapterDef!;
    if (demo) console.warn("[core] DEV demo content active (enemies or levels not available yet)");

    let finished = false;
    let world!: World;
    world = new World({
      svc,
      chapter,
      runner,
      enemySys: demo ? composeEnemySystem(enemySystem) : enemySystem,
      bosses: demo ? demoBosses : bosses,
      fallbackBosses: undefined,
      params,
      demo,
      onFinish: (victory) => {
        if (finished) return;
        finished = true;
        const res = finishRun(svc.save, chapter, world.stats, victory, world.pc.state.lives, world.time);
        const dbg = (window as unknown as { __sky?: { scene: string } }).__sky;
        if (dbg) dbg.scene = SCENES.results;
        k.go(SCENES.results, res);
      },
    });

    const hud = createHud(svc);
    const renderer = new Renderer(svc, world, hud);

    // ---- pause
    let paused = false;
    const pause = new PauseMenu(
      k,
      (a: PauseAction) => {
        if (a === "resume") setPaused(false);
        else if (a === "restart") {
          svc.audio.playSfx("ui_select");
          finished = true;
          k.go(SCENES.game, params);
        } else {
          svc.audio.playSfx("ui_back");
          finished = true;
          abortRun(svc.save, world.stats);
          svc.audio.playMusic("menu");
          k.go(SCENES.menu);
        }
      },
      chapter.palette?.accent ?? "#ffcc33",
      () => {
        const mp = (svc.input as unknown as { menuPad?: () => PausePad }).menuPad;
        return typeof mp === "function" ? mp.call(svc.input) : null;
      },
    );
    function setPaused(v: boolean): void {
      if (v === paused || finished) return;
      paused = v;
      if (v) pause.show();
      else pause.hide();
      svc.audio.playSfx(v ? "ui_select" : "ui_back", { volume: 0.6 });
    }
    const onVis = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener("visibilitychange", onVis);

    k.onMousePress(() => {
      if (paused) pause.click(k.mousePos().x, k.mousePos().y);
    });
    k.onMouseMove(() => {
      if (paused) pause.hover(k.mousePos().x, k.mousePos().y);
    });

    // ---- loop
    let acc = 0;
    k.onUpdate(() => {
      if (finished) return;
      const real = Math.min(k.dt(), 0.1);
      world.fps += (1 / Math.max(real, 1e-4) - world.fps) * 0.08;
      if (paused) {
        const inp = svc.input.poll();
        if (inp.pausePressed) setPaused(false);
        else pause.update();
        return;
      }
      acc += real;
      // snap near-60Hz frame times to exactly one step (avoids 0/2-step judder from timer noise)
      if (acc > SIM_DT * 0.82 && acc < SIM_DT * 1.18) acc = SIM_DT;
      let steps = 0;
      while (acc >= SIM_DT - 1e-5 && steps < 5 && !finished) {
        const input = svc.input.poll();
        if (input.pausePressed) {
          setPaused(true);
          break;
        }
        world.step(SIM_DT, input);
        acc -= SIM_DT;
        steps++;
      }
      if (steps >= 5) acc = 0;
    });

    k.onDraw(() => {
      renderer.draw();
      if (paused) pause.draw();
    });

    // ---- QA hooks
    const sky = (window as unknown as { __sky?: { game?: unknown; scene: string } }).__sky;
    if (sky) {
      sky.scene = SCENES.game;
      sky.game = {
        world,
        cheatWin: () => world.cheatWin(),
        cheatKillAll: () => world.cheatKillAll(),
        setGod: (v: boolean) => world.setGod(v),
      };
    }

    k.onSceneLeave(() => {
      document.removeEventListener("visibilitychange", onVis);
      svc.input.setTouchControlsVisible(false);
      if (sky) sky.game = undefined;
    });

    // ---- start
    svc.input.setTouchControlsVisible(true);
    svc.audio.playMusic(chapter.music);
    if (params.startAt && params.startAt > 0) world.fastForward(params.startAt);
    void GAME_W;
    void GAME_H;
  });
}
