import { sectionsFromText, type Section } from '../shared/pdfSections';
import { pickTitle, titleFromFirstPage, type TextPiece } from '../shared/pdfTitle';

// PDF.js is loaded on demand so the library opens quickly.

type PdfJs = typeof import('pdfjs-dist');
let loading: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  loading ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return loading;
}

type PdfViewerModule = typeof import('pdfjs-dist/web/pdf_viewer.mjs');
let loadingViewer: Promise<PdfViewerModule> | null = null;

/** The PDF.js viewer components (page layout, text selection, links). */
export function loadPdfViewer(): Promise<PdfViewerModule> {
  loadingViewer ??= (async () => {
    // The viewer module expects the core library on globalThis.
    (globalThis as { pdfjsLib?: unknown }).pdfjsLib = await loadPdfJs();
    await import('pdfjs-dist/web/pdf_viewer.css');
    return import('pdfjs-dist/web/pdf_viewer.mjs');
  })();
  return loadingViewer;
}

function plausibleTitle(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const t = raw.replace(/\s+/g, ' ').trim();
  if (t.length < 4 || t.length > 300) return '';
  if (/\.(pdf|docx?|tex|dvi|ps|indd)$/i.test(t)) return '';
  if (/^(microsoft word|untitled|title|paper|doi:|arxiv:\s*\d)/i.test(t)) return '';
  return t;
}

/**
 * A PDF's title: the largest text at the top of its first page, or failing
 * that the title in its metadata, if that is a sensible one.
 */
export async function pdfTitle(data: Uint8Array): Promise<string> {
  try {
    const pdfjs = await loadPdfJs();
    const task = pdfjs.getDocument({ data: data.slice() });
    try {
      const doc = await task.promise;
      const onPage = await firstPageTitle(doc).catch(() => '');
      const { info, metadata } = await doc.getMetadata().catch(() => ({ info: null, metadata: null }));
      const inMeta = plausibleTitle(metadata?.get('dc:title')) || plausibleTitle((info as { Title?: unknown })?.Title);
      return pickTitle(onPage, inMeta);
    } finally {
      await task.destroy();
    }
  } catch {
    return '';
  }
}

async function firstPageTitle(doc: import('pdfjs-dist').PDFDocumentProxy): Promise<string> {
  const page = await doc.getPage(1);
  const [, y0, , y1] = page.view;
  return titleFromFirstPage(await pagePieces(page), y1 - y0);
}

/** The text on a page, in PDF units measured from the bottom of the page. */
async function pagePieces(page: import('pdfjs-dist').PDFPageProxy): Promise<TextPiece[]> {
  const [, y0] = page.view;
  const content = await page.getTextContent();
  const pieces: TextPiece[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str) continue;
    const [a, b, c, d, x, y] = item.transform as number[];
    pieces.push({
      text: item.str,
      x,
      y: y - y0,
      width: item.width,
      size: Math.hypot(c, d),
      upright: a > 0 && Math.abs(b) < 1e-3 && Math.abs(c) < 1e-3,
    });
  }
  return pieces;
}

type OutlineItem = { title: string; dest: string | unknown[] | null; items: OutlineItem[] };

/**
 * A paper's sections: its outline (bookmarks) if it has one, or else the
 * headings found in its text.
 */
export async function pdfSections(doc: import('pdfjs-dist').PDFDocumentProxy): Promise<Section[]> {
  const outline = ((await doc.getOutline().catch(() => null)) ?? []) as OutlineItem[];
  const fromOutline: Section[] = [];
  const walk = async (items: OutlineItem[], level: number) => {
    for (const item of items) {
      const title = item.title.replace(/\s+/g, ' ').trim();
      const target = await resolveDest(doc, item.dest);
      if (title && target) fromOutline.push({ title, level, ...target });
      if (level < 3) await walk(item.items ?? [], level + 1);
    }
  };
  await walk(outline, 1).catch(() => undefined);
  if (fromOutline.length >= 2) return fromOutline;

  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const [, y0] = page.view;
    pages.push({ page: n, pieces: await pagePieces(page) });
    // Section positions are kept in page units, like the outline's.
    for (const p of pages[pages.length - 1].pieces) p.y += y0;
  }
  return sectionsFromText(pages);
}

async function resolveDest(
  doc: import('pdfjs-dist').PDFDocumentProxy,
  dest: string | unknown[] | null,
): Promise<{ page: number; y: number | null } | null> {
  try {
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || !explicit.length) return null;
    const ref = explicit[0];
    const index = typeof ref === 'number' ? ref : await doc.getPageIndex(ref as Parameters<typeof doc.getPageIndex>[0]);
    const kind = (explicit[1] as { name?: string } | undefined)?.name;
    const y = kind === 'XYZ' ? (explicit[3] as number | null) : kind === 'FitH' || kind === 'FitBH' ? (explicit[2] as number | null) : null;
    return { page: index + 1, y: typeof y === 'number' ? y : null };
  } catch {
    return null;
  }
}
