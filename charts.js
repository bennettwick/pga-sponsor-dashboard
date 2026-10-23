/* Chart helpers shared by both pages: HTML bars, SVG dumbbell ("tee to pin"),
   SVG scatter, and a small line chart. Charts are drawn at the container's
   current width so text stays readable on phones. */
(function (root) {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ---------- tooltip ----------
  let tipEl = null;
  function tip() {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "tooltip";
      tipEl.setAttribute("role", "status");
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  function showTip(html, x, y) {
    const t = tip();
    t.innerHTML = html;
    const half = 135;
    t.style.left = Math.min(Math.max(x, half), window.innerWidth - half) + "px";
    t.style.top = Math.max(y, 70) + "px";
    t.classList.add("show");
  }
  function hideTip() { if (tipEl) tipEl.classList.remove("show"); }

  // ---------- helpers ----------
  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, str, attrs) {
    const t = svgEl("text", { x, y, ...attrs }, parent);
    t.textContent = str;
    return t;
  }
  const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

  function niceTicks(min, max, target) {
    const span = max - min;
    const raw = span / Math.max(target, 1);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(10));
    return ticks;
  }
  const sgTick = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + String(+Math.abs(v).toFixed(2));
  const width = (el) => Math.max(el.clientWidth || 0, 280);

  // ---------- bars (HTML) ----------
  // items: {label, sub, value (0..), display, of, cls, tooFew, selected}
  function bars(el, items, opts = {}) {
    const max = opts.max ?? Math.max(...items.map((i) => (i.tooFew ? 0 : i.value || 0)), 1e-9);
    const room = opts.room ?? 0.72; // longest bar takes this share of the track, leaving space for its label
    el.innerHTML =
      `<div class="bars" role="list" aria-label="${esc(opts.aria || "")}">` +
      items
        .map((i) => {
          const w = i.tooFew || i.value === null ? 0 : Math.max((i.value / max) * room * 100, 0.4);
          const val = i.tooFew
            ? `<span class="of">too few players (${i.n})</span>`
            : `<b>${esc(i.display)}</b>${i.of ? ` <span class="of">· ${esc(i.of)}</span>` : ""}`;
          return (
            `<div class="bar-label${i.selected ? " bar-row-selected" : ""}" role="listitem">${esc(i.label)}` +
            (i.sub ? `<span class="bar-sub">${esc(i.sub)}</span>` : "") +
            `</div><div class="bar-track"><span class="bar-fill ${i.cls || "neutral"}" style="width:${w}%"></span>` +
            `<span class="bar-value">${val}</span></div>`
          );
        })
        .join("") +
      `</div>`;
  }

  // ---------- dumbbell drawn as a hole: tee (season t) to pin (season t+1) ----------
  // rows: {label, from, to}
  function hole(el, rows, opts = {}) {
    el.innerHTML = "";
    const W = width(el);
    const narrow = W < 520;
    const m = { top: 14, right: 26, bottom: 44, left: narrow ? 16 : 120 };
    const rowH = narrow ? 104 : 80;
    const H = m.top + rows.length * rowH + m.bottom;
    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "" }, el);
    const vals = rows.flatMap((r) => [r.from, r.to]).filter((v) => v !== null);
    if (!vals.length) {
      text(svg, W / 2, H / 2, "Too few players in this view", { "text-anchor": "middle", class: "axis-label" });
      return;
    }
    const lo = Math.min(-0.4, ...vals) - 0.1;
    const hi = Math.max(0.4, ...vals) + 0.15;
    const x = scale(lo, hi, m.left, W - m.right);
    const ticks = niceTicks(lo, hi, narrow ? 4 : 7);
    const plotBottom = H - m.bottom;
    ticks.forEach((t) => {
      svgEl("line", { x1: x(t), x2: x(t), y1: m.top, y2: plotBottom, class: t === 0 ? "zero-line" : "grid-line" }, svg);
      text(svg, x(t), plotBottom + 18, sgTick(t), { "text-anchor": "middle", class: "tick-label" });
    });
    text(svg, x(0), m.top + 2, "tour avg", { "text-anchor": "start", dx: 4, dy: 8, class: "axis-label" });
    text(svg, (m.left + W - m.right) / 2, H - 6, "Strokes gained per round", { "text-anchor": "middle", class: "axis-label" });

    rows.forEach((r, i) => {
      const cy = m.top + i * rowH + (narrow ? 70 : 46);
      if (narrow) text(svg, m.left, cy - 46, r.label, { class: "row-label" });
      else text(svg, m.left - 14, cy + 4, r.label, { "text-anchor": "end", class: "row-label" });
      if (r.from === null || r.to === null) return;
      const x0 = x(r.from), x1 = x(r.to);
      // fairway: a soft rounded band from tee to green
      const left = Math.min(x0, x1) - 14, right = Math.max(x0, x1) + 14;
      svgEl("rect", { x: left, y: cy - 11, width: right - left, height: 22, rx: 11, class: "fairway" }, svg);
      svgEl("line", { x1: x0, x2: x1, y1: cy, y2: cy, class: "hole-line" }, svg);
      // tee marker (season t)
      svgEl("circle", { cx: x0, cy, r: 6, class: "tee" }, svg);
      // pin (season t+1): cup, pole, flag
      svgEl("ellipse", { cx: x1, cy: cy + 1, rx: 4, ry: 2, class: "cup" }, svg);
      svgEl("line", { x1: x1, x2: x1, y1: cy, y2: cy - 30, class: "pin-pole" }, svg);
      const dir = x1 >= x0 ? 1 : -1;
      svgEl("path", { d: `M${x1},${cy - 30} L${x1 + dir * 14},${cy - 25} L${x1},${cy - 20} Z`, class: "pin-flag" }, svg);
      const fromLeft = x0 < x1;
      text(svg, x0 + (fromLeft ? -10 : 10), cy + 4, sgTick2(r.from), { "text-anchor": fromLeft ? "end" : "start", class: "val-label" });
      text(svg, x1 + (fromLeft ? 10 : -10), cy + 18, sgTick2(r.to), { "text-anchor": fromLeft ? "start" : "end", class: "val-label" });
      const hit = svgEl("rect", { x: left, y: cy - 34, width: right - left, height: 50, fill: "transparent", tabindex: 0 }, svg);
      const html = `<b>${esc(r.label)}</b><br>Season t: ${sgTick2(r.from)}<br>Next season: ${sgTick2(r.to)}`;
      bindTip(hit, html);
    });
  }
  const sgTick2 = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2);

  function bindTip(node, html) {
    const on = (e) => {
      const r = node.getBoundingClientRect();
      showTip(html, e && e.clientX ? e.clientX : r.left + r.width / 2, e && e.clientY ? e.clientY : r.top);
    };
    node.addEventListener("mousemove", on);
    node.addEventListener("focus", () => on());
    node.addEventListener("mouseleave", hideTip);
    node.addEventListener("blur", hideTip);
  }

  // ---------- scatter ----------
  // pts: {x, y, cls, ring, label, tip, top}; opts: {xLabel, yLabel, labels:boolean, aria, height}
  function scatter(el, pts, opts = {}) {
    el.innerHTML = "";
    const W = width(el);
    const narrow = W < 520;
    const H = opts.height || (narrow ? 340 : 420);
    const m = { top: 16, right: 18, bottom: 46, left: 52 };
    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "" }, el);
    if (!pts.length) {
      text(svg, W / 2, H / 2, "No players in this view", { "text-anchor": "middle", class: "axis-label" });
      return;
    }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const pad = (a, b) => (b - a) * 0.06 || 0.2;
    let x0 = Math.min(...xs, 0), x1 = Math.max(...xs, 0), y0 = Math.min(...ys, 0), y1 = Math.max(...ys, 0);
    x0 -= pad(x0, x1); x1 += pad(x0, x1); y0 -= pad(y0, y1); y1 += pad(y0, y1);
    const x = scale(x0, x1, m.left, W - m.right);
    const y = scale(y0, y1, H - m.bottom, m.top);
    niceTicks(x0, x1, narrow ? 4 : 7).forEach((t) => {
      svgEl("line", { x1: x(t), x2: x(t), y1: m.top, y2: H - m.bottom, class: t === 0 ? "zero-line" : "grid-line" }, svg);
      text(svg, x(t), H - m.bottom + 17, sgTick(t), { "text-anchor": "middle", class: "tick-label" });
    });
    niceTicks(y0, y1, 6).forEach((t) => {
      svgEl("line", { x1: m.left, x2: W - m.right, y1: y(t), y2: y(t), class: t === 0 ? "zero-line" : "grid-line" }, svg);
      text(svg, m.left - 7, y(t) + 4, sgTick(t), { "text-anchor": "end", class: "tick-label" });
    });
    text(svg, (m.left + W - m.right) / 2, H - 8, opts.xLabel || "", { "text-anchor": "middle", class: "axis-label" });
    text(svg, 0, 0, opts.yLabel || "", { transform: `translate(13 ${(m.top + H - m.bottom) / 2}) rotate(-90)`, "text-anchor": "middle", class: "axis-label" });

    const order = { other: 0, elite: 1, candidate: 2 };
    const sorted = pts.slice().sort((a, b) => (order[a.cls] - order[b.cls]) || ((a.top ? 1 : 0) - (b.top ? 1 : 0)));
    const placed = [];
    sorted.forEach((p) => {
      p.px = x(p.x); p.py = y(p.y);
      const r = p.cls === "candidate" || p.top ? 5 : 4;
      svgEl("circle", { cx: p.px, cy: p.py, r, class: `pt ${p.cls}${p.faded ? " faded" : ""}` }, svg);
      if (p.ring) svgEl("circle", { cx: p.px, cy: p.py, r: r + 4, class: "pt-ring" }, svg);
      if (p.focus) svgEl("circle", { cx: p.px, cy: p.py, r: r + 7, class: "pt-focus" }, svg);
      placed.push({ x: p.px - r - 1, y: p.py - r - 1, w: 2 * r + 2, h: 2 * r + 2 });
    });

    if (opts.labels) placeLabels(svg, sorted.filter((p) => p.label), placed, { l: m.left, r: W - m.right, t: m.top, b: H - m.bottom });

    // nearest-point hover layer
    const hit = svgEl("rect", { x: m.left, y: m.top, width: W - m.left - m.right, height: H - m.top - m.bottom, fill: "transparent" }, svg);
    const marker = svgEl("circle", { r: 9, class: "pt-focus", visibility: "hidden" }, svg);
    hit.addEventListener("mousemove", (e) => {
      const b = svg.getBoundingClientRect();
      const mx = e.clientX - b.left, my = e.clientY - b.top;
      let best = null, bd = 24 * 24;
      for (const p of sorted) {
        const d = (p.px - mx) ** 2 + (p.py - my) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) { hideTip(); marker.setAttribute("visibility", "hidden"); return; }
      marker.setAttribute("cx", best.px); marker.setAttribute("cy", best.py); marker.setAttribute("visibility", "visible");
      showTip(best.tip, b.left + best.px, b.top + best.py);
      if (opts.onHover) opts.onHover(best);
    });
    hit.addEventListener("mouseleave", () => { hideTip(); marker.setAttribute("visibility", "hidden"); });
    if (opts.onClick) hit.addEventListener("click", (e) => {
      const b = svg.getBoundingClientRect();
      const mx = e.clientX - b.left, my = e.clientY - b.top;
      let best = null, bd = 24 * 24;
      for (const p of sorted) { const d = (p.px - mx) ** 2 + (p.py - my) ** 2; if (d < bd) { bd = d; best = p; } }
      if (best) opts.onClick(best);
    });
  }

  // Greedy label placement: try right, left, above, below; then shift with a leader line.
  function placeLabels(svg, pts, obstacles, bounds) {
    const boxes = obstacles.slice();
    const overlaps = (b) =>
      b.x < bounds.l || b.x + b.w > bounds.r || b.y < bounds.t || b.y + b.h > bounds.b ||
      boxes.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
    const lab = pts.slice().sort((a, b) => b.px - a.px);
    lab.forEach((p) => {
      const w = p.label.length * 6.9 + 4, h = 15;
      const cands = [
        { x: p.px + 9, y: p.py - h / 2, anchor: "start" },
        { x: p.px - 9 - w, y: p.py - h / 2, anchor: "end" },
        { x: p.px - w / 2, y: p.py - 9 - h, anchor: "middle" },
        { x: p.px - w / 2, y: p.py + 9, anchor: "middle" },
      ];
      for (let s = 1; s <= 5; s++) {
        for (const dir of [-1, 1]) {
          cands.push({ x: p.px + 14, y: p.py - h / 2 + dir * s * 15, anchor: "start", leader: true });
          cands.push({ x: p.px - 14 - w, y: p.py - h / 2 + dir * s * 15, anchor: "end", leader: true });
        }
      }
      const c = cands.find((c) => !overlaps({ x: c.x, y: c.y, w, h })) || cands[0];
      boxes.push({ x: c.x, y: c.y, w, h });
      const tx = c.anchor === "start" ? c.x + 2 : c.anchor === "end" ? c.x + w - 2 : c.x + w / 2;
      if (c.leader) {
        const lx = c.anchor === "start" ? c.x : c.x + w;
        svgEl("line", { x1: p.px, y1: p.py, x2: lx, y2: c.y + h / 2, class: "leader" }, svg);
      }
      text(svg, tx, c.y + 11.5, p.label, { "text-anchor": c.anchor, class: "pt-label" });
    });
  }

  // ---------- small line chart (player history: top-10 rate by season) ----------
  // pts: {x (season), y (rate), cls, tip}; opts.threshold
  function miniLine(el, pts, opts = {}) {
    el.innerHTML = "";
    const W = width(el), H = 190;
    const m = { top: 14, right: 16, bottom: 30, left: 42 };
    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "" }, el);
    const xs = opts.domain || [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))];
    const yMax = Math.max(0.5, ...pts.map((p) => p.y)) * 1.1;
    const x = scale(xs[0] - 0.4, xs[1] + 0.4, m.left, W - m.right);
    const y = scale(0, yMax, H - m.bottom, m.top);
    niceTicks(0, yMax, 4).forEach((t) => {
      svgEl("line", { x1: m.left, x2: W - m.right, y1: y(t), y2: y(t), class: "grid-line" }, svg);
      text(svg, m.left - 6, y(t) + 4, Math.round(t * 100) + "%", { "text-anchor": "end", class: "tick-label" });
    });
    for (let s = xs[0]; s <= xs[1]; s++) text(svg, x(s), H - 10, String(s), { "text-anchor": "middle", class: "tick-label" });
    if (opts.threshold !== undefined) {
      svgEl("line", { x1: m.left, x2: W - m.right, y1: y(opts.threshold), y2: y(opts.threshold), class: "threshold" }, svg);
      text(svg, W - m.right, y(opts.threshold) - 5, "elite: 30%", { "text-anchor": "end", class: "axis-label" });
    }
    // break the line where a season is missing
    let seg = [];
    const flush = () => { if (seg.length > 1) svgEl("polyline", { points: seg.join(" "), class: "mini-line" }, svg); seg = []; };
    pts.forEach((p, i) => {
      if (i && p.x !== pts[i - 1].x + 1) flush();
      seg.push(`${x(p.x)},${y(p.y)}`);
    });
    flush();
    pts.forEach((p) => {
      const c = svgEl("circle", { cx: x(p.x), cy: y(p.y), r: 5, class: `mini-dot ${p.cls || ""}`, tabindex: 0 }, svg);
      bindTip(c, p.tip);
    });
  }

  // ---------- the four summary numbers as scorecard tiles ----------
  // s: result of Breakout.summary(); minGroup: below this, show the count and a note instead of a rate
  function scoreCards(el, s, minGroup) {
    const pct = (x) => (x * 100).toFixed(1) + "%";
    const cards = [
      { label: "Candidate breakout rate", stat: s.candidate, note: "Candidates elite the next season", cls: "is-candidate" },
      { label: "Other non-elite breakout rate", stat: s.other, note: "Other non-elite players elite the next season" },
      { label: "Elite stay-elite rate", stat: s.elite, note: "Elite players still elite the next season" },
      { label: "Ball-striking year-to-year correlation", corr: s.bsCorr, note: "Pearson r, season t vs. t+1" },
    ];
    el.innerHTML = cards
      .map((c) => {
        const n = c.stat ? c.stat.n : c.corr.n;
        let body;
        if (n < minGroup) {
          const unit = c.stat ? "player-season" : "pair";
          body = `<div class="too-few">Too few players</div><div class="card-count">${n} ${unit}${n === 1 ? "" : "s"} (needs ${minGroup}+)</div>`;
        } else if (c.stat) {
          body = `<div class="card-value">${pct(c.stat.rate)}</div><div class="card-count">${c.stat.hits} of ${c.stat.n.toLocaleString("en-US")}</div>`;
        } else {
          body = `<div class="card-value">${c.corr.r.toFixed(2)}</div><div class="card-count">${c.corr.n.toLocaleString("en-US")} pairs</div>`;
        }
        return (
          `<div class="card ${c.cls || ""}">` +
          `<div class="card-label">${esc(c.label)}</div>${body}<div class="card-note">${esc(c.note)}</div></div>`
        );
      })
      .join("");
  }

  root.Charts = { bars, hole, scatter, miniLine, scoreCards, showTip, hideTip, esc };
})(window);
