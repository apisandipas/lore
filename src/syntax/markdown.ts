import type { Syntax, Value } from ".";
import { escape, tickBox } from "./text";

// [[target]], [[target#heading]], [[target|label]]
const MD_LINK = /\[\[([^\[\]|#\n]+)(?:#[^\[\]|\n]*)?(?:\|[^\[\]\n]*)?\]\]/g;

export const markdown: Syntax = {
  header(lines) {
    const end = lines[0]?.trim() === "---" ? lines.findIndex((l, i) => i > 0 && l.trim() === "---") : -1;
    if (end < 0) return { fields: {}, bodyStart: 0, end: -1, span: () => undefined };
    let fields: Record<string, unknown> = {};
    let error: string | undefined;
    try {
      const parsed = Bun.YAML.parse(lines.slice(1, end).join("\n"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) fields = parsed as Record<string, unknown>;
      else if (parsed != null) error = "frontmatter is not a mapping";
    } catch (e) {
      error = `unreadable frontmatter: ${(e as Error).message}`;
    }
    // Indented lines and unindented list items continue a field's value.
    const span = (field: string): [number, number] | undefined => {
      const start = lines.findIndex((l, i) => i > 0 && i < end && l.startsWith(`${field}:`));
      if (start < 0) return undefined;
      let stop = start + 1;
      while (stop < end && /^(\s|- )/.test(lines[stop]!)) stop++;
      return [start, stop];
    };
    return { fields, error, bodyStart: end + 1, end, span };
  },
  title: (line) => (/^#\s+/.test(line) ? line.replace(/^#\s+/, "").trim() : undefined),
  heading: (line, name) => new RegExp(`^#{1,6}\\s+${escape(name)}\\s*$`, "i").test(line.trim()),
  breaks: (t) => t.startsWith("#"),
  fence: /^\s*(```|~~~)/,
  checkbox: /^\s*[-*+] \[([ xX])\]\s*(.*)$/,
  links: (line) => [...line.replace(/`[^`]*`/g, "").matchAll(MD_LINK)].map((m) => m[1]!.trim()),
  setField(text, field, value) {
    const v = render(value);
    const entry = `${field}:${v.startsWith("\n") ? "" : " "}${v}`.split("\n");
    const lines = text.split("\n");
    const { end, span } = markdown.header(lines);
    if (end < 0) return ["---", ...entry, "---", ...lines].join("\n");
    const [start, stop] = span(field) ?? [end, end];
    return [...lines.slice(0, start), ...entry, ...lines.slice(stop)].join("\n");
  },
  removeField(text, field) {
    const lines = text.split("\n");
    const at = markdown.header(lines).span(field);
    if (!at) return text;
    return [...lines.slice(0, at[0]), ...lines.slice(at[1])].join("\n");
  },
  tick: (line) => tickBox(markdown.checkbox, line, "x"),
};

// The YAML for a value: inline, or a block starting with a newline for a map.
export function render(value: Value): string {
  if (typeof value === "string") return scalar(value);
  if (Array.isArray(value)) return `[${value.map((v) => scalar(v, true)).join(", ")}]`;
  return Object.entries(value)
    .map(([k, v]) => `\n  ${key(k)}: ${scalar(v)}`)
    .join("");
}

// A string is written bare only when YAML reads it back as the same string, so
// "123456789012" or "true" stays a string.
export function scalar(s: string, inList = false): string {
  try {
    const back = (Bun.YAML.parse(`v: ${inList ? `[${s}]` : s}`) as { v: unknown }).v;
    if (inList ? Array.isArray(back) && back.length === 1 && back[0] === s : back === s) return s;
  } catch {}
  return JSON.stringify(s);
}

function key(k: string): string {
  try {
    const back = Bun.YAML.parse(`${k}: x`) as Record<string, unknown>;
    if (Object.keys(back).length === 1 && k in back) return k;
  } catch {}
  return JSON.stringify(k);
}
