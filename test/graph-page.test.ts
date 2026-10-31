import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadGraph } from "../src/graph";
import { githubUrl, graphPage } from "../src/graph-page";
import { graphData } from "../src/graph-page/data";
import { run } from "../src/main";
import { memoryTree } from "../src/tree";

const SCHEMA = `notes: docs
types:
  Spec:
    dir: docs/specs
  Effort:
    dir: docs/efforts
    freeze: [specs]
    fields:
      specs: { link: Spec, many: true }
`;
const tree = () =>
  memoryTree({
    ".lore/schema.yml": SCHEMA,
    "CONTEXT.md": "# Root\n\nThe repo.\n",
    "docs/specs/auth.md": "---\nstatus: accepted\nanchors: [src/auth/**]\n---\n# Auth\n\nLogin. See [[nowhere]] and [[dup]], [[nowhere]] again.\n",
    "docs/specs/dup.md": "# Dup spec\n",
    "docs/efforts/dup.md": "# Dup effort\n",
    "docs/efforts/auth.md": "---\nspecs: [\"[[spec/auth]]\"]\nfrozen:\n  docs/specs/auth.md: deadbeef0000\n---\n# Build auth\n\nFor [[spec/auth]].\n",
    "src/auth/login.ts": "// see lore:spec/auth and lore:gone\n",
  });
const data = () => graphData(loadGraph(tree()), { url: "https://github.com/o/r/blob/main/" });
const node = (id: string) => data().nodes.find((n) => n.id === id);
const edges = () => data().edges.map((e) => `${e.source} -${e.kind}-> ${e.target}`);

describe("graph data", () => {
  test("every note is a node, CONTEXT.md included, with its name, type, status, body and drift", () => {
    expect(data().nodes.filter((n) => n.kind === "note").map((n) => n.id)).toEqual([
      "CONTEXT.md",
      "docs/efforts/auth.md",
      "docs/efforts/dup.md",
      "docs/specs/auth.md",
      "docs/specs/dup.md",
    ]);
    expect(node("docs/specs/auth.md")).toMatchObject({ name: "spec/auth", title: "Auth", type: "Spec", status: "accepted", summary: "Login. See [[nowhere]] and [[dup]], [[nowhere]] again.", drift: false });
    expect(node("docs/specs/auth.md")!.body).toContain("Login.");
    expect(node("docs/efforts/auth.md")!.drift).toBe(true);
    expect(node("CONTEXT.md")).toMatchObject({ name: "CONTEXT", type: null });
  });

  test("links are edges by field, body links as link, once each", () => {
    expect(edges()).toContain("docs/efforts/auth.md -specs-> docs/specs/auth.md");
    expect(edges()).toContain("docs/efforts/auth.md -link-> docs/specs/auth.md");
    expect(edges().filter((e) => e.startsWith("docs/specs/auth.md -link-> missing:nowhere"))).toHaveLength(1);
  });

  test("a link to no note, or to several, is a ghost named by its text", () => {
    expect(node("missing:nowhere")).toMatchObject({ kind: "missing", name: "nowhere", summary: "no note matches" });
    expect(node("missing:dup")).toMatchObject({ kind: "missing", summary: "matches 2 notes" });
    expect(node("docs/specs/auth.md")!.refs).toEqual({ nowhere: "missing:nowhere", dup: "missing:dup" });
  });

  test("anchors and citing files are code nodes", () => {
    expect(node("anchor:src/auth/**")).toMatchObject({ kind: "code", summary: "1 file" });
    expect(edges()).toContain("docs/specs/auth.md -anchor-> anchor:src/auth/**");
    expect(edges()).toContain("file:src/auth/login.ts -cites-> docs/specs/auth.md");
    expect(edges()).toContain("file:src/auth/login.ts -cites-> missing:gone");
  });

  test("the repo, its types and the url", () => {
    expect(data()).toMatchObject({ repo: "memory", types: ["Spec", "Effort"], url: "https://github.com/o/r/blob/main/" });
  });

  test("lore graph --json prints the data", async () => {
    const { code, out } = await run(["graph", "--json"], tree());
    expect(code).toBe(0);
    expect(JSON.parse(out).nodes).toHaveLength(data().nodes.length);
  });
});

