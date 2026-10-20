import { describe, expect, test } from "bun:test";
import { checkGraph } from "../src/commands/check";
import { loadGraph } from "../src/graph";
import { run } from "../src/main";
import { parseNote } from "../src/parse";
import { memoryTree } from "../src/tree";

const SCHEMA = `notes: docs
types:
  Spec:
    dir: docs/specs
    format: org
    fields:
      status: { enum: [draft, accepted, retired], required: true }
  Decision:
    dir: docs/decisions
    id: "{n:4}"
    summary: Decision
    fields:
      status: { enum: [proposed, accepted, superseded], required: true }
  Effort:
    dir: docs/efforts
    freeze: [specs]
    fields:
      specs: { link: Spec, many: true, required: true }
      status: { enum: [planned, active, done] }
`;

const ITEMS = `#+title: Items Spec
#+STATUS: accepted
#+anchors: [src/features/items/**, symbol:ensureSession]

Saving a page and reading it later. How it looks is in [[file:design.org][design.org]].

* Rules
- One item per URL per user. See [[https://example.com/rfc][the RFC]] and [[*Goal]].

* Tasks
- [X] Table
+ [ ] Server functions
1. [-] Routes
#+begin_example
- [ ] not a task
#+end_example
`;

const DESIGN = `#+title: Dogear Visual Design
#+status: draft

* Direction  :visual:
A library of cards. Back to [[items]] and [[file:../decisions/0001-cents.md::*Decision][money]].
`;

function repo(files: Record<string, string>) {
  return memoryTree({ ".lore/schema.yml": SCHEMA, ...files });
}

describe("reading Org notes", () => {
  const files = {
    "docs/specs/items.org": ITEMS,
    "docs/specs/design.org": DESIGN,
    "docs/decisions/0001-cents.md": "---\nstatus: accepted\n---\n# Cents\n\n## Decision\nMoney is cents.\n",
    "src/features/items/save.ts": "ensureSession();\n",
  };

  test("fields, title and summary come from #+ lines and the first paragraph", () => {
    const n = parseNote("docs/specs/items.org", ITEMS);
    expect([n.title, n.status, n.stem]).toEqual(["Items Spec", "accepted", "items"]);
    expect(n.anchors).toEqual(["src/features/items/**", "symbol:ensureSession"]);
    expect(n.summary).toBe("Saving a page and reading it later. How it looks is in [[file:design.org][design.org]].");
    expect(n.fieldLines).toEqual({ title: 1, status: 2, anchors: 3 });
  });

  test("without #+title, the first heading is the title, without its tags", () => {
    expect(parseNote("a.org", "* Direction  :visual:ui:\nText.\n").title).toBe("Direction");
    expect(parseNote("a.org", "#+status: draft\n\n:PROPERTIES:\n:ID: x\n:END:\nFirst words.\n").summary).toBe("First words.");
  });

  test("a value is text unless it is in brackets or quotes", () => {
    const n = parseNote("a.org", '#+title: Items: the spec # one\n#+summary: "2024"\n#+aliases: [it, items]\n');
    expect([n.title, n.summary, n.aliases]).toEqual(["Items: the spec # one", "2024", ["it", "items"]]);
  });

  test("checklists are Org's: [X] is done, [-] is open, blocks do not count", () => {
    expect(parseNote("docs/specs/items.org", ITEMS).checklist).toEqual({ done: 1, total: 3, next: "Server functions", nextLine: 12 });
  });

  test("links: names, labels and file: paths relative to the note; no URLs or headings", () => {
    const g = loadGraph(repo(files));
    const targets = (path: string) => g.byPath.get(path)!.links.map((l) => [l.target, g.resolve(l.target).note?.path]);
    expect(targets("docs/specs/items.org")).toEqual([["docs/specs/design.org", "docs/specs/design.org"]]);
    expect(targets("docs/specs/design.org")).toEqual([
      ["items", "docs/specs/items.org"],
      ["docs/decisions/0001-cents.md", "docs/decisions/0001-cents.md"],
    ]);
  });

  test("check, context, list and show see Org notes like Markdown ones", async () => {
    const tree = repo(files);
    expect((await run(["check"], tree)).out).toBe("3 notes, 0 citations: no problems\n");
    const context = (await run(["context", "src/features/items/save.ts"], tree)).out;
    expect(context).toContain("Items Spec  (Spec, accepted)\n  docs/specs/items.org\n  matched: anchor src/features/items/**; uses ensureSession");
    expect((await run(["list", "--type", "spec"], tree)).out).toContain("docs/specs/design.org");
    expect((await run(["show", "items"], tree)).out).toContain("Items Spec");
  });

  test("a type's summary section is a * heading", () => {
    const g = loadGraph(repo({ "docs/decisions/0002-tags.org": "#+status: accepted\n* Tags\n** Context\nWhy.\n** Decision\nTags are words.\n" }));
    expect(g.notes[0]!.summary).toBe("Tags are words.");
  });

  test("check reports a broken Org link at its line, and a bad field at its #+ line", () => {
    const g = loadGraph(repo({ "docs/specs/a.org": "#+title: A\n#+status: finished\n\nSee [[nope][Nope]].\n" }));
    expect(checkGraph(g).map((p) => `${p.line}: ${p.message}`)).toEqual([
      "2: 'status' is 'finished'; expected one of draft, accepted, retired",
      "4: link 'nope' matches no note",
    ]);
  });
});

