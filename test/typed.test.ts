import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/main";
import { setField } from "../src/frontmatter";

const fixture = join(import.meta.dir, "fixtures", "typed");
const lore = (...argv: string[]) => run(argv, fixture);

// Commands that write get a throwaway copy of the fixture.
const copies: string[] = [];
function copy(): { dir: string; lore: (...argv: string[]) => ReturnType<typeof run>; read: (p: string) => string } {
  const dir = mkdtempSync(join(tmpdir(), "lore-test-"));
  copies.push(dir);
  cpSync(fixture, dir, { recursive: true });
  return { dir, lore: (...argv) => run(argv, dir), read: (p) => readFileSync(join(dir, p), "utf8") };
}
afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("schema", () => {
  test("check enforces types, enums, link types and superseding", async () => {
    const { code, out } = await lore("check");
    expect(code).toBe(1);
    expect(out).toBe(
      [
        "docs/decisions/0003-bad.md:2: 'status' is 'maybe'; expected one of proposed, accepted, superseded",
        "docs/decisions/0003-bad.md:3: 'supersedes' links to auth, a Spec; expected a Decision",
        "docs/decisions/0003-bad.md:3: supersedes auth, but auth is accepted",
        "docs/efforts/stray.md:2: type 'Chore' is not in .lore/schema.yml",
        "src/session.ts:1: cites superseded '0001-hard-expiry'; cite lore:0002-rotating-tokens instead",
        "",
        "6 notes, 1 citation: 5 problems",
        "",
      ].join("\n"),
    );
  });

  test("notes take their type from their directory and their summary from the named section", async () => {
    const [note] = JSON.parse((await lore("list", "--type", "decision", "--summaries", "--json")).out);
    expect(note).toEqual({
      path: "docs/decisions/0001-hard-expiry.md",
      title: "Sessions expire after 15 minutes",
      type: "Decision",
      status: "superseded",
      summary: "Every session hard-expires after 15 minutes.",
    });
  });
});

describe("superseding", () => {
  test("context swaps a superseded citation for the decision in force, with one line of history", async () => {
    const { out } = await lore("context", "src/session.ts");
    expect(out).toBe(
      [
        "src/session.ts: 1 note",
        "",
        "Rotating refresh tokens  (Decision, accepted)",
        "  docs/decisions/0002-rotating-tokens.md",
        "  matched: anchor src/**; cited at session.ts:1 (via superseded 0001-hard-expiry)",
        "  Refresh tokens rotate on every use; access tokens last 15 minutes.",
        "  supersedes 0001-hard-expiry: Every session hard-expires after 15 minutes.",
        "",
      ].join("\n"),
    );
  });

  test("show walks the chain from either end", async () => {
    const history = (await lore("show", "0001", "--json")).out;
    expect(JSON.parse(history).history).toEqual([
      { path: "docs/decisions/0002-rotating-tokens.md", status: "accepted" },
      { path: "docs/decisions/0001-hard-expiry.md", status: "superseded" },
    ]);
  });

  test("new --supersedes numbers the note, flips the old status and moves its anchors", async () => {
    const c = copy();
    const { code, out } = await c.lore("new", "Decision", "Sliding sessions", "--supersedes", "0002");
    expect(code).toBe(0);
    expect(out).toBe(
      "created docs/decisions/0004-sliding-sessions.md\nmarked docs/decisions/0002-rotating-tokens.md superseded and moved its anchors\n",
    );
    expect(c.read("docs/decisions/0004-sliding-sessions.md")).toBe(
      '---\ntype: Decision\nstatus: proposed\nsupersedes: ["[[0002-rotating-tokens]]"]\nanchors: ["src/**"]\n---\n# Sliding sessions\n\n## Context\n\n## Decision\n\n## Consequences\n',
    );
    expect(c.read("docs/decisions/0002-rotating-tokens.md")).toStartWith(
      '---\nstatus: superseded\nsupersedes: ["[[0001]]"]\n---\n',
    );
    // The citation of 0001 now resolves through two hops.
    expect((await c.lore("check")).out).toContain("cite lore:0004-sliding-sessions instead");
  });

  test("new refuses to supersede a note twice", async () => {
    const { code, out } = await lore("new", "Decision", "Again", "--supersedes", "0001");
    expect(code).toBe(1);
    expect(out).toContain("already superseded by 0002-rotating-tokens");
  });

  test("new rejects unknown types", async () => {
    const { code, out } = await lore("new", "Chore", "Tidy");
    expect(code).toBe(1);
    expect(out).toContain("types: Spec, Decision, Effort");
  });
});

describe("freeze", () => {
  test("records spec hashes; check reports drift when the spec body changes", async () => {
    const c = copy();
    const frozen = await c.lore("freeze", "reset");
    expect(frozen.code).toBe(0);
    expect(c.read("docs/efforts/reset.md")).toMatch(/\nfrozen:\n {2}docs\/specs\/auth\.md: [0-9a-f]{12}\n---\n/);

    const spec = join(c.dir, "docs/specs/auth.md");
    writeFileSync(spec, setField(readFileSync(spec, "utf8"), "status", "retired"));
    expect((await c.lore("check")).out).not.toContain("changed since");

    writeFileSync(spec, `${readFileSync(spec, "utf8")}\nSessions now slide.\n`);
    expect((await c.lore("check")).out).toContain(
      "docs/efforts/reset.md:5: docs/specs/auth.md changed since this was frozen; review the plan, then run lore freeze reset",
    );

    await c.lore("freeze", "reset");
    expect((await c.lore("check")).out).not.toContain("changed since");
  });

  test("show reports checklist progress", async () => {
    expect((await lore("show", "reset")).out).toContain("Checklist: 1 of 3 done");
  });
});

describe("setField", () => {
  test("replaces a key and its block value, keeping other lines", () => {
    const text = "---\na: 1\nlist:\n- x\n- y\nb: 2\n---\nbody";
    expect(setField(text, "list", "[z]")).toBe("---\na: 1\nlist: [z]\nb: 2\n---\nbody");
    expect(setField(text, "c", "3")).toBe("---\na: 1\nlist:\n- x\n- y\nb: 2\nc: 3\n---\nbody");
    expect(setField("body", "a", "1")).toBe("---\na: 1\n---\nbody");
  });
});
