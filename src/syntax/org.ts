import { dirname, normalize } from "node:path";
import type { Syntax, Value } from ".";
import { scalar } from "./markdown";
import { escape, tickBox } from "./text";

// [[target]], [[target][label]]
const ORG_LINK = /\[\[([^\[\]\n]+)\](?:\[[^\[\]\n]*\])?\]/g;
export const ORG_KEYWORD = /^#\+([\w-]+):[ \t]*(.*)$/;

export const org: Syntax = {
  // The #+key: lines at the top, before anything else. A value in brackets or
  // quotes is YAML (a list, a map, a quoted string); anything else, links
  // included, is text.
  header(lines) {
    const fields: Record<string, unknown> = {};
    // The last line for each key, as its value is the last one read.
    const at = new Map<string, number>();
    let error: string | undefined;
    let end = 0;
    let i = 0;
    for (; i < lines.length; i++) {
      if (!lines[i]!.trim()) continue;
      const m = ORG_KEYWORD.exec(lines[i]!);
      if (!m) break;
      const key = m[1]!.toLowerCase();
      at.set(key, i);
      end = i + 1;
      try {
        fields[key] = orgValue(m[2]!.trim());
      } catch (e) {
        error ??= `unreadable #+${m[1]}: ${(e as Error).message}`;
      }
    }
    const span = (field: string): [number, number] | undefined => {
      const line = at.get(field.toLowerCase());
      return line === undefined ? undefined : [line, line + 1];
    };
    return { fields, error, bodyStart: i, end, span };
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
  setField(text, field, value) {
    const lines = text.split("\n");
    const { end, span } = org.header(lines);
    const at = span(field)?.[0];
    // Keep the key as the file spells it: #+TITLE stays upper case.
    if (at !== undefined) lines[at] = `#+${ORG_KEYWORD.exec(lines[at]!)![1]}: ${render(value)}`;
    else lines.splice(end, 0, `#+${field}: ${render(value)}`);
    return lines.join("\n");
  },
  removeField(text, field) {
    const lines = text.split("\n");
    const at = org.header(lines).span(field)?.[0];
    if (at !== undefined) lines.splice(at, 1);
    return lines.join("\n");
  },
  // Org reads only an upper-case X as done, and [-] is a started item.
  tick: (line) => tickBox(org.checkbox, line, "X"),
};

// A value in brackets or quotes is YAML; anything else, links included, is text.
// Reading and writing both ask this, so a value reads back as it was written.
function isYaml(text: string): boolean {
  return /^[\[{"']/.test(text) && !text.startsWith("[[");
}

function orgValue(text: string): unknown {
  if (!isYaml(text)) return text;
  return (Bun.YAML.parse(`v: ${text}`) as { v: unknown }).v;
}

// Text is written as it is; it is quoted only when it would otherwise read as
// YAML, or lose its spaces. A list of links is written the way Org reads links,
// one after another.
function render(value: Value): string {
  if (typeof value === "string") return isYaml(value) || value !== value.trim() || value.includes("\n") || !value ? JSON.stringify(value) : value;
  if (Array.isArray(value)) {
    if (value.length && value.every((v) => /^\[\[[^\[\]]+\]\]$/.test(v))) return value.join(" ");
    return `[${value.map((v) => scalar(v, true)).join(", ")}]`;
  }
  return `{${Object.entries(value)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(", ")}}`;
}
