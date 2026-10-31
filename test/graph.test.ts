import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkGraph } from "../src/commands/check";
import { loadGraph } from "../src/graph";
import { drift, plans } from "../src/plan";
import { run } from "../src/main";
import { diskTree, memoryTree } from "../src/tree";

const SCHEMA = `notes: docs
types:
  Spec:
    dir: docs/specs
    fields:
      status: { enum: [draft, accepted, retired], required: true }
  Effort:
    dir: docs/efforts
    freeze: [specs]
    fields:
      specs: { link: Spec, many: true, required: true }
      status: { enum: [planned, active, done] }
      owner: {}
`;

// A repo in memory: the schema above plus the given files.
function repo(files: Record<string, string>) {
  return memoryTree({ ".lore/schema.yml": SCHEMA, ...files });
}

const problems = (files: Record<string, string>) =>
  checkGraph(loadGraph(repo(files))).map((p) => `${p.file}:${p.line}: ${p.message}`);

describe("memory tree", () => {
  test("reads a fixture the same as the disk does", async () => {
    const fixture = join(import.meta.dir, "fixtures", "typed");
    const disk = diskTree(fixture);
    const memory = memoryTree(Object.fromEntries(disk.files().map((f) => [f, readFileSync(join(fixture, f), "utf8")])));
    for (const argv of [["check"], ["next"], ["context", "src/session.ts"], ["list", "--summaries"]]) {
      expect(await run(argv, memory)).toEqual(await run(argv, fixture));
    }
  });

  test("searches whole words and literal text", () => {
    const tree = memoryTree({ "a.ts": "Foo.bar FooBar\nfoo Foo" });
    expect(tree.search("Foo", { fixed: true, word: true })).toEqual([
      { file: "a.ts", line: 1, text: "Foo" },
      { file: "a.ts", line: 2, text: "Foo" },
    ]);
    expect(tree.search("o.b", { fixed: true })).toEqual([{ file: "a.ts", line: 1, text: "o.b" }]);
  });
});

describe("check", () => {
  test("reports a missing required field", () => {
    expect(problems({ "docs/efforts/x.md": "---\nstatus: planned\n---\n# X\n" })).toEqual([
      "docs/efforts/x.md:1: Effort needs 'specs'",
    ]);
  });

  test("reports a list in a field that takes one value", () => {
    expect(
      problems({
        "docs/specs/s.md": "---\nstatus: draft\n---\n# S\n",
        "docs/efforts/x.md": '---\nspecs: ["[[s]]"]\nowner: [a, b]\n---\n# X\n',
      }),
    ).toEqual(["docs/efforts/x.md:3: 'owner' takes one value, not a list"]);
  });

  test("reports a field on its own line after a multi-line list, in Markdown and Org", () => {
    expect(
      problems({
        "docs/specs/s.md": "---\nstatus: draft\n---\n# S\n",
        "docs/efforts/x.md": '---\nspecs:\n  - "[[s]]"\nanchors:\n- src/a.ts\n- src/b.ts\nstatus: bogus\n---\n# X\n',
        "docs/efforts/y.org": "#+specs: [[s]]\n\n#+STATUS: bogus\n* Y\n",
      }),
    ).toEqual([
      "docs/efforts/x.md:4: anchor 'src/a.ts' matches no files",
      "docs/efforts/x.md:4: anchor 'src/b.ts' matches no files",
      "docs/efforts/x.md:7: 'status' is 'bogus'; expected one of planned, active, done",
      "docs/efforts/y.org:3: 'status' is 'bogus'; expected one of planned, active, done",
    ]);
  });
});

describe("failures", () => {
  test("an unreadable schema.yml exits 1", async () => {
    const { code, out } = await run(["check"], memoryTree({ ".lore/schema.yml": "types: [oops" }));
    expect(code).toBe(1);
    expect(out).toStartWith("lore check: ");
  });

  test("a schema type that is not a mapping exits 1", async () => {
    const { code, out } = await run(["list"], memoryTree({ ".lore/schema.yml": "types: [Spec]" }));
    expect(code).toBe(1);
    expect(out).toBe("lore list: schema.yml: types must be a mapping of type names\n");
  });

  test("rg missing from PATH exits 1 and says so", async () => {
    const path = process.env.PATH;
    process.env.PATH = "/nonexistent";
    try {
      const { code, out } = await run(["check"], join(import.meta.dir, "fixtures", "typed"));
      expect(code).toBe(1);
      expect(out).toBe("lore check: lore needs ripgrep (rg) on PATH\n");
    } finally {
      process.env.PATH = path;
    }
  });
});

