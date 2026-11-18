# Rules for every agent (SKY REAPER)

- Project: KAPLAY 3001 + TypeScript + Vite vertical shmup in `B:\Projects\airfight-game` (Windows; Bash tool uses POSIX syntax; write files with the Write tool, avoid giant heredocs).
- READ FIRST, fully: `docs/ARCHITECTURE.md` and every file in `src/contracts/`. Contracts are law: never edit them; append requests to `docs/CONTRACT_REQUESTS.md` and keep working with the current contract.
- Work ONLY inside the directories you own (see ARCHITECTURE.md §2). Other agents edit other directories concurrently. Never run mutating git commands (the Orchestrator commits).
- Typecheck only your own dirs, e.g. `npx tsc --noEmit 2>&1 | grep -E "^src/(yourdir)"` — other agents' files may be mid-edit.
- Other modules may still be stubs: code against the contract types, add graceful fallbacks, and re-check their files periodically.
- Browser testing: `npm run dev` (pick a free port with `--port` if 5173 is taken) and the Playwright MCP tools (`mcp__plugin_playwright_playwright__*`, load via ToolSearch). Check the console for errors. QA hook: `window.__sky` (see `SkyDebug` in contracts/state.ts).
- BROWSER NOTE: the Playwright MCP browser / system Chrome may fail to start (exit 13). Playwright's bundled headless Chromium IS installed and works: write a small Node script using `import { chromium } from '@playwright/test'` (`chromium.launch()`), point it at the dev server, use `page.screenshot({path})` into your scratch dir, then Read the PNG.
- Do not bypass download blocks (kenney.nl returns 403 to scripts — leave it alone).
- Finish with a concise report: what you built, known issues, contract requests.
