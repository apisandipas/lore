// The parts of the graph page that need no browser, so the tests can run
// them: rendering a note's text, which links may be followed, where nodes
// start, and which labels fit. `lore graph` inlines this file with page.js.

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// A note's body, rendered for reading: Markdown or Org, enough of each for
// specs and decisions. [[links]] to other notes select them in the graph.
export function renderBody(text, org, refs, title) {
  const codes = [];
  const hold = (c) => `\u0000${codes.push(c) - 1}\u0000`;
  const noteLink = (target, label) => {
    const t = target.trim(), id = refs[t] ?? Object.values(refs).find((p) => t.startsWith("file:") && p.endsWith(t.replace(/^file:(\.\.\/)*/, "")));
    if (id) return `<a class="note-link" data-id="${esc(id)}">${label}</a>`;
    // A [[link]] names a note; only a URL in one is followed.
    return /^(https?|mailto):/i.test(t) ? link(t, label, "dead") : `<span class="dead">${label}</span>`;
  };
  const inline = (s) => {
    let o = esc(s);
    o = o.replace(/`([^`]+)`/g, (_, c) => hold(c));
    if (org) o = o.replace(/(^|[\s(])[=~]([^=~\s](?:[^=~]*[^=~\s])?)[=~](?=$|[\s.,;:)])/g, (_, p, c) => p + hold(c));
    o = org
      ? o.replace(/\[\[([^\]]+)\](?:\[([^\]]*)\])?\]/g, (_, t, l) => noteLink(t, l || t.replace(/^file:/, "")))
      : o.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, t, l) => noteLink(t, l || t));
    if (!org) o = o.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, l, u) => link(u, l));
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

// A link from a note's text: http, https, mailto or relative only, so a
// shared page never runs a javascript: or data: link. Browsers ignore
// control characters and spaces in a scheme, so they are dropped first.
export function safeHref(url) {
  const u = String(url).replace(/[\u0000-\u0020\u007f]/g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(u.replace(/&amp;/g, "&"));
  return !scheme || /^(https?|mailto)$/i.test(scheme[1]) ? u : null;
}
// The label as a link where the target is safe, else as text.
function link(url, label, cls) {
  const href = safeHref(url);
  if (href !== null) return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
  return cls ? `<span class="${cls}">${label}</span>` : label;
}

// Where a node starts: a point from its id, so the layout is the same on
// every load and a new note does not move the others. FNV-1a, mixed so ids
// that differ in one character land far apart; the square root spreads the
// points evenly over a disc.
export function seed(id, spread) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const mix = (x) => { x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0; };
  const u = mix(h) / 2 ** 32, v = mix(h ^ 0x9e3779b9) / 2 ** 32;
  const a = u * 2 * Math.PI, r = spread * Math.sqrt(v);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

// Which labels to draw: boxes { x, y, w, h, rank }, x the centre and y the
// top. The highest rank is placed first; a box that would overlap one
// already placed is dropped. Returns the kept boxes' indexes.
export function keepLabels(boxes) {
  const order = boxes.map((b, i) => i).sort((a, b) => boxes[b].rank - boxes[a].rank || a - b);
  const kept = [];
  for (const i of order) {
    const b = boxes[i];
    const clear = kept.every((j) => {
      const o = boxes[j];
      return Math.abs(o.x - b.x) * 2 >= o.w + b.w || b.y >= o.y + o.h || o.y >= b.y + b.h;
    });
    if (clear) kept.push(i);
  }
  return new Set(kept);
}
