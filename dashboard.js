/* Dashboard page: loads players.csv and recomputes every card, chart and table
   from the rows that pass the filters. Reset restores the report's defaults. */
(function () {
  "use strict";
  const B = window.Breakout, C = window.Charts, F = B.fmt;
  const $ = (id) => document.getElementById(id);
  const COST_DEFAULT = 250000;
  const MAX_PLAYERS = 8;
  const GROUP_LABEL = { candidate: "Candidate", other: "Other non-elite", elite: "Elite" };
  // Cards whose players a Player type choice leaves out (the correlation card is not tied to a type).
  const EXCLUDES = { candidate: ["other", "elite"], other: ["candidate", "elite"], elite: ["candidate", "other"] };

  let rows = [];
  let names = [];
  let state = { ...B.DEFAULTS, players: [] };
  let sort = { key: "ball_striking", dir: -1 };
  const closedCards = new Set(); // player cards the reader collapsed

  // ---------- controls ----------
  function initControls() {
    for (let s = B.SUMMARY_FIRST; s <= B.SUMMARY_LAST; s++) {
      $("from").add(new Option(s, s));
      $("to").add(new Option(s, s));
    }
    names = [...new Set(rows.map((r) => r.player))].sort();
    $("player-list").innerHTML = names.map((n) => `<option value="${C.esc(n)}"></option>`).join("");

    // If From ends up later than To (or To earlier than From), move the other end to match.
    $("from").addEventListener("change", () => {
      const a = +$("from").value;
      update({ seasonFrom: a, seasonTo: Math.max(a, state.seasonTo) });
    });
    $("to").addEventListener("change", () => {
      const z = +$("to").value;
      update({ seasonFrom: Math.min(state.seasonFrom, z), seasonTo: z });
    });

    // Picking a name from the suggestion list adds it; typing alone does not, so a
    // name that is the start of another name is never added by accident.
    $("player").addEventListener("input", (e) => {
      if (e.inputType && e.inputType !== "insertReplacementText") { $("player-hint").textContent = ""; return; }
      const match = exactName($("player").value);
      if (match) addPlayer(match);
    });
    $("player").addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const v = $("player").value.trim();
      if (!v) return;
      const match = exactName(v);
      if (match) addPlayer(match);
      else $("player-hint").textContent = "Pick a name from the list.";
    });
    $("chips").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-remove]");
      if (b) removePlayer(b.dataset.remove);
    });
    $("clear-players").addEventListener("click", () => {
      update({ players: [] });
      $("player").focus();
    });

    $("group").addEventListener("change", () => update({ group: $("group").value }));
    $("cutoff").addEventListener("change", () => update({ cutoff: +$("cutoff").value }));
    $("putting").addEventListener("change", () => update({ putting: $("putting").checked }));
    $("reset").addEventListener("click", reset);
    $("cost-cand").addEventListener("input", renderCost);
    $("cost-other").addEventListener("input", renderCost);
    $("cost-cand").value = COST_DEFAULT;
    $("cost-other").value = COST_DEFAULT;
    $("spotlight").addEventListener("toggle", (e) => {
      const d = e.target.closest("details[data-player]");
      if (!d) return;
      if (d.open) closedCards.delete(d.dataset.player);
      else closedCards.add(d.dataset.player);
    }, true);
  }

  // While Player type is Elite or players are selected, the candidate definition rests at the
  // report's default (top 15%, putting below average). The reader's own cutoff and putting
  // choices stay in state and come back when that ends.
  const lockReason = () => (state.players.length ? "players" : state.group === "elite" ? "elite" : null);
  const eff = () => (lockReason() ? { ...state, cutoff: B.DEFAULTS.cutoff, putting: B.DEFAULTS.putting } : state);
  const LOCK_NOTE = { players: "Not used while players are selected", elite: "Not used for elite players" };

  const exactName = (v) => names.find((n) => n.toLowerCase() === v.trim().toLowerCase());

  function addPlayer(name) {
    $("player").value = "";
    if (state.players.includes(name)) { $("player-hint").textContent = `${name} is already added.`; return; }
    if (state.players.length >= MAX_PLAYERS) { $("player-hint").textContent = `Up to ${MAX_PLAYERS} players.`; return; }
    $("player-hint").textContent = "";
    update({ players: [...state.players, name] });
  }

  function removePlayer(name) {
    update({ players: state.players.filter((p) => p !== name) });
    $("player").focus();
  }

  function syncControls() {
    const picking = state.players.length > 0;
    $("from").value = state.seasonFrom;
    $("to").value = state.seasonTo;
    $("group").value = state.group; // kept while players are selected, so it comes back when they are cleared
    $("group").disabled = picking;
    $("group-note").hidden = !picking;
    const why = lockReason();
    const e = eff();
    $("putting").checked = e.putting;
    $("cutoff").value = String(e.cutoff);
    $("cutoff").disabled = !!why;
    $("putting").disabled = !!why;
    $("putting").closest(".toggle").classList.toggle("is-disabled", !!why);
    $("strength-note").hidden = !why;
    $("strength-note").textContent = why ? LOCK_NOTE[why] : "";
    const full = state.players.length >= MAX_PLAYERS;
    $("player").disabled = full;
    $("player").placeholder = full ? `Up to ${MAX_PLAYERS} players` : "Type a name…";
    $("chips-row").hidden = !picking;
    $("chips").innerHTML = state.players
      .map((p) => `<li class="chip"><span>${C.esc(p)}</span><button type="button" data-remove="${C.esc(p)}" aria-label="Remove ${C.esc(p)}">×</button></li>`)
      .join("");
  }

  function update(patch) {
    state = { ...state, ...patch };
    syncControls();
    render();
  }

  function reset() {
    state = { ...B.DEFAULTS, players: [] };
    sort = { key: "ball_striking", dir: -1 };
    closedCards.clear();
    $("cost-cand").value = COST_DEFAULT;
    $("cost-other").value = COST_DEFAULT;
    $("player").value = "";
    $("player-hint").textContent = "";
    syncControls();
    render();
  }

  // ---------- render ----------
  let view = null;

  function render() {
    const e = eff();
    const filtered = B.filterRows(rows, e);
    const s = B.summary(filtered, e);
    view = { filtered, s };

    const excluded = new Set(state.players.length || state.group === "all" ? [] : EXCLUDES[state.group]);
    renderSpotlight();
    C.scoreCards($("cards"), s, B.MIN_GROUP, excluded);
    // The putting condition changes who counts as a candidate; point to the report's explanation.
    $("putting-link").hidden = !(!state.putting && !lockReason());
    const span = state.seasonFrom === state.seasonTo ? `Season ${state.seasonFrom}` : `Seasons ${state.seasonFrom}–${state.seasonTo}`;
    $("sc-caption").textContent = `${span}, ${F.int(filtered.length)} player-seasons. Each rate shows its count, because the groups are small.`;
    renderCharts(filtered, s);
    renderCost();
    renderTable(filtered);
  }

  // Findings 1-4 recomputed from the filtered rows, plus the scatter.
  // The fifth finding needs a fixed 2015-2019 window, so it stays on the report.
  function renderCharts(filtered, s) {
    const min = B.MIN_GROUP;
    const e = eff();
    // Each subtitle ends with the scope of the rows that chart uses.
    const span = state.seasonFrom === state.seasonTo ? `season ${state.seasonFrom}` : `seasons ${state.seasonFrom}–${state.seasonTo}`;
    const scope = (n) => ` · ${span} · ${F.int(n)} player-seasons`;
    const bar = (label, sub, st, cls) => ({
      label, sub, value: st.rate, display: F.pct(st.rate), of: F.of(st), cls, n: st.n, tooFew: st.n < min,
    });

    C.bars($("f2-chart"), [
      bar("Candidates", "became elite", s.candidate, "candidate"),
      bar("Other non-elite", "became elite", s.other, "other"),
      bar("Elite", "stayed elite", s.elite, "elite"),
    ], { room: 0.55, aria: "Share elite the next season by player type" });
    $("f2-scope").textContent = scope(filtered.length); // scaled to the largest bar; room leaves space for its label

    const f1 = B.categoryCorrelations(filtered);
    $("f1-n").textContent = `${F.int(f1.n)} player-seasons with a qualified next season`;
    $("f1-scope").textContent = scope(filtered.length);
    C.bars($("f1-chart"), f1.items.map((i) => ({
      label: i.label, value: i.r, display: "r = " + F.r(i.r), cls: "neutral", n: f1.n,
      tooFew: f1.n < min || i.r === null,
      selected: i.key === "ball_striking" || i.key === "sg_putt",
    })), { max: 1, room: 0.85, aria: "Correlation with next season's top-10 rate" });

    // The cutoff chart compares cutoffs across everyone in the chosen seasons, so it ignores
    // Player type and selected players and follows only the seasons and the putting condition.
    const seasonRows = rows.filter((r) => r.season >= state.seasonFrom && r.season <= state.seasonTo);
    const f4 = B.cutoffRates(seasonRows, e.putting);
    const f4Other = B.summary(seasonRows, { ...e, group: "all", players: [] }).other;
    $("f4-sub").textContent =
      `Non-elite players above each cutoff${e.putting ? " who putted below the tour average" : ""}. Grey bar: other non-elite players at the selected top-${e.cutoff}% cutoff${scope(seasonRows.length)}.`;
    C.bars($("f4-chart"), [
      ...f4.map((c) => ({
        label: `Top ${c.cutoff}%`, sub: c.cutoff === e.cutoff ? "selected" : "", value: c.rate, display: F.pct(c.rate),
        of: F.of(c), cls: "candidate", n: c.n, tooFew: c.n < min, selected: c.cutoff === e.cutoff,
      })),
      bar("Other non-elite", `top-${e.cutoff}% definition`, f4Other, "other"),
    ], { max: 1, room: 0.8, aria: "Candidate breakout rate by ball-striking cutoff" });

    const f3 = B.candidateMovement(filtered, e);
    $("f3-n").textContent = `${f3.n} candidates with a qualified next season`;
    $("f3-scope").textContent = scope(filtered.length);
    if (f3.n < min) {
      $("f3-chart").innerHTML = `<p class="muted">${C.onlyN(f3.n, "candidate", min)}</p>`;
    } else {
      C.hole($("f3-chart"), [
        { label: "Putting", from: f3.putt.from, to: f3.putt.to },
        { label: "Ball-striking", from: f3.bs.from, to: f3.bs.to },
      ], { aria: "Candidates' putting and ball-striking, from the season measured to the next season" });
    }

    // With players selected, everyone in the chosen seasons stays on the scatter as faded
    // context and the selected players' dots are circled.
    const picking = state.players.length > 0;
    const scatterRows = picking ? rows.filter((r) => r.season >= state.seasonFrom && r.season <= state.seasonTo) : filtered;
    const mine = (r) => picking && state.players.includes(r.player);
    // Label each selected player once, at their latest season in view, so labels don't pile up.
    const latest = new Map();
    scatterRows.filter(mine).forEach((r) => latest.set(r.player, Math.max(latest.get(r.player) || 0, r.season)));
    $("scatter-note").textContent = (picking
      ? "Green rings: the players you added, each named at their latest season. Other dots show everyone in the chosen seasons, for context"
      : "Each dot is one player-season in the current view; 0 = tour average. Click a dot to add that player") + scope(scatterRows.length) + ".";
    C.scatter($("scatter"), scatterRows.map((r) => {
      const g = B.groupOf(r, e);
      return {
        x: r.ball_striking, y: r.sg_putt, cls: g, top: mine(r), select: mine(r), faded: picking && !mine(r),
        ring: r.elite === 0 && r.elite_next === 1 && (!picking || mine(r)),
        label: mine(r) && latest.get(r.player) === r.season ? shortName(r.player) : null,
        player: r.player,
        tip: `<b>${C.esc(r.player)}</b> · ${r.season}<br>${GROUP_LABEL[g]}<br>Ball-striking ${F.sg(r.ball_striking)} · putting ${F.sg(r.sg_putt)}<br>` +
          `Top 10s: ${r.top10s} of ${r.starts} (${F.pct(r.top10_rate)})<br>Elite next season: ${nextLabel(r)}`,
      };
    }), {
      labels: picking,
      otherR: 3,
      xLabel: "Ball-striking (strokes gained per round)",
      yLabel: "Putting (strokes gained per round)",
      aria: "Ball-striking vs putting for the current view",
      onClick: (p) => { if (!state.players.includes(p.player)) addPlayer(p.player); },
    });
  }

  const shortName = (name) => name.split(" ").slice(1).join(" ") || name;

  function nextLabel(r) {
    if (r.elite_next === null) return "not in data";
    if (r.elite_next === 1) return "yes";
    return r.next_qualified === 0 ? "no (no qualified season)" : "no";
  }

  // ---------- player cards: one compact, collapsible card per selected player ----------
  function renderSpotlight() {
    const wrap = $("spotlight-wrap");
    if (!state.players.length) { wrap.hidden = true; $("spotlight").innerHTML = ""; return; }
    wrap.hidden = false;
    $("spotlight").innerHTML = state.players.map((name) => {
      const hist = rows.filter((r) => r.player === name).sort((a, b) => a.season - b.season);
      const seasonsTxt = hist.length === 1 ? "1 qualified season" : `${hist.length} qualified seasons`;
      const body = hist.map((r) => {
        const g = B.groupOf(r, eff());
        const out = r.season < state.seasonFrom || r.season > state.seasonTo;
        return `<tr class="${out ? "out" : ""}"><td>${r.season}${r.season === B.WATCH_SEASON ? " <span class='tag plain'>(watch list year)</span>" : ""}</td>` +
          `<td><span class="tag ${g}">${GROUP_LABEL[g]}</span></td><td class="n">${F.sg(r.ball_striking)}</td><td class="n">${F.sg(r.sg_putt)}</td>` +
          `<td class="n">${F.pct(r.top10_rate)}</td><td>${nextLabel(r)}</td></tr>`;
      }).join("");
      return `<details class="spot" data-player="${C.esc(name)}"${closedCards.has(name) ? "" : " open"}>` +
        `<summary><span class="spot-name">${C.esc(name)}</span> <span class="muted">${seasonsTxt}, 2015–2021</span></summary>` +
        `<div class="table-wrap"><table><thead><tr><th>Season</th><th>Player type</th><th class="n">Ball-striking</th><th class="n">Putting</th>` +
        `<th class="n">Top-10 rate</th><th>Elite next season</th></tr></thead><tbody>${body}</tbody></table></div></details>`;
    }).join("") +
      `<p class="spot-foot muted">Player types use the current cutoff and putting setting. Grey rows fall outside the chosen seasons.</p>`;
  }

  // ---------- cost tool ----------
  const money = (x) => "$" + Math.round(x).toLocaleString("en-US");

  function renderCost() {
    if (!view) return;
    const { s } = view;
    const cc = Math.max(+$("cost-cand").value || 0, 0);
    const co = Math.max(+$("cost-other").value || 0, 0);
    const computable = (st) => st.n >= B.MIN_GROUP && st.rate > 0;
    // The cheaper route gets bold green; the sentence below the table says the same in words.
    const both = computable(s.candidate) && computable(s.other) && cc > 0 && co > 0;
    const perCand = both ? cc / s.candidate.rate : null, perOther = both ? co / s.other.rate : null;
    const cheaper = both && perCand !== perOther ? (perCand < perOther ? "candidate" : "other") : null;
    const line = (name, key, st, cost) => {
      const ok = computable(st);
      const perBreakout = ok ? money(cost / st.rate) : "–";
      return `<tr><td>${name}</td><td class="n">${st.n < B.MIN_GROUP ? C.onlyN(st.n, "player-season", B.MIN_GROUP) : F.pct(st.rate)}</td>` +
        `<td class="n">${ok ? F.x1(1 / st.rate) : "–"}</td><td class="n">${money(cost)}</td>` +
        `<td class="n">${cheaper === key ? `<b class="cheaper">${perBreakout}</b>` : perBreakout}</td></tr>`;
    };
    $("cost-table").innerHTML =
      `<thead><tr><th>Player type</th><th class="n">Breakout rate</th><th class="n">Signings per breakout</th><th class="n">Cost per signing</th><th class="n">Cost per breakout</th></tr></thead><tbody>` +
      line("Candidates", "candidate", s.candidate, cc) + line("Other non-elite", "other", s.other, co) + `</tbody>`;

    const ok = s.candidate.n >= B.MIN_GROUP && s.other.n >= B.MIN_GROUP && s.candidate.rate > 0 && s.other.rate > 0;
    if (!ok) {
      $("cost-verdict").textContent = "A group in this view has fewer than 10 player-seasons or no breakouts, so cost per breakout and the break-even ratio can't be computed.";
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
    { key: "group", label: "Player type" },
    { key: "ball_striking", label: "Ball-striking", n: true },
    { key: "bs_pct", label: "BS pct", n: true },
    { key: "sg_putt", label: "Putting", n: true },
    { key: "top10_rate", label: "Top-10 rate", n: true },
    { key: "elite_next", label: "Elite next season" },
  ];

  function renderTable(filtered) {
    const e = eff();
    const val = (r, k) => (k === "group" ? GROUP_LABEL[B.groupOf(r, e)] : r[k]);
    const sorted = filtered.slice().sort((a, b) => {
      const x = val(a, sort.key), y = val(b, sort.key);
      if (x === y) return a.player.localeCompare(b.player) || a.season - b.season;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * sort.dir;
    });
    $("table-count").textContent = `${F.int(filtered.length)} player-seasons in this view.`;
    $("rows-table").innerHTML =
      `<thead><tr>${COLS.map((c) => {
        const on = sort.key === c.key;
        const arrow = on ? (sort.dir > 0 ? "▲" : "▼") : "";
        return `<th class="sortable${c.n ? " n" : ""}" data-key="${c.key}" tabindex="0" aria-sort="${on ? (sort.dir > 0 ? "ascending" : "descending") : "none"}">${c.label} <span class="arrow">${arrow}</span></th>`;
      }).join("")}</tr></thead><tbody>` +
      sorted.map((r) => {
        const g = B.groupOf(r, e);
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
      if (b && !state.players.includes(b.dataset.player)) addPlayer(b.dataset.player);
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
