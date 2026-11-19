/**
 * Chapter 3 - DESERT "Operation Dust Devil". Sandstorms (wind gusts + reduced visibility), oil fields,
 * armoured columns, a sandstorm raid and a fortified convoy before the LAND FORTRESS.
 */
import type { ChapterScript } from "../types";
import { LANES, TL, medals } from "../builders";

const { L, C, R, LC, RC } = LANES;

export function desert(): ChapterScript {
  const tl = new TL();
  // difficulty curve (round 3): ch3 is the first "real" chapter: a little tougher units + ace wings mixed in
  tl.setDefaults({ hpScale: 1.05 });

  tl.at(0).banner("OPERATION DUST DEVIL", "CHAPTER 3 - DESERT", 3200);
  tl.at(3).vee("fighter_basic", 5, C);
  tl.at(5).column("tank_light", 3, L + 30, { dy: 60 });
  tl.at(7).column("tank_light", 3, R - 30, { dy: 60 });
  tl.at(9).stream("interceptor", 3, C, 600);
  tl.at(12).spawns("aa_turret", [LC, RC]);
  tl.at(14).line("fighter_basic", 5, C, { dx: 70 });

  // ---- oil field
  tl.at(18).banner("OIL FIELD", "TANKS BURN BRIGHT", 2000);
  tl.at(19).spawns("oil_tank", [L + 20, LC, RC + 10]).spawn("oil_tank", R - 20, undefined, -100);
  tl.at(19.5).spawns("oil_tank", [C], undefined, -160).spawn("aa_turret", C, undefined, -60);
  tl.at(21).pickup("bomb", C);
  tl.at(22).vee("fighter_basic", 5, LC, { y: -60 });
  tl.at(25).spawn("sam_site", R - 40).spawn("missile_launcher", L + 40, undefined, -90);
  tl.at(28).stream("fighter_basic", 6, R, 330);
  tl.at(31).spawn("bomber", C);
  tl.at(33).spawns("tank_heavy", [LC]).pickup("power", RC);

  // ---- first sandstorm
  tl.at(37).banner("SANDSTORM", "WATCH THE CROSSWIND", 2200).weather("sandstorm", 0.55).tutorial("wind");
  tl.at(40).stream("fighter_basic", 5, L, 400);
  tl.at(43).spawns("sand_crawler", [C, LC, RC]);
  tl.at(46).arc("fighter_basic_elite", 5, C, { dx: 100 });
  tl.at(49).spawn("helicopter", R - 50).spawn("helicopter", L + 50, undefined, -80);
  tl.at(52).spawns("aa_turret", [L + 20, R - 20]);
  tl.at(56).weather("none", 0);
  tl.at(57).pickup("shield", C);

  // ---- fortified convoy
  tl.at(60).banner("ARMOURED CONVOY", undefined, 2000);
  tl.at(61).convoy(LC - 20, 6, 1300);
  tl.at(63).vee("fighter_basic", 5, RC);
  tl.at(66).spawns("interceptor", [R - 30, RC]);
  tl.at(68).pickup("bomb", LC);
  tl.at(70).spawn("missile_carrier", RC);
  tl.at(73).stream("fighter_basic_elite", 5, R, 340);
  tl.at(76).spawns("tank_heavy", [RC]).spawn("aa_turret", R - 30, undefined, -80);
  tl.at(79).line("fighter_basic", 5, C, { dx: 70 });

  // ---- desert base
  tl.at(84).banner("FORWARD AIRBASE", "HIT THE HANGARS BEFORE THEY LAUNCH", 2200);
  tl.at(84).feature("runway", 120, 700);
  tl.at(85.5).spawn("hangar", 120).spawn("hangar", 120, undefined, -260);
  tl.at(86).spawn("military_base", R - 70, undefined, -100).spawns("aa_turret", [200, 200]);
  tl.at(87).spawn("radar_station", R - 50, undefined, -260);
  tl.at(88).pickup("bomb", 120).pickup("bomb", R - 70);
  tl.at(89).stream("fighter_basic", 5, 120, 500);
  tl.at(92).spawns("interceptor", [LC, RC]);
  tl.at(95).spawns("missile_launcher", [C]);
  tl.at(97).vee("fighter_heavy", 3, C, { dx: 70, dy: 40 });
  tl.at(101).stream("fighter_basic", 6, L, 300).stream("fighter_basic_elite", 5, R, 320);
  tl.at(105).pickup("power", C);

  // ---- sandstorm raid (special encounter)
  tl.at(110).banner("SANDSTORM RAID", "CONTACTS IN THE DUST", 2400).weather("sandstorm", 0.95).wind(18);
  tl.at(113).sideAmbush("interceptor", 3, "left", 140, 500);
  tl.at(115).droneMinefield(2, 5);
  tl.at(118).sideAmbush("interceptor", 3, "right", 220, 500);
  tl.at(120).column("tank_heavy", 2, C, { dy: 80 }).spawns("tank_light", [L + 20, R - 20]);
  tl.at(123).spawn("bomber_elite", LC).spawn("bomber", RC, undefined, -120);
  tl.at(126).spawns("missile_carrier", [C]);
  tl.at(129).stream("fighter_basic_elite", 5, LC, 320);
  tl.at(132).spawns("aa_turret", [L, R]).pickup("repair", C);
  tl.at(135).weather("sandstorm", 0.3).wind(0);
  tl.at(136).vee("fighter_basic", 7, C, { dx: 40 });
  tl.at(140).weather("none", 0);

  // ---- run-in to the fortress
  tl.at(143).banner("WAVE 6", "ARMOUR SCREEN", 2000);
  tl.at(144).line("sand_crawler", 5, C, { dx: 80 });
  tl.at(146).stream("interceptor", 4, R, 500);
  tl.at(149).spawns("oil_tank", [L + 20, L + 70]).spawns("missile_launcher", [R - 40]);
  tl.at(152).arc("fighter_basic_elite", 7, C, { dx: 140 });
  tl.at(155).spawn("helicopter", LC).spawn("helicopter", RC).pickup("bomb", C);
  tl.at(158).column("armored_vehicle", 4, R - 40, { dy: 56 });
  tl.at(161).vee("fighter_heavy", 3, LC, { dx: 70, dy: 40 }).spawn("shield_drone", LC, undefined, -150);
  tl.at(165).spawns("tank_heavy", [L + 40, R - 40]).spawns("sam_site", [C]);
  tl.at(168).stream("fighter_basic", 6, L, 280).stream("fighter_basic", 6, R, 280);
  tl.at(172).spawn("missile_carrier", LC).spawn("bomber", RC);
  tl.at(176).line("fighter_basic_elite", 6, C, { dx: 64 });
  tl.at(180).spawns("interceptor", [L, C, R]);
  tl.at(184).pickup("power", LC).pickup("bomb", RC).pickup("shield", C);
  tl.at(186).weather("sandstorm", 0.35);

  tl.at(190).scroll(24);
  tl.at(193).boss("land_fortress");

  return {
    def: {
      id: "desert",
      index: 2,
      name: "DESERT",
      subtitle: "Operation Dust Devil",
      briefing:
        "The enemy's armour corps hides in the dunes and its oil fields fuel the war machine. Sandstorms will push you around and hide incoming fire. Burn the oil, break the convoy and stop the LAND FORTRESS.",
      biome: "desert",
      music: "desert",
      scrollSpeed: 66,
      palette: { bg: "#6e5434", mid: "#7d6140", accent: "#ffb347", fg: "#fff3dc" },
      events: tl.build(),
      boss: "land_fortress",
      objectives: [
        { id: "des_ground", text: "Destroy 35 ground targets", stat: "groundKills", goal: 35, cmp: "gte", reward: 250 },
        { id: "des_oil", text: "Burn 5 oil tanks", stat: "tag:fuel", goal: 5, cmp: "gte", reward: 200 },
        { id: "des_dmg", text: "Take less than 150 damage", stat: "damageTaken", goal: 150, cmp: "lte", reward: 300 },
      ],
      reward: 900,
      medalScores: medals([39000, 52500, 65500, 76000], 0.88),
    },
    features: tl.features,
  };
}
