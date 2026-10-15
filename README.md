# M&M Combat Log

Hand-entered combat data for working out what stats and skills do in Monsters and Memories.

## Why

The game doesn't publish its combat formulas, so questions like "what does +5 DEX do to my hit rate?" or "how much does AGI cut the hits I take?" have no answers beyond gut feel. This project collects swing-by-swing results from controlled tests (same mob, one change at a time) and turns them into hit rates, avoidance rates and average damage with honest error bars. Several people logging the same way adds up to answers none of us could get alone.

## Staying within the terms of service

We are trying hard to stay on the right side of the game's rules, which forbid automated combat parsing. So this project is deliberately manual:

- A person reads the in-game combat window and types what they see. Nothing here touches the game.
- No OCR, screenshots, screen readers, memory reading, packet capture, log scraping or macros, and no plans to add any.
- The tool is a standalone web page with no connection to the game client.

If the developers ask us to change or stop, we will. Please don't contribute data collected any other way.

## Using it in a browser

Everything runs in your browser. There's nothing to install and no server; your data stays on your computer until you choose to send a CSV.

1. On GitHub, click **Code → Download ZIP** and unzip it anywhere (or `git clone` the repo).
2. Double-click `index.html` to open the logger. Keep the tab open next to the game, or on a second monitor.
3. To analyze, open `analyze.html` (or follow the "analyzer" link in the logger) and drag CSV files onto it.

Any modern browser works (Chrome, Edge, Firefox). The logger autosaves in the browser you use, so stick to one browser and download a CSV at the end of each session. Clearing browser data, or using a private window, loses unsaved swings.

## Logging

1. Open `index.html`.
2. **Setup** tab: fill in your stats, skills, main-hand damage, the mob and its level, plus a short setup label (`base`, `dex+10`). Press **Apply**. Apply again whenever something changes; the `+1` buttons are for skill-ups.
3. **Log** tab: type entries and press Enter.

| Entry | Meaning |
|---|---|
| `14` | you hit for 14 |
| `m` | you miss |
| `d` `p` `b` | mob dodges / parries / blocks |
| `-22` | mob hits you for 22 |
| `-m` | mob misses you |
| `-d` `-p` `-b` | you dodge / parry / block |
| `14c` | critical hit |
| `o14`, `om` | offhand swing |
| `a30` | ability hit (excluded from melee stats) |
| `n` | next fight |
| `u` | undo last entry |

Several entries per line work: `14 m 12 -22 -d`.

4. **Data** tab: **Download CSV**.

## Contributing

Send your CSV to whoever is collecting, or put it in `data/`. File names include a session id and the analyzer skips duplicate rows, so sending the same session twice is harmless.

## Analysis

Open `analyze.html` and drop in one or more CSVs, from you or anyone else.

- **Filters:** pick a mob, mob level, contributor and hand. Compare setups against a single mob and level.
- **By setup:** your hit rate, average hit and crit rate, plus the mob's hit rate and average hit on you, with 95% intervals.
- **Compare:** choose a baseline setup and another one. Shows the difference in hit rate, miss/dodge/parry/block rates, average hit and damage per swing, with a 95% interval and p-value. If the interval spans zero, you need more data.

## Getting a clean answer

- Change one thing between setups. Keep weapon, buffs and mob level fixed.
- Alternate setups (A, B, A, B) instead of all A then all B.
- Weapon skill rises while you fight. Use a capped skill if you can; otherwise press `+1` on every skill-up so it gets recorded.
- Log melee only. Spells, songs and procs muddy the numbers; log abilities with `a` if at all.
- Swings needed per setup to detect a change in hit rate (around 70%): 10 points ≈ 300, 5 points ≈ 1,300, 2 points ≈ 8,000. Bigger stat changes are much cheaper to detect than +5.

## CSV columns

One row per swing: `schema_version, session_id, setup_version, fight, ts, actor (player|mob), kind (melee|ability), hand (main|off), result (hit|miss|dodge|parry|block), damage, crit`, followed by the setup in force at that swing: `contributor, setup_label, char_race, char_level, str, agi, dex, ac, weapon_skill, offense, defense, weapon_dmg, notes, mob_name, mob_level`. Offhand swings are assumed to use the same weapon skill as the main hand.