describe("writes", () => {
  test("a value YAML would read as a number stays a string", async () => {
    const tree = repo({ "docs/specs/s.md": "---\nstatus: draft\n---\n# S\n" });
    await run(["set", "s", "title=2024"], tree);
    expect(tree.read("docs/specs/s.md")).toBe('---\nstatus: draft\ntitle: "2024"\n---\n# S\n');
    expect(JSON.parse((await run(["show", "s", "--json"], tree)).out).title).toBe("2024");
  });

  test("freeze writes a hash of all digits so it reads back as a string", async () => {
    // This body hashes to 451752723810, which unquoted YAML reads as a number.
    const tree = repo({
      "docs/specs/s.md": "---\nstatus: accepted\n---\n# S\n\n1148\n",
      "docs/efforts/e.md": '---\nspecs: ["[[s]]"]\n---\n# E\n\n- [ ] one\n',
    });
    const { frozen } = JSON.parse((await run(["freeze", "e", "--json"], tree)).out);
    const g = loadGraph(tree);
    expect(g.byPath.get("docs/efforts/e.md")!.frontmatter.frozen).toEqual({ [frozen[0].path]: frozen[0].hash });
    expect(frozen[0].hash).toBe("451752723810");
    expect((await run(["check"], tree)).code).toBe(0);
    tree.write("docs/specs/s.md", "---\nstatus: accepted\n---\n# S\n\nchanged\n");
    expect((await run(["check"], tree)).out).toContain("docs/specs/s.md changed since this was frozen");
  });

  test("tick ticks the first open item, skipping fenced examples", async () => {
    const tree = repo({ "docs/efforts/e.md": "# E\n\n```\n- [ ] example\n```\n- [x] one\n- [ ] two\n- [ ] three\n" });
    expect((await run(["tick", "e"], tree)).out).toBe("ticked docs/efforts/e.md: two\nnext: three  (2 of 3 done)\n");
    expect(tree.read("docs/efforts/e.md")).toContain("- [ ] example\n```\n- [x] one\n- [x] two\n- [ ] three");
  });
});

describe("types", () => {
  test("a note's type is matched to the schema whatever its case, and reported by its schema name", async () => {
    const tree = repo({
      "docs/specs/s.md": "---\nstatus: accepted\n---\n# S\n",
      "docs/other/e.md": '---\ntype: effort\nspecs: ["[[s]]"]\n---\n# E\n\n- [ ] one\n',
    });
    const g = loadGraph(tree);
    const e = g.byPath.get("docs/other/e.md")!;
    expect(e.type).toBe("Effort");
    expect(g.isA(e, "EFFORT")).toBe(true);
    expect(JSON.parse((await run(["list", "--type", "effort", "--json"], tree)).out).map((n: { path: string }) => n.path)).toEqual(["docs/other/e.md"]);
  });
});

describe("resolving", () => {
  const tree = () =>
    repo({
      "CONTEXT.md": "# Root\n\nSee [[docs/a]].\n",
      "src/CONTEXT.md": "# Src\n",
      "docs/a.md": "# A\n\nRoot rules: [[CONTEXT.md]]. Either: [[CONTEXT]].\n",
    });

  test("an exact path wins over an ambiguous name, in links and on the command line", async () => {
    const g = loadGraph(tree());
    expect(g.resolve("CONTEXT.md").note?.path).toBe("CONTEXT.md");
    expect(g.find("./src/CONTEXT.md").note?.path).toBe("src/CONTEXT.md");
    expect(checkGraph(g).map((p) => p.message)).toEqual(["link 'CONTEXT' is ambiguous: it matches CONTEXT.md and src/CONTEXT.md"]);
  });

  test("an ambiguous name lists what it matches", () => {
    expect(loadGraph(tree()).find("context").error).toBe("'context' matches 2 notes:\n  CONTEXT.md\n  src/CONTEXT.md");
  });
});

describe("validation", () => {
  test("check, new and set report a bad link field the same way", async () => {
    const tree = repo({
      "docs/specs/s.md": "---\nstatus: draft\n---\n# S\n",
      "docs/efforts/e.md": '---\nspecs: ["[[nope]]"]\n---\n# E\n',
    });
    const message = "'specs' links to 'nope', which matches no note";
    expect((await run(["check"], tree)).out).toContain(`docs/efforts/e.md:2: ${message}`);
    expect((await run(["set", "e", "specs=nope"], tree)).out).toBe(`lore set: docs/efforts/e.md: ${message}\n`);
    expect((await run(["new", "Effort", "F", "--link", "specs=nope"], tree)).out).toBe(`lore new: --link ${message}\n`);
  });
});

describe("plans", () => {
  const files = {
    "docs/specs/s.md": "---\nstatus: accepted\n---\n# S\n",
    "docs/efforts/e.md": '---\nspecs: ["[[s]]"]\nstatus: active\n---\n# E\n\n- [ ] one\n',
  };

  test("an effort drifts when its spec's body changes or the spec goes, not when its status flips", async () => {
    const tree = repo(files);
    await run(["freeze", "e"], tree);
    const e = () => loadGraph(tree).byPath.get("docs/efforts/e.md")!;
    expect(drift(loadGraph(tree), e())).toEqual([]);

    tree.write("docs/specs/s.md", "---\nstatus: retired\n---\n# S\n");
    expect(drift(loadGraph(tree), e())).toEqual([]);

    tree.write("docs/specs/s.md", "---\nstatus: accepted\n---\n# S\n\nMore.\n");
    expect(drift(loadGraph(tree), e())).toEqual([{ path: "docs/specs/s.md", gone: false }]);

    tree.write("docs/efforts/e.md", tree.read("docs/efforts/e.md")!.replace("status: active", "status: done"));
    expect(drift(loadGraph(tree), e())).toEqual([]);
    const g = loadGraph(tree);
    expect(plans(g)!.shippedAndChanged(g.byPath.get("docs/specs/s.md")!)).toBe(true);
  });

  test("specs and efforts come from the schema's freeze fields", () => {
    const g = loadGraph(repo(files));
    const p = plans(g)!;
    expect(p.efforts.map((n) => n.path)).toEqual(["docs/efforts/e.md"]);
    expect(p.specs.map((n) => n.path)).toEqual(["docs/specs/s.md"]);
    expect(p.effortsOf(p.specs[0]!)).toEqual(p.efforts);
    expect(plans(loadGraph(memoryTree({ ".lore/schema.yml": "types:\n  Spec: {}\n" })))).toBeUndefined();
  });
});

