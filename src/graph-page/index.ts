import type { GraphData } from "./data";
import style from "./page.css" with { type: "text" };
import page from "./page.html" with { type: "text" };
import script from "./page.js" with { type: "text" };

// The graph page: one file, nothing loaded from elsewhere (lore:decision/0001),
// and the same bytes for the same notes. The data is JSON in a script tag;
// escaping < keeps a note's `</script>` from ending it.
export function graphPage(data: GraphData): string {
  const parts: Record<string, string> = {
    TITLE: `${data.repo}: lore graph`.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`),
    STYLE: style,
    DATA: JSON.stringify(data).replace(/</g, "\\u003c"),
    SCRIPT: script,
  };
  // A function replacement, so `$'` and friends in a note stay as written.
  return (page as unknown as string).replace(/\/\*(TITLE|STYLE|DATA|SCRIPT)\*\//g, (_, k: string) => parts[k]!);
}

// Where "Open on GitHub" points: the blob URL for the branch, when origin is on GitHub.
export function githubUrl(remote: string, branch: string): string | null {
  const m = /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/(?:[^@/]+@)?github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(remote.trim());
  return m && branch ? `https://github.com/${m[1]}/blob/${branch}/` : null;
}
