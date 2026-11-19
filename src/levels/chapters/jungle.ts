/**
 * Chapter 2 - JUNGLE "Operation Green Hell". Air + ground mixed from here on.
 * River gunboats (snapped onto the river by the runner), hidden bases, AA nests, helicopter side ambush, road convoy.
 */
import type { ChapterScript } from "../types";
import { LANES, TL, medals } from "../builders";

const { L, C, R, LC, RC } = LANES;

export function jungle(): ChapterScript {
  const tl = new TL();

  tl.at(0).banner("OPERATION GREEN HELL", "CHAPTER 2 - JUNGLE", 3200);
  tl.at(3).vee("fighter_basic", 5, C);
  tl.at(6).spawns("tank_light", [L, R]);
  tl.at(8).stream("fighter_basic", 5, LC, 420);
  tl.at(10).spawn("gunboat", C);
  tl.at(12).spawns("aa_turret", [L + 10, R - 10]);
  tl.at(14).vee("fighter_basic", 5, RC);
  tl.at(17).pickup("bomb", C);
  tl.at(18).column("tank_light", 3, L + 20, { dy: 60 });
  tl.at(20).line("fighter_basic", 4, C, { dx: 80 });

  // ---- ambush from the canopy
  tl.at(25).banner("AMBUSH!", "HELICOPTERS ON THE FLANKS", 2000);
  tl.at(26).sideAmbush("helicopter", 3, "left", 140, 500);
  tl.at(29).sideAmbush("helicopter", 3, "right", 200, 500);
  tl.at(31).spawn("gunboat", LC).spawn("gunboat", RC, undefined, -100);
  tl.at(34).pickup("power", C);
  tl.at(35).arc("fighter_basic", 5, C, { dx: 110 });
  tl.at(38).spawns("aa_turret", [L, R]).spawn("missile_launcher", C, undefined, -80);
  tl.at(41).stream("interceptor", 3, LC, 700);

  // ---- hidden base #1
  tl.at(43).pickup("bomb", LC).pickup("bomb", RC);
  tl.at(45).banner("HIDDEN BASE", "BOMB THE HANGARS", 2200);
  tl.at(46).spawn("military_base", L + 50).spawn("hangar", R - 60, undefined, -60);
  tl.at(46.5).spawns("aa_turret", [L + 110, R - 120]);
  tl.at(48).pickup("bomb", LC).pickup("bomb", RC);
  tl.at(49).vee("fighter_basic", 5, C, { y: -80 });
  tl.at(52).spawn("radar_station", C, undefined, -60).spawns("tank_light", [LC, RC]);
  tl.at(55).stream("fighter_basic", 6, R, 350);
  tl.at(58).spawn("missile_carrier", LC);
  tl.at(60).spawn("gunboat", C);
  tl.at(62).vee("fighter_basic", 5, LC);

  // ---- road convoy
  tl.at(66).banner("CONVOY", "STOP THE SUPPLY TRUCKS", 2000);
  tl.at(67).convoy(R - 50, 5, 1100);
  tl.at(69).stream("fighter_basic", 5, L, 400);
  tl.at(72).spawns("gunship_light", [LC, RC]);
  tl.at(75).pickup("power", LC);
  tl.at(77).spawns("gunboat", [C, C]);
  tl.at(79).line("fighter_basic", 5, C, { dx: 70 });
  tl.at(83).spawns("tank_heavy", [L + 30]).spawns("aa_turret", [R - 30]);
  tl.at(86).stream("interceptor", 3, RC, 600);

  // ---- bombers over the river
  tl.at(91).banner("WAVE 3", "BOMBER FORMATION", 2000);
  tl.at(92).line("bomber", 2, C, { dx: 160 });
  tl.at(93).vee("fighter_basic", 5, C, { y: -140 });
  tl.at(97).spawns("gunboat", [C]).spawns("tank_light", [L, R]);
  tl.at(100).pickup("shield", C);
  tl.at(101).sideAmbush("interceptor", 5, "right", 160, 240);
  tl.at(104).spawn("missile_carrier", RC).spawns("aa_turret", [L + 20, LC]);
  tl.at(108).arc("fighter_basic", 7, C, { dx: 130 });
  tl.at(112).column("armored_vehicle", 3, L + 40, { dy: 56 });
  tl.at(114).spawns("helicopter_elite", [R - 40]);

  // ---- hidden base #2
  tl.at(117).pickup("bomb", LC).pickup("bomb", RC);
  tl.at(119).banner("JUNGLE STRONGHOLD", "BOMB THE BASES", 2000);
  tl.at(120).spawn("military_base", R - 60).spawn("hangar", L + 60, undefined, -80);
  tl.at(120.5).spawns("missile_launcher", [C]).spawns("aa_turret", [LC, RC]);
  tl.at(121).spawn("radar_station", R - 60, undefined, -170);
  tl.at(122).pickup("bomb", C).pickup("bomb", LC);
  tl.at(124).vee("fighter_basic", 5, C, { y: -60 });
  tl.at(128).stream("fighter_basic", 6, L, 320).stream("fighter_basic", 6, R, 320);
  tl.at(132).spawns("tank_heavy", [LC, RC]);
  tl.at(134).spawns("interceptor", [L, R]);
  tl.at(137).pickup("power", C);
  tl.at(138).spawns("gunboat", [C, C]);
  tl.at(141).spawn("missile_carrier", C).spawn("mine_layer", LC, undefined, -60);

  // ---- final push
  tl.at(146).banner("WAVE 5", "GUNSHIP ESCORT", 2000);
  tl.at(147).sideAmbush("helicopter", 3, "left", 120, 450);
  tl.at(147).sideAmbush("helicopter", 3, "right", 220, 450);
  tl.at(152).line("fighter_basic", 5, C, { dx: 70 });
  tl.at(155).spawns("aa_turret", [L, C, R]);
  tl.at(158).stream("interceptor", 4, C, 500);
  tl.at(161).spawn("bomber", LC).spawn("bomber", RC, undefined, -110);
  tl.at(164).column("tank_light", 4, R - 30, { dy: 54 }).pickup("bomb", RC);
  tl.at(167).arc("fighter_basic", 7, C, { dx: 140 });
  tl.at(171).spawns("gunboat", [C]).spawn("missile_carrier", LC);
  tl.at(175).vee("fighter_heavy", 3, C, { dx: 70, dy: 40 });
  tl.at(179).stream("fighter_basic", 6, L, 300).stream("fighter_basic", 6, R, 300);
  tl.at(184).spawns("helicopter", [LC, RC]).pickup("repair", C);
  tl.at(188).vee("fighter_basic", 7, C, { dx: 40 });
  tl.at(193).pickup("bomb", LC).pickup("power", RC).pickup("shield", C);

  tl.at(197).scroll(30);
  tl.at(200).boss("heli_gunship");

  return {
    def: {
      id: "jungle",
      index: 1,
      name: "JUNGLE",
      subtitle: "Operation Green Hell",
      briefing:
        "Enemy supply lines run along the river through dense jungle. Bases hide under the canopy and AA nests guard the banks. Cut the convoy, flatten the bases and bring down the gunship HORNET KING.",
      biome: "jungle",
      music: "jungle",
      scrollSpeed: 62,
      palette: { bg: "#1d3b1f", mid: "#2a5229", accent: "#9be36a", fg: "#eaf7d9" },
      events: tl.build(),
      boss: "heli_gunship",
      objectives: [
        { id: "jun_struct", text: "Destroy 2 bases or hangars", stat: "tag:base", goal: 2, cmp: "gte", reward: 200 },
        { id: "jun_aa", text: "Silence 8 AA guns", stat: "tag:aa", goal: 8, cmp: "gte", reward: 200 },
        { id: "jun_rate", text: "Destroy 60% of enemies", stat: "killRate", goal: 0.6, cmp: "gte", reward: 250 },
      ],
      reward: 700,
      medalScores: medals([32000, 43500, 54500, 64000], 0.95),
    },
    features: tl.features,
  };
}
