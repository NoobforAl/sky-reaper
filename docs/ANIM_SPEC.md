# SKY REAPER enemy animation spec (round 5, item 9)

Generated art: `scripts/art/gen_anim.mjs` (run by `npm run art`), plus the rotor rework in `scripts/art/gen_air.mjs`.
All strips are horizontal, `frames x frameW`, loaded by `src/assets/loader.ts` as KAPLAY sprites with `sliceX = frames`
(anim `loop` when frames > 1). Nothing new is needed in the loader. This document tells the renderer / world owner
(src/core) how to pick keys and frames. It can be implemented mechanically and without allocations.

Conventions (unchanged): native px, drawn at `PIXEL_SCALE` (2). Air bodies point DOWN at angle 0 and are drawn with
`angle = facing - 90`. Ground units face down and are not rotated. `*_gun` overlays point DOWN at angle 0, pivot = sprite
centre, `angle = aimDeg - 90`. Offsets below are native px relative to the sprite centre, in sprite space (before
rotation). +y is down (toward the nose of a nose-down plane).

## 1. Key families

| suffix | who | frames / fps | when |
|---|---|---|---|
| `enemy_<id>` | all | as before | idle / move (rotor, prop, afterburner, tracks, wakes, dish) |
| `enemy_<id>_bankl` / `_bankr` | air: fighter_basic, interceptor, fighter_heavy, bomber, drone_kamikaze, missile_carrier, mine_layer, helicopter, gunship_light | **same count and fps as the base** | `e.bank < -0.45` / `> 0.45` (already wired in render.ts) |
| `enemy_<id>_dmg` | every enemy body (26 ids; not `_gun`) | same as base | `e.hp < 0.5 * e.maxHp` |
| `enemy_<id>_bankl_dmg` / `_bankr_dmg` | the 9 banking air units | same as base | damaged AND banking |
| `enemy_<id>_gun` | tank_light, tank_heavy, aa_turret, ice_turret, citadel_turret, ice_walker | **3, fps 0 (state strip)** | 0 rest, 1 fire (recoil 2px + flash), 2 return (recoil 1px) |
| `enemy_<id>_burn` | every ground unit with a `_dead` wreck (16 ids) | 3 @ 10 fps, loop | the first seconds of the wreck, then `_dead` |
| `debris_s` 6x6, `debris_m` 8x8, `debris_l` 12x12 | shared | 4, fps 0 (variants) | debris fx: frame = chunk variant |
| `fx_muzzle_e` 8x8, `fx_muzzle_e_l` 12x12 | shared | 3, played over the flash life | enemy shot |

The elites (`*_elite`) set `def.sprite` to the base key, so they get every variant through `keys.base + suffix`.
Boss parts have none of these keys. Every lookup must fall back to the next key when `sprites.has()` is false.

The bank and damage strips have **exactly the base frame count**, so the existing `e.frame` (computed in
`World.animateEnemy` from the base `SpriteInfo`) indexes them directly: `frame = e.frame % info.frames`.

## 2. Body key selection (render.ts `drawEnemy` and `drawShadow`)

Extend `EnemyKeys` (src/core/spritekeys.ts) once per def. Never concatenate strings per frame:

```ts
k = { base, bankL: base + "_bankl", bankR: base + "_bankr", gun: base + "_gun", dead: "enemy_" + def.id + "_dead",
      dmg: base + "_dmg", bankLDmg: base + "_bankl_dmg", bankRDmg: base + "_bankr_dmg",
      burn: "enemy_" + def.id + "_burn" };
```

```ts
const damaged = e.hp < e.maxHp * 0.5 && !e.bossId;
let key = keys.base;
if (damaged && this.info(keys.dmg)) key = keys.dmg;
if (e.bank < -0.45 || e.bank > 0.45) {
  const bk = e.bank < 0 ? (damaged ? keys.bankLDmg : keys.bankL) : (damaged ? keys.bankRDmg : keys.bankR);
  if (this.info(bk)) key = bk;
  else if (damaged) { const b2 = e.bank < 0 ? keys.bankL : keys.bankR; if (!this.info(keys.dmg) && this.info(b2)) key = b2; }
}
const frame = info.frames > 1 ? e.frame % info.frames : 0;   // unchanged
```

Use the same key for the shadow (silhouettes match). Hit flash (`sprFlash`) works on any key.
The damaged strips already contain scorch marks, smoke holes and embers that flicker with the normal frame clock. Keep
the existing smoke puffs (`smokeT`) on top. They read as "this one is about to go".

