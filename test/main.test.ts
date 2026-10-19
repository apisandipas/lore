import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { run } from "../src/main";
import { parseNote } from "../src/parse";

const fixture = join(import.meta.dir, "fixtures", "basic");
const lore = (...argv: string[]) => run(argv, fixture);
const json = async (...argv: string[]) => JSON.parse((await lore(...argv, "--json")).out);

describe("cli", () => {
  test("help lists commands", async () => {
    const { code, out } = await run(["help"]);
    expect(code).toBe(0);
    expect(out).toContain("context <file>");
  });

  test("unknown command fails with usage", async () => {
    const { code, out } = await run(["nope"]);
    expect(code).toBe(2);
    expect(out).toContain("unknown command 'nope'");
  });

  test("--link without field=note is a usage error", async () => {
    for (const bad of ["specs", "=auth", "specs="]) {
      const { code, out } = await lore("new", "Spec", "X", "--link", bad);
      expect(code).toBe(2);
      expect(out).toBe(`lore new: --link takes <field>=<note>, not '${bad}'\n`);
    }
  });

  test("bad --budget is a usage error", async () => {
    expect((await lore("context", "pkg/auth/session.ts", "--budget", "lots")).code).toBe(2);
  });
});

describe("parseNote", () => {
  test("skips links in code spans and fences, keeps frontmatter links with their field", () => {
    const note = parseNote("docs/x.md", "---\nspec: \"[[auth]]\"\n---\n# X\n\n[[a]] `[[b]]`\n```\n[[c]]\n```\n");
    expect(note.links).toEqual([
      { target: "auth", line: 2, field: "spec" },
      { target: "a", line: 6 },
    ]);
  });

  test("checklist counts items and finds the first unchecked one, skipping fences", () => {
    const note = parseNote("docs/x.md", "---\na: 1\n---\n# X\n\n- [x] one\n```\n- [ ] fenced\n```\n- [ ] two\n- [ ] three\n");
    expect(note.checklist).toEqual({ done: 1, total: 3, next: "two", nextLine: 10 });
  });

  test("title and summary fall back to heading and first paragraph", () => {
    const note = parseNote("docs/x.md", "# Heading\n\nFirst line\nsecond line.\n\nLater.");
    expect(note.title).toBe("Heading");
    expect(note.summary).toBe("First line second line.");
  });

  test("reports unreadable frontmatter instead of throwing", () => {
    expect(parseNote("docs/x.md", "---\n: [\n---\nbody").frontmatterError).toContain("unreadable frontmatter");
  });
});

describe("context", () => {
  test("ranks citation, symbol, path anchor, CONTEXT.md, then linked notes", async () => {
    const { notes } = await json("context", "pkg/auth/session.ts");
    expect(notes.map((n: { path: string }) => n.path)).toEqual([
      "docs/decisions/0007-short-sessions.md",
      "docs/decisions/0008-session-manager.md",
      "pkg/auth/CONTEXT.md",
      "CONTEXT.md",
      "docs/specs/auth.md",
    ]);
    expect(notes[0].matched).toEqual(["cited at session.ts:1", "anchor pkg/auth/**"]);
    expect(notes[4].matched).toEqual(["spec of Short-lived sessions"]);
  });

  test("symbol anchors reach files outside the anchored directory", async () => {
    const { notes } = await json("context", "pkg/billing/charge.ts");
    expect(notes[0].path).toBe("docs/decisions/0008-session-manager.md");
    expect(notes[0].matched).toEqual(["uses SessionManager"]);
  });

  test("resolves paths relative to the working directory", async () => {
    const { out } = await run(["context", "session.ts"], join(fixture, "pkg", "auth"));
    expect(out).toStartWith("pkg/auth/session.ts: 5 notes");
  });

  test("budget omits lower-ranked notes but always keeps one", async () => {
    const { out } = await lore("context", "pkg/auth/session.ts", "--budget", "1");
    expect(out).toContain("Short-lived sessions");
    expect(out).toContain("4 more notes omitted");
  });

  test("the root CONTEXT.md governs every file", async () => {
    const { notes } = await json("context", "README.md");
    expect(notes.map((n: { path: string }) => n.path)).toEqual(["CONTEXT.md"]);
  });
});

describe("show", () => {
  test("lists links, backlinks, citations and anchors", async () => {
    const data = await json("show", "0007");
    expect(data.linksOut.map((l: { resolved: string | null }) => l.resolved)).toEqual([
      "docs/specs/auth.md",
      "docs/decisions/0008-session-manager.md",
    ]);
    expect(data.citedBy).toEqual([{ file: "pkg/auth/session.ts", line: 1 }]);
    expect(data.anchors[0].files).toEqual(["pkg/auth/CONTEXT.md", "pkg/auth/session.ts"]);
  });

  test("finds notes by alias and reports backlinks", async () => {
    const data = await json("show", "login");
    expect(data.path).toBe("docs/specs/auth.md");
    expect(data.linksIn).toEqual([{ from: "docs/decisions/0007-short-sessions.md", line: 4, field: "spec" }]);
  });

  test("an ambiguous name lists the candidates", async () => {
    const { code, out } = await lore("show", "CONTEXT");
    expect(code).toBe(1);
    expect(out).toContain("matches 2 notes");
  });
});

describe("list", () => {
  test("filters by type", async () => {
    const notes = await json("list", "--type", "spec");
    expect(notes.map((n: { path: string }) => n.path)).toEqual(["docs/specs/auth.md"]);
  });
});

describe("check", () => {
  test("reports every broken link, anchor and citation", async () => {
    const { code, out } = await lore("check");
    expect(code).toBe(1);
    expect(out).toContain("docs/decisions/0009-broken.md:4: anchor 'gone/**' matches no files");
    expect(out).toContain("docs/decisions/0009-broken.md:8: link 'nowhere' matches no note");
    expect(out).toContain("docs/decisions/0009-broken.md:8: link 'CONTEXT' is ambiguous: it matches 2 notes");
    expect(out).toContain("pkg/auth/session.ts:3: citation 'lore:missing-note' matches no note");
    expect(out).toContain("6 notes, 2 citations: 4 problems");
  });
});