describe("writing Org notes", () => {
  const spec = "#+TITLE: S\n#+status: draft\n\n* Goal\nDo S.\n";

  test("set changes #+ lines in place, keeps the key's case, and adds new ones after the last", async () => {
    const tree = repo({ "docs/specs/s.org": spec });
    expect((await run(["set", "s", "status=accepted", "title=Items: the spec", "aliases=[x]"], tree)).code).toBe(0);
    expect(tree.read("docs/specs/s.org")).toBe('#+TITLE: Items: the spec\n#+status: accepted\n#+aliases: ["[x]"]\n\n* Goal\nDo S.\n');
    const n = loadGraph(tree).byPath.get("docs/specs/s.org")!;
    expect([n.title, n.status, n.frontmatter.aliases]).toEqual(["Items: the spec", "accepted", ["[x]"]]);
  });

  test("a note with no #+ lines gets them at the top", async () => {
    const tree = repo({ "docs/specs/s.org": "* S\nText.\n" });
    await run(["set", "s", "status=draft"], tree);
    expect(tree.read("docs/specs/s.org")).toBe("#+status: draft\n* S\nText.\n");
  });

  test("links are written as Org reads them, and += adds to links written by hand", async () => {
    const tree = repo({
      "docs/specs/a.org": "#+status: accepted\n",
      "docs/specs/b.org": "#+status: accepted\n",
      "docs/specs/c.org": "#+status: accepted\n",
      "docs/efforts/e.org": "#+specs: [[a]] [[b]]\n\n* Tasks\n- [ ] one\n",
    });
    expect((await run(["set", "e", "specs+=c"], tree)).code).toBe(0);
    expect(tree.read("docs/efforts/e.org")).toStartWith("#+specs: [[a]] [[b]] [[c]]\n");
    const g = loadGraph(tree);
    expect(g.byPath.get("docs/efforts/e.org")!.links.map((l) => l.target)).toEqual(["a", "b", "c"]);
    expect(checkGraph(g)).toEqual([]);
  });

  test("freeze writes a map that reads back, all-digit hashes included, and drift is reported", async () => {
    // This body hashes to 451752723810, which unquoted YAML reads as a number.
    const tree = repo({
      "docs/specs/s.md": "---\nstatus: accepted\n---\n# S\n\n1148\n",
      "docs/efforts/e.org": "#+specs: [[s]]\n\n* Tasks\n- [ ] one\n",
    });
    expect((await run(["freeze", "e"], tree)).code).toBe(0);
    expect(tree.read("docs/efforts/e.org")).toStartWith('#+specs: [[s]]\n#+frozen: {"docs/specs/s.md": "451752723810"}\n');
    expect((await run(["check"], tree)).code).toBe(0);
    tree.write("docs/specs/s.md", "---\nstatus: accepted\n---\n# S\n\nchanged\n");
    expect((await run(["check"], tree)).out).toContain("docs/specs/s.md changed since this was frozen");
  });

  test("tick writes [X], ticks a started [-] item, and skips blocks", async () => {
    const tree = repo({ "docs/efforts/e.org": "#+specs: [[s]]\n#+begin_src\n- [ ] code\n#+end_src\n1. [-] started\n+ [ ] two\n" });
    expect((await run(["tick", "e"], tree)).out).toBe("ticked docs/efforts/e.org: started\nnext: two  (1 of 2 done)\n");
    expect((await run(["tick", "e"], tree)).out).toBe("ticked docs/efforts/e.org: two\nall 2 items done\n");
    expect(tree.read("docs/efforts/e.org")).toBe("#+specs: [[s]]\n#+begin_src\n- [ ] code\n#+end_src\n1. [X] started\n+ [X] two\n");
  });
});