Bank thresholds: `e.bank` is already smoothed (`dt*8`). If it flickers at ±0.45, add hysteresis: enter at 0.5, leave at 0.35.

## 3. Turret recoil + muzzle flash (`*_gun`, and muzzle flashes for everyone)

Add to `EnemyRT` (core-private, not a contract field): `fireT: number` = seconds since the last shot (spawn: 99;
`animateEnemy` does `e.fireT += dt`). Set `fireT = 0` and `fireDir = heading` in `World.spawnBullet` for enemy bullets
with `spec.ownerId`. Find the owner by scanning the enemy pool (at most about 60). Cache the last `ownerId -> EnemyRT`,
because volleys spawn many bullets from one owner in the same step. No allocation.

Gun frame (`spr(keys.gun, x, y, gunFrame, ...)` instead of the hard-coded 0):

```ts
const ft = e.fireT;
const gunFrame = ft < 0.06 ? 1 : ft < 0.14 ? 2 : 0;
```

Muzzle flash: while `fireT < 0.1`, draw `fx_muzzle_e` (or `_l`, see the table) with
`frame = Math.min(2, (fireT * 30) | 0)` and `angle = fireDir - 90`. Position: take the muzzle offset `(mx, my)`, rotate
it by the body angle (`facing - 90` for air, 0 for ground bodies, `aimDeg - 90` for `_gun` muzzles), scale by PIXEL_SCALE,
add it to the enemy position, then push the sprite centre forward along `fireDir` by `frameH/2 * PIXEL_SCALE` (the
muzzle is the top-centre of the flash frame). When an offset row lists `±x`, draw at both points (or alternate per shot
using `e.id & 1`). Skip the flash for `isMissile` bullets (launch smoke is the engine's existing fx).

| id | muzzle offset(s) native px | flash |
|---|---|---|
| fighter_basic | (0, +10) | s |
| interceptor | (0, +12) | s |
| fighter_heavy | (0, +15) | l |
| bomber | (0, +15) nose; (0, -15) tail gunner when aiming up | s |
| drone_kamikaze | none (kamikaze) | - |
| missile_carrier | bay (0, +2); wing rails (±7, +8) (±11, +4) (±15, 0) | s |
| mine_layer | chute (0, -5) | none (mines) |
| helicopter | chin (0, +13); rocket pods (±6.5, +5) | s |
| gunship_light | chin (0, +12); pods (±5.4, +5) | s |
| shield_drone | (0, 0) | s |
| tank_light `_gun` | (0, +8) gun space | s |
| tank_heavy `_gun` | (0, +12) gun space | l |
| aa_turret `_gun` | (±1.5, +8) gun space | s |
| ice_turret `_gun` | (0, +8) gun space | s |
| citadel_turret `_gun` | (±2, +10) gun space | l |
| ice_walker `_gun` | (±2.5, +12) gun space | l |
| armored_vehicle | (0, +11) | s |
| gunboat | (0, +12) | s |
| destroyer | fore turret (±1, +20); aft turret (±1, -21) | l |
| sand_crawler | (0, +12) | s |
| missile_launcher | tubes (±2, +7) | missiles: none |
| sam_site | rails (±2.5, -7) | missiles: none |
| radar_station, military_base, hangar, oil_tank | (0, 0) when they shoot at all | s |

The `_gun` frame 1 already has a small flash drawn into the freed barrel rows. `fx_muzzle_e` is the bigger bloom drawn
on top of it, so draw both.

## 4. Destruction

### Air units: spin-out + debris
On `killEnemy` for `layer === "air"` (not boss parts): spawn one fx "spinout" (or reuse `wreck` with a flag) with
`sprite = keys.dmg ?? keys.base`, `frame = e.frame`, `life 0.55 s`, `vrot = ±(360..540) deg/s` (sign from `e.bank`, or
`e.id & 1`), `vx = e.vx*0.5`, `vy = e.vy*0.5 + 40`. Draw it at `scale = PIXEL_SCALE * (1 - 0.45 * p)` and
`opacity = 1 - p*p`. Draw it under the explosion. The explosion stays as is.
Debris: see below, 3 to 6 chunks.

### Debris chunks (existing `debris` fx)
Replace the rect fallback: `sprite = def.explosion === "l" ? "debris_l" : def.explosion === "m" ? "debris_m" : "debris_s"`,
`f.frame = spawnIndex & 3` (variant: 0 bent plate, 1 shard, 2 strut, 3 heavy chunk/track), draw with `angle = f.rot`
(give `vrot` 200..720 deg/s), `scale = PIXEL_SCALE`, `opacity = 1 - p*p` over the last 30 %. No tint.
Counts: s = 3, m = 4, l = 6 (mix in one `debris_m` for an `l` explosion).

### Ground units: burning wreck
At spawn of the `wreck` fx, set `f.frame = e.id % 3` (phase) and keep `w.sprite = keys.dead` as today. Also store
`keys.burn`, or derive it: give Fx a second string field `sprite2` set once at spawn. Draw:

```ts
const BURN_SECS = 5;               // wreck life is 8 s
if (f.t < BURN_SECS && f.sprite2 && this.info(f.sprite2))
  this.spr(f.sprite2, f.x, f.y, (((f.t * 10) | 0) + f.frame) % 3, PIXEL_SCALE, 0, a);
else this.spr(f.sprite, f.x, f.y, 0, PIXEL_SCALE, 0, a);
```

(`_burn` = the same wreck plus 1 to 5 flame tongues with smoke wisps, same frame size as `_dead`, so the swap is seamless.)
Optional: emit one `smoke` fx from the wreck every 0.35 s while burning (pooled).

## 5. Per-enemy summary

frames@fps of the base strip (bank and dmg strips identical). Idle/move = the base loop. "fire" = gun recoil and/or
muzzle flash (section 3). "damaged" = `_dmg` below 50 %. "death" = air: spin-out + debris; ground: explosion + debris +
`_burn` then `_dead`.

| id | size | base | bank | gun | burn | notes on the base loop |
|---|---|---|---|---|---|---|
| fighter_basic | 20x20 | 4@14 | yes | - | - | afterburner flicker, nav-light blink |
| interceptor | 16x24 | 4@16 | yes | - | - | burner flicker, wingtip strobe |
| fighter_heavy | 32x32 | 4@12 | yes | - | - | twin burners |
| bomber | 40x32 | 4@16 | yes | - | - | 4 props (offset phases), tail glint |
| drone_kamikaze | 12x12 | 4@10 | yes | - | - | warhead blink + exhaust |
| missile_carrier | 40x40 | 8@6 | yes | - | - | bay doors open/close, burners |
| mine_layer | 28x28 | 4@16 | yes | - | - | twin props, chute light |
| helicopter | 32x32 | 6@20 | yes | - | - | **reworked** rotor: blur disc, travelling rim dashes, smear blades; tail rotor pulses |
| gunship_light | 28x32 | 6@22 | yes | - | - | same rotor rework |
| shield_drone | 16x16 | 4@8 | - | - | - | core pulse |
| tank_light | 16x16 | 4@10 | - | 3 (state) | yes | tread scroll (rate follows ground speed, existing) |
| tank_heavy | 24x24 | 4@7 | - | 3 (state) | yes | tread scroll |
| aa_turret | 16x16 | 1 | - | 3 (state) | yes | |
| ice_turret | 16x16 | 1 | - | 3 (state) | yes | |
| citadel_turret | 20x20 | 1 | - | 3 (state) | yes | |
| ice_walker | 24x24 | 4@5 | - | 3 (state) | yes | leg stride |
| sand_crawler | 20x24 | 4@12 | - | - | yes | tyres + dust |
| armored_vehicle | 16x24 | 4@10 | - | - | yes | wheels |
| missile_launcher | 20x20 | 2@3 | - | - | yes | tube lights |
| sam_site | 20x20 | 1 | - | - | yes | |
| radar_station | 24x24 | 8@8 | - | - | yes | dish rotation |
| military_base | 48x48 | 2@2 | - | - | yes | beacon blink |
| hangar | 48x32 | 2@2 | - | - | yes | door lights |
| oil_tank | 28x28 | 1 | - | - | yes | |
| gunboat | 16x32 | 4@8 | - | - | yes | wake |
| destroyer | 24x64 | 4@6 | - | - | yes | wake, mast beacon |

## 6. Performance notes
- Every lookup is a cached string plus a `Map.get` (`registry.info`). There is no per-frame string building and no allocation.
- Frame math is integer only (`| 0`, `%`). Total added PNG: about 64 KB (sprites dir 133 KB -> 197 KB; 83 new files).
- The new `_gun` strips are 3 frames wide. Code that still passes frame 0 keeps working (rest pose).
