import type { Note } from "../parse";

export type Result = { code: number; out: string };

export function label(note: Note): string {
  const tags = [note.type, note.status].filter(Boolean).join(", ");
  return tags ? `${note.title}  (${tags})` : note.title;
}
