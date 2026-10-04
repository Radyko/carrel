import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import {
  HIGHLIGHT_COLORS,
  mergeLineRects,
  type Highlight,
  type HighlightColor,
  type Rect,
} from '../../shared/highlights';
import { api, errorText } from '../api';
import { loadPdfJs, loadPdfViewer } from '../pdf';

export interface PdfHandle {
  zoomIn(): void;
  zoomOut(): void;
  fitWidth(): void;
  goToPage(page: number): void;
  /** Highlights the current text selection, if there is one in the PDF. */
  highlightSelection(color?: HighlightColor): void;
}

/** A new highlight: the part of a selection on one page. */
export type NewHighlight = Omit<Highlight, 'id'>;

interface Props {
  paperId: string;
  initialPage: number | null;
  onPageChange: (page: number) => void;
  highlights: Highlight[];
  onAddHighlights: (items: NewHighlight[]) => void;
  onRecolorHighlight: (id: string, color: HighlightColor) => void;
  onDeleteHighlight: (id: string) => void;
}

type Popover =
  | { kind: 'selection'; x: number; y: number; parts: NewHighlight[] }
  | { kind: 'highlight'; x: number; y: number; id: string };

const COLOR_NAMES: Record<HighlightColor, string> = { yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink' };

export const PdfPane = forwardRef<PdfHandle, Props>(function PdfPane(props, ref) {
  const { paperId, initialPage, onPageChange } = props;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const highlightsRef = useRef(props.highlights);
  highlightsRef.current = props.highlights;
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
        // pdf.js redraws pages as you scroll and zoom; draw highlights onto each one.
        eventBus.on('pagerendered', (e: { pageNumber: number; source: { div: HTMLDivElement } }) =>
          drawHighlights(e.source.div, e.pageNumber, highlightsRef.current),
        );
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

  // Redraw when highlights change.
  useEffect(() => {
    containerRef.current?.querySelectorAll<HTMLDivElement>('.page[data-page-number]').forEach((div) => {
      if (div.querySelector('.canvasWrapper')) drawHighlights(div, Number(div.dataset.pageNumber), props.highlights);
    });
  }, [props.highlights]);

  /** The selection in the PDF, split by page and turned into page fractions. */
  const selectionParts = useCallback((): NewHighlight[] => {
    const container = containerRef.current;
    const sel = window.getSelection();
    if (!container || !sel || sel.isCollapsed || !sel.rangeCount) return [];
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return [];
    const pages = Array.from(container.querySelectorAll<HTMLDivElement>('.page[data-page-number]')).map((div) => ({
      page: Number(div.dataset.pageNumber),
      box: div.getBoundingClientRect(),
    }));
    const byPage = new Map<number, Rect[]>();
    for (const r of Array.from(range.getClientRects())) {
      if (r.width < 1 || r.height < 1) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const p = pages.find((p) => cx >= p.box.left && cx <= p.box.right && cy >= p.box.top && cy <= p.box.bottom);
      if (!p) continue;
      const rect: Rect = [
        (r.left - p.box.left) / p.box.width,
        (r.top - p.box.top) / p.box.height,
        r.width / p.box.width,
        r.height / p.box.height,
      ];
      // Skip boxes of whole elements (a selection across pages includes them).
      if (rect[3] > 0.08) continue;
      byPage.set(p.page, [...(byPage.get(p.page) ?? []), rect]);
    }
    const text = sel.toString().replace(/\s+/g, ' ').trim();
    const parts = [...byPage.entries()].map(([page, rects]) => ({ page, rects: mergeLineRects(rects), color: 'yellow' as HighlightColor, text }));
    if (parts.length > 1) {
      // Split the quote roughly between pages; the rectangles are what matter on screen.
      parts.forEach((p, i) => (p.text = i === 0 ? text : `(continued) ${text}`));
    }
    return parts;
  }, []);

  const addFromSelection = useCallback(
    (color: HighlightColor = 'yellow', parts = selectionParts()) => {
      if (!parts.length) return;
      props.onAddHighlights(parts.map((p) => ({ ...p, color })));
      window.getSelection()?.removeAllRanges();
      setPopover(null);
    },
    [props, selectionParts],
  );

  // After a selection, offer colours; after a click on a highlight, offer to change or remove it.
  const onMouseUp = (e: React.MouseEvent) => {
    const body = bodyRef.current;
    if (!body || e.button !== 0) return;
    const at = body.getBoundingClientRect();
    setTimeout(() => {
      const parts = selectionParts();
      if (parts.length) {
        setPopover({ kind: 'selection', x: e.clientX - at.left, y: e.clientY - at.top, parts });
        return;
      }
      const pageDiv = (e.target as HTMLElement).closest<HTMLDivElement>('.page[data-page-number]');
      if (!pageDiv) return setPopover(null);
      const box = pageDiv.getBoundingClientRect();
      const fx = (e.clientX - box.left) / box.width;
      const fy = (e.clientY - box.top) / box.height;
      const page = Number(pageDiv.dataset.pageNumber);
      const hit = highlightsRef.current.find(
        (h) => h.page === page && h.rects.some(([x, y, w, hh]) => fx >= x && fx <= x + w && fy >= y && fy <= y + hh),
      );
      setPopover(hit ? { kind: 'highlight', x: e.clientX - at.left, y: e.clientY - at.top, id: hit.id } : null);
    }, 0);
  };

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
  useImperativeHandle(ref, () => ({
    zoomIn,
    zoomOut,
    fitWidth,
    goToPage: go,
    highlightSelection: (color) => addFromSelection(color),
  }));

  const popoverHighlight = popover?.kind === 'highlight' ? props.highlights.find((h) => h.id === popover.id) : undefined;

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
      <div className="pdf-body" ref={bodyRef}>
        {error ? (
          <div className="pdf-error">{error}</div>
        ) : (
          <div
            className="pdf-scroll"
            ref={containerRef}
            tabIndex={0}
            onMouseUp={onMouseUp}
            onMouseDown={() => setPopover(null)}
            onScroll={() => popover && setPopover(null)}
          >
            <div className="pdfViewer" ref={viewerElRef} />
          </div>
        )}
        {popover && (popover.kind === 'selection' || popoverHighlight) && (
          <div
            className="hl-popover"
            style={{ left: popover.x, top: popover.y + 14 }}
            onMouseDown={(e) => e.preventDefault() /* keep the text selection */}
          >
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                className={`hl-dot hl-${c}${popoverHighlight?.color === c ? ' on' : ''}`}
                title={popover.kind === 'selection' ? `Highlight in ${COLOR_NAMES[c].toLowerCase()}` : COLOR_NAMES[c]}
                aria-label={COLOR_NAMES[c]}
                onClick={() =>
                  popover.kind === 'selection'
                    ? addFromSelection(c, popover.parts)
                    : (props.onRecolorHighlight(popover.id, c), setPopover(null))
                }
              />
            ))}
            {popoverHighlight && (
              <>
                <span className="hl-sep" />
                <button
                  className="btn quiet small"
                  onClick={() => {
                    void navigator.clipboard.writeText(popoverHighlight.text);
                    setPopover(null);
                  }}
                >
                  Copy
                </button>
                <button
                  className="btn quiet small"
                  onClick={() => {
                    props.onDeleteHighlight(popoverHighlight.id);
                    setPopover(null);
                  }}
                >
                  Remove
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

/** Draws a page's highlights in a layer between the page image and its text. */
function drawHighlights(pageDiv: HTMLDivElement, page: number, highlights: Highlight[]): void {
  pageDiv.querySelector(':scope > .carrel-highlights')?.remove();
  const mine = highlights.filter((h) => h.page === page);
  if (!mine.length) return;
  const layer = document.createElement('div');
  layer.className = 'carrel-highlights';
  for (const h of mine) {
    for (const [x, y, w, hh] of h.rects) {
      const mark = document.createElement('div');
      mark.className = `hl hl-${h.color}`;
      mark.dataset.id = h.id;
      mark.style.left = `${x * 100}%`;
      mark.style.top = `${y * 100}%`;
      mark.style.width = `${w * 100}%`;
      mark.style.height = `${hh * 100}%`;
      layer.appendChild(mark);
    }
  }
  const canvas = pageDiv.querySelector(':scope > .canvasWrapper');
  if (canvas) canvas.after(layer);
  else pageDiv.prepend(layer);
}
