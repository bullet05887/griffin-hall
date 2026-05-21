# Griffin Hall

A learning hall for the curious. Heraldic-themed single-page app, mobile-first, built for repetition-driven mastery.

> "Griffin Hall" = the master Hall (homepage)
> "Griffin's Quest: [Subject]" = each subject module

## Live

- Production: deployed to Vercel as `griffin-hall`
- Local: open `index.html` in any browser — no build step

## Stack

Single HTML file. React 18 + Tailwind + Babel standalone via CDN. localStorage for all progress, XP, streaks, and the review queue. No backend.

## Brand

| Token | Hex | Use |
|---|---|---|
| Navy | `#1a2942` | Primary chrome, text |
| Gold (burnished) | `#c9a44c` | Accents, sigil, dividers, XP |
| Parchment | `#f4ecd8` | Page background |
| Parchment warm | `#ece2c4` | Cards |
| Crimson | `#9b2226` | Highlight, name accent, Drill Yard |

Type: **Cinzel** (heraldic display & uppercase), **Instrument Serif** (editorial headers), **Manrope** (body).

Sigil: hand-drawn SVG griffin (eagle head + erect wing + lion body, profile, in a gold-circled navy roundel). Two variants:
- `#griffin-sigil` — full sigil, used for hero / empty-state imagery
- `#griffin-mark` — compact rounded-square mark, used in the top bar and favicon

## Repetition framework

E learns by repetition. The whole system is designed around that.

- **Mastery gate (80%)** — to unlock the next lesson, you need 80%+ correct on the **first try** of the current lesson's quiz
- **Retry-until-right** — wrong answer → explanation → "Try Again" button → same Q reappears. Can't leave a question unanswered
- **Drilling Yard** (the Review queue) — every miss lands here automatically. Hub shows a crimson Drill tile when non-empty. First-try-correct in the Yard removes the question from the queue
- **Streaks** — practicing today extends streak by one. Missed day resets
- **7-day replay bonus** — any mastered lesson after 7 days shows a "2× XP" badge. Replaying pays double
- **XP economy:** +10 first-try / +5 retry / +5 drill / +50 lesson bonus / +50 first-mastery bonus / 2× replay
- **Gold XP toast** floats up on every right answer

## Quests

### Live tonight
- **Griffin's Quest: War & Strategy** — 6 battles, 30 questions

### Planned (greyed Coming Soon tiles)
- Strategy: Game Theory
- Mind: Logic, Rationality, Philosophy
- Skills: Languages, Grammar, Cursive, Roots, Parts of Speech, Tenses, Sentences, Reading
- Wealth: Operations, Founding, Investing, Capital, Personal Coin, Metals
- Numbers: Arithmetic, Geometry, Statistics
- Letters: Verse, Realism, Tales

## War & Strategy — 6 lessons

| # | Lesson | Era | Image source |
|---|---|---|---|
| 1 | Washington Crosses the Delaware | Christmas 1776 | Leutze 1851 (PD) |
| 2 | Custer's Last Stand | June 1876 | Charles M. Russell 1903 (PD) |
| 3 | Sun Tzu and the Art of War | ~500 BC | Traditional portrait (PD) |
| 4 | Hannibal at Cannae | 216 BC | Trumbull c. 1773 (PD) |
| 5 | D-Day: Combined Arms | June 6, 1944 | Sargent, US Coast Guard 1944 (PD) |
| 6 | Stalingrad: Holding the Line | 1942–43 | Soviet press, Nov 1942 (PD) |

All images via Wikipedia's `Special:FilePath` endpoint (auto-resize, proper headers).

## Storage

Single key: `griffin-hall:state:v1` — `{ name, xp, streak, quests, reviewQueue }`. Bump suffix to v2 to wipe.

Migrates automatically from the earlier `learning-hub:state:v2` key if present (preserves XP, streak, mastery from prior playthrough).

## Adding a new Quest

Two changes to `index.html`:

1. Add a `STRATEGY_LESSONS`-style array for the new subject
2. Add an entry to `QUESTS` keyed by quest id with `{ id, title, formalTitle, motto, lessons, active:true }`
3. In `ROWS`, find the matching row tile and set `active:true`

The mastery + drill + replay + XP logic works automatically for any quest that follows this shape.

## Roadmap

Built for a market launch in 3–4 months. Premium learning-hall brand, sellable to families. Each future Quest module follows the same pattern so the system scales by content, not by code.
