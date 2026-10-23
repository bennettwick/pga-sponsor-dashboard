/* Dashboard page: loads players.csv and recomputes every card, chart and table
   from the rows that pass the filters. Reset restores the report's defaults. */
(function () {
  "use strict";
  const B = window.Breakout, C = window.Charts, F = B.fmt;
  const $ = (id) => document.getElementById(id);
  const COST_DEFAULT = 250000;
  const GROUP_LABEL = { candidate: "Candidate", other: "Other non-elite", elite: "Elite" };

  let rows = [];
  let names = [];
  let state = { ...B.DEFAULTS };
  let sort = { key: "ball_striking", dir: -1 };

  // ---------- controls ----------
  function initControls() {
    for (let s = B.SUMMARY_FIRST; s <= B.SUMMARY_LAST; s++) {
      $("from").add(new Option(s, s));
      $("to").add(new Option(s, s));
    }
    names = [...new Set(rows.map((r) => r.player))].sort();
    $("player-list").innerHTML = names.map((n) => `<option value="${C.esc(n)}"></option>`).join("");

    $("from").addEventListener("change", () => setSeasons(+$("from").value, state.seasonTo));
    $("to").addEventListener("change", () => setSeasons(state.seasonFrom, +$("to").value));
    document.querySelectorAll("[data-range]").forEach((b) =>
      b.addEventListener("click", () => {
        const [a, z] = b.dataset.range.split("-").map(Number);
        setSeasons(a, z);
      })
    );
    $("player").addEventListener("input", onPlayerInput);
    $("player").addEventListener("change", onPlayerInput);
    $("group").addEventListener("change", () => update({ group: $("group").value }));
    document.querySelectorAll("input[name=cutoff]").forEach((r) =>
      r.addEventListener("change", () => update({ cutoff: +r.value }))
    );
    $("putting").addEventListener("change", () => update({ putting: $("putting").checked }));
    $("reset").addEventListener("click", reset);
    $("cost-cand").addEventListener("input", renderCost);
    $("cost-other").addEventListener("input", renderCost);
    $("cost-cand").value = COST_DEFAULT;
    $("cost-other").value = COST_DEFAULT;
  }

  function setSeasons(a, z) {
    if (a > z) [a, z] = [z, a];
    update({ seasonFrom: a, seasonTo: z });
  }

  function onPlayerInput() {
    const v = $("player").value.trim();
    const match = names.find((n) => n.toLowerCase() === v.toLowerCase());
    if (!v) {
      $("player-hint").textContent = "";
      if (state.player) update({ player: "" });
    } else if (match) {
      $("player-hint").textContent = "";
      if (match !== state.player) selectPlayer(match);
    } else {
      $("player-hint").textContent = "Pick a name from the list";
    }
  }

  function selectPlayer(name) {
    $("player").value = name;
    $("player-hint").textContent = "";
    update({ player: name });
    $("spotlight-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function syncControls() {
    $("from").value = state.seasonFrom;
    $("to").value = state.seasonTo;
    $("group").value = state.group;
    $("putting").checked = state.putting;
    $("player").value = state.player;
    document.querySelectorAll("input[name=cutoff]").forEach((r) => (r.checked = +r.value === state.cutoff));
    document.querySelectorAll("[data-range]").forEach((b) => {
      const [a, z] = b.dataset.range.split("-").map(Number);
      b.setAttribute("aria-pressed", String(a === state.seasonFrom && z === state.seasonTo));
    });
  }

  function update(patch) {
    state = { ...state, ...patch };
    syncControls();
    render();
  }

  function reset() {
    state = { ...B.DEFAULTS };
    sort = { key: "ball_striking", dir: -1 };
    $("cost-cand").value = COST_DEFAULT;
    $("cost-other").value = COST_DEFAULT;
    $("player-hint").textContent = "";
    syncControls();
    render();
  }

  const isDefault = () => Object.keys(B.DEFAULTS).every((k) => state[k] === B.DEFAULTS[k]);

  // ---------- render ----------
  let view = null;

  function render() {
    const filtered = B.filterRows(rows, state);
    const s = B.summary(filtered, state);
    view = { filtered, s };

    renderStatus(filtered);
    renderSpotlight();
    C.scoreCards($("cards"), s, B.MIN_GROUP);
    renderCharts(filtered, s);
    renderCost();
    renderTable(filtered);
  }

  function renderStatus(filtered) {
    const seasons = state.seasonFrom === state.seasonTo ? `season ${state.seasonFrom}` : `seasons ${state.seasonFrom}–${state.seasonTo}`;
    const group = state.group === "all" ? "all groups" : GROUP_LABEL[state.group].toLowerCase() + (state.group === "elite" ? "" : "s");
    const parts = [
      `<b>${F.int(filtered.length)}</b> player-seasons`,
      seasons,
      state.player ? C.esc(state.player) : "all players",
      group,
      `top ${state.cutoff}% ball-striking`,
      state.putting ? "putting below average" : "putting condition off",
    ];
    $("status").innerHTML =
      "Showing " + parts.join(" · ") + ". " +
      (isDefault() ? "<b>Default view: the cards match the report.</b>" : "Press Reset to return to the report's defaults.");
  }

  function renderCharts(filtered, s) {
    const min = B.MIN_GROUP;

    const f1 = B.categoryCorrelations(filtered);
    $("f1-n").textContent = `${F.int(f1.n)} player-seasons with a qualified next season`;
    C.bars($("f1-chart"), f1.items.map((i) => ({
      label: i.label, value: i.r, display: "r = " + F.r(i.r), cls: "neutral", n: f1.n,
      tooFew: f1.n < min || i.r === null,
      selected: i.key === "ball_striking" || i.key === "sg_putt",
    })), { max: 1, room: 0.85, aria: "Correlation with next season's top-10 rate" });

    const bar = (label, sub, st, cls) => ({
      label, sub, value: st.rate, display: F.pct(st.rate), of: F.of(st), cls, n: st.n, tooFew: st.n < min,
    });
    C.bars($("f2-chart"), [
      bar("Candidates", "became elite", s.candidate, "candidate"),
      bar("Other non-elite", "became elite", s.other, "other"),
      bar("Elite", "stayed elite", s.elite, "elite"),
    ], { max: 1, room: 0.8, aria: "Share elite the next season by group" });

    const f3 = B.candidateMovement(filtered, state);
    $("f3-n").textContent = `${f3.n} candidates with a qualified next season`;
    if (f3.n < min) {
      $("f3-chart").innerHTML = `<p class="muted">Too few players: ${f3.n} candidates with a qualified next season (needs ${min}+).</p>`;
    } else {
      C.hole($("f3-chart"), [
        { label: "Putting", from: f3.putt.from, to: f3.putt.to },
        { label: "Ball-striking", from: f3.bs.from, to: f3.bs.to },
      ], { aria: "Candidates' putting and ball-striking, season t to t+1" });
    }

    const f4 = B.cutoffRates(filtered, state.putting);
    $("f4-sub").textContent =
      `Non-elite players above each cutoff${state.putting ? " with below-average putting" : ""}. Grey bar: other non-elite players at the selected top-${state.cutoff}% cutoff.`;
    C.bars($("f4-chart"), [
      ...f4.map((c) => ({
        label: `Top ${c.cutoff}%`, sub: c.cutoff === state.cutoff ? "selected" : "", value: c.rate, display: F.pct(c.rate),
        of: F.of(c), cls: "candidate", n: c.n, tooFew: c.n < min, selected: c.cutoff === state.cutoff,
      })),
      bar("Other non-elite", `top-${state.cutoff}% definition`, s.other, "other"),
    ], { max: 1, room: 0.8, aria: "Candidate breakout rate by ball-striking cutoff" });

    C.scatter($("scatter"), filtered.map((r) => {
      const g = B.groupOf(r, state);
      const mine = state.player && r.player === state.player;
      return {
        x: r.ball_striking, y: r.sg_putt, cls: g, top: mine, focus: mine,
        ring: r.elite === 0 && r.elite_next === 1,
        label: mine ? String(r.season) : null,
        player: r.player,
        tip: `<b>${C.esc(r.player)}</b> · ${r.season}<br>${GROUP_LABEL[g]}<br>Ball-striking ${F.sg(r.ball_striking)} · putting ${F.sg(r.sg_putt)}<br>` +
          `Top 10s: ${r.top10s} of ${r.starts} (${F.pct(r.top10_rate)})<br>Elite next season: ${nextLabel(r)}`,
      };
    }), {
      labels: !!state.player,
      xLabel: "Ball-striking (strokes gained per round)",
      yLabel: "Putting (strokes gained per round)",
      aria: "Ball-striking vs putting for the current view",
      onClick: (p) => { if (p.player !== state.player) selectPlayer(p.player); },
    });
  }

  function nextLabel(r) {
    if (r.elite_next === null) return "not in data";
    if (r.elite_next === 1) return "yes";
    return r.next_qualified === 0 ? "no (no qualified season)" : "no";
  }

  // ---------- player spotlight ----------
  function renderSpotlight() {
    const wrap = $("spotlight-wrap");
    if (!state.player) { wrap.hidden = true; return; }
    wrap.hidden = false;
    const hist = rows.filter((r) => r.player === state.player).sort((a, b) => a.season - b.season);
    const opts = state;
    const el = $("spotlight");
    const seasonsTxt = hist.length === 1 ? "1 qualified season" : `${hist.length} qualified seasons`;
    el.innerHTML =
      `<div class="spotlight-head"><div><p class="kicker">Player spotlight</p><h3 id="spot-name">${C.esc(state.player)}</h3>` +
      `<p class="muted" style="margin:0">${seasonsTxt}, 2015–2021. Groups use the current cutoff and putting setting.</p></div>` +
      `<button type="button" id="spot-close">Clear player</button></div>` +
      `<p class="chart-title">Top-10 rate by season</p><p class="chart-sub">Dashed line: elite threshold (30%). Red dots: candidate seasons.</p>` +
      `<div class="chart" id="spot-chart"></div>` +
      `<div class="table-wrap" style="margin-top:.8rem"><table><thead><tr><th>Season</th><th>Group</th><th class="n">Starts</th><th class="n">Top 10s</th>` +
      `<th class="n">Top-10 rate</th><th class="n">Ball-striking</th><th class="n">BS pct</th><th class="n">Putting</th><th>Elite next season</th></tr></thead><tbody>` +
      hist.map((r) => {
        const g = B.groupOf(r, opts);
        return `<tr><td>${r.season}${r.season === B.WATCH_SEASON ? " <span class='tag'>watch list year</span>" : ""}</td>` +
          `<td><span class="tag ${g}">${GROUP_LABEL[g]}</span></td><td class="n">${r.starts}</td><td class="n">${r.top10s}</td>` +
          `<td class="n">${F.pct(r.top10_rate)}</td><td class="n">${F.sg(r.ball_striking)}</td><td class="n">${F.pct(r.bs_pct, 0)}</td>` +
          `<td class="n">${F.sg(r.sg_putt)}</td><td>${nextLabel(r)}</td></tr>`;
      }).join("") +
      `</tbody></table></div>`;
    $("spot-close").addEventListener("click", () => update({ player: "" }));
    C.miniLine($("spot-chart"), hist.map((r) => {
      const g = B.groupOf(r, opts);
      return {
        x: r.season, y: r.top10_rate,
        cls: g === "candidate" ? "is-candidate" : g === "elite" ? "is-elite" : "",
        tip: `<b>${r.season}</b><br>Top-10 rate ${F.pct(r.top10_rate)} (${r.top10s} of ${r.starts})<br>${GROUP_LABEL[g]}`,
      };
    }), { threshold: 0.3, domain: [B.SUMMARY_FIRST, B.WATCH_SEASON], aria: `Top-10 rate by season for ${state.player}` });
  }

  // ---------- cost tool ----------
  const money = (x) => "$" + Math.round(x).toLocaleString("en-US");

  function renderCost() {
    if (!view) return;
    const { s } = view;
    const cc = Math.max(+$("cost-cand").value || 0, 0);
    const co = Math.max(+$("cost-other").value || 0, 0);
    const line = (name, st, cost) => {
      const ok = st.n >= B.MIN_GROUP && st.rate > 0;
      return `<tr><td>${name}</td><td class="n">${st.n < B.MIN_GROUP ? `too few (${st.n})` : `${F.pct(st.rate)} <span class="muted">· ${F.of(st)}</span>`}</td>` +
        `<td class="n">${ok ? F.x1(1 / st.rate) : "–"}</td><td class="n">${money(cost)}</td><td class="n">${ok ? money(cost / st.rate) : "–"}</td></tr>`;
    };
    $("cost-table").innerHTML =
      `<thead><tr><th>Group</th><th class="n">Breakout rate</th><th class="n">Signings per breakout</th><th class="n">Cost per signing</th><th class="n">Cost per breakout</th></tr></thead><tbody>` +
      line("Candidates", s.candidate, cc) + line("Other non-elite", s.other, co) + `</tbody>`;

    const ok = s.candidate.n >= B.MIN_GROUP && s.other.n >= B.MIN_GROUP && s.candidate.rate > 0 && s.other.rate > 0;
    if (!ok) {
      $("cost-verdict").textContent = "This view has too few players or no breakouts in a group, so cost per breakout and the break-even ratio can't be computed.";
      return;
    }
    const be = s.breakEven;
    const perC = cc / s.candidate.rate, perO = co / s.other.rate;
    let verdict = `Break-even ratio: <b>${be.toFixed(2)}</b>. Candidates are the cheaper route to a breakout unless a non-candidate signing costs less than ` +
      `${be.toFixed(2)}× a candidate signing (${money(cc * be)} at your candidate cost). `;
    if (cc > 0 && co > 0) {
      verdict += perC < perO
        ? `With your costs, candidates are cheaper by <b>${money(perO - perC)}</b> per breakout.`
        : perC > perO
          ? `With your costs, other non-elite players are cheaper by <b>${money(perC - perO)}</b> per breakout.`
          : "With your costs, both routes cost the same per breakout.";
    }
    $("cost-verdict").innerHTML = verdict;
  }

  // ---------- table ----------
  const COLS = [
    { key: "player", label: "Player" },
    { key: "season", label: "Season", n: true },
    { key: "group", label: "Group" },
    { key: "ball_striking", label: "Ball-striking", n: true },
    { key: "bs_pct", label: "BS pct", n: true },
    { key: "sg_putt", label: "Putting", n: true },
    { key: "top10_rate", label: "Top-10 rate", n: true },
    { key: "elite_next", label: "Elite next season" },
  ];

  function renderTable(filtered) {
    const val = (r, k) => (k === "group" ? GROUP_LABEL[B.groupOf(r, state)] : r[k]);
    const sorted = filtered.slice().sort((a, b) => {
      const x = val(a, sort.key), y = val(b, sort.key);
      if (x === y) return a.player.localeCompare(b.player) || a.season - b.season;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * sort.dir;
    });
    $("table-count").textContent = `· ${F.int(filtered.length)} rows`;
    $("rows-table").innerHTML =
      `<thead><tr>${COLS.map((c) => {
        const on = sort.key === c.key;
        const arrow = on ? (sort.dir > 0 ? "▲" : "▼") : "";
        return `<th class="sortable${c.n ? " n" : ""}" data-key="${c.key}" tabindex="0" aria-sort="${on ? (sort.dir > 0 ? "ascending" : "descending") : "none"}">${c.label} <span class="arrow">${arrow}</span></th>`;
      }).join("")}</tr></thead><tbody>` +
      sorted.map((r) => {
        const g = B.groupOf(r, state);
        return `<tr><td><button type="button" class="linklike" data-player="${C.esc(r.player)}">${C.esc(r.player)}</button></td>` +
          `<td class="n">${r.season}</td><td><span class="tag ${g}">${GROUP_LABEL[g]}</span></td>` +
          `<td class="n">${F.sg(r.ball_striking)}</td><td class="n">${F.pct(r.bs_pct, 0)}</td><td class="n">${F.sg(r.sg_putt)}</td>` +
          `<td class="n">${F.pct(r.top10_rate)} <span class="muted">(${r.top10s}/${r.starts})</span></td><td>${nextLabel(r)}</td></tr>`;
      }).join("") + `</tbody>`;
  }

  function initTableEvents() {
    const t = $("rows-table");
    const resort = (key) => {
      sort = sort.key === key ? { key, dir: -sort.dir } : { key, dir: key === "player" || key === "group" ? 1 : -1 };
      renderTable(view.filtered);
    };
    t.addEventListener("click", (e) => {
      const th = e.target.closest("th[data-key]");
      if (th) return resort(th.dataset.key);
      const b = e.target.closest("button[data-player]");
      if (b) selectPlayer(b.dataset.player);
    });
    t.addEventListener("keydown", (e) => {
      const th = e.target.closest("th[data-key]");
      if (th && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); resort(th.dataset.key); }
    });
  }

  let lastW = 0;
  window.addEventListener("resize", () => {
    if (!view || Math.abs(window.innerWidth - lastW) < 20) return;
    lastW = window.innerWidth;
    clearTimeout(window.__rt);
    window.__rt = setTimeout(render, 120);
  });

  fetch("players.csv")
    .then((r) => { if (!r.ok) throw new Error(`players.csv: HTTP ${r.status}`); return r.text(); })
    .then((t) => {
      rows = B.parseCSV(t);
      lastW = window.innerWidth;
      initControls();
      initTableEvents();
      syncControls();
      render();
    })
    .catch((e) => {
      const box = $("load-error");
      box.hidden = false;
      box.textContent = `Could not load players.csv (${e.message}). Open the page through a web server, for example the GitHub Pages site.`;
    });
})();
