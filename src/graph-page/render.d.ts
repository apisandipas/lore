// render.js runs in the browser; the tests import it, and lore inlines it as text.
export function esc(s: unknown): string;
export function safeHref(url: string): string | null;
export function renderBody(text: string, org: boolean, refs: Record<string, string>, title: string): string;
export function seed(id: string, spread: number): { x: number; y: number };
export function keepLabels(boxes: { x: number; y: number; w: number; h: number; rank: number }[]): Set<number>;
declare const text: string;
export default text;
