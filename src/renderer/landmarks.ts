import type { PDFDocumentProxy } from 'pdfjs-dist';
import { findLandmarks, type Landmarks, type Line, type OutlineEntry, type PageText } from '../shared/landmarks';

// Reads what findLandmarks needs out of a PDF.js document: each page's text,
// joined into lines, and the bookmarks with where they point.

/** Pages read for landmarks; a book's later chapters don't matter for a survey. */
const MAX_PAGES = 120;
const MAX_BOOKMARKS = 400;

type TextItem = { str: string; transform: number[]; width: number; fontName: string };
type Building = Line & { baseline: number; end: number; styledBy: string };

export function joinLines(items: TextItem[], x0: number, y1: number): Line[] {
  const lines: Line[] = [];
  let cur: Building | null = null;
  for (const it of items) {
    // Spaces carry no position worth keeping (some are as wide as the page).
    if (!it.str.trim()) {
      if (cur && it.str) cur.text += ' ';
      continue;
    }
    const [a, b, c, d, e, f] = it.transform;
    // Skip rotated text, such as arXiv's sidebar stamp.
    if (!(a > 0 && Math.abs(b) < 1e-3 && Math.abs(c) < 1e-3)) continue;
    const size = Math.hypot(c, d);
    if (size <= 0) continue;
    const x = e - x0;
    const baseline = y1 - f;
    // Section numbers are set an em or more before their heading ("1  Introduction").
    const reach = cur && /^[\dIVXA-H.]+$/.test(cur.text.trim()) ? size * 1.6 : size;
    if (cur && Math.abs(baseline - cur.baseline) < size * 0.3 && x >= cur.end - size * 0.5 && x - cur.end < reach) {
      const gap = x - cur.end;
      cur.text += gap > size * 0.15 && !cur.text.endsWith(' ') && !it.str.startsWith(' ') ? ` ${it.str}` : it.str;
      cur.end = Math.max(cur.end, x + it.width);
      cur.width = cur.end - cur.x;
      // A line's style is its first real word's: "1 Introduction" keeps the heading font.
      if (!/\p{L}/u.test(cur.styledBy) && /\p{L}/u.test(it.str)) {
        cur.font = it.fontName;
        cur.size = size;
        cur.styledBy = it.str;
      }
      continue;
    }
    if (cur) lines.push(finish(cur));
    cur = { text: it.str, x, top: 0, width: it.width, size, font: it.fontName, baseline, end: x + it.width, styledBy: it.str };
  }
  if (cur) lines.push(finish(cur));
  return lines.filter((l) => l.text.trim());
}

function finish(l: Building): Line {
  return { text: l.text.replace(/\s+/g, ' ').trim(), x: l.x, top: l.baseline - l.size * 0.85, width: l.width, size: l.size, font: l.font };
}

async function pageText(doc: PDFDocumentProxy, n: number): Promise<PageText> {
  const page = await doc.getPage(n);
  const [x0, y0, x1, y1] = page.view;
  const width = x1 - x0;
  const height = y1 - y0;
  // Rotated pages would need their own geometry; leave them out.
  if (page.rotate % 360 !== 0) return { width, height, lines: [] };
  const content = await page.getTextContent();
  return { width, height, lines: joinLines(content.items as TextItem[], x0, y1) };
}

async function bookmarks(doc: PDFDocumentProxy): Promise<OutlineEntry[]> {
  const outline = await doc.getOutline().catch(() => null);
  if (!outline) return [];
  const entries: OutlineEntry[] = [];
  const walk = async (items: typeof outline, level: number) => {
    for (const item of items) {
      if (entries.length >= MAX_BOOKMARKS) return;
      try {
        const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
        if (dest && dest[0]) {
          const index = typeof dest[0] === 'number' ? dest[0] : await doc.getPageIndex(dest[0]);
          const page = await doc.getPage(index + 1);
          const [x0, , , y1] = page.view;
          const kind = (dest[1] as { name?: string } | undefined)?.name;
          const nums = dest.slice(2) as (number | null)[];
          let x: number | null = null;
          let y: number | null = null;
          if (kind === 'XYZ') [x, y] = nums;
          else if (kind === 'FitH' || kind === 'FitBH') y = nums[0];
          else if (kind === 'FitR') [x, , , y] = nums;
          entries.push({
            title: item.title,
            level,
            page: index + 1,
            x: typeof x === 'number' ? x - x0 : null,
            top: typeof y === 'number' ? y1 - y : null,
          });
        }
      } catch {
        // A broken bookmark; the text fills in.
      }
      if (item.items?.length) await walk(item.items, level + 1);
    }
  };
  await walk(outline, 1);
  return entries;
}

const cache = new WeakMap<PDFDocumentProxy, Promise<Landmarks>>();

/** The landmarks of a document, read once. */
export function readLandmarks(doc: PDFDocumentProxy): Promise<Landmarks> {
  let found = cache.get(doc);
  if (!found) {
    found = (async () => {
      const count = Math.min(doc.numPages, MAX_PAGES);
      // PDF.js parses in its worker; asking for every page at once keeps it busy.
      const [pages, outline] = await Promise.all([
        Promise.all(Array.from({ length: count }, (_, i) => pageText(doc, i + 1))),
        bookmarks(doc),
      ]);
      return findLandmarks(pages, outline.filter((e) => e.page <= count));
    })();
    cache.set(doc, found);
  }
  return found;
}
