// Finding the parts of a paper a survey skims: title, abstract, introduction,
// conclusion, section headings, figures and references. The PDF's bookmarks
// come first, since they are exact when a paper has them; text that looks
// like a heading or a caption fills in the rest. Every PDF is different, so
// anything uncertain is left out: a missing region is better than a wrong one.

import type { Rect } from './highlights';
import { JUNK } from './pdfTitle';

export const LANDMARK_KINDS = ['title', 'abstract', 'introduction', 'conclusion', 'headings', 'figures', 'references'] as const;
export type LandmarkKind = (typeof LANDMARK_KINDS)[number];

/** A line of text, in PDF units from the top-left of its page. */
export interface Line {
  text: string;
  x: number;
  /** Top of the line's letters. */
  top: number;
  width: number;
  /** Font size. */
  size: number;
  font: string;
}

export interface PageText {
  width: number;
  height: number;
  lines: Line[];
}

/** A bookmark, with where it points (top and x are null when it points at a whole page). */
export interface OutlineEntry {
  title: string;
  /** 1 for a top-level bookmark. */
  level: number;
  page: number;
  x: number | null;
  top: number | null;
}

export interface Region {
  page: number;
  /** x, y, width, height as fractions of the page, like a highlight. */
  rect: Rect;
}

export type Landmarks = Record<LandmarkKind, Region[]>;

export function emptyLandmarks(): Landmarks {
  return { title: [], abstract: [], introduction: [], conclusion: [], headings: [], figures: [], references: [] };
}

/** Pages lit when skimming the start of a long section. */
const MAX_SECTION_PAGES = 3;
const PAD = 3;

const bottomOf = (l: Line) => l.top + l.size * 1.15;
const letters = (s: string) => (s.match(/\p{L}/gu) ?? []).length;

// ---------- Page layout ----------

interface Column {
  left: number;
  right: number;
  top: number;
  /** Bottom of the main text. */
  bottom: number;
  /** Bottom of any text, small type such as a reference list included. */
  lowest: number;
}

interface Layout {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  mid: number;
  /** One column, or two side by side. */
  cols: Column[];
}

function layoutOf(page: PageText, body: Body, first: boolean): Layout {
  const { width, height } = page;
  const withWords = page.lines.filter((l) => letters(l.text) > 0);
  // Footnotes, running heads and page numbers are set small; the columns are where the main text is.
  const main = withWords.filter((l) => l.size >= body.size * 0.9);
  const lines = main.length >= 5 ? main : withWords;
  if (!lines.length) {
    const all = { left: 0, right: width, top: 0, bottom: height, lowest: height };
    return { width, height, left: 0, right: width, top: 0, bottom: height, mid: width / 2, cols: [all] };
  }
  const left = Math.min(...lines.map((l) => l.x));
  const right = Math.max(...lines.map((l) => l.x + l.width));
  const top = Math.min(...lines.map((l) => l.top));
  const bottom = Math.max(...lines.map(bottomOf));
  const mid = (left + right) / 2;
  const slack = width * 0.02;
  const inLeft = lines.filter((l) => l.x + l.width < mid + slack);
  const inRight = lines.filter((l) => l.x > mid - slack);
  const spanning = lines.length - inLeft.length - inRight.length;
  const lowest = (inCol: (l: Line) => boolean) => Math.max(bottom, ...withWords.filter(inCol).map(bottomOf));
  const one: Column[] = [{ left, right, top, bottom, lowest: lowest(() => true) }];
  if (inLeft.length < 5 || inRight.length < 5 || spanning > 0.3 * (inLeft.length + inRight.length)) {
    return { width, height, left, right, top, bottom, mid, cols: one };
  }
  // On a first page, the title and authors sit above the columns; the columns start with the running text.
  const proseTops = first ? lines.filter((l) => isProse(l, body, (right - left) * 0.45)).map((l) => l.top) : [];
  const front = proseTops.length ? Math.min(...proseTops) - body.size * 2.5 : -Infinity;
  const col = (all: Line[]): Column => {
    const below = all.filter((l) => l.top >= front);
    const ls = below.length ? below : all;
    const c = {
      left: Math.min(...ls.map((l) => l.x)),
      right: Math.max(...ls.map((l) => l.x + l.width)),
      top: Math.min(...ls.map((l) => l.top)),
      bottom: Math.max(...ls.map(bottomOf)),
    };
    return { ...c, lowest: Math.max(c.bottom, ...withWords.filter((l) => l.x >= c.left - 2 && l.x + l.width <= c.right + 2).map(bottomOf)) };
  };
  return { width, height, left, right, top, bottom, mid, cols: [col(inLeft), col(inRight)] };
}

