# Breakout Watch: do strong ball-strikers with cold putters become elite?

**Question.** Do PGA Tour players with top-15% ball-striking and below-average putting, who are not yet elite, become elite the next season more often than other players?

**Reader.** The tour-player marketing director at a golf equipment company deciding which rising players to sign before their results peak.

**Rows counted.** One player in one season with at least 10 events that have strokes-gained data.

**Period.** The 2015–2020 seasons, each compared with the following season (2016–2021).

- Report: https://bennettwick.github.io/pga-sponsor-dashboard/
- Dashboard: https://bennettwick.github.io/pga-sponsor-dashboard/dashboard.html
- Tableau: https://public.tableau.com/app/profile/bennett.wicker/viz/PGABreakoutDashboard/BreakoutDashboard

By Bennett Wicker.

## Answer

Candidates (not elite, top-15% ball-striking, putting below tour average) became elite the next season at 10.4% (8 of 77), against 2.8% (26 of 941) for other non-elite players: 3.8 times as often. Both pages compute every number in the browser from `players.csv`.

## Files

| File | What it is |
| --- | --- |
| `pga_raw.csv` | Raw data: one player in one tournament, 36,864 rows, 37 columns, seasons 2015–2022 |
| `prep_data.py` | Cleans the raw file and writes `players.csv` (Python standard library only: `python prep_data.py`) |
| `players.csv` | One row per qualified player-season (2015–2021) with skill measures, flags and next-season outcomes |
| `index.html` | Report page: answer, recommendation, four summary numbers, five findings, watch list, data notes, agreement table |
| `dashboard.html` | Dashboard page: filters, the same four numbers, charts, cost tool and the rows behind the view |
| `analysis.js` | Shared calculations used by both pages (summary numbers, correlations, findings) |
| `charts.js` | Shared chart drawing (bars, tee-to-pin dumbbell, scatter, scorecard tiles) |
| `report.js` | Fills the report page from `players.csv` |
| `dashboard.js` | Filters and redraws the dashboard from `players.csv` |
| `styles.css` | Shared look for both pages |
| `.gitignore` | Keeps working files out of the repository |
| `README.md` | This file |

## Data source

[PGA Tour Golf Data (2015-2022)](https://www.kaggle.com/datasets/robikscube/pga-tour-golf-data-20152022) on Kaggle by Rob Mulla, originally from Advanced Sports Analytics. License: CC0 (public domain), which allows posting the data in this public repository. Every player is a professional tour golfer whose results are public.

## Cleaning, in brief

1. Drop both rows of every duplicated player id + tournament id pair (42 rows, 21 pairs).
2. Drop the partial 2022 season (3,674 rows), leaving 33,148 event rows; 26,032 have strokes-gained data.
3. Top 10 comes from `pos`; when `pos` is missing, a clean top-10 `Finish` counts only if `made_cut` = 1 (28 rows).
4. Keep player-seasons with at least 10 strokes-gained events: 1,306 rows, 151–209 per season.

The report's data notes section lists every definition, formula and caveat.

## Run locally

The pages load `players.csv` with `fetch`, so open them through a web server rather than as files:

```
python prep_data.py          # optional: rebuilds players.csv
python -m http.server 8000   # then open http://localhost:8000
```