describe("context sessions", () => {
  const files = {
    "CONTEXT.md": "# Root\n\nThe whole repo.\n",
    "src/CONTEXT.md": "# Src\n\nThe code.\n",
    "src/a.ts": "",
    "src/b.ts": "",
  };
  const id = () => `test-${crypto.randomUUID()}`;
  const titles = (out: string) => [...out.matchAll(/^(\w+)\n  \S+\.md$/gm)].map((m) => m[1]);

  test("shows each note once, and nothing when every note was shown", async () => {
    const tree = memoryTree(files);
    const session = id();
    expect(titles((await run(["context", "--session", session, "src/a.ts"], tree)).out)).toEqual(["Src", "Root"]);
    expect(await run(["context", "--session", session, "src/a.ts"], tree)).toEqual({ code: 0, out: "" });
    expect(await run(["context", "--session", session, "src/b.ts"], tree)).toEqual({ code: 0, out: "" });
    expect(titles((await run(["context", "--session", id(), "src/b.ts"], tree)).out)).toEqual(["Src", "Root"]);
  });

  test("shows a note again when it changes", async () => {
    const tree = memoryTree(files);
    const session = id();
    await run(["context", "--session", session, "src/a.ts"], tree);
    tree.write("src/CONTEXT.md", "# Src\n\nThe code, changed.\n");
    expect(titles((await run(["context", "--session", session, "src/a.ts"], tree)).out)).toEqual(["Src"]);
  });

  test("a note left out by the budget is still unseen", async () => {
    const tree = memoryTree(files);
    const session = id();
    expect(titles((await run(["context", "--session", session, "--budget", "1", "src/a.ts"], tree)).out)).toEqual(["Src"]);
    expect(titles((await run(["context", "--session", session, "src/a.ts"], tree)).out)).toEqual(["Root"]);
  });

  test("--forget starts the session over", async () => {
    const tree = memoryTree(files);
    const session = id();
    await run(["context", "--session", session, "src/a.ts"], tree);
    expect(await run(["context", "--session", session, "--forget"], tree)).toEqual({ code: 0, out: "" });
    expect(titles((await run(["context", "--session", session, "src/a.ts"], tree)).out)).toEqual(["Src", "Root"]);
    expect((await run(["context", "--forget"], tree)).code).toBe(2);
    expect((await run(["context", "--session", session, "--forget", "src/a.ts"], tree)).code).toBe(2);
  });

  test("--json lists only the unseen notes", async () => {
    const tree = memoryTree(files);
    const session = id();
    await run(["context", "--session", session, "src/b.ts"], tree);
    tree.write("CONTEXT.md", "# Root\n\nChanged.\n");
    const { notes } = JSON.parse((await run(["context", "--session", session, "--json", "src/a.ts"], tree)).out);
    expect(notes.map((n: { path: string }) => n.path)).toEqual(["CONTEXT.md"]);
  });
});

describe("anchors", () => {
  test("an anchor's covers() agrees with its files() for every file", () => {
    const fixture = join(import.meta.dir, "fixtures", "typed");
    const disk = diskTree(fixture);
    const memory = memoryTree(Object.fromEntries(disk.files().map((f) => [f, readFileSync(join(fixture, f), "utf8")])));
    for (const tree of [disk, memory]) {
      const g = loadGraph(tree);
      const anchors = [...new Set(g.notes.flatMap((n) => n.anchors)), "symbol:Session", "symbol:", "pkg/", "./pkg/auth/**/*.ts"];
      expect(anchors.length).toBeGreaterThan(4);
      for (const anchor of anchors) {
        const files = g.anchor(anchor).files();
        for (const file of g.repo.files) expect([anchor, file, g.anchor(anchor).covers(file)]).toEqual([anchor, file, files.includes(file)]);
      }
      // src/unicode.ts uses Session only beside letters and digits of other scripts.
      expect(g.anchor("symbol:Session").files()).toEqual([]);
    }
  });

  test("a file not written yet gets the notes anchored to its directory", async () => {
    const tree = memoryTree({
      "docs/money.md": "---\nanchors: [src/billing/**]\n---\n# Money in cents\n",
      "src/billing/charge.ts": "",
    });
    expect((await run(["context", "src/billing/refund.ts"], tree)).out).toContain("Money in cents");
  });
});