function colAt(layout: Layout, x: number): number {
  return layout.cols.length > 1 && x >= layout.mid - layout.width * 0.01 ? 1 : 0;
}

function spansColumns(layout: Layout, l: { x: number; width: number }): boolean {
  const slack = layout.width * 0.02;
  return layout.cols.length > 1 && l.x < layout.mid - slack && l.x + l.width > layout.mid + slack;
}

function toRegion(page: number, layout: Layout, x0: number, y0: number, x1: number, y1: number): Region {
  const { width: w, height: h } = layout;
  const l = Math.max(0, x0 - PAD);
  const t = Math.max(0, y0 - PAD);
  const r = Math.min(w, x1 + PAD);
  const b = Math.min(h, y1 + PAD);
  return { page, rect: [l / w, t / h, Math.max(0, r - l) / w, Math.max(0, b - t) / h] };
}

// ---------- Text style ----------

interface Body {
  size: number;
  font: string;
}

/** The size and font of the paper's running text: whatever covers the most characters. */
function bodyStyle(pages: PageText[]): Body {
  const bySize = new Map<number, number>();
  const byFont = new Map<string, number>();
  for (const p of pages) {
    for (const l of p.lines) {
      const n = l.text.length;
      const s = Math.round(l.size * 2) / 2;
      bySize.set(s, (bySize.get(s) ?? 0) + n);
    }
  }
  const size = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;
  for (const p of pages) {
    for (const l of p.lines) {
      if (Math.abs(l.size - size) < size * 0.1) byFont.set(l.font, (byFont.get(l.font) ?? 0) + l.text.length);
    }
  }
  const font = [...byFont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  return { size, font };
}

const headingStyle = (l: Line, body: Body) => l.size >= body.size * 1.08 || (l.font !== body.font && l.size >= body.size * 0.9);

/** Running text: body size and font, and most of a column wide. */
const isProse = (l: Line, body: Body, colWidth: number) =>
  Math.abs(l.size - body.size) < body.size * 0.12 && l.font === body.font && l.width >= colWidth * 0.6;

// ---------- Headings ----------

const NUMBERING = /^(?:(\d{1,2}(?:\.\d{1,2})*)\.?|([IVX]{1,5})\.|([A-H])\.?)\s+(?=\p{Lu})/u;

const NAMED: [LandmarkKind, RegExp][] = [
  ['abstract', /^abstract$/],
  ['introduction', /^introduction$/],
  [
    'conclusion',
    /^(conclusions?|concluding remarks|summary and conclusions?|conclusions?,? (and|&) (future work|discussion|outlook|limitations)|discussion and conclusions?)$/,
  ],
  ['references', /^(references|bibliography|literature cited|works cited|cited literature)$/],
];

/** Unnumbered headings that end the section before them. */
const OTHER_SECTIONS =
  /^(acknowledge?ments?|appendix|appendices|supplementary material|limitations|ethics statement|ethical considerations|broader impacts?|impact statement|related work|discussion|future work|funding|author contributions|data availability|code availability|competing interests|keywords|index terms)$/;

/** A heading's words without its number or trailing punctuation, in lower case. */
export function headingWords(text: string): string {
  return text
    .replace(NUMBERING, '')
    .replace(/[\s.:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function namedSection(text: string): LandmarkKind | null {
  const words = headingWords(text);
  for (const [kind, re] of NAMED) if (re.test(words)) return kind;
  return null;
}

interface Heading {
  page: number;
  col: number;
  top: number;
  bottom: number;
  x: number;
  width: number;
  level: number;
  text: string;
  /** From the bookmarks rather than guessed from the text. */
  bookmarked: boolean;
}

/** A line that reads as a heading, and its level; null when it doesn't. */
function textHeading(l: Line, body: Body): { level: number; named: LandmarkKind | null } | null {
  const text = l.text.trim();
  // "Abstract—We propose…": an abstract that starts on its label's line.
  if (/^abstract\s*[—–:.-]\s*\S/i.test(text)) return { level: 1, named: 'abstract' };
  if (text.length > 70 || letters(text) < 3) return null;
  // A table of contents line ends in its page number.
  if (/(\s|\.{2,})\d+$/.test(text)) return null;
  const named = namedSection(text);
  const styled = headingStyle(l, body) || (letters(text) > 3 && text === text.toUpperCase());
  if (named) return styled ? { level: 1, named } : null;
  if (OTHER_SECTIONS.test(headingWords(text))) return styled ? { level: 1, named: null } : null;
  const m = NUMBERING.exec(text);
  if (!m || !headingStyle(l, body)) return null;
  // "A Study of…" is a title, not appendix A; letters count as numbers only as "A.".
  if (m[3] && !/^[A-H]\./.test(text)) return null;
  const rest = text.slice(m[0].length);
  if (letters(rest) < 3 || rest.split(/\s+/).length > 12 || /[.;,]$/.test(rest)) return null;
  if (m[1]) {
    const parts = m[1].split('.').map(Number);
    if (parts[0] < 1 || parts[0] > 30) return null;
    return { level: parts.length, named: null };
  }
  return { level: 1, named: null };
}

function findHeadings(pages: PageText[], layouts: Layout[], outline: OutlineEntry[], body: Body): Heading[] {
  const fromText: Heading[] = [];
  pages.forEach((p, i) => {
    for (const l of p.lines) {
      const h = textHeading(l, body);
      if (!h) continue;
      // A table of contents: the page number sits apart, at the end of the line.
      const toc = p.lines.some(
        (o) =>
          o !== l &&
          Math.abs(o.top - l.top) < 2 &&
          o.x > l.x + l.width &&
          colAt(layouts[i], o.x) === colAt(layouts[i], l.x) &&
          /^(\.\s*)*\d+$/.test(o.text.trim()),
      );
      if (toc) continue;
      fromText.push({
        page: i + 1,
        col: colAt(layouts[i], l.x),
        top: l.top,
        bottom: bottomOf(l),
        x: l.x,
        width: l.width,
        level: h.level,
        text: l.text.trim(),
        bookmarked: false,
      });
    }
  });

  const fromOutline: Heading[] = [];
  for (const e of outline) {
    const page = pages[e.page - 1];
    if (!page) continue;
    const layout = layouts[e.page - 1];
    const want = headingWords(e.title);
    if (!want) continue;
    // The bookmark's own line on the page, nearest to where it points.
    const matches = page.lines.filter((l) => {
      const got = headingWords(l.text);
      return got.length > 1 && (got === want || (got.startsWith(want) && got.length < want.length + 6) || want.startsWith(got));
    });
    const near = (l: Line) => (e.top === null ? 0 : Math.abs(l.top - e.top)) + (e.x === null ? 0 : Math.abs(l.x - e.x) * 0.5);
    const line = matches.sort((a, b) => near(a) - near(b))[0];
    if (line && (e.top === null || near(line) < layout.height * 0.25)) {
      fromOutline.push({
        page: e.page,
        col: colAt(layout, line.x),
        top: line.top,
        bottom: bottomOf(line),
        x: line.x,
        width: line.width,
        level: e.level,
        text: line.text.trim(),
        bookmarked: true,
      });
    } else if (e.top !== null) {
      const col = colAt(layout, e.x ?? layout.left);
      const c = layout.cols[col];
      const top = Math.max(e.top, c.top);
      fromOutline.push({
        page: e.page,
        col,
        top,
        bottom: top + body.size * 1.3,
        x: c.left,
        width: c.right - c.left,
        level: e.level,
        text: e.title.trim(),
        bookmarked: true,
      });
    }
  }

  // Bookmarks win; text headings fill in what they leave out (often Abstract and References).
  const headings = [...fromOutline];
  for (const h of fromText) {
    const dup = fromOutline.some(
      (o) => o.page === h.page && (Math.abs(o.top - h.top) < body.size * 3 || headingWords(o.text) === headingWords(h.text)),
    );
    if (!dup) headings.push(h);
  }
  return headings.sort((a, b) => a.page - b.page || a.col - b.col || a.top - b.top);
}

// ---------- Sections ----------

interface Pos {
  page: number;
  col: number;
  top: number;
}

/**
 * The regions of text from one point to another, one per column per page,
 * stopping after maxPages pages (or one column, if asked).
 */
function span(start: Pos, end: Pos | null, layouts: Layout[], maxPages: number, oneColumn = false, smallType = false): Region[] {
  const regions: Region[] = [];
  const lastPage = Math.min(end?.page ?? layouts.length, start.page + maxPages - 1, layouts.length);
  for (let page = start.page; page <= lastPage; page++) {
    const layout = layouts[page - 1];
    const n = layout.cols.length;
    const first = page === start.page ? Math.min(start.col, n - 1) : 0;
    const endsHere = end !== null && end.page === page;
    const last = oneColumn ? first : endsHere ? Math.min(end.col, n - 1) : n - 1;
    for (let c = first; c <= last; c++) {
      const col = layout.cols[c];
      const y0 = page === start.page && c === first ? start.top : col.top;
      const y1 = endsHere && c === Math.min(end.col, n - 1) ? end.top : smallType ? col.lowest : col.bottom;
      if (y1 - y0 > 4) regions.push(toRegion(page, layout, col.left, y0, col.right, y1 - 2));
    }
    if (oneColumn) break;
  }
  return regions;
}

function sectionRegions(kind: LandmarkKind, headings: Heading[], layouts: Layout[]): Region[] {
  // A bookmarked heading is surer than one found in the text (which might be in a table of contents).
  const named = (h: Heading) => namedSection(h.text) === kind;
  const marked = headings.findIndex((h) => h.bookmarked && named(h));
  const i = marked >= 0 ? marked : headings.findIndex(named);
  if (i < 0) return [];
  const h = headings[i];
  const next = headings.slice(i + 1).find((n) => n.level <= h.level);
  const end = next ? { page: next.page, col: next.col, top: next.top } : null;
  const start = { page: h.page, col: h.col, top: h.top };
  if (kind === 'references') return span(start, end, layouts, 1, true, true);
  if (kind === 'abstract') return span(start, end, layouts, 1);
  return span(start, end, layouts, MAX_SECTION_PAGES);
}

// ---------- Title and abstract ----------

function titleBlock(page: PageText | undefined, body: Body): Line[] {
  if (!page) return [];
  const candidates = page.lines.filter((l) => l.top < page.height * 0.5 && letters(l.text) >= 3 && !JUNK.test(l.text));
  if (!candidates.length) return [];
  const biggest = Math.max(...candidates.map((l) => l.size));
  if (biggest < body.size * 1.15) return [];
  const big = candidates.filter((l) => l.size >= biggest * 0.85).sort((a, b) => a.top - b.top);
  const block = [big[0]];
  for (const l of big.slice(1)) {
    if (l.top - bottomOf(block[block.length - 1]) > biggest * 1.5) break;
    block.push(l);
  }
  return block;
}

function boxOf(page: number, layout: Layout, lines: Line[]): Region {
  return toRegion(
    page,
    layout,
    Math.min(...lines.map((l) => l.x)),
    Math.min(...lines.map((l) => l.top)),
    Math.max(...lines.map((l) => l.x + l.width)),
    Math.max(...lines.map(bottomOf)),
  );
}

/** With no "Abstract" heading: the paragraph just before the first heading on page 1. */
function unlabelledAbstract(page: PageText, layout: Layout, headings: Heading[], title: Line[]): Region[] {
  const first = headings.find((h) => h.page === 1);
  if (!first) return [];
  const below = title.length ? Math.max(...title.map(bottomOf)) : 0;
  const before = page.lines
    .filter((l) => l.top >= below && bottomOf(l) <= first.top + 1 && (layout.cols.length === 1 || colAt(layout, l.x) === first.col || spansColumns(layout, l)))
    .sort((a, b) => b.top - a.top);
  const block: Line[] = [];
  for (const l of before) {
    if (block.length && block[block.length - 1].top - bottomOf(l) > l.size * 0.9) break;
    block.push(l);
  }
  return block.length >= 3 ? [boxOf(1, layout, block)] : [];
}

// ---------- Figures and tables ----------

const CAPTION = /^(fig(?:ure)?\.?|table|tab\.)\s*(\d{1,3}|[IVX]{1,5})(?:\s*[.:|]|\s*$)/i;

function figureRegions(pages: PageText[], layouts: Layout[], headings: Heading[], body: Body): Region[] {
  const regions: Region[] = [];
  // A figure with no text in it can reach the page's margin, which a page of only pictures doesn't show; the paper's usual margins do.
  const marginTop = median(layouts.map((l) => l.top));
  const marginBottom = median(layouts.map((l) => l.bottom));
  pages.forEach((page, i) => {
    const layout = layouts[i];
    const colWidth = Math.min(...layout.cols.map((c) => c.right - c.left));
    const captions = page.lines.filter((l) => CAPTION.test(l.text.trim()));
    if (!captions.length) return;
    const pageHeadings = headings.filter((h) => h.page === i + 1);
    const boundary = (l: Line) =>
      isProse(l, body, colWidth) || CAPTION.test(l.text.trim()) || pageHeadings.some((h) => Math.abs(h.top - l.top) < 1);
    for (const cap of captions) {
      const full = spansColumns(layout, cap);
      const col = layout.cols[colAt(layout, cap.x)];
      const x0 = full ? layout.left : col.left;
      const x1 = full ? layout.right : col.right;
      const overlaps = (l: Line) => l.x < x1 && l.x + l.width > x0;
      const sorted = page.lines.filter(overlaps).sort((a, b) => a.top - b.top);
      // The caption runs on while lines follow closely.
      let capBottom = bottomOf(cap);
      let k = sorted.indexOf(cap) + 1;
      for (let n = 0; k < sorted.length && n < 8; k++, n++) {
        const l = sorted[k];
        if (l.top < capBottom - l.size * 0.5) continue;
        if (l.top - capBottom > l.size * 0.8 || CAPTION.test(l.text.trim())) break;
        capBottom = bottomOf(l);
      }
      const colTop = i === 0 ? (full ? layout.top : col.top) : Math.min(full ? layout.top : col.top, marginTop);
      const colBottom = Math.max(full ? layout.bottom : col.bottom, marginBottom);
      const above = sorted.filter((l) => bottomOf(l) <= cap.top + 1 && boundary(l)).pop();
      const below = sorted.find((l) => l.top >= capBottom - 1 && boundary(l));
      const upTop = above ? bottomOf(above) : colTop;
      const downBottom = below ? below.top : colBottom;
      const inside = (a: number, b: number) => sorted.filter((l) => l.top >= a && bottomOf(l) <= b + 1).length;
      const fits = (h: number) => h > layout.height * 0.03 && h < layout.height * 0.75;
      const upFits = fits(cap.top - upTop);
      const downFits = fits(downBottom - capBottom);
      const isTable = /^tab/i.test(cap.text.trim());
      // Figures sit above their captions and tables below, but papers vary; a table's band holds text.
      let useUp: boolean;
      if (isTable) useUp = upFits && (!downFits || inside(upTop, cap.top) > inside(capBottom, downBottom));
      else useUp = upFits || !downFits;
      if (useUp && upFits) regions.push(toRegion(i + 1, layout, x0, upTop, x1, capBottom));
      else if (!useUp && downFits) regions.push(toRegion(i + 1, layout, x0, cap.top, x1, downBottom));
      else regions.push(toRegion(i + 1, layout, x0, cap.top, x1, capBottom));
    }
  });
  return regions;
}

// ---------- All together ----------

export function findLandmarks(pages: PageText[], outline: OutlineEntry[]): Landmarks {
  const found = emptyLandmarks();
  if (!pages.some((p) => p.lines.length)) return found;
  const body = bodyStyle(pages);
  const layouts = pages.map((p, i) => layoutOf(p, body, i === 0));
  const headings = findHeadings(pages, layouts, outline, body);

  const title = titleBlock(pages[0], body);
  if (title.length) found.title = [boxOf(1, layouts[0], title)];

  for (const kind of ['abstract', 'introduction', 'conclusion', 'references'] as const) {
    found[kind] = sectionRegions(kind, headings, layouts);
  }
  if (!found.abstract.length && pages[0]) found.abstract = unlabelledAbstract(pages[0], layouts[0], headings, title);

  found.headings = headings.map((h) => toRegion(h.page, layouts[h.page - 1], h.x, h.top, h.x + h.width, h.bottom));
  found.figures = figureRegions(pages, layouts, headings, body);
  return found;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}
