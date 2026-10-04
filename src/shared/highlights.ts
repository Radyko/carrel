// Highlights are stored in notes.md under their own heading, one per line:
//
//   - p. 4: “PagedAttention divides the KV cache into blocks” <!-- carrel id=k3f9 color=yellow rects=0.112,0.341,0.402,0.012 -->
//
// The quote and page are readable anywhere; the comment (hidden when the
// markdown is rendered) holds where the highlight sits on the page, as
// fractions of the page's width and height. Deleting a line in an editor
// deletes the highlight. Lines in any other form are kept as they are.

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

/** x, y, width, height as fractions of the page. */
export type Rect = [number, number, number, number];

export interface Highlight {
  id: string;
  page: number;
  color: HighlightColor;
  text: string;
  rects: Rect[];
}

export interface ParsedHighlights {
  items: Highlight[];
  /** Lines that are not highlights, kept so nothing is lost. */
  extra: string;
}

const LINE = /^\s*[-*+]\s+p\.\s*(\d+)\s*:\s*(.*?)\s*<!--\s*carrel\s+(.*?)\s*-->\s*$/;

function cleanQuote(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/-->/g, '–>')
    .trim();
}

function round(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
}

export function parseHighlights(text: string): ParsedHighlights {
  const items: Highlight[] = [];
  const extra: string[] = [];
  for (const line of text.split('\n')) {
    const m = LINE.exec(line);
    if (!m) {
      if (line.trim()) extra.push(line);
      continue;
    }
    const attrs = Object.fromEntries(
      m[3].split(/\s+/).map((pair) => {
        const i = pair.indexOf('=');
        return i > 0 ? [pair.slice(0, i), pair.slice(i + 1)] : [pair, ''];
      }),
    );
    const rects = (attrs.rects ?? '')
      .split(';')
      .map((r: string) => r.split(',').map(Number))
      .filter((r: number[]) => r.length === 4 && r.every((n) => Number.isFinite(n)))
      .map((r: number[]) => r as Rect);
    const color = (HIGHLIGHT_COLORS as readonly string[]).includes(attrs.color) ? (attrs.color as HighlightColor) : 'yellow';
    items.push({
      id: attrs.id || `h${items.length + 1}`,
      page: Number(m[1]),
      color,
      text: m[2].replace(/^[“"]/, '').replace(/[”"]$/, ''),
      rects,
    });
  }
  return { items, extra: extra.join('\n') };
}

/** Highlights in reading order: by page, then from the top. */
export function sortHighlights(items: Highlight[]): Highlight[] {
  const top = (h: Highlight) => (h.rects.length ? Math.min(...h.rects.map((r) => r[1])) : 0);
  return [...items].sort((a, b) => a.page - b.page || top(a) - top(b));
}

export function formatHighlights(p: ParsedHighlights): string {
  const lines = sortHighlights(p.items).map((h) => {
    const rects = h.rects.map((r) => r.map(round).join(',')).join(';');
    return `- p. ${h.page}: “${cleanQuote(h.text)}” <!-- carrel id=${h.id} color=${h.color} rects=${rects} -->`;
  });
  return [lines.join('\n'), p.extra.trim()].filter(Boolean).join('\n\n');
}

export function newHighlightId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Turns the rectangles of a text selection (one per text fragment) into one
 * rectangle per line, so a highlight looks like a marker stroke.
 */
export function mergeLineRects(rects: Rect[]): Rect[] {
  const sorted = [...rects].filter((r) => r[2] > 0 && r[3] > 0).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const lines: Rect[] = [];
  for (const r of sorted) {
    const last = lines[lines.length - 1];
    if (last) {
      const overlap = Math.min(last[1] + last[3], r[1] + r[3]) - Math.max(last[1], r[1]);
      const sameLine = overlap > 0.5 * Math.min(last[3], r[3]);
      const gap = r[0] - (last[0] + last[2]);
      if (sameLine && gap < 0.02) {
        const x = Math.min(last[0], r[0]);
        const y = Math.min(last[1], r[1]);
        const right = Math.max(last[0] + last[2], r[0] + r[2]);
        const bottom = Math.max(last[1] + last[3], r[1] + r[3]);
        lines[lines.length - 1] = [x, y, right - x, bottom - y];
        continue;
      }
    }
    lines.push(r);
  }
  return lines;
}
