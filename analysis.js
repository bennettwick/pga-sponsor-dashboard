/* Shared calculations for the report and the dashboard.
   Every number on both pages comes from players.csv through these functions,
   so the report and the reset dashboard always agree. Runs in the browser
   (window.Breakout) and in Node (module.exports) for checking. */
(function (root) {
  "use strict";

  const TEXT_COLS = new Set(["player_id", "player"]);

  // Ball-striking cutoff (top X%) -> precomputed flag column and percentile threshold.
  const CUTOFFS = {
    20: { col: "candidate_80", pct: 0.80 },
    15: { col: "candidate_85", pct: 0.85 },
    10: { col: "candidate_90", pct: 0.90 },
    5: { col: "candidate_95", pct: 0.95 },
  };

  const SUMMARY_FIRST = 2015;
  const SUMMARY_LAST = 2020;
  const WATCH_SEASON = 2021;
  const MIN_GROUP = 10; // fewer player-seasons than this: show "Only N player-seasons (needs 10+)" instead of a rate

  const DEFAULTS = Object.freeze({
    seasonFrom: SUMMARY_FIRST,
    seasonTo: SUMMARY_LAST,
    group: "all",
    cutoff: 15,
    putting: true,
    players: Object.freeze([]), // selected player names; while any are selected, the group filter is ignored
  });

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const header = lines[0].split(",");
    return lines.slice(1).map((line) => {
      const cells = line.split(",");
      const row = {};
      header.forEach((col, i) => {
        const v = cells[i];
        row[col] = TEXT_COLS.has(col) ? v : v === "" || v === undefined ? null : Number(v);
      });
      return row;
    });
  }

  // Candidate under the chosen cutoff and putting condition. With the putting
  // condition on, this reads the flag columns written by prep_data.py.
  function isCandidate(r, opts) {
    const c = CUTOFFS[opts.cutoff];
    if (opts.putting) return r[c.col] === 1;
    return r.elite === 0 && r.bs_pct > c.pct;
  }

  function groupOf(r, opts) {
    if (r.elite === 1) return "elite";
    return isCandidate(r, opts) ? "candidate" : "other";
  }

  function filterRows(rows, opts) {
    const players = opts.players || [];
    return rows.filter(
      (r) =>
        r.season >= opts.seasonFrom &&
        r.season <= opts.seasonTo &&
        (players.length ? players.includes(r.player) : opts.group === "all" || groupOf(r, opts) === opts.group)
    );
  }

  function share(rows, outcome) {
    const hits = rows.reduce((s, r) => s + (r[outcome] === 1 ? 1 : 0), 0);
    return { hits, n: rows.length, rate: rows.length ? hits / rows.length : null };
  }

  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 2) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
      syy += (ys[i] - my) ** 2;
    }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }

  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  // The four summary numbers plus signings per breakout.
  function summary(rows, opts) {
    const cand = rows.filter((r) => groupOf(r, opts) === "candidate");
    const other = rows.filter((r) => groupOf(r, opts) === "other");
    const elite = rows.filter((r) => r.elite === 1);
    const paired = rows.filter((r) => r.next_qualified === 1);
    const s = {
      candidate: share(cand, "elite_next"),
      other: share(other, "elite_next"),
      elite: share(elite, "elite_next"),
      bsCorr: {
        r: pearson(paired.map((r) => r.ball_striking), paired.map((r) => r.next_ball_striking)),
        n: paired.length,
      },
      puttCorr: {
        r: pearson(paired.map((r) => r.sg_putt), paired.map((r) => r.next_sg_putt)),
        n: paired.length,
      },
    };
    s.candidate.signings = s.candidate.rate ? 1 / s.candidate.rate : null;
    s.other.signings = s.other.rate ? 1 / s.other.rate : null;
    s.ratio = s.candidate.rate && s.other.rate ? s.candidate.rate / s.other.rate : null;
    s.breakEven = s.candidate.rate && s.other.rate ? s.other.rate / s.candidate.rate : null;
    return s;
  }

  // Finding 1: each season-t measure against next season's top-10 rate.
  const MEASURES = [
    { key: "sg_total", label: "Total strokes gained" },
    { key: "ball_striking", label: "Ball-striking (OTT + APP)" },
    { key: "sg_ott", label: "Off the tee" },
    { key: "sg_app", label: "Approach" },
    { key: "sg_arg", label: "Around the green" },
    { key: "sg_putt", label: "Putting" },
  ];

  function categoryCorrelations(rows) {
    const paired = rows.filter((r) => r.next_qualified === 1);
    const next = paired.map((r) => r.next_top10_rate);
    return {
      n: paired.length,
      items: MEASURES.map((m) => ({ ...m, r: pearson(paired.map((r) => r[m.key]), next) })).sort(
        (a, b) => (b.r ?? -2) - (a.r ?? -2)
      ),
    };
  }

  // Finding 3: candidates' putting and ball-striking in t and t+1.
  function candidateMovement(rows, opts) {
    const c = rows.filter((r) => groupOf(r, opts) === "candidate" && r.next_qualified === 1);
    return {
      n: c.length,
      putt: { from: mean(c.map((r) => r.sg_putt)), to: mean(c.map((r) => r.next_sg_putt)) },
      bs: { from: mean(c.map((r) => r.ball_striking)), to: mean(c.map((r) => r.next_ball_striking)) },
    };
  }

  // Finding 4: candidate breakout rate at each ball-striking cutoff.
  function cutoffRates(rows, putting) {
    return [20, 15, 10, 5].map((cut) => {
      const o = { cutoff: cut, putting };
      return { cutoff: cut, ...share(rows.filter((r) => groupOf(r, o) === "candidate"), "elite_next") };
    });
  }

  // Non-elite players above the ball-striking cutoff, split by putting:
  // cold = putting below tour average (the candidates), warm = at or above it.
  function puttingSplit(rows, cutoff) {
    const strong = rows.filter((r) => r.elite === 0 && r.bs_pct > CUTOFFS[cutoff].pct);
    // breakout share, plus average top-10 rate now and (for players with a qualified next season) next season
    const part = (rs) => ({
      ...share(rs, "elite_next"),
      top10: mean(rs.map((r) => r.top10_rate)),
      nextTop10: mean(rs.filter((r) => r.next_qualified === 1).map((r) => r.next_top10_rate)),
    });
    return {
      all: part(strong),
      cold: part(strong.filter((r) => r.sg_putt < 0)),
      warm: part(strong.filter((r) => r.sg_putt >= 0)),
    };
  }

  // Finding 5: still elite two seasons later. Needs t+2, so season t = 2015-2019.
  function persistence(rows) {
    const w = rows.filter((r) => r.season >= SUMMARY_FIRST && r.season <= SUMMARY_LAST - 1);
    return {
      breakouts: share(w.filter((r) => r.elite === 0 && r.elite_next === 1), "elite_next2"),
      repeat: share(w.filter((r) => r.elite === 1 && r.elite_next === 1), "elite_next2"),
    };
  }

  function watchList(rows) {
    return rows
      .filter((r) => r.season === WATCH_SEASON && r.candidate === 1)
      .sort((a, b) => b.ball_striking - a.ball_striking);
  }

  // Formatting shared by both pages.
  const fmt = {
    pct: (x, d = 1) => (x === null || x === undefined ? "–" : (x * 100).toFixed(d) + "%"),
    r: (x) => (x === null || x === undefined ? "–" : x.toFixed(2)),
    sg: (x) => (x === null || x === undefined ? "–" : (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(2)),
    of: (s) => `${s.hits} of ${s.n.toLocaleString("en-US")}`,
    int: (x) => x.toLocaleString("en-US"),
    x1: (x) => (x === null || x === undefined ? "–" : x.toFixed(1)),
  };

  const api = {
    CUTOFFS, DEFAULTS, MIN_GROUP, SUMMARY_FIRST, SUMMARY_LAST, WATCH_SEASON, MEASURES,
    parseCSV, isCandidate, groupOf, filterRows, share, pearson, mean, summary,
    categoryCorrelations, candidateMovement, cutoffRates, puttingSplit, persistence, watchList, fmt,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Breakout = api;
})(typeof window !== "undefined" ? window : globalThis);
