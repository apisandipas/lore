import { describe, expect, test } from "bun:test";
import { names, qualify, resolver, type Named } from "../src/names";

// Plain notes: naming needs no tree and no graph.
const note = (path: string, type?: string, aliases: string[] = []): Named => {
  const stem = path.split("/").at(-1)!.replace(/\.(md|org)$/, "");
  return { path, stem, name: type ? qualify(type, stem) : stem, aliases };
};
const notes = [
  note("docs/specs/auth.md", "Spec", ["login"]),
  note("docs/efforts/auth.md", "Effort"),
  note("docs/decisions/0007-money-is-cents.md", "Decision"),
  note("CONTEXT.md"),
  note("src/CONTEXT.md"),
  note("docs/guide.org"),
];
const { resolve, find, adding } = resolver(notes, "docs");
const at = (target: string) => resolve(target).note?.path;

describe("names", () => {
  test("a typed note is named type/stem, the type lowercased and dashed", () => {
    expect(qualify("Spec", "auth")).toBe("spec/auth");
    expect(qualify("Design Doc", "x")).toBe("design-doc/x");
  });

  test("a note is found by name, path from the repo or the notes dir, filename, alias or number", () => {
    expect(at("spec/auth")).toBe("docs/specs/auth.md");
    expect(at("docs/specs/auth.md")).toBe("docs/specs/auth.md");
    expect(at("./specs/auth")).toBe("docs/specs/auth.md");
    expect(at("LOGIN")).toBe("docs/specs/auth.md");
    expect(at("guide")).toBe("docs/guide.org");
    expect(at("0007")).toBe("docs/decisions/0007-money-is-cents.md");
    expect(at("decision/0007")).toBe("docs/decisions/0007-money-is-cents.md");
  });

  test("a filename two notes share is ambiguous, unless the target is an exact path", () => {
    expect(resolve("auth").candidates.map((n) => n.path)).toEqual(["docs/specs/auth.md", "docs/efforts/auth.md"]);
    expect(at("auth")).toBeUndefined();
    expect(at("CONTEXT.md")).toBe("CONTEXT.md");
    expect(at("./src/CONTEXT.md")).toBe("src/CONTEXT.md");
  });

  test("find says why nothing or too much matched", () => {
    expect(find("auth").error).toBe("'auth' matches 2 notes:\n  spec/auth  docs/specs/auth.md\n  effort/auth  docs/efforts/auth.md");
    expect(find("context").error).toBe("'context' matches 2 notes:\n  CONTEXT.md\n  src/CONTEXT.md");
    expect(find("nope").error).toBe("no note matches 'nope'");
  });

  test("adding a note resolves as if it existed, leaving the notes alone", () => {
    const after = adding(note("docs/specs/guide.md", "Spec"));
    expect(after.resolve("guide").note).toBeUndefined();
    expect(at("guide")).toBe("docs/guide.org");
    // A number prefix is a fallback: a second note starting with it shadows it.
    expect(adding(note("docs/efforts/0007-plan.md", "Effort")).resolve("0007").note).toBeUndefined();
  });

  test("several notes are listed by name, by path where names repeat", () => {
    expect(names([notes[0]!, notes[1]!])).toBe("spec/auth and effort/auth");
    expect(names([notes[3]!, notes[4]!, notes[0]!])).toBe("CONTEXT.md, src/CONTEXT.md and spec/auth");
  });
});
