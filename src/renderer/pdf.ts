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
  return titleFromFirstPage(pieces, y1 - y0);
}
