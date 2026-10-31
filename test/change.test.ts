import { describe, expect, test } from "bun:test";
import { planChange, type Change } from "../src/change";
import { loadGraph } from "../src/graph";
import { memoryTree } from "../src/tree";

const g = loadGraph(
  memoryTree({
    ".lore/schema.yml": `types:
  Spec:
    dir: docs/specs
    fields:
      status: { enum: [draft, accepted] }
  Effort:
    dir: docs/efforts
    fields:
      specs: { link: Spec, many: true }
      parent: { link: Effort }
      status: { enum: [planned, done] }
`,
    "docs/specs/auth.md": "---\ntype: Spec\nstatus: accepted\n---\n# Auth\n",
    "docs/specs/billing.md": "---\ntype: Spec\nstatus: accepted\n---\n# Billing\n",
    "docs/efforts/reset.md": '---\ntype: Effort\nspecs: ["[[auth]]"]\n---\n# Reset\n',
    "docs/efforts/org.org": "#+type: Effort\n#+specs: [[auth]] [[billing]]\n* Org\n",
    "docs/loose.md": "# Loose\n",
  }),
);
const effort = g.repo.config.schema.find("Effort")!;
const note = (name: string) => g.find(name).note!;
const change = (field: string, values: string[], add = false): Change => ({ field, add, values });

describe("planChange", () => {
  test("writes a type's fields and the common ones, links by name", () => {
    expect(planChange(g, { def: effort }, [change("specs", ["auth", "spec/billing"]), change("parent", ["reset"]), change("title", ["X"])])).toEqual({
      fields: { specs: ["[[spec/auth]]", "[[spec/billing]]"], parent: "[[effort/reset]]", title: "X" },
    });
  });

  test("refuses a field the type does not have, naming the ones it does", () => {
    expect(planChange(g, { def: effort }, [change("stauts", ["done"])])).toEqual({
      problem: "'stauts' is not a field of Effort (fields: type, status, title, summary, aliases, anchors, specs, parent)",
    });
    expect(planChange(g, { note: note("loose") }, [change("specs", ["auth"])])).toEqual({
      problem: "'specs' is not a field of an untyped note (fields: type, status, title, summary, aliases, anchors)",
    });
  });

  test("refuses a type not in the schema", () => {
    expect(planChange(g, { note: note("loose") }, [change("type", ["Chore"])])).toEqual({ problem: "type 'Chore' is not in .lore/schema.yml" });
  });

  test("a field that is not many takes one value, and no +=", () => {
    const one = { problem: "'parent' takes one value, not a list" };
    expect(planChange(g, { def: effort }, [change("parent", ["reset", "other"])])).toEqual(one);
    expect(planChange(g, { note: note("reset") }, [change("parent", ["reset"], true)])).toEqual(one);
    expect(planChange(g, { def: effort }, [change("parent", ["reset", "effort/reset"]), change("status", ["done", "done"])])).toEqual({
      fields: { parent: "[[effort/reset]]", status: "done" },
    });
  });

  test("+= adds to the list, not twice for one note under two names", () => {
    expect(planChange(g, { note: note("reset") }, [change("specs", ["spec/auth", "billing", "docs/specs/billing.md"], true)])).toEqual({
      fields: { specs: ["[[auth]]", "[[spec/billing]]"] },
    });
  });

  test("+= splits Org's links held as text", () => {
    expect(planChange(g, { note: note("org") }, [change("specs", ["auth"], true)])).toEqual({ fields: { specs: ["[[auth]]", "[[billing]]"] } });
  });

  test("a bad value is the first problem, and nothing after it is planned", () => {
    expect(planChange(g, { def: effort }, [change("status", ["planned"]), change("specs", ["nope"]), change("parent", ["auth"])])).toEqual({
      problem: "'specs' links to 'nope', which matches no note",
    });
    expect(planChange(g, { def: effort }, [change("parent", ["auth"])])).toEqual({ problem: "'parent' links to spec/auth, a Spec; expected an Effort" });
  });
});
