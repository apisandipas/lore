// Edits one top-level frontmatter key in place, leaving the rest of the file's
// formatting alone. `value` is YAML for the value: inline ("superseded") or a
// block that starts with a newline ("\n  a: b").
export function setField(text: string, key: string, value: string): string {
  const entry = `${key}:${value.startsWith("\n") ? "" : " "}${value}`.split("\n");
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return ["---", ...entry, "---", ...lines].join("\n");
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end < 0) return ["---", ...entry, "---", ...lines].join("\n");

  const start = lines.findIndex((l, i) => i > 0 && i < end && l.startsWith(`${key}:`));
  if (start < 0) return [...lines.slice(0, end), ...entry, ...lines.slice(end)].join("\n");
  // A key's value continues over indented lines and unindented list items.
  let stop = start + 1;
  while (stop < end && /^(\s|- )/.test(lines[stop]!)) stop++;
  return [...lines.slice(0, start), ...entry, ...lines.slice(stop)].join("\n");
}

export function yamlString(s: string): string {
  return JSON.stringify(s);
}

export function removeField(text: string, key: string): string {
  const lines = text.split("\n");
  const end = lines[0]?.trim() === "---" ? lines.findIndex((l, i) => i > 0 && l.trim() === "---") : -1;
  const start = end < 0 ? -1 : lines.findIndex((l, i) => i > 0 && i < end && l.startsWith(`${key}:`));
  if (start < 0) return text;
  let stop = start + 1;
  while (stop < end && /^(\s|- )/.test(lines[stop]!)) stop++;
  return [...lines.slice(0, start), ...lines.slice(stop)].join("\n");
}
