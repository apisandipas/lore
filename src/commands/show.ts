import type { Graph } from "../graph";
import { history } from "../supersede";
import { label, type Result } from "./shared";

export function runShow(g: Graph, args: string[], opts: { json: boolean }): Result {
  const [ref] = args;
  if (!ref || args.length > 1) return { code: 2, out: "lore show: name exactly one note\n" };
  const { note, error } = g.find(ref);
  if (!note) return { code: 1, out: `lore show: ${error}\n` };

  const linksOut = note.links.map((l) => ({ ...l, resolved: g.resolve(l.target).note?.path ?? null }));
  const linksIn = g.backlinks(note).map((b) => ({ from: b.from.path, line: b.link.line, field: b.link.field ?? null }));
  const citedBy = g.citations.filter((c) => g.resolve(c.target).note === note).map((c) => ({ file: c.file, line: c.line }));
  const anchors = note.anchors.map((anchor) => ({ anchor, files: g.anchor(anchor).files() }));
  const chain = history(g, note);

  if (opts.json) {
    const data = {
      path: note.path,
      name: note.name,
      title: note.title,
      type: note.type ?? null,
      status: note.status ?? null,
      summary: note.summary,
      frontmatter: note.frontmatter,
      linksOut,
      linksIn,
      citedBy,
      anchors,
      history: chain.map((n) => ({ path: n.path, name: n.name, status: n.status ?? null })),
      checklist: note.checklist,
    };
    return { code: 0, out: `${JSON.stringify(data, null, 2)}\n` };
  }

  const { done, total } = note.checklist;
  const progress = total ? `\nChecklist: ${done} of ${total} done` : "";
  const sections: string[] = [`${label(note)}\n${note.path}${note.summary ? `\n${note.summary}` : ""}${progress}`];
  const section = (title: string, lines: string[]) => {
    if (lines.length) sections.push(`${title}:\n${lines.map((l) => `  ${l}`).join("\n")}`);
  };
  if (chain.length > 1) {
    section(
      "History (newest first)",
      chain.map((n) => `${n === note ? "▸ " : "  "}${n.name}  (${n.status ?? "no status"})`),
    );
  }
  section(
    "Links to",
    // A link by path (Org's file: links) needs no arrow to the same path.
    linksOut.map((l) => `${l.field ? `${l.field}: ` : ""}${l.target === l.resolved ? l.target : `${l.target} → ${l.resolved ?? "unresolved"}`}`),
  );
  section(
    "Linked from",
    linksIn.map((l) => `${l.from}:${l.line}${l.field ? ` (${l.field})` : ""}`),
  );
  section(
    "Cited by code",
    citedBy.map((c) => `${c.file}:${c.line}`),
  );
  section(
    "Anchors",
    anchors.map((a) => `${a.anchor} → ${a.files.length === 1 ? "1 file" : `${a.files.length} files`}`),
  );
  return { code: 0, out: `${sections.join("\n\n")}\n` };
}
