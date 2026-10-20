import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Note } from "./parse";

// What one agent session has been shown, so `lore context --session` repeats a
// note only when it changes. It lives in the temp directory, not the repo: a
// record of one session, not an index of the repo (see lore:0003).
export type Session = {
  // Not shown yet in this session, or changed since it was.
  unseen(note: Note): boolean;
  saw(notes: Note[]): void;
  // After the agent's context is compacted it has lost what it was shown.
  forget(): void;
};

export function openSession(root: string, id: string, dir = join(tmpdir(), "lore-sessions")): Session {
  const file = join(dir, `${hash(`${root}\0${id}`).slice(0, 16)}.json`);
  let seen: Record<string, string> = {};
  try {
    seen = JSON.parse(readFileSync(file, "utf8"));
  } catch {}
  return {
    unseen: (note) => seen[note.path] !== version(note),
    saw: (notes) => {
      for (const n of notes) seen[n.path] = version(n);
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify(seen));
    },
    forget: () => rmSync(file, { force: true }),
  };
}

function version(note: Note): string {
  return hash(`${note.title}\0${note.status ?? ""}\0${note.body}`);
}

function hash(text: string): string {
  return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}
