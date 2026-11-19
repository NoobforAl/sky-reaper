# Farsi (fa) style guide: short, natural, gamer-friendly

The user asked for Farsi that is short and modern, like a game, not a classic novel. Words also must not turn into awkward or rude Farsi.

Research notes:
- Localisation is not literal translation: the dictionary meaning and the way native speakers use a word can differ ([Digikala Mag](https://www.digikala.com/mag/the-trials-and-tribulations-of-video-game-localization/)).
- Weak localisation spoils the game and becomes a meme (same source).
- Game titles often have no smooth Persian form, and Latin text inside Persian looks bad ([Digikala Mag: game titles](https://www.digikala.com/mag/on-the-challenges-of-translating-game-titles-to-persian/)).
- Common game localisation mistakes are drifting away from brevity, wrong slang, missing context, and translators who don't play games. UI boxes are small ([Andovar](https://www.andovar.com/15-common-game-localization-problems)).
- Text overflow is the most common localisation bug ([bugnet](https://bugnet.io/blog/common-game-localization-mistakes)).
- Farsi game terms are often borrowed from English and respelled ([all-in.global](https://all-in.global/blog/language/farsi-fa/)).

## Rules
1. **Length.** A Farsi string may be at most about 1.2× the English character count. Labels and buttons use 1–2 words. Hints use one short sentence. No preambles such as «لطفاً توجه داشته باشید که …».
2. **Register.** Use modern written standard Farsi, neutral and direct.
   - Buttons use a noun or a short verb: «شروع»، «ادامه»، «تنظیمات»، «خرید».
   - Hints use short singular imperatives: «بمب بنداز!»، «منور بزن!».
   - Do not use colloquial spellings such as «میشه»، «بزنی‌ش».
3. **No literary or bureaucratic Farsi.** Avoid «می‌بایست»، «مبادرت ورزیدن»، «خواهشمند است»، «اینجانب»، «گردید»، «نمودن» (use «کردن»)، «جهت» (use «برای»)، «فلذا»، «مزبور» and heavy Arabic phrasing.
4. **Avoid religious and political terms entirely**, for example «شهید»، «جهاد»، «کافر» and real country, army or leader names. Enemies are fictional.
5. **Enemies are destroyed, not murdered.** Use «نابود»، «منهدم» or «سرنگون» (for aircraft). Never use «قتل»، and avoid «کشتن» for enemies.
6. **Transliteration safety.** Any English word written in Persian letters (names, loanwords) must be checked so it does not form or contain a vulgar Persian word. An automated blocklist check enforces this (tests/i18n). When in doubt, translate the word or keep it in Latin.
7. **Do not double-translate.** "Fire" is «شلیک» (shooting), not «آتش» (flames). "Credits" (money) is «سکه». "Credits" (people who made the game) is «سازندگان». "Flare" is «منور», the military term, not «شعله».
8. **Numbers and keys stay left-to-right.** Write `+150`, `x1.5`, `WASD` and `ESC` in Latin. Western digits are the default.
9. **Write zero-width non-joiners correctly** (U+200C): «می‌کند»، «آپگریدها»، «سلاح‌ها».

## Glossary (use these exactly)
| EN | FA | Note |
|---|---|---|
| SKY REAPER (logo) | keep Latin **SKY REAPER** + small subtitle «جنگنده‌ی آسمان» | «داس آسمان» sounds literary and odd |
| Play / Start | شروع | |
| Continue | ادامه | |
| Pause | توقف | |
| Settings | تنظیمات | |
| Shop / Hangar | آشیانه | Hangar screen name; "buy" is «خرید» |
| Upgrade | ارتقا | |
| Chapter | فصل | |
| Mission | مأموریت | |
| Boss | غول آخر | Classic Iranian gamer term; boss bar label is «غول آخر» |
| Wave | موج | |
| Score / Points | امتیاز | |
| High score | رکورد | |
| Combo | کمبو | |
| Credits (money) | سکه | |
| Lives | جان | |
| Shield | سپر | |
| Bomb | بمب | |
| Rocket / Missile | راکت / موشک | |
| Flare | منور | |
| Guns (air weapons) | مسلسل | |
| Air / Ground target | هوایی / زمینی | |
| Enemy destroyed | نابود شد | |
| Mission complete | مأموریت انجام شد | |
| Game over | باختی! | Short and game-like |
| Victory | پیروزی | |
| Medal: Ace | آس | |
| Threat (rank) | خطر | |
| Missile lock! | قفل موشک! | |
| Warning | هشدار | |
| Back | برگشت | |
| Volume / Music / Sound | صدا / موسیقی / افکت | |
