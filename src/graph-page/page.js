// The graph page. Its data is the JSON in #data, written by `lore graph`.
import { esc, keepLabels, renderBody, seed } from "./render.js";

const data = JSON.parse(document.getElementById("data").textContent);
const PALETTE = ["#7c6cf0", "#e0915a", "#3fa7a0", "#d4699a", "#c9a227", "#5b8fd6", "#8bb04a"];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const typeColor = (t) => (t && data.types.includes(t) ? PALETTE[data.types.indexOf(t) % PALETTE.length] : "#8a8f98");
const FADED = new Set(["superseded", "retired"]);
const HOLLOW = new Set(["draft", "planned", "proposed"]);

const spread = 12 * Math.sqrt(data.nodes.length + 1);
const nodes = data.nodes.map((n) => ({ ...n, ...seed(n.id, spread), vx: 0, vy: 0, deg: 0 }));
const byId = new Map(nodes.map((n) => [n.id, n]));
const edges = data.edges.map((e) => ({ ...e, s: byId.get(e.source), t: byId.get(e.target) })).filter((e) => e.s && e.t);
const out = new Map(), inn = new Map();
for (const n of nodes) { out.set(n, []); inn.set(n, []); }
for (const e of edges) { out.get(e.s).push(e); inn.get(e.t).push(e); e.s.deg++; e.t.deg++; }
// The best-linked notes keep their labels at any zoom, as landmarks.
const hubs = new Set(nodes.filter((n) => n.kind === "note").sort((a, b) => b.deg - a.deg).slice(0, 12).filter((n) => n.deg > 2));
const radius = (n) => (n.kind === "code" ? 4 : 5 + 2.2 * Math.sqrt(n.deg));

// What is shown.
const typeKeys = [...data.types, "untyped"];
const show = { code: false, old: true, orphans: true, types: new Set(typeKeys) };
let focus = null; // { node, set }
let vis = [], visEdges = [];
function refilter() {
  const keep = (n) => {
    if (focus && !focus.set.has(n)) return false;
    if (n.kind === "code") return show.code;
    if (n.kind === "missing") return true;
    if (!show.types.has(n.type && data.types.includes(n.type) ? n.type : "untyped")) return false;
    if (!show.old && FADED.has(n.status)) return false;
    return true;
  };
  let shown = new Set(nodes.filter(keep));
  // A ghost shows only beside a note or file that links to it.
  const linkedToGhost = new Set(edges.filter((e) => shown.has(e.s) && e.t.kind === "missing").map((e) => e.t));
  shown = new Set([...shown].filter((n) => n.kind !== "missing" || linkedToGhost.has(n)));
  visEdges = edges.filter((e) => shown.has(e.s) && shown.has(e.t));
  if (!show.orphans) {
    const linked = new Set(visEdges.flatMap((e) => [e.s, e.t]));
    shown = new Set([...shown].filter((n) => linked.has(n) || n === focus?.node));
  }
  vis = [...shown];
  heat(0.6);
}

