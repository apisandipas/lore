// The graph page. Its data is the JSON in #data, written by `lore graph`.
const data = JSON.parse(document.getElementById("data").textContent);
const PALETTE = ["#7c6cf0", "#e0915a", "#3fa7a0", "#d4699a", "#c9a227", "#5b8fd6", "#8bb04a"];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const typeColor = (t) => (t && data.types.includes(t) ? PALETTE[data.types.indexOf(t) % PALETTE.length] : "#8a8f98");
const FADED = new Set(["superseded", "retired"]);
const HOLLOW = new Set(["draft", "planned", "proposed"]);

const nodes = data.nodes.map((n, i) => {
  const a = i * 2.39996, r = 12 * Math.sqrt(i + 1);
  return { ...n, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, deg: 0 };
});
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
    if (!show.types.has(n.type && data.types.includes(n.type) ? n.type : "untyped")) return false;
    if (!show.old && FADED.has(n.status)) return false;
    return true;
  };
  let shown = new Set(nodes.filter(keep));
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
      if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
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
    const code = e.kind === "anchor" || e.kind === "cites";
    const field = !code && e.kind !== "link";
    ctx.globalAlpha = on ? (L ? 0.95 : 0.55) : 0.07;
    ctx.strokeStyle = code ? codeC : edgeC;
    ctx.lineWidth = (field ? 1.6 : code ? 1.2 : 0.8) / Math.sqrt(k);
    ctx.setLineDash(e.kind === "supersedes" ? [6 / k, 4 / k] : code ? [2 / k, 3 / k] : []);
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
  for (const n of vis) {
    // A label shows once its node is big enough on screen: hubs first, the rest as you zoom.
    const zoomAlpha = hubs.has(n) ? 1 : Math.min(1, Math.max(0, (radius(n) * k - 5.5) / 2.5));
    const on = L && L.has(n), a = on ? 1 : L ? 0 : zoomAlpha;
    if (a <= 0.02) continue;
    ctx.globalAlpha = a * (FADED.has(n.status) ? 0.5 : 1);
    ctx.fillStyle = on ? ink : muted;
    const label = n.kind === "code" ? n.name : n.title;
    ctx.fillText(label.length > 42 ? label.slice(0, 41) + "…" : label, n.x, n.y + radius(n) + 3 / k);
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
addEventListener("keydown", (ev) => { if (ev.key === "Escape") { select(null); search.value = ""; matches = null; draw(); } });

// Details.
const details = document.getElementById("details"), body = document.getElementById("body");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// A note's body, rendered for reading: Markdown or Org, enough of each for
// specs and decisions. [[links]] to other notes select them in the graph.
function renderBody(text, org, refs, title) {
  const codes = [];
  const hold = (c) => `\u0000${codes.push(c) - 1}\u0000`;
  const noteLink = (target, label) => {
    const t = target.trim(), id = refs[t] ?? Object.values(refs).find((p) => t.startsWith("file:") && p.endsWith(t.replace(/^file:(\.\.\/)*/, "")));
    if (id) return `<a class="note-link" data-id="${esc(id)}">${label}</a>`;
    if (/^https?:/.test(t)) return `<a href="${t}" target="_blank" rel="noopener">${label}</a>`;
    return `<span class="dead">${label}</span>`;
  };
  const inline = (s) => {
    let o = esc(s);
    o = o.replace(/`([^`]+)`/g, (_, c) => hold(c));
    if (org) o = o.replace(/(^|[\s(])[=~]([^=~\s](?:[^=~]*[^=~\s])?)[=~](?=$|[\s.,;:)])/g, (_, p, c) => p + hold(c));
    o = org
      ? o.replace(/\[\[([^\]]+)\](?:\[([^\]]*)\])?\]/g, (_, t, l) => noteLink(t, l || t.replace(/^file:/, "")))
      : o.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, t, l) => noteLink(t, l || t));
    if (!org) o = o.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, l, u) => `<a href="${u}" target="_blank" rel="noopener">${l}</a>`);
    o = org
      ? o.replace(/(^|[\s(])\*([^*\s](?:[^*]*[^*\s])?)\*(?=$|[\s.,;:)])/g, "$1<strong>$2</strong>").replace(/(^|[\s(])\/([^/\s](?:[^/]*[^/\s])?)\/(?=$|[\s.,;:)])/g, "$1<em>$2</em>")
      : o.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[\s(])[*_]([^*_\s](?:[^*_]*[^*_\s])?)[*_](?=$|[\s.,;:)])/g, "$1<em>$2</em>");
    return o.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  };

  const out = [], lists = [];
  let para = [], skippedTitle = false;
  const flush = () => { if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`); para = []; };
  const closeLists = (indent = -1) => { while (lists.length && lists.at(-1).indent > indent) out.push(`</${lists.pop().tag}>`); };
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], t = line.trim();
    const fence = org ? /^#\+begin_(\w+)/i.exec(t) : /^(```|~~~)/.exec(t);
    if (fence) {
      flush(); closeLists();
      const body = [];
      const end = org ? new RegExp(`^#\\+end_${fence[1]}`, "i") : new RegExp(`^${fence[1]}`);
      for (i++; i < lines.length && !end.test(lines[i].trim()); i++) body.push(lines[i]);
      out.push(org && /quote/i.test(fence[1]) ? `<blockquote>${inline(body.join(" "))}</blockquote>` : `<pre><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }
    if (org && (/^#\+\w+:/.test(t) || /^#\s/.test(t))) continue;
    if (org && /^:[A-Z_]+:$/i.test(t)) { while (i < lines.length && !/^:END:$/i.test(lines[i].trim())) i++; continue; }
    const head = org ? /^(\*+)\s+(.*?)(\s+:[\w@#%:]+:)?$/.exec(line) : /^(#{1,6})\s+(.*)$/.exec(line);
    if (head) {
      flush(); closeLists();
      const text = head[2].replace(/^(TODO|DONE)\s+/, "");
      if (!skippedTitle && head[1].length === 1 && text.trim() === title) { skippedTitle = true; continue; }
      const level = Math.min(5, head[1].length + 1);
      out.push(`<h${level}>${inline(text)}</h${level}>`);
      continue;
    }
    if (!t) { flush(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t) && !org || org && /^-{5,}$/.test(t)) { flush(); closeLists(); out.push("<hr>"); continue; }
    if (t.startsWith("|")) {
      flush(); closeLists();
      const rows = [];
      for (; i < lines.length && lines[i].trim().startsWith("|"); i++) rows.push(lines[i].trim());
      i--;
      const sep = (r) => /^\|[\s:|+-]+\|?$/.test(r) && r.includes("-");
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));
      const hasHead = rows.length > 1 && sep(rows[1]);
      const data = rows.filter((r) => !sep(r));
      const [first, ...rest] = data;
      out.push(`<table>${hasHead ? `<thead><tr>${cells(first).map((c) => `<th>${c}</th>`).join("")}</tr></thead>` : ""}<tbody>${(hasHead ? rest : data).map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (!org && t.startsWith(">")) {
      flush(); closeLists();
      const q = [];
      for (; i < lines.length && lines[i].trim().startsWith(">"); i++) q.push(lines[i].trim().replace(/^>\s?/, ""));
      i--;
      out.push(`<blockquote>${inline(q.join(" "))}</blockquote>`);
      continue;
    }
    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item && !(org && item[2] === "*" && !item[1])) {
      flush();
      const indent = item[1].length, tag = /\d/.test(item[2]) ? "ol" : "ul";
      closeLists(indent);
      if (!lists.length || lists.at(-1).indent < indent || lists.at(-1).tag !== tag) {
        if (lists.length && lists.at(-1).indent === indent) out.push(`</${lists.pop().tag}>`);
        lists.push({ indent, tag });
        out.push(`<${tag}>`);
      }
      const box = /^\[([ xX-])\]\s*(.*)$/.exec(item[3]);
      out.push(box
        ? `<li class="task${/x/i.test(box[1]) ? " done" : ""}"><span class="box">${/x/i.test(box[1]) ? "✓" : box[1] === "-" ? "–" : ""}</span><span>${inline(box[2])}</span></li>`
        : `<li>${inline(item[3])}</li>`);
      continue;
    }
    if (lists.length && /^\s+/.test(line)) {
      out[out.length - 1] = out.at(-1).replace(/(<\/span>)?<\/li>$/, (m, s) => ` ${inline(t)}${s ?? ""}</li>`);
      continue;
    }
    closeLists();
    para.push(t);
  }
  flush(); closeLists();
  return out.join("\n");
}

