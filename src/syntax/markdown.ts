import type { Syntax } from ".";

// [[target]], [[target#heading]], [[target|label]]
const MD_LINK = /\[\[([^\[\]|#\n]+)(?:#[^\[\]|\n]*)?(?:\|[^\[\]\n]*)?\]\]/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
};
