"""Build players.csv (one row per qualified player-season) from pga_raw.csv.

Source: Kaggle "PGA Tour Golf Data (2015-2022)" by Rob Mulla, originally from
Advanced Sports Analytics. One raw row is one player in one tournament.

Uses only the Python standard library, so it runs with any Python 3.8+:
    python prep_data.py
"""

import csv
import math
import re
from collections import Counter, defaultdict

RAW = "pga_raw.csv"
OUT = "players.csv"

EXPECTED_ROWS = 36864
EXPECTED_COLS = 37

KEEP = [
    "player id", "player", "season", "tournament id", "tournament name", "course",
    "purse", "no_cut", "n_rounds", "made_cut", "pos", "Finish",
    "sg_putt", "sg_arg", "sg_app", "sg_ott", "sg_t2g", "sg_total",
]
SG_COLS = ["sg_ott", "sg_app", "sg_arg", "sg_putt", "sg_total"]
MISSING = ("", "NA")
CLEAN_FINISH = re.compile(r"^T?(\d+)$")

FIRST_SEASON, LAST_SEASON = 2015, 2021   # 2022 is partial and dropped
SUMMARY_SEASONS = range(2015, 2021)      # season t for the four summary numbers
MIN_SG_EVENTS = 10
ELITE_TOP10_RATE = 0.30
BS_CUTOFFS = {"80": 0.80, "85": 0.85, "90": 0.90, "95": 0.95}
DEFAULT_CUTOFF = "85"


def num(value):
    """Parse a raw cell; missing values become None."""
    return None if value in MISSING else float(value)


def finish_fallback(row):
    """Top 10 from Finish when pos is missing: made_cut = 1 and a clean 1, 2, T8, ...
    Never on missed-cut rows: Finish is wrong in the 2015 and 2016 Northern Trust."""
    m = CLEAN_FINISH.match(row["Finish"])
    return row["made_cut"] == "1" and m is not None and int(m.group(1)) <= 10


def is_top10(row):
    """Top 10 means pos <= 10; Finish fills in only when pos is missing."""
    pos = num(row["pos"])
    if pos is not None:
        return pos <= 10
    return finish_fallback(row)


def load_raw(path=RAW):
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        columns = reader.fieldnames
    return rows, columns


def clean(rows, log=print):
    """Apply the cleaning rules from the spec, logging each step."""
    rows = [{c: r[c] for c in KEEP} for r in rows]

    pair_counts = Counter((r["player id"], r["tournament id"]) for r in rows)
    dup_pairs = {k for k, n in pair_counts.items() if n > 1}
    before = len(rows)
    rows = [r for r in rows if (r["player id"], r["tournament id"]) not in dup_pairs]
    log(f"Step 1  drop duplicated (player id, tournament id) pairs: "
        f"{before - len(rows):,} rows dropped ({len(dup_pairs)} pairs)")

    before = len(rows)
    rows = [r for r in rows if int(r["season"]) <= LAST_SEASON]
    log(f"Step 2  drop season 2022 (partial): {before - len(rows):,} rows dropped")
    log(f"Step 3  remaining event rows {FIRST_SEASON}-{LAST_SEASON}: {len(rows):,}")

    sg_rows = [r for r in rows if num(r["sg_total"]) is not None]
    log(f"Step 4  rows with strokes-gained data: {len(sg_rows):,}")
    incomplete = [r for r in sg_rows if any(num(r[c]) is None for c in SG_COLS)]
    if incomplete:
        raise ValueError(f"{len(incomplete)} rows have sg_total but miss a component")

    # Rows where pos is missing but Finish shows a clean top 10.
    gaps = [r for r in rows if num(r["pos"]) is None
            and (m := CLEAN_FINISH.match(r["Finish"])) and int(m.group(1)) <= 10]
    used = [r for r in gaps if finish_fallback(r)]
    log(f"Top-10 rule: pos missing, Finish a clean top 10: {len(gaps)} rows; "
        f"counted (made_cut = 1) {len(used)}, not counted (made_cut = 0) {len(gaps) - len(used)}")
    for r in sorted(gaps, key=lambda r: (r["season"], r["tournament name"], r["Finish"])):
        status = "counted    " if finish_fallback(r) else "not counted"
        log(f"    {status} {r['season']}  {r['player']:<20} {r['tournament name']:<38} "
            f"Finish {r['Finish']:<4} made_cut {r['made_cut']}")
    return rows


