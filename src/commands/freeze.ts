import { join } from "node:path";
import { setField } from "../frontmatter";
import { SUPERSEDES, type Graph } from "../graph";
import type { Note } from "../parse";
import { findNote, type Result } from "./shared";

// Hashes the body only, so a status flip in frontmatter is not drift.
export function specHash(note: Note): string {
  return new Bun.CryptoHasher("sha256").update(note.body).digest("hex").slice(0, 12);
}

export function frozenEntries(note: Note): [string, string][] {
  const frozen = note.frontmatter.frozen;
  if (!frozen || typeof frozen !== "object" || Array.isArray(frozen)) return [];
  return Object.entries(frozen).filter((e): e is [string, string] => typeof e[1] === "string");
}

export async function runFreeze(g: Graph, args: string[], opts: { json: boolean }): Promise<Result> {
  const [ref] = args;
  if (!ref || args.length > 1) return { code: 2, out: "lore freeze: name exactly one note\n" };
  const { note, error } = findNote(g, ref);
  if (!note) return { code: 1, out: `lore freeze: ${error}\n` };

  // The schema names the fields to freeze; otherwise every link field but supersedes.
  const fields = g.repo.config.schema.find(note.type)?.freeze;
  const links = note.links.filter((l) => l.field && l.field !== SUPERSEDES && (!fields || fields.includes(l.field)));
  const targets: Note[] = [];
  for (const link of links) {
    const target = g.resolve(link.target).note;
    if (!target) return { code: 1, out: `lore freeze: ${note.path}:${link.line}: '${link.target}' matches no single note\n` };
    if (!targets.includes(target)) targets.push(target);
  }
  if (!targets.length) {
    const where = fields ? ` in ${fields.join(", ")}` : "";
    return { code: 1, out: `lore freeze: ${note.path} links no notes${where}\n` };
  }

  const frozen = targets.map((t) => ({ path: t.path, hash: specHash(t) }));
  const file = Bun.file(join(g.repo.root, note.path));
  await Bun.write(file, setField(await file.text(), "frozen", `\n${frozen.map((f) => `  ${f.path}: ${f.hash}`).join("\n")}`));

  if (opts.json) return { code: 0, out: `${JSON.stringify({ path: note.path, frozen }, null, 2)}\n` };
  return { code: 0, out: `froze ${note.path} against:\n${frozen.map((f) => `  ${f.path} ${f.hash}`).join("\n")}\n` };
}
