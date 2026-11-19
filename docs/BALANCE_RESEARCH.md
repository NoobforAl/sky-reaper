# Balance research and plan (round 5)

User report: "without upgrades I skipped 3 levels", so the game is too easy.

## What the research says
- **Balance the zero-upgrade game first.** Make the base game feel like "normal" with no upgrades. Then decide how many upgrades the player should have at each level, and tune prices and rewards so they arrive on time.
  Source: [Difficulty Balancing (wmelongames)](https://wmelongames.notion.site/Difficulty-Balancing-08ea6e1f9a6e4d43a9e58618558a6be9)
- **Currency, prices and damage gain are one system.** The Space Machine team spent most of their tuning time on exactly this link.
  Source: [Balancing the sh out of our shmup](https://gamedeveloper.com/design/balancing-the-sh-out-of-our-shmup)
- **Raise pressure with bullet density, bullet speed and wave pacing, not HP sponges.** Remove dead time between waves. Bosses that are hard only because of HP are boring.
  Sources: [gradual difficulty scaling](https://vikinghelmet99.itch.io/shoodemup/devlog/186347/gradual-difficulty-scaling), [design sins in shmups](https://nomadsreviews.co.uk/post/design-sins-and-pet-peeves-in-shoot-em-ups)
- **Player durability sets the bullet ceiling.** With a lot of HP, dense patterns stop mattering. To make the game harder, cut the player's tankiness rather than only adding bullets.
  Source: [Space shooters & more: tips for developers](https://community.flowlab.io/t/space-shooters-more-tips-for-developers/38750)
- **"Rank" (dynamic difficulty) is common in shmups.** The game watches how well the player is doing and adjusts: enemies fire faster and denser when the player is strong. A soft version that is visible to the player beats a hidden, punishing one.
  Sources: [Dynamic Difficulty (Giant Bomb)](https://giantbomb.com/wiki/Concepts/Dynamic_Difficulty), [Battle Garegga retrospective](https://retroxp.substack.com/p/past-meets-present-battle-garegga)

## Plan for SKY REAPER
1. **Upgrade budget per chapter.** The upgrade levels the player is expected to own at the start of each chapter are ch1 0, ch2 3, ch3 6, ch4 9 and ch5 12. Each budget should be reachable from that chapter's average earnings with one replay at most.
2. **Scale enemies to the budget.** Raise enemy HP gradually by chapter so that a ship with zero upgrades does about 40% less damage per second than the chapter assumes. Fire rate and bullet speed tiers (src/patterns/tiers.ts) go up one step per chapter.
3. **Cut player durability.**
   - Shorter invulnerability after a hit.
   - Slower shield recharge on the base ship.
   - Pickups drop less often from ch3 on.
   - Bombs no longer clear boss bullets for free.
4. **Bosses are gated by DPS, not by HP.** Each phase has a soft timer. If the player is under-powered, the boss's attack patterns escalate, so face-tanking fails.
5. **Light rank.** A visible "THREAT" level from 0 to 3 rises with long no-hit streaks and a high combo, and resets on death. Each level adds about 8% bullet speed and about 10% fire rate, and multiplies the score. Strong players get pressure; struggling players get relief.
6. **Verify with QA bots** (tests/qa/playtest.mjs):
   - no-dodge bot with zero upgrades fails by ch2;
   - novice bot with zero upgrades fails ch3;
   - novice bot with the budgeted upgrades clears ch3 to ch5 with 1 to 3 deaths;
   - expert bot dies 0 to 1 times.
