// STUB (Orchestrator) - Asset agent replaces: loads manifest + sprites + font, provides synth audio.
import type { KAPLAYCtx } from "kaplay";
import type { AudioService, SaveService, SpriteRegistry } from "../contracts";

export async function loadAssets(_k: KAPLAYCtx): Promise<SpriteRegistry> {
  return { has: () => false, info: () => undefined };
}

export function createAudioService(_save: SaveService): AudioService {
  let muted = false;
  return {
    unlock() {},
    playSfx() {},
    playMusic() {},
    setMasterVolume() {},
    setMusicVolume() {},
    setSfxVolume() {},
    setMuted(m) {
      muted = m;
    },
    get muted() {
      return muted;
    },
  };
}
