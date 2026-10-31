import { basename } from "node:path";
import type { Graph } from "../graph";
import { drift } from "../plan";

// What the graph page draws, and what `lore graph --json` prints: the notes,
// the code they govern, and the links between them.
export type GraphNode = {
  // A note's path, anchor:<text>, file:<path>, or missing:<target> for a link to no note or several.
  id: string;
  kind: "note" | "code" | "missing";
  name: string;
  title: string;
  type: string | null;
  status: string | null;
  summary: string;
  drift: boolean;
  // A note's text, and where each link in it goes.
  body?: string;
  refs?: Record<string, string>;
};
// kind is the frontmatter field, link for a body link, anchor or cites.
export type GraphEdge = { source: string; target: string; kind: string };
export type GraphData = { repo: string; url: string | null; types: string[]; nodes: GraphNode[]; edges: GraphEdge[] };

const files = (n: number) => (n === 1 ? "1 file" : `${n} files`);

export function graphData(g: Graph, opts: { url: string | null }): GraphData {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const edge = (source: string, target: string, kind: string) => {
    if (source !== target) edges.set(`${source}\0${target}\0${kind}`, { source, target, kind });
  };
  const add = (node: Omit<GraphNode, "type" | "status" | "drift">) => {
    if (!nodes.has(node.id)) nodes.set(node.id, { type: null, status: null, drift: false, ...node });
  };
  // Where a link goes: the note it names, or a ghost named by its text.
  const target = (text: string): string => {
    const r = g.resolve(text);
    if (r.note) return r.note.path;
    const id = `missing:${text}`;
    const summary = r.candidates.length ? `matches ${r.candidates.length} notes` : "no note matches";
    add({ id, kind: "missing", name: text, title: text, summary });
    return id;
  };

  for (const n of g.notes) {
    nodes.set(n.path, { id: n.path, kind: "note", name: n.name, title: n.title, type: n.type ?? null, status: n.status ?? null, summary: n.summary, drift: drift(g, n).length > 0 });
  }
  for (const n of g.notes) {
    const refs: Record<string, string> = {};
    for (const l of n.links) {
      refs[l.target] = target(l.target);
      edge(n.path, refs[l.target]!, l.field ?? "link");
    }
    Object.assign(nodes.get(n.path)!, { body: n.body, refs });
    // An anchor is one node, joined to every note that claims it.
    for (const text of n.anchors) {
      add({ id: `anchor:${text}`, kind: "code", name: text, title: text, summary: files(g.anchor(text).files().length) });
      edge(n.path, `anchor:${text}`, "anchor");
    }
  }
  for (const c of g.citations) {
    const id = `file:${c.file}`;
    add({ id, kind: "code", name: c.file, title: c.file, summary: "cites notes" });
    edge(id, target(c.target), "cites");
  }

  return {
    repo: basename(g.repo.root),
    url: opts.url,
    types: g.repo.config.schema.types.map((t) => t.name),
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };
}
