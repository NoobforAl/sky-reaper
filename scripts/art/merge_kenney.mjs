// OPTIONAL: merge a user-supplied Kenney "Pixel Shmup" pack (CC0, https://kenney.nl/assets/pixel-shmup).
// kenney.nl blocks scripted downloads — never fetch it. If the user unzips the pack by hand into
// assets_original/kenney-pixel-shmup/ (so that .../Tiles/tile_0000.png exists), list overrides in
// assets_original/kenney-pixel-shmup/map.json as { "<our sprite key>": ["Tiles/tile_0000.png", ...frames] }.
// Each listed key is replaced by the Kenney frames (scaled/centred into our frame size). Nothing else changes;
// with no pack present this is a no-op and the build is 100% original art.
import fs from "node:fs";
import path from "node:path";
import { decodePNG } from "./png.mjs";
import { Img } from "./lib.mjs";

export function mergeKenney(reg, root) {
  const dir = path.join(root, "assets_original/kenney-pixel-shmup");
  const mapFile = path.join(dir, "map.json");
  if (!fs.existsSync(mapFile)) return 0;
  let map;
  try {
    map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
  } catch (e) {
    console.warn("merge_kenney: bad map.json", e.message);
    return 0;
  }
  let n = 0;
  for (const [key, files] of Object.entries(map)) {
    const it = reg.get(key);
    if (!it) {
      console.warn("merge_kenney: unknown key", key);
      continue;
    }
    const frames = [];
    for (const f of files) {
      const p = path.join(dir, f);
      if (!fs.existsSync(p)) { console.warn("merge_kenney: missing", f); continue; }
      const src = decodePNG(fs.readFileSync(p));
      const im = new Img(it.w, it.h);
      const ox = Math.floor((it.w - src.w) / 2), oy = Math.floor((it.h - src.h) / 2);
      for (let y = 0; y < src.h; y++)
        for (let x = 0; x < src.w; x++) {
          const o = (y * src.w + x) * 4;
          if (src.data[o + 3]) im.set(ox + x, oy + y, [src.data[o], src.data[o + 1], src.data[o + 2], src.data[o + 3]]);
        }
      frames.push(im);
    }
    if (frames.length) {
      it.frames = frames;
      it.kenney = true;
      n++;
    }
  }
  return n;
}
