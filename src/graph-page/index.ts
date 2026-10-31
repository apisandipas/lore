import type { GraphData } from "./data";
import style from "./page.css" with { type: "text" };
import page from "./page.html" with { type: "text" };
import script from "./page.js" with { type: "text" };
import render from "./render.js" with { type: "text" };

// The graph page: one file, nothing loaded from elsewhere (lore:decision/0001),
// and the same bytes for the same notes. The data is JSON in a script tag;
// escaping < keeps a note's `</script>` from ending it.
// With focus, the page opens on that note's local graph.
export function graphPage(data: GraphData, focus?: { name: string; depth: number }): string {
  const parts: Record<string, string> = {
    TITLE: `${focus ? `${focus.name} in ` : ""}${data.repo}: lore graph`.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`),
    STYLE: style,
    DATA: JSON.stringify(focus ? { ...data, focus } : data).replace(/</g, "\\u003c"),
    // One module: render.js, then page.js without its import of it.
    SCRIPT: `${render}\n${script.replace(/^import .*\n/m, "")}`,
  };
  // A function replacement, so `$'` and friends in a note stay as written.
  return (page as unknown as string).replace(/\/\*(TITLE|STYLE|DATA|SCRIPT)\*\//g, (_, k: string) => parts[k]!);
}

// The branch "Open on GitHub" links to: the current one when origin has it,
// else the origin branch nearest it (the fewest commits behind HEAD; origin's
// default on a tie), so a local or deleted branch gives no dead links.
export function githubBranch(current: string, origin: { branch: string; behind: number }[], originDefault: string): string {
  if (current && origin.some((o) => o.branch === current)) return current;
  const rank = (o: { branch: string; behind: number }) => [o.behind, o.branch === originDefault ? 0 : 1, o.branch] as const;
  const nearest = [...origin].sort((x, y) => {
    const [a, b] = [rank(x), rank(y)];
    return a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : 1);
  })[0];
  return nearest?.branch ?? "";
}

// Where "Open on GitHub" points: the blob URL for the branch, when origin is on GitHub.
export function githubUrl(remote: string, branch: string): string | null {
  const m = /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/(?:[^@/]+@)?github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(remote.trim());
  return m && branch ? `https://github.com/${m[1]}/blob/${branch}/` : null;
}
