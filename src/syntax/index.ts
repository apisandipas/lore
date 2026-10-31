import { markdown } from "./markdown";
import { org } from "./org";

// Notes are Markdown or Org. The note model is the same; only the syntax for
// fields, headings, links, blocks and checkboxes differs, and each syntax
// lives in one adapter here.

export type Header = { fields: Record<string, unknown>; error?: string; fieldLines: Record<string, number>; bodyStart: number };

export type Syntax = {
  header(lines: string[]): Header;
  // A top heading's text, for the title; undefined when the line is not one.
  title(line: string): string | undefined;
  // Whether a line is a heading named `name`, at any level.
  heading(line: string, name: string): boolean;
  // Lines that end a paragraph and are never part of a summary.
  breaks(trimmed: string): boolean;
  // Opens or closes a block whose lines are not prose (code, examples).
  fence: RegExp;
  checkbox: RegExp;
  links(line: string, notePath: string): string[];
};

export function isOrg(path: string): boolean {
  return /\.org$/i.test(path);
}

export function syntaxOf(path: string): Syntax {
  return isOrg(path) ? org : markdown;
}
