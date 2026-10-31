import { describe, expect, test } from "bun:test";
import { keepLabels, renderBody, safeHref, seed } from "../src/graph-page/render.js";

describe("graph page rendering", () => {
  test("only http, https, mailto and relative links are followed", () => {
    for (const ok of ["https://x.org/a?b=1&amp;c=2", "http://x", "mailto:a@b.c", "../src/a.ts", "#part", "a.md"]) expect(safeHref(ok)).toBe(ok);
    for (const bad of ["javascript:alert(1)", "JavaScript:alert(1)", "java\tscript:alert(1)", "\u0001javascript:alert(1)", "data:text/html,x", "vbscript:x", "file:///etc/passwd"]) {
      expect(safeHref(bad)).toBeNull();
    }
    const body = renderBody("[a](javascript:alert%281%29) and [b](https://x.org) and [[spec/x]] and [[gone]]", false, { "spec/x": "docs/specs/x.md" }, "T");
    expect(body).toContain("a and ");
    expect(body).not.toContain("javascript");
    expect(body).toContain('<a href="https://x.org" target="_blank" rel="noopener">b</a>');
    expect(body).toContain('<a class="note-link" data-id="docs/specs/x.md">spec/x</a>');
    expect(body).toContain('<span class="dead">gone</span>');
    expect(renderBody("[[gone]]", false, { gone: "missing:gone" }, "T")).toBe('<p><a class="note-link missing" data-id="missing:gone">gone</a></p>');
    expect(renderBody("[[javascript:alert(1)][x]] [[https://x.org][y]]", true, {}, "T")).toBe('<p><span class="dead">x</span> <a href="https://x.org" target="_blank" rel="noopener">y</a></p>');
  });

  test("a note's text is escaped, then rendered", () => {
    expect(renderBody("<img src=x onerror=alert(1)> **b** `<i>`", false, {}, "T")).toBe("<p>&lt;img src=x onerror=alert(1)&gt; <strong>b</strong> <code>&lt;i&gt;</code></p>");
  });

  test("Markdown: the title heading is skipped, headings, lists, tasks, tables, code", () => {
    const md = "# T\n\nIntro.\n\n## Part\n\n- [x] done\n- [ ] open\n  more\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\n<x>\n```\n";
    expect(renderBody(md, false, {}, "T")).toBe(
      [
        "<p>Intro.</p>",
        "<h3>Part</h3>",
        "<ul>",
        '<li class="task done"><span class="box">✓</span><span>done</span></li>',
        '<li class="task"><span class="box"></span><span>open more</span></li>',
        "</ul>",
        "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
        "<pre><code>&lt;x&gt;</code></pre>",
      ].join("\n"),
    );
  });

  test("Org: fields and drawers dropped, headings, emphasis, links, blocks", () => {
    const org = "#+title: T\n* T\n:PROPERTIES:\n:ID: 1\n:END:\nSome *bold* and /it/ and =code= with [[spec/x][the spec]].\n** TODO Next\n#+begin_src ts\nlet a = 1;\n#+end_src\n";
    expect(renderBody(org, true, { "spec/x": "docs/specs/x.md" }, "T")).toBe(
      [
        '<p>Some <strong>bold</strong> and <em>it</em> and <code>code</code> with <a class="note-link" data-id="docs/specs/x.md">the spec</a>.</p>',
        "<h3>Next</h3>",
        "<pre><code>let a = 1;</code></pre>",
      ].join("\n"),
    );
  });

  test("a node starts at the same point every time, whatever else is in the graph", () => {
    expect(seed("docs/specs/a.md", 100)).toEqual(seed("docs/specs/a.md", 100));
    expect(seed("docs/specs/a.md", 100)).not.toEqual(seed("docs/specs/b.md", 100));
    const points = Array.from({ length: 200 }, (_, i) => seed(`n${i}`, 100));
    expect(points.every((p) => Math.hypot(p.x, p.y) <= 100)).toBe(true);
    // Spread over the disc, not bunched in one quarter.
    const quarters = Object.groupBy(points, (p) => `${p.x > 0}${p.y > 0}`);
    expect(Object.values(quarters).map((q) => q!.length).every((n) => n > 20)).toBe(true);
  });

  test("overlapping labels are hidden, the highest rank kept", () => {
    const box = (x: number, y: number, rank: number) => ({ x, y, w: 40, h: 10, rank });
    expect(keepLabels([box(0, 0, 1), box(10, 5, 5), box(100, 0, 0), box(0, 20, 0)])).toEqual(new Set([1, 2, 3]));
    expect(keepLabels([box(0, 0, 1), box(40, 0, 1), box(0, 10, 1)]).size).toBe(3);
  });
});
