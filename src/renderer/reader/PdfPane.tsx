import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import { api, errorText } from '../api';
import { loadPdfJs, loadPdfViewer } from '../pdf';

export interface PdfHandle {
  zoomIn(): void;
  zoomOut(): void;
  fitWidth(): void;
}

interface Props {
  paperId: string;
  initialPage: number | null;
  onPageChange: (page: number) => void;
}

export const PdfPane = forwardRef<PdfHandle, Props>(function PdfPane({ paperId, initialPage, onPageChange }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerElRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFViewer | null>(null);
  const [page, setPage] = useState(initialPage ?? 1);
  const [pageInput, setPageInput] = useState(String(initialPage ?? 1));
  const [pages, setPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [fit, setFit] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const initialPageRef = useRef(initialPage);

  useEffect(() => {
    let cancelled = false;
    let task: { destroy(): Promise<void> } | null = null;
    let viewer: PDFViewer | null = null;
    (async () => {
      try {
        const [pdfjs, v, data] = await Promise.all([loadPdfJs(), loadPdfViewer(), api.readPdf(paperId)]);
        if (cancelled) return;
        if (!data) {
          setError('The PDF for this paper could not be found in its folder.');
          return;
        }
        const container = containerRef.current!;
        const eventBus = new v.EventBus();
        const linkService = new v.PDFLinkService({ eventBus, externalLinkTarget: v.LinkTarget.BLANK });
        viewer = new v.PDFViewer({
          container,
          viewer: viewerElRef.current!,
          eventBus,
          linkService,
          textLayerMode: 1,
        });
        linkService.setViewer(viewer);
        viewerRef.current = viewer;
        eventBus.on('pagesinit', () => {
          if (!viewer) return;
          viewer.currentScaleValue = 'page-width';
          const start = initialPageRef.current;
          if (start && start > 1 && start <= viewer.pagesCount) viewer.currentPageNumber = start;
        });
        eventBus.on('pagechanging', (e: { pageNumber: number }) => {
          setPage(e.pageNumber);
          setPageInput(String(e.pageNumber));
          onPageChangeRef.current(e.pageNumber);
        });
        eventBus.on('scalechanging', (e: { scale: number; presetValue?: string }) => {
          setScale(e.scale);
          setFit(e.presetValue === 'page-width');
        });
        const loadingTask = pdfjs.getDocument({ data });
        task = loadingTask;
        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPages(doc.numPages);
        viewer.setDocument(doc);
        linkService.setDocument(doc);
      } catch (err) {
        if (!cancelled) setError(`The PDF could not be opened: ${errorText(err)}`);
      }
    })();
    return () => {
      cancelled = true;
      viewerRef.current = null;
      viewer?.setDocument(null as unknown as PDFDocumentProxy);
      void task?.destroy();
    };
  }, [paperId]);

  // Keep fitting the width as the pane is resized.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const viewer = viewerRef.current;
      if (viewer && viewer.pagesCount && viewer.currentScaleValue === 'page-width') viewer.currentScaleValue = 'page-width';
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const go = (n: number) => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.pagesCount) return;
    viewer.currentPageNumber = Math.min(viewer.pagesCount, Math.max(1, n));
  };
  const zoomIn = () => viewerRef.current?.increaseScale();
  const zoomOut = () => viewerRef.current?.decreaseScale();
  const fitWidth = () => {
    if (viewerRef.current) viewerRef.current.currentScaleValue = 'page-width';
  };
  useImperativeHandle(ref, () => ({ zoomIn, zoomOut, fitWidth }));

  return (
    <div className="pdf-pane">
      <div className="pdf-toolbar">
        <button className="btn quiet icon small" onClick={() => go(page - 1)} disabled={page <= 1} title="Previous page">
          ‹
        </button>
        <input
          className="page-input"
          value={pageInput}
          aria-label="Page"
          onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go(Number(pageInput) || page);
          }}
          onBlur={() => setPageInput(String(page))}
        />
        <span className="muted">of {pages || '…'}</span>
        <button className="btn quiet icon small" onClick={() => go(page + 1)} disabled={page >= pages} title="Next page">
          ›
        </button>
        <span className="spacer" />
        <button className="btn quiet icon small" onClick={zoomOut} title="Zoom out">
          −
        </button>
        <span className="zoom muted">{Math.round(scale * 100)}%</span>
        <button className="btn quiet icon small" onClick={zoomIn} title="Zoom in">
          +
        </button>
        <button className={`btn quiet small${fit ? ' on' : ''}`} onClick={fitWidth} title="Fit to width">
          Fit width
        </button>
      </div>
      <div className="pdf-body">
        {error ? (
          <div className="pdf-error">{error}</div>
        ) : (
          <div className="pdf-scroll" ref={containerRef} tabIndex={0}>
            <div className="pdfViewer" ref={viewerElRef} />
          </div>
        )}
      </div>
    </div>
  );
});
