import type { Tree } from "./tree";

// How a note claims code: a path (pkg/auth), a glob (pkg/auth/**), or
// symbol:Name, any file using that word. Parsed once; every question about
// which files an anchor governs is answered here.
export type Anchor = {
  text: string;
  kind: "path" | "glob" | "symbol";
  // The path or glob without ./ or a trailing slash, or the symbol's word.
  name: string;
  // Every file the anchor governs, sorted.
  files(): string[];
  // Whether one file falls under the anchor, without listing the anchor's
  // files: cheap enough to ask of every anchor for every file. A path anchor
  // also covers a file that does not exist yet.
  covers(file: string): boolean;
  // How narrowly a path or glob targets code: the literal prefix before any
  // glob. 0 for a symbol.
  specificity: number;
};

// What anchors match against: the repo's files, and the tree to search them.
export type Scope = { tree: Tree; files: string[]; isNoteFile(file: string): boolean };

const SYMBOL = "symbol:";
const GLOB_CHAR = /[*?[{]/;

// Anchors for one scope, each parsed once. No index (see lore:0003): the cache
// lives as long as the graph that holds it.
export function anchors(scope: Scope): (text: string) => Anchor {
  const fileSet = new Set(scope.files);
  const cache = new Map<string, Anchor>();
  return (text) => {
    let anchor = cache.get(text);
    if (!anchor) cache.set(text, (anchor = parse(scope, fileSet, text)));
    return anchor;
  };
}

function parse({ tree, files, isNoteFile }: Scope, fileSet: Set<string>, text: string): Anchor {
  let listed: string[] | undefined;
  const once = (list: () => string[]) => () => (listed ??= list());

  if (text.startsWith(SYMBOL)) {
    const name = text.slice(SYMBOL.length).trim();
    const word = new RegExp(String.raw`(?<!\w)(?:${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?!\w)`);
    const code = (file: string) => fileSet.has(file) && !isNoteFile(file);
    return {
      text,
      kind: "symbol",
      name,
      files: once(() => (name ? [...new Set(tree.search(name, { fixed: true, word: true }).map((h) => h.file))].filter(code).sort() : [])),
      covers: (file) => !!name && code(file) && word.test(tree.read(file) ?? ""),
      specificity: 0,
    };
  }

  const name = text.trim().replace(/^\.\//, "").replace(/\/$/, "");
  const at = name.search(GLOB_CHAR);
  if (at >= 0) {
    const glob = new Bun.Glob(name);
    return { text, kind: "glob", name, files: once(() => files.filter((f) => glob.match(f))), covers: (file) => glob.match(file), specificity: at };
  }
  const covers = (file: string) => file === name || file.startsWith(`${name}/`);
  return { text, kind: "path", name, files: once(() => files.filter(covers)), covers, specificity: name.length + 1 };
}
