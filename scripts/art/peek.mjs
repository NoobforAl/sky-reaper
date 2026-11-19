// Dev helper: `node scripts/art/peek.mjs out.png key1 key2 ...` renders the named sprites (all frames) at 6x on a
// mid-grey + biome-ish swatch background for close review. Not part of the build.
import fs from "node:fs";
import { encodePNG } from "./png.mjs";
import { Img, Registry, upscale } from "./lib.mjs";
import { genPlayers, genAirEnemies } from "./gen_air.mjs";
import { genGroundEnemies } from "./gen_ground.mjs";
import { genEnemyAnims } from "./gen_anim.mjs";
import { genBosses } from "./gen_boss.mjs";
import { genBullets, genFx, genPickups } from "./gen_fx.mjs";
import { genWorld } from "./gen_world.mjs";
import { genUi } from "./gen_ui.mjs";
import { genSkins } from "./gen_skins.mjs";

const [out, ...keys] = process.argv.slice(2);
const scale = Number(process.env.SCALE || 6);
const reg = new Registry();
genPlayers(reg); genSkins(reg); genAirEnemies(reg); genGroundEnemies(reg); genEnemyAnims(reg); genBosses(reg); genBullets(reg); genFx(reg); genPickups(reg); genWorld(reg); genUi(reg);
const items = keys.flatMap((k) => (k.endsWith("*") ? reg.items.filter((i) => i.key.startsWith(k.slice(0, -1))) : [reg.get(k)])).filter(Boolean);
const W = Math.max(...items.map((it) => it.frames.length * (it.w * scale + 4))) + 8;
const H = items.reduce((s, it) => s + it.h * scale + 8, 8);
const img = new Img(W, H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) img.set(x, y, ((x >> 4) + (y >> 4)) & 1 ? [70, 76, 90, 255] : [58, 64, 78, 255]);
let y = 4;
for (const it of items) {
  it.frames.forEach((f, i) => img.blit(upscale(f, scale), 4 + i * (it.w * scale + 4), y));
  y += it.h * scale + 8;
}
fs.writeFileSync(out, encodePNG(img.w, img.h, img.d));
console.log(items.map((i) => i.key).join(", "));
