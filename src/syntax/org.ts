import { dirname, normalize } from "node:path";
import type { Syntax } from ".";

// [[target]], [[target][label]]
const ORG_LINK = /\[\[([^\[\]\n]+)\](?:\[[^\[\]\n]*\])?\]/g;
export const ORG_KEYWORD = /^#\+([\w-]+):[ \t]*(.*)$/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const org: Syntax = {
  // The #+key: lines at the top, before anything else. A value in brackets or
  // quotes is YAML (a list, a map, a quoted string); anything else, links
  // included, is text.
  header(lines) {
    const fields: Record<string, unknown> = {};
    const fieldLines: Record<string, number> = {};
    let error: string | undefined;
    let i = 0;
    for (; i < lines.length; i++) {
      if (!lines[i]!.trim()) continue;
      const m = ORG_KEYWORD.exec(lines[i]!);
      if (!m) break;
      const key = m[1]!.toLowerCase();
      fieldLines[key] = i + 1;
      try {
        fields[key] = orgValue(m[2]!.trim());
      } catch (e) {
        error ??= `unreadable #+${m[1]}: ${(e as Error).message}`;
      }
    }
    return { fields, error, fieldLines, bodyStart: i };
  },
  title: (line) => /^\*+\s+(.*)$/.exec(line)?.[1]!.replace(/\s+:[\w@#%:]+:\s*$/, "").trim(),
  heading: (line, name) => new RegExp(`^\\*+\\s+${escape(name)}\\s*$`, "i").test(line.trim()),
  breaks: (t) => t.startsWith("#") || /^\*+\s/.test(t) || /^:[\w-]+:/.test(t),
  fence: /^\s*#\+(begin|end)_\w+/i,
  checkbox: /^\s*(?:[-+]|\d+[.)])\s+\[([ xX-])\]\s*(.*)$/,
  links(line, notePath) {
    return [...line.matchAll(ORG_LINK)].flatMap((m) => {
      const target = m[1]!.trim().replace(/::.*$/, "");
      if (/^file:/i.test(target)) {
        // As Org reads it: relative to the note, unless it is absolute.
        const path = target.slice("file:".length);
        const resolved = path.startsWith("/") ? path : normalize(`${dirname(notePath)}/${path}`);
        return resolved && !resolved.startsWith("../") ? [resolved] : [];
      }
      // URLs and other link types, headings in this file (*, #), coderefs.
      if (!target || /^[a-z][\w+.-]*:/i.test(target) || /^[*#(]/.test(target)) return [];
      return [target];
    });
  },
};

function orgValue(text: string): unknown {
  if (!/^[\[{"']/.test(text) || text.startsWith("[[")) return text;
  return (Bun.YAML.parse(`v: ${text}`) as { v: unknown }).v;
}
