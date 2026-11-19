/**
 * Chapter 5 - CITADEL "Operation Last Light". Intense finale over the industrial fortress city:
 * dense mixed waves, citadel turrets, a drone minefield, a gauntlet of launchers and the CITADEL CORE.
 */
import type { ChapterScript } from "../types";
import { LANES, TL, medals } from "../builders";

const { L, C, R, LC, RC } = LANES;

export function citadel(): ChapterScript {
  const tl = new TL();
  tl.setDefaults({ hpScale: 1.2 });

  tl.at(0).banner("OPERATION LAST LIGHT", "CHAPTER 5 - CITADEL", 3200);
  tl.at(3).vee("fighter_basic_elite", 7, C, { dx: 34 });
  tl.at(5).spawns("citadel_turret", [L + 20, R - 20]);
  tl.at(7).stream("interceptor", 4, LC, 400);
  tl.at(9).stream("interceptor", 4, RC, 400);
  tl.at(12).spawns("citadel_turret", [LC, RC]).spawn("aa_turret", C, undefined, -70);
  tl.at(14).arc("fighter_basic", 9, C, { dx: 150 });
  tl.at(18).spawn("missile_carrier", LC).spawn("missile_carrier", RC, undefined, -110);
  tl.at(20).pickup("bomb", C);
  tl.at(22).vee("fighter_heavy", 3, C, { dx: 70, dy: 40 }).spawn("fighter_heavy_elite", C, undefined, -140);
  tl.at(26).column("tank_heavy", 2, L + 40, { dy: 80 }).column("tank_heavy", 2, R - 40, { dy: 80 });

  // ---- launcher gauntlet
  tl.at(30).banner("MISSILE GAUNTLET", "FLARES READY", 2200);
  tl.at(31).spawns("sam_site", [L + 20, R - 20]);
  tl.at(33).spawns("missile_launcher", [LC, RC]).spawn("radar_station", C, undefined, -80);
  tl.at(35).stream("fighter_basic_elite", 6, L, 280).stream("fighter_basic_elite", 6, R, 280);
  tl.at(38).spawns("citadel_turret", [C]).pickup("bomb", LC);
  tl.at(40).spawn("missile_carrier", C);
  tl.at(43).sideAmbush("interceptor", 4, "left", 160, 350);
  tl.at(45).sideAmbush("interceptor", 4, "right", 230, 350);
  tl.at(48).pickup("power", C);
  tl.at(49).line("fighter_heavy", 3, C, { dx: 110 }).spawn("shield_drone", C, undefined, -120);

  // ---- drone minefield
  tl.at(54).banner("DRONE SWARM", undefined, 2000);
  tl.at(55).droneMinefield(5, 6);
  tl.at(58).spawns("citadel_turret", [L, R]);
  tl.at(62).spawns("aa_turret", [LC, RC]).pickup("shield", C);
  tl.at(64).stream("interceptor", 5, C, 380);
  tl.at(68).vee("fighter_basic_elite", 9, C, { dx: 30 });

  // ---- factory district
  tl.at(73).banner("FACTORY DISTRICT", "BOMB THE PRODUCTION LINES", 2200);
  tl.at(74).spawn("military_base", L + 60).spawn("military_base", R - 60, undefined, -150);
  tl.at(74.5).spawns("hangar", [C]).spawns("oil_tank", [L + 20, R - 20]);
  tl.at(75).spawns("citadel_turret", [LC, RC]);
  tl.at(76).pickup("bomb", LC).pickup("bomb", RC);
  tl.at(78).stream("fighter_basic", 7, LC, 260);
  tl.at(81).spawn("bomber", C).line("fighter_heavy", 2, C, { dx: 160, y: -100 });
  tl.at(85).convoy(R - 60, 5, 1100);
  tl.at(88).spawns("helicopter_elite", [L + 40, LC]);
  tl.at(91).arc("fighter_basic", 9, C, { dx: 150 });
  tl.at(95).spawns("missile_launcher", [L + 30]).pickup("power", C);

  // ---- heavy air
  tl.at(100).banner("WAVE 6", "HEAVY ESCORT", 2000);
  tl.at(101).vee("fighter_heavy_elite", 3, C, { dx: 70, dy: 40 });
  tl.at(104).spawn("bomber_elite", LC).spawn("bomber", RC, undefined, -100);
  tl.at(107).stream("interceptor_elite", 5, L, 350).stream("interceptor_elite", 5, R, 350);
  tl.at(111).spawns("citadel_turret", [L + 20, C, R - 20]);
  tl.at(114).spawn("missile_carrier", LC).spawn("missile_carrier", RC);
  tl.at(117).pickup("repair", C);
  tl.at(118).sideAmbush("interceptor", 6, "left", 140, 200);
  tl.at(118).sideAmbush("interceptor", 6, "right", 240, 200);
  tl.at(123).droneMinefield(3, 6);

  // ---- armoured train through the citadel yards
  tl.at(128).banner("ARMOURED TRAIN", undefined, 2000);
  tl.at(129).armouredTrain(L + 70, 8);
  tl.at(130).pickup("bomb", L + 70).pickup("bomb", LC);
  tl.at(132).spawns("citadel_turret", [RC, R - 20]);
  tl.at(134).vee("fighter_basic_elite", 9, RC, { dx: 30 });
  tl.at(138).spawn("missile_carrier", R - 60);
  tl.at(141).stream("interceptor", 5, RC, 330);
  tl.at(145).arc("fighter_heavy", 5, C, { dx: 140 });

  // ---- final approach
  tl.at(150).banner("CITADEL WALLS", "NO WAY BACK", 2400);
  tl.at(151).line("citadel_turret", 4, C, { dx: 110 });
  tl.at(152).spawns("aa_turret", [L + 20, R - 20]).spawn("radar_station", C, undefined, -140);
  tl.at(153).pickup("bomb", LC).pickup("bomb", RC);
  tl.at(155).stream("fighter_basic_elite", 7, L, 260).stream("fighter_basic_elite", 7, R, 260);
  tl.at(159).spawns("missile_launcher", [LC, RC]);
  tl.at(162).vee("fighter_heavy", 5, C, { dx: 56, dy: 40 });
  tl.at(166).droneMinefield(3, 5).spawn("mine_layer", C, undefined, -40);
  tl.at(170).spawn("bomber", C).spawns("interceptor", [L, R]);
  tl.at(174).spawns("tank_heavy_elite", [LC, RC]).spawns("citadel_turret", [C]);
  tl.at(177).arc("fighter_basic_elite", 11, C, { dx: 160 });
  tl.at(181).spawn("missile_carrier_elite", LC).spawn("missile_carrier", RC);
  tl.at(185).stream("interceptor_elite", 6, C, 300);
  tl.at(190).pickup("power", LC).pickup("bomb", RC).pickup("shield", C).pickup("repair", C, -60);

  tl.at(194).scroll(20);
  tl.at(198).boss("citadel_core");

  return {
    def: {
      id: "citadel",
      index: 4,
      name: "CITADEL",
      subtitle: "Operation Last Light",
      briefing:
        "This is it: the enemy citadel, a city of furnaces, launchers and drone hives wrapped around the CITADEL CORE. Everything they have left is waiting. Break the walls, survive the swarm and destroy the core.",
      biome: "citadel",
      music: "citadel",
      scrollSpeed: 75,
      palette: { bg: "#16181f", mid: "#23262f", accent: "#ff4060", fg: "#f2f2f2" },
      events: tl.build(),
      boss: "citadel_core",
      objectives: [
        { id: "cit_kills", text: "Destroy 170 enemies", stat: "kills", goal: 170, cmp: "gte", reward: 400 },
        { id: "cit_struct", text: "Destroy 10 structures", stat: "tag:structure", goal: 10, cmp: "gte", reward: 300 },
        { id: "cit_deaths", text: "Lose at most 1 life", stat: "deaths", goal: 1, cmp: "lte", reward: 500 },
      ],
      reward: 1500,
      medalScores: medals([61000, 83000, 103500, 122000], 0.85),
    },
    features: tl.features,
  };
}
