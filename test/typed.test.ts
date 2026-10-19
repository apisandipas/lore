import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/main";
import { setField } from "../src/frontmatter";
import { runInit, SKILLS } from "../src/commands/init";

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

describe("new --link", () => {
  test("refuses bad links and writes nothing", async () => {
    const c = copy();
    const schema = join(c.dir, ".lore/schema.yml");
    // A one-note link field, to test giving it two.
    writeFileSync(schema, readFileSync(schema, "utf8").replace("      status: { enum: [planned, active, done] }", "      status: { enum: [planned, active, done] }\n      parent: { link: Effort }"));
    const cases: [string[], string][] = [
      [["Effort", "X", "--link", "status=auth"], "'status' is not a link field of Effort (link fields: specs, parent)"],
      [["Effort", "X", "--link", "specs=nope"], "--link specs: no note matches 'nope'"],
      [["Effort", "X", "--link", "specs=0002"], "--link specs: 0002-rotating-tokens is a Decision; specs links to a Spec"],
      [["Effort", "X", "--link", "parent=reset", "--link", "parent=auth"], "--link parent: auth is a Spec; parent links to a Effort"],
      [["Effort", "X", "--link", "specs=auth", "--link", "parent=reset", "--link", "parent=stray"], "--link parent: stray is a Chore; parent links to a Effort"],
      [["Decision", "X", "--link", "supersedes=0002"], "--link cannot set supersedes; use --supersedes <note>"],
    ];
    for (const [args, message] of cases) {
      const { code, out } = await c.lore("new", ...args);
      expect(out).toBe(`lore new: ${message}\n`);
      expect(code).toBe(1);
    }
    writeFileSync(join(c.dir, "docs/efforts/other.md"), "---\ntype: Effort\nspecs: [\"[[auth]]\"]\n---\n# Other\n");
    const twice = await c.lore("new", "Effort", "X", "--link", "parent=reset", "--link", "parent=other");
    expect(twice.out).toBe("lore new: parent takes one note, not several\n");
    expect(existsSync(join(c.dir, "docs/efforts/x.md"))).toBe(false);
    expect(existsSync(join(c.dir, "docs/decisions/0004-x.md"))).toBe(false);
  });
});

