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
