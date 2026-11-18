// STUB (Orchestrator) - UI/UX agent replaces with keyboard + touch + gamepad InputService.
import type { KAPLAYCtx } from "kaplay";
import type { InputService, InputState, SaveService } from "../contracts";
import { DEFAULT_BINDINGS } from "../contracts";

export function createInputService(k: KAPLAYCtx, _save: SaveService): InputService {
  const st = (): InputState => ({
    moveX: (k.isKeyDown("right") ? 1 : 0) - (k.isKeyDown("left") ? 1 : 0),
    moveY: (k.isKeyDown("down") ? 1 : 0) - (k.isKeyDown("up") ? 1 : 0),
    fire: k.isKeyDown("space"),
    bomb: k.isKeyDown("k"),
    special: k.isKeyDown("shift"),
    bombPressed: k.isKeyPressed("k"),
    specialPressed: k.isKeyPressed("shift"),
    weaponPrev: k.isKeyPressed("q"),
    weaponNext: k.isKeyPressed("e"),
    groundNext: k.isKeyPressed("r"),
    pausePressed: k.isKeyPressed("escape"),
    dragTarget: null,
  });
  return {
    poll: st,
    touchActive: false,
    setTouchControlsVisible() {},
    setAutoFire() {},
    bindings: DEFAULT_BINDINGS,
    rebind() {},
    resetBindings() {},
    gamepad: null,
  };
}