describe("new --link writes", () => {
  test("list fields as lists and single fields as one value, in a note check accepts", async () => {
    const c = copy();
    const schema = join(c.dir, ".lore/schema.yml");
    writeFileSync(schema, readFileSync(schema, "utf8").replace("      status: { enum: [planned, active, done] }", "      status: { enum: [planned, active, done] }\n      parent: { link: Effort }"));
    const { code, out } = await c.lore("new", "Effort", "Sliding sessions", "--link", "specs=auth", "--link", "parent=reset", "--link", "specs=auth");
    expect(out).toBe("created docs/efforts/sliding-sessions.md\n");
    expect(code).toBe(0);
    expect(c.read("docs/efforts/sliding-sessions.md")).toBe(
      '---\ntype: Effort\nstatus: planned\nspecs: ["[[auth]]"]\nparent: "[[reset]]"\n---\n# Sliding sessions\n',
    );
    expect((await c.lore("check")).out).not.toContain("sliding-sessions");
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

describe("next", () => {
  const steps = async (c: ReturnType<typeof copy>) =>
    JSON.parse((await c.lore("next", "--json")).out).steps.map((s: { skill: string; path: string }) => `${s.skill} ${s.path}`);

  test("walks an effort from plan to build to ship, and drift sends it back to plan", async () => {
    const c = copy();
    const effort = join(c.dir, "docs/efforts/reset.md");
    expect((await c.lore("next")).out).toBe(
      "next: lore-plan docs/efforts/reset.md\n  Password reset  (Effort, active)\n  planned but not frozen\n",
    );

    await c.lore("freeze", "reset");
    expect((await c.lore("next")).out).toBe(
      "next: lore-build docs/efforts/reset.md\n  Password reset  (Effort, active)\n  1 of 3 done\n  next item: Email the link\n",
    );

    writeFileSync(effort, readFileSync(effort, "utf8").replaceAll("- [ ]", "- [x]"));
    expect(await steps(c)).toEqual(["lore-ship docs/efforts/reset.md"]);

    const spec = join(c.dir, "docs/specs/auth.md");
    writeFileSync(spec, `${readFileSync(spec, "utf8")}\nSessions now slide.\n`);
    expect((await c.lore("next")).out).toContain("docs/specs/auth.md changed since it was planned");

    writeFileSync(effort, setField(readFileSync(effort, "utf8"), "status", "done"));
    expect((await c.lore("next")).out).toBe("nothing in progress; start a spec with lore-spec\n");
  });

  test("ranks efforts before unplanned specs, and those before drafts", async () => {
    const c = copy();
    writeFileSync(join(c.dir, "docs/specs/billing.md"), "---\nstatus: accepted\n---\n# Billing\n");
    writeFileSync(join(c.dir, "docs/specs/search.md"), "---\nstatus: draft\n---\n# Search\n");
    writeFileSync(join(c.dir, "docs/specs/old.md"), "---\nstatus: retired\n---\n# Old\n");
    expect(await steps(c)).toEqual([
      "lore-plan docs/efforts/reset.md",
      "lore-plan docs/specs/billing.md",
      "lore-spec docs/specs/search.md",
    ]);
    expect((await c.lore("next")).out).toContain(
      "then:\n  lore-plan  docs/specs/billing.md  accepted spec with no effort\n  lore-spec  docs/specs/search.md  draft spec\n",
    );
  });

  test("needs a type that freezes something", async () => {
    const { code, out } = await run(["next"], join(import.meta.dir, "fixtures", "basic"));
    expect(code).toBe(1);
    expect(out).toContain("no type in .lore/schema.yml sets freeze");
  });
});

describe("init", () => {
  const scratch = () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-test-"));
    copies.push(dir);
    mkdirSync(join(dir, ".git"));
    return dir;
  };

  test("writes .lore/ without overwriting, and points at npx skills when the skills are missing", async () => {
    const [dir, home] = [scratch(), scratch()];
    mkdirSync(join(dir, ".lore"));
    writeFileSync(join(dir, ".lore/schema.yml"), "notes: notes\n");
    const { code, out } = await runInit(dir, { json: false, home });
    expect(code).toBe(0);
    expect(out).toBe(
      [
        "created .lore/WORKFLOW.md",
        "created .lore/templates/Spec.md",
        "created .lore/templates/Decision.md",
        "created .lore/templates/Effort.md",
        "kept .lore/schema.yml (already there)",
        "",
        "skills: not installed; install them with:",
        "  npx skills add apisandipas/lore",
        "",
        "Read .lore/WORKFLOW.md, then start a spec with lore-spec.",
        "",
      ].join("\n"),
    );
    expect(readFileSync(join(dir, ".lore/schema.yml"), "utf8")).toBe("notes: notes\n");
  });

  test("finds skills in the project or the home directory", async () => {
    const [dir, home] = [scratch(), scratch()];
    const install = (base: string, names: string[]) => {
      for (const n of names) {
        mkdirSync(join(base, n), { recursive: true });
        writeFileSync(join(base, n, "SKILL.md"), `---\nname: ${n}\n---\n`);
      }
    };
    install(join(home, ".claude/skills"), SKILLS.slice(0, 3));
    expect((await runInit(dir, { json: false, home })).out).toContain("skills: lore-ship, lore-decide, lore-next missing");
    install(join(dir, ".agents/skills"), SKILLS.slice(3));
    expect(JSON.parse((await runInit(dir, { json: true, home })).out).skills).toEqual({
      found: [".agents/skills", "~/.claude/skills"],
      missing: [],
    });
  });

  test("the schema it writes gives next an effort to follow", async () => {
    const dir = scratch();
    await run(["init"], dir);
    await run(["new", "Spec", "Login"], dir);
    expect((await run(["next"], dir)).out).toContain("next: lore-spec docs/specs/login.md");
  });
});
