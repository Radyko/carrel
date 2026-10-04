// Finding a paper's title on its first page: the largest text near the top,
// which is how a reader spots it too. PDF metadata titles are often missing or
// junk ("Microsoft Word - final.docx"), so this comes first.

/** A piece of text on the page, in PDF units (y grows upwards from the bottom). */
export interface TextPiece {
  text: string;
  x: number;
  y: number;
  width: number;
  /** Font size. */
  size: number;
  /** False for rotated text, such as arXiv's sidebar stamp. */
  upright: boolean;
}

// Headers, stamps and banners that can be set large above or beside a title.
const JUNK =
  /\barxiv\b|\bpreprint\b|\bproceedings\b|\bconference on\b|\bjournal of\b|\btransactions on\b|copyright|©|https?:|www\.|\bdoi\b|@|\bvol(ume)?\.?\s*\d|\bissn\b|\bisbn\b|\baccepted (at|to|for)\b|\bpublished (at|in|as)\b|\bsubmitted to\b|\bunder review\b/i;

const letters = (s: string) => (s.match(/\p{L}/gu) ?? []).length;

/** The title on a first page, or '' when nothing looks like one. */
export function titleFromFirstPage(pieces: TextPiece[], pageHeight: number): string {
  // Upright text in the top 60% of the page, with real words in it.
  const candidates = pieces.filter(
    (p) => p.upright && p.text.trim() && p.y > pageHeight * 0.4 && p.size > 0,
  );
  const sized = candidates.filter((p) => letters(p.text) >= 3 && !JUNK.test(p.text));
  if (!sized.length) return '';
  const biggest = Math.max(...sized.map((p) => p.size));
  // Body text is about 10pt; a "largest" text that small means there's no title styling to go on.
  const body = median(candidates.map((p) => p.size));
  if (biggest < body * 1.15) return '';

  // Lines of title-sized text, from the top down.
  const big = candidates.filter((p) => p.size >= biggest * 0.85);
  const lines: TextPiece[][] = [];
  for (const p of [...big].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l[0].y - p.y) < biggest * 0.5);
    if (line) line.push(p);
    else lines.push([p]);
  }
  const texts: string[] = [];
  let lastY: number | null = null;
  for (const line of lines) {
    const y = line[0].y;
    const text = joinLine(line);
    // The title is the first block of big lines that isn't a header; stop at a gap.
    if (lastY !== null && lastY - y > biggest * 2.2) break;
    if (JUNK.test(text) || letters(text) < 2) {
      if (texts.length) break;
      continue;
    }
    texts.push(text);
    lastY = y;
  }
  return tidyTitle(texts.join(' '));
}

function joinLine(line: TextPiece[]): string {
  const sorted = [...line].sort((a, b) => a.x - b.x);
  let out = '';
  let end: number | null = null;
  for (const p of sorted) {
    // Pieces that touch are parts of one word; a gap means a space.
    const gap = end === null ? 0 : p.x - end;
    if (out && gap > p.size * 0.15 && !out.endsWith(' ') && !p.text.startsWith(' ')) out += ' ';
    out += p.text;
    end = p.x + p.width;
  }
  return out;
}

/** Tidies a title: one space between words, no footnote marks, and words broken across lines joined. */
export function tidyTitle(raw: string): string {
  const t = raw
    .replace(/\s+/g, ' ')
    .replace(/(\p{L})- (\p{L})/gu, '$1-$2')
    .replace(/[*∗†‡§¶]+/g, '')
    .replace(/\s+([:,.;])/g, '$1')
    .trim()
    .replace(/[\s.:;,]+$/, '');
  const words = t.split(' ').length;
  if (letters(t) < 8 || words < 2 || t.length > 300) return '';
  return t;
}

/**
 * Chooses between the title found on the page and the one in the metadata.
 * The page wins, since metadata is so often wrong, unless the metadata title
 * is the page title continued (a title cut off at the page edge, say).
 */
export function pickTitle(onPage: string, inMetadata: string): string {
  if (!onPage) return inMetadata;
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  if (inMetadata && norm(inMetadata).length > norm(onPage).length && norm(inMetadata).startsWith(norm(onPage))) return inMetadata;
  return onPage;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}
