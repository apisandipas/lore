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
