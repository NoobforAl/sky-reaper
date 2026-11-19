# i18n keys requested by other owners

One line per key: `key | English | where used`. The i18n owner adds them to `src/i18n/locales/en.ts` (+ `fa.ts`).
Callers keep an English fallback, so a missing key never shows up raw.

**Status (round 5 merge, i18n owner): every key below is merged into `en.ts` + `fa.ts` (DONE).** New requests go
below a new heading; lines without `DONE` are still open.

## UI (round 5, re-checked by the UI owner)

Already in `en.ts` / `fa.ts` (added by the i18n owner) and used by src/ui: `menu.subtitle`, `settings.scorePopups`,
`settings.language`, `hud.threat`, `hud.enraged`, `hud.rapidAbbr`, `hud.overdriveAbbr`, `hud.magnetAbbr`,
`results.maxThreat`, `results.bombsFlaresShort`, `chapters.replayBonus` (label only; the amount is drawn separately
with `common.plusCredits`), `shop.swapTouch`. `settings.languageRow` and `chapters.replayBonusPlain` are withdrawn.

Were missing; now merged (the UI owner can delete the `src/ui/i18n.ts` EXTRA fallback table):

DONE menu.flightTimeHM | {h}H {m}M | src/ui/menu.ts wide pilot record, flight time (fa: {h} ساعت {m} دقیقه)
DONE menu.flightTimeM | {m}M | src/ui/menu.ts wide pilot record, flight time under an hour (fa: {m} دقیقه)
DONE settings.secondsShort | {n}S | src/ui/hud.ts wide HUD power-up timers "RAPID FIRE 8S" (fa: {n} ث)

## Level agent (round 5): boss escalation banners

All other boss / chapter / wave banner keys already exist in `en.ts` (I18N_STATUS section 6) and are wired in
`src/bosses/*` and `src/levels/chapters/*` through `tr()` from `src/levels/i18n.ts` (English fallback).

DONE bossBanner.enraged1 | BOSS ENRAGED | src/bosses/framework.ts (soft-timer escalation stage 1)
DONE bossBanner.enraged2 | ENRAGED II | src/bosses/framework.ts (escalation stage 2)
DONE bossBanner.enraged3 | ENRAGED III | src/bosses/framework.ts (escalation stage 3)

## Engine agent (round 5)

DONE banner.threat | THREAT {n} | src/core/world.ts threatBanner(): banner when the THREAT rank rises; {n} = "I" / "II" / "III" (keep the roman numeral Latin)
DONE upgrade.damage.desc | +10% weapon damage per level | TEXT CHANGE (BALANCE_SPEC U1), src/weapons/index.ts UPGRADES; was "+8% weapon damage per level"
DONE upgrade.fireRate.desc | +7% fire rate per level | TEXT CHANGE (BALANCE_SPEC U1); was "+6% fire rate per level"
DONE upgrade.hull.desc | +15 hull HP per level | TEXT CHANGE (BALANCE_SPEC U1); was "+10 hull HP per level"
DONE upgrade.shield.desc | +10 shield and faster regeneration per level | TEXT CHANGE (BALANCE_SPEC U1); was "+8 shield and faster regeneration per level"
