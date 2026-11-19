# Asset requests

Append one line per new sprite/sfx: `key | native size | frames | description | requested by`

enemy_sam_site | 20x20 | 1 | ground SAM launcher pad, twin missile rails pointing up, sandy/olive camo | enemy
enemy_mine_layer | 28x28 | 2 | air: stubby twin-boom cargo plane with rear mine chute (prop blur frames) | enemy
enemy_sand_crawler | 20x24 | 2 | ground: desert dune buggy w/ roll cage + gun, tan; frames = wheel bounce | enemy
enemy_ice_walker | 24x24 | 2 | ground: small two-legged walker mech, white/ice-blue armour; frames = leg step | enemy
enemy_shield_drone | 16x16 | 2 | air: round cyan drone with glowing emitter core; frames = core pulse | enemy
enemy_gunship_light | 28x32 | 4 | air: light attack helicopter (smaller than enemy_helicopter), rotor frames | enemy
enemy_ice_turret_gun | 16x16 | 1 | rotating barrel overlay for enemy_ice_turret (barrel pointing RIGHT = 0deg) | enemy
enemy_citadel_turret_gun | 20x20 | 1 | rotating barrel overlay for enemy_citadel_turret (barrel pointing RIGHT = 0deg) | enemy
enemy_tank_light_gun | 16x16 | 1 | optional rotating turret overlay for tank_light (rotatesToPlayer) | enemy
enemy_tank_heavy_gun | 24x24 | 1 | optional rotating turret overlay for tank_heavy (rotatesToPlayer) | enemy
enemy_ice_walker_gun | 24x24 | 1 | optional rotating gun overlay for ice_walker (rotatesToPlayer) | enemy
note: elites (fighter_basic_elite, interceptor_elite, fighter_heavy_elite, helicopter_elite, tank_heavy_elite, missile_carrier_elite, bomber_elite) set `sprite` to the base enemy_<id> key; renderer may tint with def.color. No new art needed. | enemy
boss_carrier_turret_gun | 24x24 | 1 | OPTIONAL rotating barrel overlay for boss carrier turret (barrel pointing RIGHT = 0deg; part has rotatesToPlayer) | level
boss_carrier_aa_gun | 16x16 | 1 | OPTIONAL rotating barrel overlay for boss carrier AA mount | level
boss_land_fortress_turret_big_gun | 40x40 | 1 | OPTIONAL rotating cannon overlay for the fortress big turret | level
boss_land_fortress_turret_small_gun | 20x20 | 1 | OPTIONAL rotating barrel overlay for the fortress small turrets | level
note: all boss part keys used are exactly the ARCHITECTURE §3.5 table (boss_<id>_<part>, one key per part kind even when instanced x2/x4). Bodies drawn first (under parts): carrier hull, fortress body + treads, dreadnought hull; heli rotor and citadel ring are drawn OVER body/core (ring must stay hollow; ring rotates via facing). | level
note: bgtile_<biome>_b tiles currently do not blend seamlessly next to _a (hard square edges in ocean/jungle/arctic). Backgrounds use only _a until fixed (BG_TUNING.tileBChance = 0 in src/levels/backgrounds). Desert/arctic tiles are very bright; levels draw a darkening veil (BIOME_DIM) to keep bullets readable — slightly darker tiles would let us reduce it. | level
