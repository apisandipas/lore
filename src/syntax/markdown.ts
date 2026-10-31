import type { Syntax } from ".";

// [[target]], [[target#heading]], [[target|label]]
const MD_LINK = /\[\[([^\[\]|#\n]+)(?:#[^\[\]|\n]*)?(?:\|[^\[\]\n]*)?\]\]/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const markdown: Syntax = {
  header(lines) {
    const fieldLines: Record<string, number> = {};
    if (lines[0]?.trim() !== "---") return { fields: {}, fieldLines, bodyStart: 0 };
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (end < 0) return { fields: {}, fieldLines, bodyStart: 0 };
    const fmLines = lines.slice(1, end);
    let fields: Record<string, unknown> = {};
    let error: string | undefined;
    try {
      const parsed = Bun.YAML.parse(fmLines.join("\n"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) fields = parsed as Record<string, unknown>;
      else if (parsed != null) error = "frontmatter is not a mapping";
    } catch (e) {
      error = `unreadable frontmatter: ${(e as Error).message}`;
    }
    for (const field of Object.keys(fields)) {
      const at = fmLines.findIndex((l) => l.startsWith(`${field}:`));
      fieldLines[field] = at >= 0 ? at + 2 : 1;
    }
    return { fields, error, fieldLines, bodyStart: end + 1 };
  },
  title: (line) => (/^#\s+/.test(line) ? line.replace(/^#\s+/, "").trim() : undefined),
  heading: (line, name) => new RegExp(`^#{1,6}\\s+${escape(name)}\\s*$`, "i").test(line.trim()),
  breaks: (t) => t.startsWith("#"),
  fence: /^\s*(```|~~~)/,
  checkbox: /^\s*[-*+] \[([ xX])\]\s*(.*)$/,
  links: (line) => [...line.replace(/`[^`]*`/g, "").matchAll(MD_LINK)].map((m) => m[1]!.trim()),
};
