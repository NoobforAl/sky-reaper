# SKY REAPER

A retro vertical-scrolling military shoot-'em-up for the browser. Fly a lone fighter through five chapters - Pacific,
Jungle, Desert, Arctic and the Citadel - shooting down aircraft with your guns while bombing tanks, ships, bases and
missile sites below. Built with [KAPLAY](https://kaplayjs.com) + TypeScript + Vite and hosted on Cloudflare Workers.

## Features

- **Dual attack system** - air-to-air guns (Vulcan, Spread, Homing, Laser) and air-to-ground ordnance (Bomb, Rocket,
  Precision missile, Heavy bomb). Ground targets need bombs; on-screen brackets show what hurts what.
- **Flares** that destroy incoming guided missiles, a regenerating shield, and power-ups.
- **5 chapters**, each with its own biome, weather, objectives, medals and a multi-phase boss with destructible parts.
- **Progression** - earn credits, buy upgrades, unlock weapons and two extra aircraft (Raptor, Bulwark).
- **Skins** - paint schemes for every aircraft (Arctic, Desert, Nightfall, Crimson, Tiger, Gold), bought with credits in
  the Hangar; some unlock by clearing a chapter.
- **Full-screen desktop playfield** - on a landscape window the playfield widens to fill the screen (up to 1520 units
  wide) instead of a narrow letterboxed column. `?layout=portrait` forces the classic portrait field.
- **Mobile controls** - hold anywhere to fly *and* fire, lift to stop; icon buttons for bomb, flares, weapon swaps and
  pause, with cooldown and ammo shown on the icons. Full-screen mobile layout.
- **Keyboard, gamepad and touch** input; keys can be rebound in Settings.
- **Reduced motion** setting (follows the OS `prefers-reduced-motion` by default) for calmer menus and backgrounds.
- Optional **online leaderboard** (Cloudflare D1). The game is fully playable offline / without it.

## Controls

| Action | Keyboard | Gamepad (standard layout) | Touch |
|---|---|---|---|
| Move | WASD / arrow keys | Left stick / D-pad | Hold and drag anywhere (relative) |
| Air weapon (hold) | Space / J | A / RT | Fires while your finger is down |
| Bomb / ground weapon | K | B / X | BOMB icon |
| Flares | Shift | Y / RB | FLARE icon |
| Next air weapon | Q (previous) / E (next) | LB | Air-weapon icon |
| Next bomb type | R | LT / Back | Ordnance icon |
| Pause | Esc / P | Start | Pause icon (top bar) |

Keys can be rebound in Settings. Touch controls appear automatically on phones and tablets (Settings: auto / on / off);
an AUTO-FIRE setting keeps firing after you lift your finger.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev          # Vite dev server at http://localhost:5173 (no online leaderboard)
npm run build        # typecheck + production build into dist/
npm run preview      # serve dist/ with Vite
```

Full edge stack locally (Worker + static assets + local D1):

```bash
npm run db:migrate:local
npm run dev:edge     # build, then `wrangler dev` at http://localhost:8787
```

Other scripts: `npm run typecheck`, `npm run typecheck:worker`, `npm test` (Playwright).

## Deploy

```bash
npx wrangler login
npx wrangler d1 create sky-reaper      # paste database_id into wrangler.jsonc
npm run db:migrate:remote
npm run deploy
```

Step-by-step instructions, custom domains, troubleshooting and how to run without online features: [docs/DEPLOY.md](docs/DEPLOY.md).

## Project layout

```
src/
  main.ts          boot: kaplay(), services, scene registration
  contracts/       shared types & constants (single source of truth)
  core/            game scene, world simulation, rendering
  player/ weapons/ player ship, weapons, upgrades, aircraft
  enemies/ patterns/  enemy AI and bullet patterns
  levels/ bosses/  chapter timelines and boss controllers
  ui/ input/ save/ menus, HUD, controls, persistence
  assets/          sprite loading and audio
  net/             online leaderboard client (fails silently offline)
worker/            Cloudflare Worker (Hono): /api/health, /api/leaderboard, /api/score
migrations/        D1 SQL migrations
public/            static files (sprites, _headers cache rules)
docs/              architecture, deploy guide, QA report
tests/             Playwright tests
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design bible and module ownership.

## Credits

Art and audio sources, authors and licenses are listed in [ASSET_CREDITS.md](ASSET_CREDITS.md).

## License

Code: [MIT](LICENSE) (c) 2026 Sky Reaper contributors. Third-party assets keep their own licenses (see credits).
