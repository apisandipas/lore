// lore docs: leader lines from code to the notes in the margin, copy buttons,
// the contents rail and the theme toggle. Everything here is an enhancement;
// the pages read the same without it.

(() => {
  const root = document.documentElement;

  // --- Theme ---------------------------------------------------------------
  const stored = (() => { try { return localStorage.getItem("lore-theme"); } catch { return null; } })();
  if (stored) root.dataset.theme = stored;
  const toggle = document.querySelector(".theme-toggle");
  const isDark = () => root.dataset.theme
    ? root.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  const label = () => { if (toggle) toggle.textContent = isDark() ? "Light" : "Dark"; };
  label();
  toggle?.addEventListener("click", () => {
    root.dataset.theme = isDark() ? "light" : "dark";
    try { localStorage.setItem("lore-theme", root.dataset.theme); } catch {}
    label();
  });

  // --- Copy buttons ----------------------------------------------------------
  // A terminal's commands are its `.cmd` lines; a file block copies whole.
  for (const button of document.querySelectorAll(".copy")) {
    button.addEventListener("click", async () => {
      const block = button.closest(".term");
      const cmds = [...block.querySelectorAll(".cmd")].map((c) => c.textContent);
      const text = cmds.length ? cmds.join("\n") : block.querySelector("pre").textContent;
      try {
        await navigator.clipboard.writeText(text.trim());
        button.textContent = "Copied";
        button.classList.add("done");
        setTimeout(() => { button.textContent = "Copy"; button.classList.remove("done"); }, 1400);
      } catch {
        button.textContent = "Select and copy";
      }
    });
  }

  // --- Leader lines ------------------------------------------------------------
  // In an .annotated figure, each [data-to] span in the code is joined to the
  // note card it names by a dashed line, and hovering either lights both.
  const NS = "http://www.w3.org/2000/svg";

  function draw(figure) {
    let svg = figure.querySelector("svg.leaders");
    if (!svg) {
      svg = document.createElementNS(NS, "svg");
      svg.classList.add("leaders");
      svg.setAttribute("aria-hidden", "true");
      figure.prepend(svg);
    }
    svg.replaceChildren();
    const notes = figure.querySelector(".notes");
    const cards = [...figure.querySelectorAll(".note-card")];
    const stacked = getComputedStyle(svg).display === "none";
    if (stacked || figure.classList.contains("centered")) {
      // Stacked under the code, or a centred figure: document order.
      notes.style.height = "";
      cards.forEach((c) => { c.style.position = c.style.top = c.style.width = ""; });
      if (stacked) return;
    }
    const box = figure.getBoundingClientRect();
    const scroller = figure.querySelector("pre");
    const clip = scroller.getBoundingClientRect();
    if (!figure.classList.contains("centered")) place(figure, notes, cards, box);
    for (const src of figure.querySelectorAll("[data-to]")) {
      for (const id of src.dataset.to.split(" ")) {
        const card = figure.querySelector(`#${id}`);
        if (!card) continue;
        const a = src.getBoundingClientRect();
        const b = card.getBoundingClientRect();
        // From the code box's edge, level with the source; the source
        // itself is highlighted, so the line need not cross the code.
        const x1 = clip.right - box.left;
        const y1 = a.top + a.height / 2 - box.top;
        const x2 = b.left - box.left;
        const y2 = b.top + Math.min(26, b.height / 2) - box.top;
        const mid = x1 + (x2 - x1) * 0.55;
        const g = document.createElementNS(NS, "g");
        g.dataset.pair = `${src.dataset.key} ${id}`;
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
        const dot = document.createElementNS(NS, "circle");
        dot.setAttribute("cx", x1); dot.setAttribute("cy", y1); dot.setAttribute("r", 2.5);
        g.append(path, dot);
        svg.append(g);
      }
    }
  }

  // Set each card beside the first line that points at it, as a sidenote
  // sits beside its paragraph, pushed down only to clear the card above.
  function place(figure, notes, cards, box) {
    const top = notes.getBoundingClientRect().top;
    const srcY = (card) => {
      const ys = [...figure.querySelectorAll("[data-to]")]
        .filter((s) => s.dataset.to.split(" ").includes(card.id))
        .map((s) => { const r = s.getBoundingClientRect(); return r.top + r.height / 2 - top; });
      return ys.length ? Math.min(...ys) : 0;
    };
    const order = cards.map((c) => ({ c, y: srcY(c) })).sort((a, b) => a.y - b.y);
    let next = 0;
    for (const { c, y } of order) {
      const at = Math.max(next, Math.max(0, y - 22));
      c.style.position = "absolute";
      c.style.width = "100%";
      c.style.top = `${at}px`;
      next = at + c.offsetHeight + 14;
    }
    notes.style.height = `${next - 14}px`;
  }

  function wire(figure) {
    figure.querySelectorAll("[data-to]").forEach((src, i) => { src.dataset.key = `s${i}`; });
    const light = (key, ids, on) => {
      figure.querySelectorAll(`[data-key="${key}"]`).forEach((s) => s.classList.toggle("on", on));
      for (const id of ids) {
        figure.querySelector(`#${id}`)?.classList.toggle("on", on);
        figure.querySelectorAll("svg.leaders g").forEach((g) => {
          if (g.dataset.pair === `${key} ${id}`) g.classList.toggle("on", on);
        });
      }
    };
    for (const src of figure.querySelectorAll("[data-to]")) {
      const ids = src.dataset.to.split(" ");
      src.addEventListener("mouseenter", () => light(src.dataset.key, ids, true));
      src.addEventListener("mouseleave", () => light(src.dataset.key, ids, false));
    }
    for (const card of figure.querySelectorAll(".note-card")) {
      const sources = [...figure.querySelectorAll("[data-to]")].filter((s) => s.dataset.to.split(" ").includes(card.id));
      card.addEventListener("mouseenter", () => sources.forEach((s) => light(s.dataset.key, [card.id], true)));
      card.addEventListener("mouseleave", () => sources.forEach((s) => light(s.dataset.key, [card.id], false)));
    }
    figure.querySelector("pre")?.addEventListener("scroll", () => draw(figure), { passive: true });
    draw(figure);
  }

  const figures = [...document.querySelectorAll(".annotated")];
  figures.forEach(wire);
  const redraw = () => figures.forEach(draw);
  // Fonts arriving change line heights and card sizes inside the figure.
  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(redraw);
    figures.forEach((f) => { ro.observe(f); f.querySelectorAll(".note-card, pre").forEach((el) => ro.observe(el)); });
  } else addEventListener("resize", redraw);
  document.fonts?.addEventListener?.("loadingdone", redraw);
  document.fonts?.ready.then(redraw);
  addEventListener("load", redraw);

  // --- Contents rail -----------------------------------------------------------
  const links = [...document.querySelectorAll(".toc a")];
  if (links.length && "IntersectionObserver" in window) {
    const byId = new Map(links.map((a) => [a.hash.slice(1), a]));
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id);
      const first = [...byId.keys()].find((id) => seen.has(id));
      if (first) links.forEach((a) => a.classList.toggle("active", a === byId.get(first)));
    }, { rootMargin: "-70px 0px -60% 0px" });
    for (const id of byId.keys()) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
  }
})();

// The current page in the masthead.
(() => {
  const here = location.pathname.split("/").pop() || "index.html";
  for (const a of document.querySelectorAll(".site-nav a")) {
    if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page");
  }
})();
