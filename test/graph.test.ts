import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkGraph } from "../src/commands/check";
import { loadGraph } from "../src/graph";
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
