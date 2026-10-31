import { describe, expect, test } from "bun:test";
import { parseNote } from "../src/parse";
import { syntaxOf, type Value } from "../src/syntax";

// What each syntax writes reads back as the value it was given.
const values = ["123456789012", "12e456789012", "true", "null", "~", "a: b", "a #b", "[[x]]", " pad", "plain", "0007", "-x", "a,b", "[x]", "'q'", ""];

for (const path of ["docs/a.md", "docs/a.org"]) {
  const syntax = syntaxOf(path);
  const empty = path.endsWith(".org") ? "* Title\n" : "# Title\n";
  const read = (text: string) => parseNote(path, text).frontmatter;
  const roundTrip = (field: string, value: Value) => read(syntax.setField(empty, field, value))[field];

  describe(`${path.slice(-3)} round trip`, () => {
    test("a scalar reads back as the same string", () => {
      for (const v of values) expect(roundTrip("one", v)).toBe(v);
      expect(roundTrip("title", "2024")).toBe("2024");
    });

    test("a list reads back as the same list", () => {
      expect(roundTrip("many", values.filter(Boolean))).toEqual(values.filter(Boolean));
      expect(roundTrip("specs", ["[[spec/a]]", "[[spec/b]]"])).toEqual(
        path.endsWith(".org") ? "[[spec/a]] [[spec/b]]" : ["[[spec/a]]", "[[spec/b]]"],
      );
    });

    test("a map reads back as the same map, keys included", () => {
      const map = Object.fromEntries(values.map((v, i) => [`docs/${i}: x.md`, v]));
      expect(roundTrip("frozen", map)).toEqual(map);
    });

    test("setting a field again replaces it, keeping the others", () => {
      let text = syntax.setField(empty, "a", "1");
      text = syntax.setField(text, "list", ["x", "y"]);
      text = syntax.setField(text, "b", "2");
      text = syntax.setField(text, "list", ["z"]);
      expect(read(text)).toEqual({ a: "1", list: ["z"], b: "2" });
      expect(parseNote(path, text).title).toBe("Title");
    });

    test("removing a field leaves the others", () => {
      let text = syntax.setField(empty, "a", "1");
      text = syntax.setField(text, "map", { k: "v" });
      text = syntax.setField(text, "b", "2");
      text = syntax.removeField(syntax.removeField(text, "map"), "missing");
      expect(read(text)).toEqual({ a: "1", b: "2" });
    });

    test("ticking a line ticks its checkbox and nothing else", () => {
      const text = syntax.setField("- [x] one\n- [ ] [[two]] [ ]\n", "status", "active");
      const note = parseNote(path, text);
      const lines = text.split("\n");
      lines[note.checklist.nextLine! - 1] = syntax.tick(lines[note.checklist.nextLine! - 1]!);
      const after = parseNote(path, lines.join("\n"));
      expect(after.checklist).toEqual({ done: 2, total: 2 });
      expect(lines.join("\n")).toContain("[[two]] [ ]");
    });
  });
}

describe("markdown", () => {
  const md = syntaxOf("a.md");

  test("a block value is replaced and removed whole", () => {
    const text = "---\na: 1\nlist:\n- x\n- y\nb: 2\n---\nbody";
    expect(md.setField(text, "list", ["z"])).toBe("---\na: 1\nlist: [z]\nb: 2\n---\nbody");
    expect(md.setField(text, "c", "three")).toBe("---\na: 1\nlist:\n- x\n- y\nb: 2\nc: three\n---\nbody");
    expect(md.removeField(md.removeField(text, "list"), "a")).toBe("---\nb: 2\n---\nbody");
  });

  test("text with no frontmatter gets one", () => {
    expect(md.setField("body", "a", "x")).toBe("---\na: x\n---\nbody");
    expect(md.removeField("body", "a")).toBe("body");
  });
});

describe("org", () => {
  const org = syntaxOf("a.org");

  test("a key keeps its spelling, and new keys go after the last #+ line", () => {
    const text = "#+TITLE: Old\n\n#+status: draft\n* Heading\n";
    expect(org.setField(text, "title", "New")).toBe("#+TITLE: New\n\n#+status: draft\n* Heading\n");
    expect(org.setField(text, "type", "Spec")).toBe("#+TITLE: Old\n\n#+status: draft\n#+type: Spec\n* Heading\n");
    expect(org.removeField(text, "TITLE")).toBe("\n#+status: draft\n* Heading\n");
  });

  test("text with no #+ lines gets them at the top", () => {
    expect(org.setField("* Heading\n", "a", "x")).toBe("#+a: x\n* Heading\n");
  });

  test("ticking marks a started item done with an upper-case X", () => {
    expect(org.tick("- [-] started")).toBe("- [X] started");
    expect(org.tick("1. [ ] first")).toBe("1. [X] first");
  });
});