def player_seasons(rows):
    """Aggregate event rows to one record per player-season (all, not just qualified)."""
    groups = defaultdict(list)
    for r in rows:
        groups[(r["player id"], int(r["season"]))].append(r)

    records = {}
    for (pid, season), events in groups.items():
        sg_events = [e for e in events if num(e["sg_total"]) is not None]
        rounds = sum(num(e["n_rounds"]) for e in sg_events)
        rec = {
            "player_id": pid,
            "player": Counter(e["player"] for e in events).most_common(1)[0][0],
            "season": season,
            "starts": len(events),
            "top10s": sum(is_top10(e) for e in events),
            "sg_events": len(sg_events),
            "sg_rounds": int(rounds),
        }
        rec["top10_rate"] = round(rec["top10s"] / rec["starts"], 6)
        for c in SG_COLS:
            # Per-round average over skill events, weighted by rounds played.
            rec[c] = (round(sum(num(e[c]) * num(e["n_rounds"]) for e in sg_events) / rounds, 6)
                      if rounds else None)
        rec["ball_striking"] = (round(rec["sg_ott"] + rec["sg_app"], 6)
                                if rounds else None)
        records[(pid, season)] = rec
    return records


def percentile_rank(values):
    """Average-rank percentile in (0, 1], ties share their mean rank (pandas rank(pct=True))."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return [r / len(values) for r in ranks]


def qualify_and_flag(records):
    qualified = [r for r in records.values() if r["sg_events"] >= MIN_SG_EVENTS]
    by_season = defaultdict(list)
    for r in qualified:
        by_season[r["season"]].append(r)
    for season_rows in by_season.values():
        pcts = percentile_rank([r["ball_striking"] for r in season_rows])
        for r, p in zip(season_rows, pcts):
            r["bs_pct"] = round(p, 6)

    for r in qualified:
        r["elite"] = int(r["top10_rate"] >= ELITE_TOP10_RATE)
        for label, cut in BS_CUTOFFS.items():
            r[f"candidate_{label}"] = int(not r["elite"] and r["bs_pct"] > cut
                                          and r["sg_putt"] < 0)
        r["candidate"] = r[f"candidate_{DEFAULT_CUTOFF}"]
    return {(r["player_id"], r["season"]): r for r in qualified}


def add_next_seasons(qualified):
    """Attach t+1 and t+2 outcomes. Blank when that season is outside the data."""
    for (pid, season), r in qualified.items():
        nxt = qualified.get((pid, season + 1))
        if season + 1 > LAST_SEASON:
            r.update(next_qualified=None, elite_next=None, next_ball_striking=None,
                     next_sg_putt=None, next_top10_rate=None)
        else:
            r["next_qualified"] = int(nxt is not None)
            r["elite_next"] = nxt["elite"] if nxt else 0
            r["next_ball_striking"] = nxt["ball_striking"] if nxt else None
            r["next_sg_putt"] = nxt["sg_putt"] if nxt else None
            r["next_top10_rate"] = nxt["top10_rate"] if nxt else None
        nxt2 = qualified.get((pid, season + 2))
        r["elite_next2"] = None if season + 2 > LAST_SEASON else (nxt2["elite"] if nxt2 else 0)


OUT_COLS = [
    "player_id", "player", "season", "starts", "top10s", "top10_rate", "elite",
    "sg_events", "sg_rounds", "sg_ott", "sg_app", "sg_arg", "sg_putt", "sg_total",
    "ball_striking", "bs_pct", "candidate",
    "candidate_80", "candidate_85", "candidate_90", "candidate_95",
    "next_qualified", "elite_next", "next_ball_striking", "next_sg_putt",
    "next_top10_rate", "elite_next2",
]


def write_players(qualified, path=OUT):
    rows = sorted(qualified.values(), key=lambda r: (r["season"], r["player"]))
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLS, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({c: "" if r[c] is None else r[c] for c in OUT_COLS})
    return rows


# ---------- summary ----------

def pearson(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    return sxy / math.sqrt(sxx * syy)


def rate(rows, outcome="elite_next"):
    hits = sum(r[outcome] for r in rows)
    pct = f"{hits / len(rows):.1%}" if rows else "n/a"
    return f"{pct} ({hits} of {len(rows)})"


def summarize(rows, log=print):
    log("\nQualified player-seasons (>= 10 strokes-gained events):")
    counts = Counter(r["season"] for r in rows)
    log("  " + "  ".join(f"{s}: {counts[s]}" for s in sorted(counts))
        + f"  | total {len(rows):,}")

    base = [r for r in rows if r["season"] in SUMMARY_SEASONS]
    cand = [r for r in base if r["candidate"]]
    other = [r for r in base if not r["elite"] and not r["candidate"]]
    elite = [r for r in base if r["elite"]]
    paired = [r for r in base if r["next_qualified"]]

    log(f"\nFour summary numbers (season t = 2015-2020, {len(base):,} rows):")
    log(f"  1 Candidate breakout rate:             {rate(cand)}")
    log(f"  2 Other non-elite breakout rate:       {rate(other)}")
    log(f"  3 Elite stay-elite rate:               {rate(elite)}")
    bs_r = pearson([r["ball_striking"] for r in paired], [r["next_ball_striking"] for r in paired])
    log(f"  4 Ball-striking year-to-year corr.:    {bs_r:.2f} ({len(paired)} pairs)")
    putt_r = pearson([r["sg_putt"] for r in paired], [r["next_sg_putt"] for r in paired])
    log(f"    Putting year-to-year corr.:          {putt_r:.2f} ({len(paired)} pairs)")
    c_rate = sum(r["elite_next"] for r in cand) / len(cand)
    o_rate = sum(r["elite_next"] for r in other) / len(other)
    log(f"    Signings per breakout: candidates {1 / c_rate:.1f}, other non-elite "
        f"{1 / o_rate:.1f}; ratio {c_rate / o_rate:.1f}x; break-even cost ratio "
        f"{o_rate / c_rate:.2f}")

    watch = [r for r in rows if r["season"] == LAST_SEASON and r["candidate"]]
    log(f"\n2021 candidates (watch list): {len(watch)}")
    for r in sorted(watch, key=lambda r: -r["ball_striking"]):
        log(f"    {r['player']:<24} BS {r['ball_striking']:+.2f}  putt {r['sg_putt']:+.2f}  "
            f"top-10 {r['top10s']}/{r['starts']}")

    log("\nFinding 5 (season t = 2015-2019, still elite in t+2):")
    f5 = [r for r in rows if 2015 <= r["season"] <= 2019]
    breakouts = [r for r in f5 if not r["elite"] and r["elite_next"]]
    repeat = [r for r in f5 if r["elite"] and r["elite_next"]]
    log(f"  New breakouts (not elite t, elite t+1):  {rate(breakouts, 'elite_next2')}")
    log(f"  Elite in both t and t+1:                 {rate(repeat, 'elite_next2')}")

    log(f"\nFindings check (not required by Prompt A):")
    log(f"  Finding 1  corr. of season-t measure with next-season top-10 rate "
        f"({len(paired)} rows with a qualified next season):")
    nxt = [r["next_top10_rate"] for r in paired]
    f1 = {c: pearson([r[c] for r in paired], nxt)
          for c in ["sg_total", "ball_striking", "sg_ott", "sg_app", "sg_arg", "sg_putt"]}
    for c, v in sorted(f1.items(), key=lambda kv: -kv[1]):
        log(f"    {c:<14} {v:.2f}")
    cp = [r for r in cand if r["next_qualified"]]
    mean = lambda xs: sum(xs) / len(xs)
    log(f"  Finding 3  candidates with a qualified next season: {len(cp)}")
    log(f"    putting        {mean([r['sg_putt'] for r in cp]):+.2f} -> "
        f"{mean([r['next_sg_putt'] for r in cp]):+.2f}")
    log(f"    ball-striking  {mean([r['ball_striking'] for r in cp]):+.2f} -> "
        f"{mean([r['next_ball_striking'] for r in cp]):+.2f}")
    log("  Finding 4  candidate breakout rate by ball-striking cutoff:")
    for label in BS_CUTOFFS:
        group = [r for r in base if r[f"candidate_{label}"]]
        log(f"    top {100 - int(label)}%: {rate(group)}")


def main():
    raw, columns = load_raw()
    print(f"Raw file: {len(raw):,} rows x {len(columns)} columns "
          f"(expected {EXPECTED_ROWS:,} x {EXPECTED_COLS})")
    if (len(raw), len(columns)) != (EXPECTED_ROWS, EXPECTED_COLS):
        raise SystemExit("Raw file shape does not match; stopping.")
    print(f"  players {len({r['player id'] for r in raw})}, "
          f"tournaments {len({r['tournament id'] for r in raw})}, "
          f"seasons {min(r['season'] for r in raw)}-{max(r['season'] for r in raw)}")

    rows = clean(raw)
    records = player_seasons(rows)
    qualified = qualify_and_flag(records)
    add_next_seasons(qualified)
    out = write_players(qualified)
    print(f"Step 5  player-seasons {len(records):,}; qualified (>= {MIN_SG_EVENTS} SG events) "
          f"{len(out):,} -> wrote {OUT}")
    summarize(out)


if __name__ == "__main__":
    main()
