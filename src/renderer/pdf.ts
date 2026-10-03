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

function plausibleTitle(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const t = raw.replace(/\s+/g, ' ').trim();
  if (t.length < 4 || t.length > 300) return '';
  if (/\.(pdf|docx?|tex|dvi|ps|indd)$/i.test(t)) return '';
  if (/^(microsoft word|untitled|title|paper|doi:|arxiv:\s*\d)/i.test(t)) return '';
  return t;
}

/** The title from a PDF's metadata, if it has a sensible one. */
export async function pdfTitle(data: Uint8Array): Promise<string> {
  try {
    const pdfjs = await loadPdfJs();
    const task = pdfjs.getDocument({ data: data.slice() });
    try {
      const doc = await task.promise;
      const { info, metadata } = await doc.getMetadata();
      return plausibleTitle(metadata?.get('dc:title')) || plausibleTitle((info as { Title?: unknown })?.Title);
    } finally {
      await task.destroy();
    }
  } catch {
    return '';
  }
}
