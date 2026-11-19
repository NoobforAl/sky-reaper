# Deploy on ArvanCloud Edge Computing

SKY REAPER is a static game: `vite build` produces about 0.9 MB in `dist/`. `scripts/arvan/build-bundle.mjs` packs it into one ArvanCloud Edge Computing script, `dist-arvan/bundle.js` (about 1 MB). The script is a service-worker "fetch" handler that serves the game from memory:
- every file is served with the right `Content-Type`;
- hashed `/assets/*` files are cached for a year (`immutable`);
- HTML is sent with `no-cache`, so a new deploy shows up immediately;
- other files are cached for one hour;
- any other path falls back to `index.html`;
- a missing asset returns a real 404;
- `/api/*` returns a JSON 503. The online leaderboard is optional and the game handles it being offline.

## One-time setup
1. Install ArvanCLI: the Windows binary is kept in `temp/arvan.exe`, which is gitignored.
2. Log in in a real terminal: `temp\arvan.exe auth login`. Check it with `temp\arvan.exe auth whoami`.
   The CLI crashes with a `GetTTY` nil-pointer panic when it runs without a console, for example from scripts or CI. Run it in Windows Terminal or PowerShell, or through a pseudo-console wrapper such as `pywinpty`.

## Deploy
```
npm run deploy:arvan
```
This runs `tsc`, `vite build`, `node scripts/arvan/build-bundle.mjs dist dist-arvan/bundle.js` and `arvan ec deploy -f dist-arvan/bundle.js sky-reaper`. Run the same command again to update the app.

Other useful commands:
- `temp\arvan.exe ec list` lists the apps.
- `temp\arvan.exe ec log <app-id>` shows the logs.
- `temp\arvan.exe ec delete` removes the app.

## Give it a public address (ArvanCloud panel)
The CLI only uploads the script. To make it reachable:
1. Go to panel.arvancloud.ir, then CDN, and add or select your domain. Its DNS must point to ArvanCloud.
2. Open Edge Computing (or Edge Functions) for that domain. Attach the app `sky-reaper` to a route, for example `game.<your-domain>/*` or `<your-domain>/*`.
3. Turn on HTTPS for the domain.
4. Open the address. The game should load, and `/api/leaderboard` should return `{"error":"leaderboard offline"}`.

## Test locally before deploying
```
npm run build:arvan
```
The bundle needs only `addEventListener`, `Request`, `Response`, `Headers`, `URL` and `atob`.

## Online leaderboard (optional, later)
The Cloudflare Worker + D1 API in `worker/` does not run on Arvan Edge Computing as-is. Two options:
- host that API elsewhere and build the game with `VITE_API_BASE=https://<api-host>`; the API's `ALLOWED_ORIGINS` must include the game's address;
- port it to an ArvanCloud service later.

Without the API the game is fully playable.

## Alternative
`docs/DEPLOY.md` describes the Cloudflare Workers deployment (`npm run deploy`).