function select(n) {
  selected = n;
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
      <span class="dot${o.kind === "code" ? " code" : ""}" style="background:${o.kind === "code" ? css("--code") : typeColor(o.type)}"></span>
      <span class="t">${esc(o.kind === "code" ? o.name : o.title)}</span>
      <span class="tags">${kinds.map((k) => `<span class="tag">${esc(k)}</span>`).join("")}</span></li>`;
  const section = (title, rows, open = true) => rows.size
    ? `<details ${open ? "open" : ""}><summary>${title} <span class="n">${rows.size}</span></summary><ul class="links">${[...rows.values()].map(row).join("")}</ul></details>`
    : "";

  const kicker = n.kind === "code"
    ? `<span class="dot" style="background:${css("--code")};border-radius:2px"></span>Code`
    : `<span class="dot" style="background:${typeColor(n.type)}"></span>${esc(n.type ?? "Note")}${n.status ? ` · ${esc(n.status)}` : ""}${n.drift ? ` <span class="warn">· its spec changed since it was frozen</span>` : ""}`;
  const org = /\.org$/i.test(n.id);
  const rendered = n.body ? renderBody(n.body, org, n.refs ?? {}, n.title) : "";
  body.innerHTML = `
    <div class="kicker">${kicker}</div>
    <h2 class="title">${esc(n.title)}</h2>
    <div class="name">${esc(n.kind === "note" ? n.name : path ?? n.name)}</div>
    ${!rendered && n.summary ? `<p class="lede">${esc(n.summary)}</p>` : ""}
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
  const go = (id) => {
    const t = byId.get(id);
    if (!t) return;
    if (t.kind === "code" && !show.code) { show.code = true; showCode.checked = true; refilter(); }
    select(t); center(t);
  };
  body.querySelectorAll("ul.links li").forEach((li) => li.addEventListener("click", () => go(li.dataset.id)));
  body.querySelectorAll("a.note-link").forEach((a) => a.addEventListener("click", () => go(a.dataset.id)));
  document.getElementById("focusBtn").addEventListener("click", () => focusOn(n));
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

// Local graph: a note and everything within two links of it.
const focusbar = document.getElementById("focusbar");
function focusOn(n) {
  const set = new Set([n]);
  let frontier = [n];
  for (let d = 0; d < 2; d++) {
    const next = [];
    for (const m of frontier) for (const e of [...out.get(m), ...inn.get(m)]) { const o = e.s === m ? e.t : e.s; if (!set.has(o)) { set.add(o); next.push(o); } }
    frontier = next;
  }
  focus = { node: n, set };
  document.getElementById("focusLabel").textContent = `Within two links of ${n.title}`;
  focusbar.classList.add("open");
  focusbar.style.left = `${innerWidth / 2 + shift()}px`;
  refilter();
  for (let i = 0; i < 150; i++) tick();
  fit(); draw();
}
document.getElementById("unfocus").addEventListener("click", () => { focus = null; focusbar.classList.remove("open"); focusbar.style.left = ""; refilter(); for (let i = 0; i < 100; i++) tick(); fit(); draw(); });

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
showCode.addEventListener("change", (ev) => { show.code = ev.target.checked; refilter(); });
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
// #code shows the code layer; #focus=<path> opens on a note's local graph.
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.has("code")) { show.code = true; showCode.checked = true; }
refilter();
for (let i = 0; i < 300; i++) tick();
alpha = 0.1;
resize(); fit(); draw();
const start = byId.get(hash.get("focus") ?? "");
if (start) { select(start); focusOn(start); }
