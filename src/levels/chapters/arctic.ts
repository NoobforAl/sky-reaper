/**
 * Chapter 4 - ARCTIC "Operation White Fang". Blizzards (gusting wind + snow), ice turrets on the floes,
 * warships in the open-water lead, an armoured train and a drone minefield before the ICE DREADNOUGHT.
 */
import type { ChapterScript } from "../types";
import { LANES, TL, medals } from "../builders";

const { L, C, R, LC, RC } = LANES;

export function arctic(): ChapterScript {
  const tl = new TL();
  // round 5 balance E1: 1.1 -> 1.4
  tl.setDefaults({ hpScale: 1.4 });

  tl.at(0).banner("OPERATION WHITE FANG", "CHAPTER 4 - ARCTIC", 3200, { key: "banner.operation", paramKeys: { name: ["chapter.arctic.opName", "WHITE FANG"] }, subKey: "banner.chapterIntro", subParams: { n: 4 }, subParamKeys: { name: ["chapter.arctic.name", "ARCTIC"] } });
  tl.at(3).vee("interceptor", 3, C, { dx: 60 });
  tl.at(5).spawns("ice_turret", [L + 20, R - 20]);
  tl.at(7).vee("fighter_basic", 7, LC, { dx: 34 });
  tl.at(10).spawn("destroyer", C);
  tl.at(12).stream("fighter_basic", 6, R, 320);
  // round 6: turrets kept off the open-water lead (sanity checkNaval structure warnings)
  tl.at(15).spawns("ice_turret", [LC, R]).spawn("radar_station", L + 30, undefined, -90);
  tl.at(17).pickup("bomb", C);
  tl.at(18).arc("fighter_basic", 7, C, { dx: 130 });
  tl.at(22).spawn("missile_carrier", LC).spawn("missile_carrier", RC, undefined, -120);
  tl.at(25).column("ice_walker", 2, L + 30, { dy: 70 });

  // ---- blizzard 1
  tl.at(29).banner("BLIZZARD", "VISIBILITY DROPPING", 2200, { key: "wave.arctic.blizzard", subKey: "wave.arctic.blizzard.sub" }).weather("blizzard", 0.6);
  tl.at(31).stream("interceptor", 4, LC, 500);
  tl.at(34).spawns("ice_turret", [L + 10, C + 30, R - 10]);
  tl.at(36).vee("fighter_heavy", 3, C, { dx: 70, dy: 40 });
  tl.at(40).sideAmbush("interceptor", 5, "left", 150, 220);
  tl.at(42).spawn("gunboat", C).spawn("gunboat", C, undefined, -110);
  tl.at(45).pickup("power", RC);
  tl.at(46).line("fighter_basic_elite", 6, C, { dx: 64 });
  // round 6 (#14): milder telegraphed blizzard gusts (about half the desert push)
  tl.at(32).gust(-1, 3, 0.3);
  tl.at(37.5).gust(1, 3, 0.32);
  tl.at(46.5).gust(-1, 2.5, 0.3);
  tl.at(50).weather("none", 0);

  // ---- armoured train
  tl.at(53).banner("ARMOURED TRAIN", "DERAIL IT", 2200, { key: "wave.arctic.train", subKey: "wave.arctic.train.sub" });
  tl.at(54).armouredTrain(R - 60, 7);
  tl.at(55).pickup("bomb", RC).pickup("bomb", R - 30);
  tl.at(57).stream("fighter_basic", 6, L, 300);
  tl.at(60).spawns("ice_turret", [LC]).spawn("aa_turret", C + 70, undefined, -60);
  tl.at(62).spawns("interceptor", [L, C]);
  tl.at(65).vee("fighter_basic", 5, LC);
  tl.at(68).spawn("bomber", C);
  tl.at(71).spawn("missile_carrier", L + 60);
  tl.at(74).arc("fighter_basic_elite", 7, C, { dx: 130 });

  // ---- drone minefield
  tl.at(79).banner("DRONE MINEFIELD", "SHOOT A PATH THROUGH", 2400, { key: "wave.arctic.minefield", subKey: "wave.arctic.minefield.sub" });
  tl.at(80).droneMinefield(4, 6);
  tl.at(83).spawns("ice_turret", [L, R + 30]);
  // round 5 balance P6: the t 86 shield pickup is gone
  tl.at(88).stream("interceptor", 3, RC, 500);
  // round 5 (#7): the faster gunboat leads the destroyer down the lead instead of spawning inside it
  tl.at(90).spawns("gunboat", [C]);
  tl.at(91).spawn("destroyer", C);
  tl.at(94).line("fighter_basic", 6, C, { dx: 64 });
  tl.at(96).column("armored_vehicle", 3, L + 40, { dy: 56 }).column("armored_vehicle", 2, R - 40, { dy: 56 });

  // ---- naval group in the lead
  tl.at(99).banner("ICEBREAKER GROUP", undefined, 2000, { key: "wave.arctic.icebreaker" });
  tl.at(100).spawn("destroyer", C).spawn("destroyer", C, undefined, -200);
  tl.at(101).spawns("ice_turret", [L + 20, R - 20]).spawns("missile_launcher", [C + 60]);
  tl.at(103).vee("fighter_heavy", 3, C, { dx: 70, dy: 40 });
  // round 5 balance P5: the power pickup that shared this beat is gone (2 scripted power-ups left)
  tl.at(106).pickup("bomb", C);
  tl.at(108).stream("fighter_basic", 7, L, 280).stream("fighter_basic", 7, R, 280);
  tl.at(112).spawns("helicopter", [LC, RC]);
  tl.at(115).spawns("ice_walker", [L + 30, R - 30]);
  tl.at(118).spawn("bomber", LC).spawn("bomber", RC, undefined, -100);

  // ---- blizzard 2 (strong)
  tl.at(123).banner("WHITEOUT", "HOLD YOUR LINE", 2200, { key: "wave.arctic.whiteout", subKey: "wave.arctic.whiteout.sub" }).weather("blizzard", 1).wind(-6);
  tl.at(125).sideAmbush("interceptor", 3, "right", 160, 450);
  tl.at(127).spawns("ice_turret", [LC, RC + 20]);
  tl.at(135).vee("fighter_basic_elite", 7, C, { dx: 40 });
  tl.at(132).spawn("missile_carrier_elite", C);
  // round 6: drone rows moved up (was t 135, swapped with the t 129 vee) so the end of the whiteout is free for gusts
  tl.at(129).droneMinefield(2, 5);
  tl.at(138).spawns("gunboat", [C]).pickup("repair", C);
  tl.at(141).arc("fighter_heavy", 3, C, { dx: 100 });
  // round 6 (#14): whiteout gusts once the t 118 bombers' carpet runs and the drone rows are over
  tl.at(137).gust(1, 2.5, 0.34);
  tl.at(140.5).gust(-1, 2.5, 0.32);
  tl.at(144).gust(1, 2, 0.3);
  tl.at(145).weather("blizzard", 0.4).wind(0);
  tl.at(146).stream("fighter_basic", 6, LC, 280);

  // ---- outpost & run-in
  tl.at(150).banner("POLAR OUTPOST", undefined, 2000, { key: "wave.arctic.outpost" }).weather("none", 0);
  tl.at(151).spawn("military_base", L + 60).spawn("radar_station", R - 50, undefined, -40);
  // round 5 (#7): ice turrets moved off the base (LC) and the radar (R - 50); round 6: the 290 turret and the hangar
  // sat on the lead -> second turret stacked above the first, hangar 10 u right
  tl.at(151.5).spawn("ice_turret", 210).spawn("ice_turret", 190, undefined, -110).spawn("ice_turret", R - 50, undefined, -90).spawn("hangar", R - 60, undefined, -160);
  tl.at(153).pickup("bomb", LC).pickup("bomb", RC);
  tl.at(155).stream("interceptor_elite", 4, C, 450);
  tl.at(158).line("fighter_basic", 6, C, { dx: 64, y: -90 });
  tl.at(162).spawns("missile_launcher", [L + 30, R - 30]);
  tl.at(165).vee("fighter_heavy", 3, C, { dx: 70, dy: 40 }).spawn("fighter_heavy_elite", C, undefined, -140);
  tl.at(169).spawn("destroyer", C).spawns("helicopter", [L + 40, R - 40]);
  tl.at(173).stream("fighter_basic_elite", 6, L, 280).stream("fighter_basic_elite", 6, R, 280);
  tl.at(177).spawn("bomber_elite", C).spawns("interceptor_elite", [LC, RC]);
  tl.at(181).spawns("ice_turret", [L, C, R]);
  tl.at(184).arc("fighter_basic", 9, C, { dx: 150 });
  tl.at(189).pickup("power", LC).pickup("bomb", RC).pickup("shield", C);
  tl.at(191).weather("blizzard", 0.35);

  tl.at(194).scroll(28);
  tl.at(197).boss("ice_dreadnought");

  return {
    def: {
      id: "arctic",
      index: 3,
      name: "ARCTIC",
      subtitle: "Operation White Fang",
      briefing:
        "Beyond the ice shelf the enemy is hiding its flying dreadnought. Blizzards cut visibility and gusts will drag you sideways. Derail the armoured train, punch through the drone minefield and ground the ICE DREADNOUGHT.",
      biome: "arctic",
      music: "arctic",
      scrollSpeed: 70,
      palette: { bg: "#34475c", mid: "#43586f", accent: "#7fe0ff", fg: "#f0faff" },
      events: tl.build(),
      boss: "ice_dreadnought",
      objectives: [
        { id: "arc_air", text: "Shoot down 90 aircraft", stat: "airKills", goal: 90, cmp: "gte", reward: 300 },
        { id: "arc_vehicle", text: "Destroy 7 armoured vehicles", stat: "tag:vehicle", goal: 7, cmp: "gte", reward: 250 },
        { id: "arc_flare", text: "Finish using 3 flares or fewer", stat: "flaresUsed", goal: 3, cmp: "lte", reward: 300 },
      ],
      // round 5: R1 reward 1100 -> 1300; M1 starting guess gold / ace x1.25 (re-derive from round-5 QA)
      reward: 1300,
      medalScores: medals([43000, 58500, 91500, 107500], 0.7),
    },
    features: tl.features,
    gusts: tl.gusts,
  };
}
