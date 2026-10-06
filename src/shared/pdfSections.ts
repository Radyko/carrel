// A paper's sections, for the contents list beside the PDF. Many PDFs carry
// an outline (bookmarks) and that is used when there is one. Otherwise the
// headings are found the way a reader spots them: short lines that are
// numbered, set larger than the text, or named like the usual parts of a paper.

import type { TextPiece } from './pdfTitle';

export interface Section {
  title: string;
  /** 1 for a section, 2 for a subsection, 3 below that. */
  level: number;
  page: number;
  /** Top of the heading in PDF units (y grows upwards), when known. */
  y: number | null;
}

export interface PageText {
  page: number;
  pieces: TextPiece[];
}

interface Line {
  text: string;
  size: number;
  y: number;
  page: number;
}

const KNOWN =
  /^(abstract|introduction|related work|background|preliminaries|motivation|method|methods|methodology|approach|model|experiments?|experimental (setup|results)|evaluation|results( and discussion)?|analysis|discussion|limitations|conclusions?|conclusions? and future work|future work|acknowledge?ments?|references|bibliography|appendix|appendices|supplementary materials?)$/i;

const JUNK = /https?:|www\.|@|©|copyright|arxiv|preprint|\bdoi\b|\bproceedings\b|\bpage \d/i;

const letters = (s: string) => (s.match(/\p{L}/gu) ?? []).length;
const digits = (s: string) => (s.match(/\d/g) ?? []).length;

/** Pieces of text gathered into lines, from the top of each page down. */
function toLines({ page, pieces }: PageText): Line[] {
  const upright = pieces.filter((p) => p.upright && p.text.trim() && p.size > 0);
  const lines: TextPiece[][] = [];
  for (const p of [...upright].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l[0].y - p.y) < Math.max(l[0].size, p.size) * 0.4);
    if (line) line.push(p);
    else lines.push([p]);
  }
  // A wide gap splits a line, so a heading in one column isn't joined to text in the other.
  const segments = lines.flatMap((l) => {
    l.sort((a, b) => a.x - b.x);
    const out: TextPiece[][] = [[l[0]]];
    for (const p of l.slice(1)) {
      const prev = out[out.length - 1].at(-1)!;
      if (p.x - (prev.x + prev.width) > Math.max(p.size, prev.size) * 2) out.push([p]);
      else out[out.length - 1].push(p);
    }
    return out;
  });
  // Read a column to its foot before starting the next, as on paper.
  const xs = upright.flatMap((p) => [p.x, p.x + p.width]);
  const middle = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  const column = (l: TextPiece[]) => (l[0].x >= middle - 1 ? 1 : 0);
  segments.sort((a, b) => column(a) - column(b) || b[0].y - a[0].y);
  return segments.map((l) => {
    let text = '';
    let end = -Infinity;
    for (const p of l) {
      const gap = p.x - end;
      text += text && gap > p.size * 0.15 && !text.endsWith(' ') && !p.text.startsWith(' ') ? ` ${p.text}` : p.text;
      end = p.x + p.width;
    }
    const sizes = l.filter((p) => letters(p.text) > 0).map((p) => p.size);
    return {
      text: text.replace(/\s+/g, ' ').trim(),
      size: sizes.length ? Math.max(...sizes) : l[0].size,
      y: Math.max(...l.map((p) => p.y)),
      page,
    };
  });
}

/** The size most of the text is set in, weighted by how much text uses it. */
function bodySize(lines: Line[]): number {
  const weight = new Map<number, number>();
  for (const l of lines) {
    const s = Math.round(l.size * 2) / 2;
    weight.set(s, (weight.get(s) ?? 0) + l.text.length);
  }
  let best = 0;
  let size = 10;
  for (const [s, w] of weight) if (w > best) [best, size] = [w, s];
  return size;
}

/** Most words capitalised, as headings are; sentences aren't. */
function titleCase(s: string): boolean {
  const words = s.split(' ').filter((w) => letters(w) > 3);
  if (!words.length) return true;
  const caps = words.filter((w) => /^[\p{Lu}\d]/u.test(w)).length;
  return caps / words.length >= 0.6;
}

/** The headings of a paper, found from the text of its pages. */
export function sectionsFromText(pages: PageText[]): Section[] {
  const lines = pages.flatMap(toLines);
  if (!lines.length) return [];
  const body = bodySize(lines);

  // Running headers and footers repeat on many pages.
  const key = (t: string) => t.toLowerCase().replace(/\d+/g, '#');
  const seenOn = new Map<string, Set<number>>();
  for (const l of lines) {
    const k = key(l.text);
    if (!seenOn.has(k)) seenOn.set(k, new Set());
    seenOn.get(k)!.add(l.page);
  }
  const repeated = (l: Line) => (seenOn.get(key(l.text))?.size ?? 0) >= 3;

  // The title on the first page is the largest text there, not a section.
  const firstPage = Math.min(...lines.map((l) => l.page));
  const titleSize = Math.max(...lines.filter((l) => l.page === firstPage).map((l) => l.size));

  const out: Section[] = [];
  for (const l of lines) {
    const t = l.text;
    if (t.length > 90 || letters(t) < 3 || t.split(' ').length > 12) continue;
    if (JUNK.test(t) || repeated(l)) continue;
    if (l.page === firstPage && titleSize > body * 1.3 && l.size >= titleSize * 0.9) continue;
    if (l.size < body * 0.97) continue;
    const larger = l.size > body * 1.05;

    const numbered = /^((\d{1,2})((?:\.\d{1,2}){0,3})|[IVX]{1,5}|[A-H](?:\.\d{1,2}){0,2})\.?\s+(.+)$/.exec(t);
    if (numbered) {
      const rest = numbered[4].trim();
      if (!/^\p{Lu}/u.test(rest) || /[.,;:]$/.test(rest)) continue;
      if (digits(rest) > letters(rest) * 0.3) continue;
      const known = KNOWN.test(rest);
      const isLetter = /^[A-H]/.test(numbered[1]) && !/^[IVX]+$/.test(numbered[1]);
      if (!known && !larger && (isLetter || !titleCase(rest))) continue;
      const depth = numbered[2] ? numbered[3].split('.').length : 1;
      out.push({ title: `${numbered[1]} ${rest}`, level: Math.min(3, depth), page: l.page, y: l.y + l.size });
      continue;
    }
    const plain = t.replace(/:$/, '');
    if ((KNOWN.test(plain) && /^\p{Lu}/u.test(t)) || (l.size > body * 1.12 && /^\p{Lu}/u.test(t) && !/[.,;]$/.test(t) && titleCase(t))) {
      out.push({ title: plain, level: 1, page: l.page, y: l.y + l.size });
    }
  }

  const sections = out.filter((s, i) => i === 0 || s.title !== out[i - 1].title);
  return sections.length >= 2 ? sections : [];
}