// A small force simulation: repulsion, springs on edges, a pull to the centre.
let alpha = 1, running = false;
function heat(a) { alpha = Math.max(alpha, a); if (!running) { running = true; requestAnimationFrame(frame); } }
function tick() {
  for (let i = 0; i < vis.length; i++) {
    const a = vis[i];
    for (let j = i + 1; j < vis.length; j++) {
      const b = vis[j];
      let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
      // Two nodes on one spot: push them apart along a fixed direction, not a random one.
      if (d2 < 1) { dx = ((i * 7 + j * 13) % 11) / 11 - 0.5 || 0.3; dy = ((i * 11 + j * 7) % 13) / 13 - 0.5 || -0.3; d2 = 1; }
      if (d2 > 250000) continue;
      const f = (700 * alpha) / d2;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
  }
  for (const e of visEdges) {
    const len = e.kind === "anchor" || e.kind === "cites" ? 45 : 70;
    const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y, d = Math.hypot(dx, dy) || 1;
    const f = ((d - len) / d) * 0.06 * alpha;
    e.s.vx += dx * f; e.s.vy += dy * f; e.t.vx -= dx * f; e.t.vy -= dy * f;
  }
  for (const n of vis) {
    n.vx -= n.x * 0.006 * alpha; n.vy -= n.y * 0.006 * alpha;
    if (n === dragged) { n.vx = n.vy = 0; continue; }
    n.vx *= 0.55; n.vy *= 0.55; n.x += n.vx; n.y += n.vy;
  }
  alpha *= dragged ? 1 : 0.985;
}
function frame() {
  tick();
  draw();
  if (alpha > 0.004 || dragged) requestAnimationFrame(frame);
  else running = false;
}

// View.
const canvas = document.getElementById("c"), ctx = canvas.getContext("2d");
let W = 0, H = 0, dpr = 1, view = { x: 0, y: 0, k: 1 };
function resize() {
  dpr = window.devicePixelRatio || 1; W = innerWidth; H = innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr; draw();
}
const toWorld = (px, py) => ({ x: (px - W / 2 - view.x) / view.k, y: (py - H / 2 - view.y) / view.k });
// The width the open side panel covers, so the graph fits and centres beside it.
const panelW = () => (innerWidth > 640 && document.getElementById("details").classList.contains("open") ? document.getElementById("details").offsetWidth + 24 : 0);
const controlsW = () => (innerWidth > 640 ? document.getElementById("controls").offsetWidth + 24 : 0);
// The middle of the space between the controls and the side panel, from the window's centre.
const shift = () => (controlsW() - panelW()) / 2;
function fit() {
  if (!vis.length) return;
  const xs = vis.map((n) => n.x), ys = vis.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  view.k = Math.min(2, 0.85 * Math.min((W - panelW() - controlsW()) / (x1 - x0 + 80), H / (y1 - y0 + 80)));
  view.x = -((x0 + x1) / 2) * view.k + shift(); view.y = -((y0 + y1) / 2) * view.k;
}

let hover = null, selected = null, matches = null;
function lit() {
  const n = hover || selected;
  if (matches) return matches;
  if (!n) return null;
  return new Set([n, ...out.get(n).map((e) => e.t), ...inn.get(n).map((e) => e.s)]);
}

function draw() {
  const [edgeC, codeC, ink, muted, bg, warn] = ["--edge", "--code", "--ink", "--muted", "--bg", "--warn"].map(css);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * (W / 2 + view.x), dpr * (H / 2 + view.y));
  const L = lit(), k = view.k;

  for (const e of visEdges) {
    const on = !L || (L.has(e.s) && L.has(e.t) && (matches || e.s === (hover || selected) || e.t === (hover || selected)));
    const code = e.kind === "anchor" || e.kind === "cites", ghost = e.t.kind === "missing";
    const field = !code && !ghost && e.kind !== "link";
    ctx.globalAlpha = (on ? (L ? 0.95 : 0.55) : 0.07) * (ghost ? 0.7 : 1);
    ctx.strokeStyle = code ? codeC : edgeC;
    ctx.lineWidth = (field ? 1.6 : code ? 1.2 : 0.8) / Math.sqrt(k);
    ctx.setLineDash(e.kind === "supersedes" || ghost ? [6 / k, 4 / k] : code ? [2 / k, 3 / k] : []);
    const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y, d = Math.hypot(dx, dy) || 1, rt = radius(e.t) + 2;
    const ex = e.t.x - (dx / d) * rt, ey = e.t.y - (dy / d) * rt;
    ctx.beginPath(); ctx.moveTo(e.s.x, e.s.y); ctx.lineTo(ex, ey); ctx.stroke();
    if (field) {
      const h = 6 / Math.sqrt(k), ang = Math.atan2(dy, dx);
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(ex, ey);
      ctx.lineTo(ex - h * Math.cos(ang - 0.45), ey - h * Math.sin(ang - 0.45));
      ctx.lineTo(ex - h * Math.cos(ang + 0.45), ey - h * Math.sin(ang + 0.45));
      ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    }
  }
  ctx.setLineDash([]);

  for (const n of vis) {
    const r = radius(n), on = !L || L.has(n), col = n.kind === "code" ? codeC : typeColor(n.type);
    if (n.kind === "missing") {
      // A link to no note: a faint dashed ring where the note would be.
      ctx.globalAlpha = on ? 0.6 : 0.1;
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = bg; ctx.fill();
      ctx.setLineDash([2 / k, 2 / k]); ctx.lineWidth = 1.2 / Math.sqrt(k); ctx.strokeStyle = muted; ctx.stroke(); ctx.setLineDash([]);
      if (n === selected) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2); ctx.lineWidth = 1.5 / k; ctx.strokeStyle = ink; ctx.stroke(); }
      continue;
    }
    ctx.globalAlpha = (on ? 1 : 0.15) * (FADED.has(n.status) ? 0.4 : 1);
    ctx.beginPath();
    if (n.kind === "code") ctx.rect(n.x - r, n.y - r, 2 * r, 2 * r);
    else ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    if (HOLLOW.has(n.status)) { ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 2 / Math.sqrt(k); ctx.strokeStyle = col; ctx.stroke(); }
    else { ctx.fillStyle = col; ctx.fill(); }
    if (n.drift) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2); ctx.lineWidth = 1.5 / Math.sqrt(k); ctx.strokeStyle = warn; ctx.stroke(); }
    if (n === selected) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2); ctx.lineWidth = 1.5 / k; ctx.strokeStyle = ink; ctx.stroke(); }
  }

  // Labels fade in as you zoom, and always show for what is lit.
  ctx.font = `${12 / k}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  const labels = [];
  for (const n of vis) {
    // A label shows once its node is big enough on screen: hubs first, the rest as you zoom.
    const zoomAlpha = hubs.has(n) ? 1 : Math.min(1, Math.max(0, (radius(n) * k - 5.5) / 2.5));
    const on = L && L.has(n), a = on ? 1 : L ? 0 : zoomAlpha;
    if (a <= 0.02) continue;
    const full = n.kind === "note" ? n.title : n.name, text = full.length > 42 ? full.slice(0, 41) + "…" : full;
    const y = n.y + radius(n) + 3 / k;
    // Lit and selected labels win a collision, then the best-linked.
    const rank = (n === selected ? 2e6 : on ? 1e6 : 0) + (hubs.has(n) ? 1e3 : 0) + n.deg;
    labels.push({ n, a, on, text, x: n.x, y, w: ctx.measureText(text).width + 4 / k, h: 14 / k, rank });
  }
  for (const i of keepLabels(labels)) {
    const { n, a, on, text, x, y } = labels[i];
    ctx.globalAlpha = a * (FADED.has(n.status) || n.kind === "missing" ? 0.5 : 1);
    ctx.fillStyle = on ? ink : muted;
    ctx.fillText(text, x, y);
  }
  ctx.globalAlpha = 1;
}

// Interaction.
let dragged = null, panning = null, downAt = null;
const hit = (px, py) => {
  const p = toWorld(px, py);
  let best = null, bd = Infinity;
  for (const n of vis) {
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d < radius(n) + 6 / view.k && d < bd) { best = n; bd = d; }
  }
  return best;
};
canvas.addEventListener("pointerdown", (ev) => {
  canvas.setPointerCapture(ev.pointerId);
  downAt = { x: ev.clientX, y: ev.clientY };
  const n = hit(ev.clientX, ev.clientY);
  if (n) { dragged = n; heat(0.25); } else panning = { x: ev.clientX - view.x, y: ev.clientY - view.y };
  canvas.classList.add("dragging");
});
canvas.addEventListener("pointermove", (ev) => {
  if (dragged) { const p = toWorld(ev.clientX, ev.clientY); dragged.x = p.x; dragged.y = p.y; heat(0.25); return; }
  if (panning) { view.x = ev.clientX - panning.x; view.y = ev.clientY - panning.y; draw(); return; }
  const n = hit(ev.clientX, ev.clientY);
  if (n !== hover) { hover = n; canvas.style.cursor = n ? "pointer" : "grab"; draw(); }
});
canvas.addEventListener("pointerup", (ev) => {
  const still = downAt && Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) < 4;
  if (still) { const n = hit(ev.clientX, ev.clientY); n ? select(n) : select(null); }
  dragged = null; panning = null; downAt = null;
  canvas.classList.remove("dragging");
});
canvas.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  const before = toWorld(ev.clientX, ev.clientY);
  view.k = Math.min(6, Math.max(0.1, view.k * Math.exp(-ev.deltaY * 0.0015)));
  view.x = ev.clientX - W / 2 - before.x * view.k; view.y = ev.clientY - H / 2 - before.y * view.k;
  draw();
}, { passive: false });

// Details.
const details = document.getElementById("details"), body = document.getElementById("body");

function go(id) {
  const t = byId.get(id);
  if (!t) return;
  if (t.kind === "code" && !show.code) { show.code = true; showCode.checked = true; refilter(); }
  select(t); center(t);
}

function select(n) {
  selected = n;
  syncHash();
  if (!n) { details.classList.remove("open"); draw(); return; }
  const path = n.kind === "note" ? n.id : n.id.startsWith("file:") ? n.id.slice(5) : null;

  // Neighbours, one row each, naming every way they are linked; code apart.
  const groups = { to: new Map(), from: new Map(), code: new Map() };
  for (const [list, end, dir] of [[out.get(n), "t", "to"], [inn.get(n), "s", "from"]]) {
    for (const e of list) {
      const o = e[end], g = o.kind === "code" || n.kind === "code" ? groups.code : groups[dir];
      const row = g.get(o.id) ?? { n: o, kinds: [] };
      if (!row.kinds.includes(e.kind)) row.kinds.push(e.kind);
      g.set(o.id, row);
    }
  }
  const row = ({ n: o, kinds }) => `<li data-id="${esc(o.id)}">
      <span class="dot${o.kind === "code" ? " code" : o.kind === "missing" ? " ghost" : ""}" style="background:${o.kind === "code" ? css("--code") : o.kind === "missing" ? "transparent" : typeColor(o.type)}"></span>
      <span class="t">${esc(o.kind === "code" ? o.name : o.title)}</span>
      <span class="tags">${kinds.map((k) => `<span class="tag">${esc(k)}</span>`).join("")}</span></li>`;
  const section = (title, rows, open = true) => rows.size
    ? `<details ${open ? "open" : ""}><summary>${title} <span class="n">${rows.size}</span></summary><ul class="links">${[...rows.values()].map(row).join("")}</ul></details>`
    : "";

  const kicker = n.kind === "code"
    ? `<span class="dot" style="background:${css("--code")};border-radius:2px"></span>Code`
    : n.kind === "missing"
    ? `<span class="dot ghost"></span>Missing note · <span class="warn">${esc(n.summary)}</span>`
    : `<span class="dot" style="background:${typeColor(n.type)}"></span>${esc(n.type ?? "Note")}${n.status ? ` · ${esc(n.status)}` : ""}${n.drift ? ` <span class="warn">· its spec changed since it was frozen</span>` : ""}`;
  const org = /\.org$/i.test(n.id);
  const rendered = n.body ? renderBody(n.body, org, n.refs ?? {}, n.title) : "";
  body.innerHTML = `
    <div class="kicker">${kicker}</div>
    <h2 class="title">${esc(n.title)}</h2>
    <div class="name">${esc(n.kind === "note" ? n.name : path ?? n.name)}</div>
    ${!rendered && n.summary && n.kind !== "missing" ? `<p class="lede">${esc(n.summary)}</p>` : ""}
    <div class="actions">
      <button id="focusBtn">Focus here</button>
      ${data.url && path ? `<a class="button" target="_blank" rel="noopener" href="${esc(data.url + path)}">Open on GitHub</a>` : ""}
    </div>
    ${rendered ? `<details open><summary>Note</summary><div class="md">${rendered}</div></details>` : ""}
    ${section("Links to", groups.to)}
    ${section("Linked from", groups.from)}
    ${section(n.kind === "code" ? "Notes" : "Code", groups.code, n.kind === "code")}
    ${n.kind === "note" ? `<div class="path">${esc(n.id)}</div>` : ""}`;
  details.classList.add("open");
  details.scrollTop = 0;
  cursor = -1;
  body.querySelectorAll("ul.links li").forEach((li) => li.addEventListener("click", () => go(li.dataset.id)));
  body.querySelectorAll("a.note-link").forEach((a) => a.addEventListener("click", () => go(a.dataset.id)));
  document.getElementById("focusBtn").addEventListener("click", () => focusOn(n, focus?.depth ?? 2));
  draw();
}
document.getElementById("close").addEventListener("click", () => select(null));
function center(n) { view.x = -n.x * view.k + shift(); view.y = -n.y * view.k; draw(); }

// The panel's width: drag its left edge; remembered in this browser.
const grip = document.getElementById("grip");
try { const w = localStorage.getItem("lore-graph-panel"); if (w) details.style.width = w; } catch {}
grip.addEventListener("pointerdown", (ev) => {
  grip.setPointerCapture(ev.pointerId); grip.classList.add("active");
  const move = (e) => { details.style.width = `${Math.min(innerWidth * 0.75, Math.max(320, innerWidth - e.clientX - 12))}px`; };
  const up = () => {
    grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up); grip.classList.remove("active");
    try { localStorage.setItem("lore-graph-panel", details.style.width); } catch {}
  };
  grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", up);
});

// Local graph: a note and everything within `depth` links of it.
const focusbar = document.getElementById("focusbar");
function focusOn(n, depth = 2) {
  const set = new Set([n]);
  let frontier = [n];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const m of frontier) for (const e of [...out.get(m), ...inn.get(m)]) { const o = e.s === m ? e.t : e.s; if (!set.has(o)) { set.add(o); next.push(o); } }
    frontier = next;
  }
  focus = { node: n, set, depth };
  syncHash();
  document.getElementById("focusLabel").textContent = `Within ${depth === 1 ? "one link" : `${depth} links`} of ${n.title}`;
  focusbar.classList.add("open");
  focusbar.style.left = `${innerWidth / 2 + shift()}px`;
  refilter();
  for (let i = 0; i < 150; i++) tick();
  fit(); draw();
}
function unfocus() { focus = null; syncHash(); focusbar.classList.remove("open"); focusbar.style.left = ""; refilter(); for (let i = 0; i < 100; i++) tick(); fit(); draw(); }
document.getElementById("unfocus").addEventListener("click", unfocus);

// Controls.
document.getElementById("repo").textContent = data.repo;
const typesEl = document.getElementById("types");
for (const t of typeKeys) {
  const count = nodes.filter((n) => n.kind === "note" && (t === "untyped" ? !n.type || !data.types.includes(n.type) : n.type === t)).length;
  if (!count) continue;
  const row = document.createElement("label");
  row.className = "row";
  row.innerHTML = `<input type="checkbox" checked><span class="swatch" style="background:${typeColor(t === "untyped" ? null : t)}"></span>${esc(t === "untyped" ? "Untyped (CONTEXT.md, …)" : t)}<span class="count">${count}</span>`;
  row.querySelector("input").addEventListener("change", (ev) => { ev.target.checked ? show.types.add(t) : show.types.delete(t); refilter(); });
  typesEl.append(row);
}
const showCode = document.getElementById("showCode");
showCode.addEventListener("change", (ev) => { show.code = ev.target.checked; syncHash(); refilter(); });
document.getElementById("showOld").addEventListener("change", (ev) => { show.old = ev.target.checked; refilter(); });
document.getElementById("showOrphans").addEventListener("change", (ev) => { show.orphans = ev.target.checked; refilter(); });
const search = document.getElementById("search");
search.addEventListener("input", () => {
  const q = search.value.trim().toLowerCase();
  matches = q ? new Set(vis.filter((n) => `${n.title} ${n.name}`.toLowerCase().includes(q))) : null;
  draw();
});
search.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && matches?.size) { const n = [...matches][0]; matches = null; search.value = ""; select(n); center(n); } });

addEventListener("resize", resize);
// Keyboard: Esc clears the search, closes the panel, then leaves focus; / searches;
// the arrows step through the open note's links, and Enter follows one.
let cursor = -1;
addEventListener("keydown", (ev) => {
  const typing = ev.target instanceof HTMLInputElement;
  if (ev.key === "Escape") {
    if (typing && search.value) { search.value = ""; matches = null; draw(); }
    else if (typing) search.blur();
    else if (selected) select(null);
    else if (focus) unfocus();
    return;
  }
  if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.key === "/") { ev.preventDefault(); search.focus(); return; }
  const rows = selected ? [...body.querySelectorAll("ul.links li")].filter((li) => li.offsetParent) : [];
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[ev.key];
  if (step && rows.length) {
    ev.preventDefault();
    cursor = cursor < 0 ? (step > 0 ? 0 : rows.length - 1) : (cursor + step + rows.length) % rows.length;
    rows.forEach((li, i) => li.classList.toggle("cursor", i === cursor));
    rows[cursor].scrollIntoView({ block: "nearest" });
    hover = byId.get(rows[cursor].dataset.id) ?? null; draw();
  } else if (ev.key === "Enter" && rows[cursor]) {
    hover = null; go(rows[cursor].dataset.id);
  }
});

// The address keeps the view: #note=<name> for the open note, #focus=<name>
// (and depth=<n>) for a local graph, #code for the code layer. `lore graph
// <note>` asks for a focus through data.focus instead.
const nameCount = new Map();
for (const n of nodes) nameCount.set(n.name, (nameCount.get(n.name) ?? 0) + 1);
const nameOf = (n) => (nameCount.get(n.name) === 1 ? n.name : n.id);
const byName = (name) => (nameCount.get(name) === 1 ? nodes.find((n) => n.name === name) : undefined) ?? byId.get(name);
let restoring = true;
const enc = (n) => encodeURIComponent(nameOf(n)).replace(/%2F/g, "/");
function syncHash() {
  if (restoring) return;
  const p = [];
  if (selected) p.push(`note=${enc(selected)}`);
  if (focus) p.push(`focus=${enc(focus.node)}`, ...(focus.depth !== 2 ? [`depth=${focus.depth}`] : []));
  if (show.code) p.push("code");
  try { history.replaceState(null, "", p.length ? `#${p.join("&")}` : location.pathname + location.search); } catch {}
}
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.has("code")) { show.code = true; showCode.checked = true; }
refilter();
for (let i = 0; i < 300; i++) tick();
alpha = 0.1;
resize(); fit(); draw();
const start = hash.has("focus") ? { name: hash.get("focus"), depth: Number(hash.get("depth")) || 2 } : data.focus;
const startNode = start && byName(start.name);
if (startNode) { select(startNode); focusOn(startNode, start.depth); }
const noteNode = hash.has("note") && byName(hash.get("note"));
if (noteNode) { if (noteNode.kind === "code" && !show.code) { show.code = true; showCode.checked = true; refilter(); } select(noteNode); if (!startNode) center(noteNode); }
restoring = false;
syncHash();
// An address edited by hand, or a link followed within the page: start over from it.
addEventListener("hashchange", () => location.reload());