// The data a page carries, read back out of it.
const embedded = (page: string) => JSON.parse(/<script type="application\/json" id="data">(.*?)<\/script>/s.exec(page)![1]!);

describe("graph page", () => {
  test("lore graph writes the page to --out and prints its path", async () => {
    const out = join(mkdtempSync(join(tmpdir(), "lore-graph-")), "g.html");
    expect(await run(["graph", "--out", out], tree())).toEqual({ code: 0, out: `${out}\n` });
    const page = readFileSync(out, "utf8");
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain("<title>memory: lore graph</title>");
    expect(page).not.toMatch(/\/\*(TITLE|STYLE|DATA|SCRIPT)\*\//);
    expect(page).not.toMatch(/<(script|link)[^>]+(src|href)=/);
    expect(embedded(page).nodes).toHaveLength(data().nodes.length);
  });

  test("a note's text survives the page as written, </script> and $' included", () => {
    const t = memoryTree({ ".lore/schema.yml": SCHEMA, "docs/specs/x.md": "# X\n\nEnds </script><script>alert(1)</script> and $' and $& and $1.\n" });
    const page = graphPage(graphData(loadGraph(t), { url: null }));
    expect(page.match(/<\/script>/g)).toHaveLength(2);
    expect(embedded(page).nodes[0].body).toContain("</script><script>alert(1)</script> and $' and $& and $1.");
  });

  test("the same notes give the same bytes", () => {
    expect(graphPage(data())).toBe(graphPage(data()));
  });

  test("Open on GitHub points at the branch, only for a GitHub origin", () => {
    const url = "https://github.com/o/r/blob/dev/";
    expect(githubUrl("git@github.com:o/r.git", "dev")).toBe(url);
    expect(githubUrl("https://github.com/o/r", "dev")).toBe(url);
    expect(githubUrl("https://user@github.com/o/r.git\n", "dev")).toBe(url);
    expect(githubUrl("ssh://git@github.com/o/r.git", "dev")).toBe(url);
    expect(githubUrl("git@gitlab.com:o/r.git", "dev")).toBeNull();
    expect(githubUrl("", "dev")).toBeNull();
    expect(githubUrl("git@github.com:o/r.git", "")).toBeNull();
  });

  test("lore graph <note> opens focused on it, two links deep unless --depth says", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-graph-"));
    expect(await run(["graph", "auth"], tree())).toMatchObject({ code: 1, out: expect.stringContaining("'auth' matches 2 notes") });
    await run(["graph", "spec/auth", "--depth", "3", "--out", join(dir, "a.html")], tree());
    const page = readFileSync(join(dir, "a.html"), "utf8");
    expect(embedded(page).focus).toEqual({ name: "spec/auth", depth: 3 });
    expect(page).toContain("<title>spec/auth in memory: lore graph</title>");
    await run(["graph", "effort/auth", "--out", join(dir, "b.html")], tree());
    expect(embedded(readFileSync(join(dir, "b.html"), "utf8")).focus).toEqual({ name: "effort/auth", depth: 2 });
  });

  test("a note that matches nothing, a bad --depth, or --depth with no note is refused", async () => {
    expect(await run(["graph", "nope"], tree())).toEqual({ code: 1, out: "lore graph: no note matches 'nope'\n" });
    expect(await run(["graph", "spec/auth", "--depth", "0"], tree())).toMatchObject({ code: 2 });
    expect(await run(["graph", "spec/auth", "--depth", "two"], tree())).toEqual({ code: 2, out: "lore graph: --depth takes a whole number of links, 1 or more, not 'two'\n" });
    expect(await run(["graph", "--depth", "2"], tree())).toEqual({ code: 2, out: "lore graph: --depth needs a note to count links from\n" });
    expect(await run(["graph", "a", "b"], tree())).toEqual({ code: 2, out: "lore graph: name at most one note\n" });
  });
});
