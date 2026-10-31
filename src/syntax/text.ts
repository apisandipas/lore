// Text helpers the syntaxes share.

export const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The line with its checkbox's mark replaced: the box is found by the same
// pattern the syntax reads checkboxes with, its first group being the mark.
export function tickBox(checkbox: RegExp, line: string, mark: string): string {
  const m = new RegExp(checkbox.source, `${checkbox.flags}d`).exec(line);
  if (!m?.indices?.[1]) return line;
  const [start, end] = m.indices[1];
  return `${line.slice(0, start)}${mark}${line.slice(end)}`;
}
