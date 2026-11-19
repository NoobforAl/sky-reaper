/**
 * Chapter 1 - PACIFIC "Operation Tidebreak". Forgiving; teaches the whole control set:
 * movement -> guns vs air -> bombs vs ground (naval) -> bracket legend -> immune ping -> pickups -> flares -> weapon swap.
 * Ground targets are ships plus an offshore platform (runway feature) with AA / radar / oil tanks.
 */
import type { ChapterScript } from "../types";
import { LANES, TL, medals } from "../builders";

const { L, C, R, LC, RC } = LANES;

export function pacific(): ChapterScript {
  const tl = new TL();

  // ---- 0-25 s: movement + guns
  tl.at(0).banner("OPERATION TIDEBREAK", "CHAPTER 1 - PACIFIC", 3200).tutorial("move");
  tl.at(4).line("fighter_basic", 3, C, { dx: 70 });
  tl.at(7).tutorial("fire_air");
  tl.at(9).vee("fighter_basic", 5, LC);
  tl.at(14).vee("fighter_basic", 5, RC);
  tl.at(18).stream("fighter_basic", 5, L, 450);
  tl.at(19.5).pickup("power", C);
  tl.at(21).stream("fighter_basic", 5, R, 450);

  // ---- 25-45 s: bombs vs ships, bracket legend
  tl.at(25).banner("SURFACE CONTACTS", "BOMBS SINK SHIPS", 2400).tutorial("bomb_ground");
  tl.at(26).pickup("bomb", LC).spawn("gunboat", LC);
  tl.at(29).spawn("gunboat", RC);
  tl.at(31).line("fighter_basic", 3, C, { dx: 90 });
  // QA #6: the starting bombs usually go on the two gunboats; restock before the legend / "switch to bombs" hints
  // (the runner also drops a bomb at the player if the stock is empty when a bomb hint shows)
  tl.at(32.5).pickup("bomb", C);
  tl.at(33).tutorial("legend");
  tl.at(33).feature("runway", 330, 420);
  tl.at(34.2).spawn("aa_turret", 300).spawn("radar_station", 365, undefined, -70);
  tl.at(35).spawn("oil_tank", 300, undefined, -150).spawn("oil_tank", 360, undefined, -170);
  tl.at(37).pickup("bomb", RC);
  // legend stays readable for the full HINT_SECONDS (7 s) before the immune hint replaces it
  tl.at(40.5).tutorial("immune");
  tl.at(39).arc("fighter_basic", 5, LC, { dx: 90 });
  tl.at(42).pickup("bomb", RC);
  tl.at(44).vee("fighter_basic", 5, C);

  // ---- 48-80 s: pickups, helicopters, first missile carrier + flares
  tl.at(48).banner("WAVE 2", "ESCORT GROUP", 2000).tutorial("pickups");
  tl.at(50).spawns("helicopter", [L + 20, R - 20]);
  tl.at(52).pickup("shield", C);
  tl.at(54).stream("fighter_basic", 6, LC, 380);
  tl.at(57).stream("fighter_basic", 6, RC, 380);
  tl.at(59).pickup("bomb", C);
  tl.at(61).spawn("gunboat", L + 30).spawn("gunboat", R - 30, undefined, -90);
  tl.at(64).spawn("missile_carrier", C);
  tl.at(65.5).tutorial("flares");
  tl.at(70).line("fighter_basic", 4, C, { dx: 80 });
  tl.at(73).spawn("destroyer", RC);
  tl.at(74).pickup("bomb", LC);
  tl.at(76).vee("fighter_basic", 5, LC);

  // ---- 80-120 s: weapon swap hint, side ambush, bombers
  tl.at(80).tutorial("weapons");
  tl.at(82).sideAmbush("interceptor", 4, "left", 150);
  tl.at(86).sideAmbush("interceptor", 4, "right", 210);
  tl.at(90).banner("WAVE 3", "BOMBER RUN", 2000);
  tl.at(91).spawn("bomber", LC).vee("fighter_basic", 3, LC, { y: -110 });
  tl.at(95).spawn("bomber", RC).vee("fighter_basic", 3, RC, { y: -110 });
  tl.at(99).pickup("power", C);
  tl.at(100).spawns("gunboat", [L + 40, C, R - 40]);
  tl.at(103).stream("fighter_basic", 5, L, 400).stream("fighter_basic", 5, R, 400);
  tl.at(108).spawn("missile_carrier", LC).spawn("helicopter", RC);
  tl.at(112).arc("fighter_basic", 7, C, { dx: 130 });
  tl.at(114).pickup("bomb", C);
  tl.at(116).spawn("destroyer", LC).spawn("gunboat", RC);

  // ---- 120-160 s: interceptors, second platform, mixed
  tl.at(121).banner("WAVE 4", "INTERCEPTORS", 2000);
  tl.at(122).spawns("interceptor", [LC, RC]);
  tl.at(125).vee("fighter_basic", 5, C);
  tl.at(128).feature("runway", 150, 520);
  tl.at(129.2).spawns("aa_turret", [125, 175]).spawn("missile_launcher", 150, undefined, -110);
  tl.at(130).spawn("radar_station", 150, undefined, -220).spawn("oil_tank", 120, undefined, -300);
  tl.at(131).pickup("bomb", 150);
  tl.at(134).stream("fighter_basic", 6, R, 350);
  tl.at(138).spawns("interceptor", [L, C, R]);
  tl.at(142).spawn("bomber", C).line("fighter_basic", 4, C, { dx: 70, y: -120 });
  tl.at(146).spawns("helicopter", [L + 30, C, R - 30]);
  tl.at(150).pickup("repair", C);
  tl.at(151).spawn("missile_carrier", RC).spawns("gunboat", [L + 30, LC]);
  tl.at(155).sideAmbush("interceptor", 5, "left", 180, 220);
  tl.at(156).sideAmbush("interceptor", 5, "right", 120, 220);

  // ---- 160-195 s: carrier group screen
  tl.at(162).banner("CARRIER GROUP AHEAD", "CLEAR THE SCREEN", 2400).pickup("bomb", C);
  tl.at(164).spawn("destroyer", L + 60).spawn("destroyer", R - 60, undefined, -120);
  tl.at(166).vee("fighter_basic", 7, C, { dx: 40 });
  tl.at(170).spawns("interceptor", [LC, RC]).pickup("power", C);
  tl.at(173).spawn("bomber", LC).spawn("bomber", RC, undefined, -100);
  tl.at(176).stream("fighter_basic", 6, L, 320).stream("fighter_basic", 6, R, 320);
  tl.at(181).spawn("missile_carrier", C).spawns("gunboat", [L + 40, R - 40]);
  tl.at(185).arc("fighter_basic", 7, C, { dx: 140 });
  tl.at(189).pickup("bomb", LC).pickup("bomb", RC).pickup("shield", C);

  // ---- boss
  tl.at(194).scroll(26);
  tl.at(196).tutorial("boss");
  tl.at(197).boss("carrier");

  return {
    def: {
      id: "pacific",
      index: 0,
      name: "PACIFIC",
      subtitle: "Operation Tidebreak",
      briefing:
        "An enemy carrier group is pushing across the Pacific. Learn your aircraft on the escorts: guns for aircraft, bombs for ships and ground targets. Then sink the carrier LEVIATHAN.",
      biome: "ocean",
      music: "pacific",
      scrollSpeed: 60,
      palette: { bg: "#0f3a5c", mid: "#17507a", accent: "#ffcc33", fg: "#e8f4ff" },
      events: tl.build(),
      boss: "carrier",
      objectives: [
        { id: "pac_naval", text: "Sink 4 ships", stat: "tag:naval", goal: 4, cmp: "gte", reward: 150 },
        { id: "pac_ground", text: "Destroy 10 ground or naval targets", stat: "groundKills", goal: 10, cmp: "gte", reward: 150 },
        { id: "pac_nodeath", text: "Finish without losing a life", stat: "deaths", goal: 0, cmp: "lte", reward: 250 },
      ],
      reward: 500,
      medalScores: medals([25500, 34500, 43000, 50500], 1.08),
    },
    features: tl.features,
  };
}
