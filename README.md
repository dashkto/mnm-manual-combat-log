# M&M Combat Log

Hand-entered combat data for working out what stats and skills do in Monsters and Memories.

- **[Logger](https://dashkto.github.io/mnm-manual-combat-log/)**: log your swings while you play.
- **[Analyzer](https://dashkto.github.io/mnm-manual-combat-log/analyze.html)**: see what stats do across everyone's shared logs.
- **[Shared logs](data/)**: every contributed CSV.

## Why

The game doesn't publish its combat formulas, so questions like "what does +5 DEX do to my hit rate?" or "how much does AGI cut the hits I take?" have no answers beyond gut feel. This project collects swing-by-swing results from controlled tests (same mob, one change at a time) and turns them into hit rates and average damage with honest error bars. Several people logging the same way adds up to answers none of us could get alone.

## Staying within the terms of service

We are trying hard to stay on the right side of the game's rules, which forbid automated combat parsing. So this project is deliberately manual:

- A person reads the in-game combat window and types what they see. Nothing here touches the game.
- No OCR, screenshots, screen readers, memory reading, packet capture, log scraping or macros, and no plans to add any.
- The tool is a standalone web page with no connection to the game client.

If the developers ask us to change or stop, we will. Please don't contribute data collected any other way.

## Using it in a browser

Everything runs in your browser. There's nothing to install and no server; your data stays on your computer until you choose to share a CSV.

1. Open the **[Logger](https://dashkto.github.io/mnm-manual-combat-log/)**. Keep the tab open next to the game, or on a second monitor.
2. Open the **[Analyzer](https://dashkto.github.io/mnm-manual-combat-log/analyze.html)**. It loads all the shared logs automatically; drop in your own CSVs to include them too.

Each page links to the other in its header. To use it offline, click **Code → Download ZIP** on GitHub, unzip it, and open `index.html` or `analyze.html`.

Any modern browser works (Chrome, Edge, Firefox). The logger autosaves in the browser you use, so stick to one browser and download a CSV at the end of each session. Clearing browser data, or using a private window, loses unsaved swings.

## Logging

1. Open `index.html`.
2. **Setup** tab: fill in your stats, skills, main-hand damage, the mob and its level, plus a short setup label (`base`, `dex+10`). Press **Apply**. Apply again whenever something changes; the `+1` buttons are for skill-ups.
3. **Log** tab: type entries and press Enter.

| Entry | Meaning |
|---|---|
| `14` | you hit for 14 |
| `m` | you miss (dodges, parries and blocks count as misses) |
| `-22` | mob hits you for 22 |
| `-m` | mob misses you |
| `n` | next fight |
| `u` | undo last entry |

Several entries per line work: `14 m 12 -22 -m`.

4. **Data** tab: **Download CSV**.

## Contributing

Logs are added by pull request and reviewed before merging.

1. Download your CSV from the logger's **Data** tab. Don't rename or edit it.
2. On GitHub, open the `data/` folder and click **Add file → Upload files**. GitHub forks the repo for you.
3. Drop in your CSV and choose **Create a new branch … and start a pull request**. The CSV holds everything needed; no description required.

Only manually entered logs are accepted (see [Staying within the terms of service](#staying-within-the-terms-of-service)).

## Analysis

Open the **[Analyzer](https://dashkto.github.io/mnm-manual-combat-log/analyze.html)**. It pulls every CSV from the [shared logs](data/) automatically; offline, click **Load all logs from the repo** instead. Drop in any number of your own CSVs to add them. Everything loaded is pooled, and duplicate rows are skipped.

- **Filters:** narrow to a mob, mob level or contributor.
- **Effects:** one panel per outcome, each fitted to the factors assumed to drive it plus mob level:

  | Outcome | Your side | Mob side |
  |---|---|---|
  | Your hit chance | DEX, weapon skill, offense | mob level |
  | Your damage per hit | STR, weapon damage | mob level |
  | Mob hit chance on you | AGI, defense | mob level |
  | Mob damage per hit on you | AC | mob level |

  Each chart is a heatmap of the fitted model: the stat across, every mob level down, color for the predicted value with the other factors held at typical values. Hatched cells were never logged (the color there is the model's guess), and dots mark what was. The table has one row per logged mob level: how much +1 of each stat changes the outcome there, and whether that effect changes with mob level (e.g. AC mattering less against higher-level mobs). The more things vary across everyone's logs, the more it can measure; factors that never change, or always change together, are listed as not measurable.

## Getting a clean answer

- Change one thing between setups. Keep weapon and mob level fixed.
- Follow the assumptions below.
- Alternate setups (A, B, A, B) instead of all A then all B.
- Weapon skill rises while you fight. Use a capped skill if you can; otherwise press `+1` on every skill-up so it gets recorded.
- Swings needed per setup to detect a change in hit rate (around 70%): 10 points ≈ 300, 5 points ≈ 1,300, 2 points ≈ 8,000. Bigger stat changes are much cheaper to detect than +5.

## Assumptions and deferrals

To keep logs comparable without extra fields, every log assumes:

- **Front only.** You fight from the mob's front; it's assumed to be in front of you at all times.
- **No mob debuffs.** Fights where the mob has any debuff (slow, AC debuff and so on) are not logged.
- **Buffs on you don't matter.** Enter stats and skills as the game shows them, buffs included.
- **Class and race bonuses** are assumed to show up in your skills and attributes, so class isn't recorded.
- **What drives what** (used by the analyzer): DEX, weapon skill and offense affect your hit chance; STR and weapon damage affect your damage; AGI and defense affect the mob's hit chance on you; AC affects the mob's damage on you. Mob level stands in for everything about the mob. The mob's class may matter but usually isn't known, so it's ignored for now.

Deferred for now, may come back later:

- **Offhand.** Offhand swings aren't logged.
- **Abilities.** Only auto-attack swings are logged; skip combat abilities, spells, songs and procs.
- **Crits.** Not marked. A critical hit is entered as a normal hit with its damage.
- **Dodge, parry and block.** Logged as misses, on both sides, so avoidance types aren't broken out and your own dodge/parry/block skills aren't recorded.

## CSV columns

One row per swing: `schema_version, session_id, seq (swing number within the session), setup_version, fight, ts, actor (player|mob), result (hit|miss), damage`, followed by the setup in force at that swing: `contributor, setup_label, char_race, char_level, str, agi, dex, ac, weapon_skill, offense, defense, weapon_dmg, notes, mob_name, mob_level`.
