/* Report page: loads players.csv, computes every number with the default
   definitions (season t = 2015-2020, top-15% cutoff, putting < 0), fills the
   text and draws the charts. */
(function () {
  "use strict";
  const B = window.Breakout, C = window.Charts, F = B.fmt;
  let rows = null;

  function fill(values) {
    document.querySelectorAll("[data-k]").forEach((el) => {
      const v = values[el.dataset.k];
      if (v !== undefined) el.textContent = v;
    });
  }

  function compute() {
    const opts = { ...B.DEFAULTS };
    const base = B.filterRows(rows, opts);
    const s = B.summary(base, opts);
    const f1 = B.categoryCorrelations(base);
    const f3 = B.candidateMovement(base, opts);
    const f4 = B.cutoffRates(base, true);
    const f5 = B.persistence(rows);
    const split = B.puttingSplit(base, opts.cutoff); // strong ball-strikers by putting, same seasons and cutoff
    // the same summary for the two halves of the period
    const periodOf = (a, z) => B.summary(B.filterRows(rows, { ...opts, seasonFrom: a, seasonTo: z }), opts);
    const periods = { early: periodOf(2015, 2017), late: periodOf(2018, 2020) };
    const watch = B.watchList(rows);
    const perSeason = {};
    rows.forEach((r) => (perSeason[r.season] = (perSeason[r.season] || 0) + 1));
    const counts = Object.values(perSeason);
    return { opts, base, s, f1, f3, f4, f5, split, periods, watch, perSeason, counts };
  }

  function values(d) {
    const { s, f1, f3, f4, f5 } = d;
    const v = {
      rows: F.int(d.base.length),
      "cand.rate": F.pct(s.candidate.rate), "cand.of": F.of(s.candidate), "cand.hits": s.candidate.hits, "cand.n": s.candidate.n,
      "other.rate": F.pct(s.other.rate), "other.of": F.of(s.other), "other.hits": s.other.hits, "other.n": F.int(s.other.n),
      "elite.rate": F.pct(s.elite.rate), "elite.of": F.of(s.elite),
      "bs.r": F.r(s.bsCorr.r), "putt.r": F.r(s.puttCorr.r),
      ratio: F.x1(s.ratio),
      "cand.sign": F.x1(s.candidate.signings), "other.sign": F.x1(s.other.signings),
      "cand.signRound": Math.round(s.candidate.signings), "other.signRound": Math.round(s.other.signings),
      "f1.n": F.int(f1.n),
      "f3.n": f3.n, "f3.puttFrom": F.sg(f3.putt.from), "f3.puttTo": F.sg(f3.putt.to),
      "f3.bsFrom": F.sg(f3.bs.from), "f3.bsTo": F.sg(f3.bs.to),
      "f3.puttRecovered": F.pct(1 - f3.putt.to / f3.putt.from, 0),
      "f3.bsKept": F.pct(f3.bs.to / f3.bs.from, 0),
      "f5.b.hits": f5.breakouts.hits, "f5.b.n": f5.breakouts.n, "f5.b.rate": F.pct(f5.breakouts.rate),
      "f5.r.hits": f5.repeat.hits, "f5.r.n": f5.repeat.n, "f5.r.rate": F.pct(f5.repeat.rate),
      "watch.n": d.watch.length,
      "f2.warm.rate": F.pct(d.split.warm.rate), "f2.warm.of": F.of(d.split.warm),
      "off.cand.rate": F.pct(d.split.all.rate), "off.cand.of": F.of(d.split.all),
      "per.early.cand.of": F.of(d.periods.early.candidate), "per.late.cand.of": F.of(d.periods.late.candidate),
      "per.early.other.of": F.of(d.periods.early.other), "per.late.other.of": F.of(d.periods.late.other),
      "per.late.cand.hitsWord": word(d.periods.late.candidate.hits, true), "cand.hitsWord": word(s.candidate.hits),
      "split.warm.top10": F.pct(d.split.warm.top10), "split.cold.top10": F.pct(d.split.cold.top10),
      "split.warm.next": F.pct(d.split.warm.nextTop10), "split.cold.next": F.pct(d.split.cold.nextTop10),
      "qual.total": F.int(rows.length),
      "qual.range": `${Math.min(...d.counts)}–${Math.max(...d.counts)}`,
      "qual.seasons": Object.keys(d.perSeason).sort().map((k) => `${k}: ${d.perSeason[k]}`).join(", "),
      // agreement table: same text format as the Tableau column, so the two can be compared exactly
      "agree.cand": `${F.pct(s.candidate.rate)} (${F.of(s.candidate)})`,
      "agree.other": `${F.pct(s.other.rate)} (${F.of(s.other)})`,
      "agree.elite": `${F.pct(s.elite.rate)} (${F.of(s.elite)})`,
      "agree.bs": `${F.r(s.bsCorr.r)} (${F.int(s.bsCorr.n)} pairs)`,
    };
    f1.items.forEach((i) => (v["f1." + i.key] = F.r(i.r)));
    f4.forEach((c) => {
      v[`f4.${c.cutoff}.rate`] = F.pct(c.rate);
      v[`f4.${c.cutoff}.of`] = F.of(c);
      v[`f4.${c.cutoff}.n`] = c.n;
    });
    return v;
  }

  // Match column: "Yes" only when the website text and the typed Tableau text are identical.
  function markAgreement() {
    document.querySelectorAll("#agree-table tbody tr").forEach((tr) => {
      const [, web, tab, match] = tr.cells;
      match.textContent = web.textContent === tab.textContent ? "Yes" : "No";
    });
  }

  // Small counts read better as words in a sentence ("Seven of the eight").
  function word(n, capital) {
    const w = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? String(n);
    return capital ? w[0].toUpperCase() + w.slice(1) : w;
  }

  function draw(d) {
    const { s, f1, f3, f4, f5 } = d;
    C.scoreCards(document.getElementById("cards"), s, B.MIN_GROUP);

    C.bars(document.getElementById("f1-chart"),
      f1.items.map((i) => ({
        label: i.label, value: i.r, display: "r = " + F.r(i.r), cls: "neutral",
        selected: i.key === "ball_striking" || i.key === "sg_putt",
      })),
      { max: 1, room: 0.85, aria: "Correlation with next season's top-10 rate by measure" });

    C.bars(document.getElementById("f2-chart"), [
      { label: "Candidates", sub: "became elite", value: s.candidate.rate, display: F.pct(s.candidate.rate), of: F.of(s.candidate), cls: "candidate" },
      { label: "Other non-elite", sub: "became elite", value: s.other.rate, display: F.pct(s.other.rate), of: F.of(s.other), cls: "other" },
      { label: "Elite", sub: "stayed elite", value: s.elite.rate, display: F.pct(s.elite.rate), of: F.of(s.elite), cls: "elite" },
    ], { aria: "Share elite the next season by group" });

    C.hole(document.getElementById("f3-chart"), [
      { label: "Putting", from: f3.putt.from, to: f3.putt.to },
      { label: "Ball-striking", from: f3.bs.from, to: f3.bs.to },
    ], { aria: "Candidates' putting and ball-striking, season t to t+1" });

    C.bars(document.getElementById("f4-chart"), [
      ...f4.map((c) => ({
        label: `Top ${c.cutoff}%`, sub: c.cutoff === 15 ? "default cutoff" : "", value: c.rate,
        display: F.pct(c.rate), of: F.of(c), cls: "candidate", selected: c.cutoff === 15,
      })),
      { label: "Other non-elite", sub: "top-15% definition", value: s.other.rate, display: F.pct(s.other.rate), of: F.of(s.other), cls: "other" },
    ], { aria: "Candidate breakout rate by ball-striking cutoff" });

    C.bars(document.getElementById("f5-chart"), [
      { label: "New breakouts", sub: "elite in t+1 only", value: f5.breakouts.rate, display: F.pct(f5.breakouts.rate), of: F.of(f5.breakouts), cls: "other" },
      { label: "Established elite", sub: "elite in t and t+1", value: f5.repeat.rate, display: F.pct(f5.repeat.rate), of: F.of(f5.repeat), cls: "elite" },
    ], { max: 1, room: 0.8, aria: "Still elite two seasons later" });

    drawWatch(d);
  }

  function drawWatch(d) {
    const season = rows.filter((r) => r.season === B.WATCH_SEASON);
    // Label each candidate dot with its number in the leaderboard table.
    const rank = new Map(d.watch.map((r, i) => [r.player, i + 1]));
    C.scatter(document.getElementById("watch-chart"),
      season.map((r) => {
        const g = B.groupOf(r, d.opts);
        return {
          x: r.ball_striking, y: r.sg_putt, cls: g, faded: g !== "candidate",
          label: rank.has(r.player) ? String(rank.get(r.player)) : null,
          tip: `<b>${C.esc(r.player)}</b> · 2021<br>Ball-striking ${F.sg(r.ball_striking)} · putting ${F.sg(r.sg_putt)}<br>Top 10s: ${r.top10s} of ${r.starts} (${F.pct(r.top10_rate)})`,
        };
      }),
      { labels: true, height: window.innerWidth < 560 ? 400 : 480, xLabel: "Better ball-striking →", yLabel: "↑ Better putting", yLabelTop: true, aria: "2021 ball-striking vs putting, candidates labeled by their table number" });

    document.getElementById("watch-table").innerHTML =
      `<thead><tr><th>No.</th><th>Player</th><th class="n">Ball-striking</th><th class="n">Ball-striking percentile</th><th class="n">Putting</th><th class="n">Top 10s</th><th class="n">Top-10 rate</th></tr></thead><tbody>` +
      d.watch.map((r, i) =>
        `<tr><td class="hole">${i + 1}</td><td>${C.esc(r.player)}</td><td class="n">${F.sg(r.ball_striking)}</td><td class="n">${F.pct(r.bs_pct, 0)}</td>` +
        `<td class="n">${F.sg(r.sg_putt)}</td><td class="n">${r.top10s} of ${r.starts}</td><td class="n">${F.pct(r.top10_rate)}</td></tr>`
      ).join("") + `</tbody>`;
  }


  let data = null, lastW = 0;
  window.addEventListener("resize", () => {
    if (!data || Math.abs(window.innerWidth - lastW) < 20) return;
    lastW = window.innerWidth;
    clearTimeout(window.__rt);
    window.__rt = setTimeout(() => draw(data), 120);
  });

  fetch("players.csv")
    .then((r) => { if (!r.ok) throw new Error(`players.csv: HTTP ${r.status}`); return r.text(); })
    .then((t) => {
      rows = B.parseCSV(t);
      data = compute();
      lastW = window.innerWidth;
      const v = values(data);
      fill(v);
      markAgreement();
      document.getElementById("focal").setAttribute("aria-label",
        `Candidates became elite the next season ${v.ratio} times as often as other non-elite players`);
      draw(data);
    })
    .catch((e) => {
      const box = document.getElementById("load-error");
      box.hidden = false;
      box.textContent = `Could not load players.csv (${e.message}). Open the page through a web server, for example the GitHub Pages site.`;
    });
})();
