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
import { darkPageColors } from '../../shared/pageColors';
import { darkenDrawnPage } from './darkPages';

export interface PdfHandle {
  zoomIn(): void;
  zoomOut(): void;
  fitWidth(): void;
  goToPage(page: number): void;
  /** Highlights the current text selection, if there is one in the PDF. */
  highlightSelection(color?: HighlightColor): void;
  /** Scrolls a highlight into view. */
  revealHighlight(h: Highlight): void;
}

/** A new highlight: the part of a selection on one page. */
export type NewHighlight = Omit<Highlight, 'id'>;

interface Props {
  paperId: string;
  initialPage: number | null;
  onPageChange: (page: number) => void;
  highlights: Highlight[];
  onAddHighlights: (items: NewHighlight[]) => void;
  /** The highlight whose note is open, if any. */
  activeHighlightId: string | null;
  onActivateHighlight: (id: string | null) => void;
  /** Draw the pages dark, in the given background tone. */
  darkPages: boolean;
  tone: string;
}

/** The colour picker shown under a fresh text selection. */
type Popover = { x: number; y: number; parts: NewHighlight[] };

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

const COLOR_NAMES: Record<HighlightColor, string> = { yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink' };

export const PdfPane = forwardRef<PdfHandle, Props>(function PdfPane(props, ref) {
  const { paperId, initialPage, onPageChange } = props;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const highlightsRef = useRef(props.highlights);
  highlightsRef.current = props.highlights;
  const activeRef = useRef(props.activeHighlightId);
  activeRef.current = props.activeHighlightId;
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
  const darkRef = useRef<string | null>(null);
  darkRef.current = props.darkPages ? props.tone : null;

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
          // Have PDF.js note where the pictures are, so dark pages can leave photos as they are.
          // The size is so large that it adds nothing else (it is meant for right-clicking images).
          imagesRightClickMinSize: 1e9,
        });
        linkService.setViewer(viewer);
        viewerRef.current = viewer;
        // pdf.js redraws pages as you scroll and zoom; draw highlights onto each one.
        eventBus.on(
          'pagerendered',
          (e: { pageNumber: number; source: { div: HTMLDivElement; canvas?: HTMLCanvasElement }; error?: unknown }) => {
            if (darkRef.current && !e.error) darkenDrawnPage(e.source, darkRef.current);
            drawHighlights(e.source.div, e.pageNumber, highlightsRef.current, activeRef.current);
          },
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

  // Pinch on a trackpad (or Ctrl + scroll) zooms around the pointer. Pages stretch at once
  // and are redrawn sharply once the fingers rest.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let target = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const viewer = viewerRef.current;
      if (!viewer || !viewer.pagesCount) return;
      // Keep tiny steps that pdf.js would round away, so slow pinches still move.
      if (Math.abs(target - viewer.currentScale) > 0.01) target = viewer.currentScale;
      const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY;
      target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, target * Math.exp(-Math.max(-25, Math.min(25, delta)) / 100)));
      // Note the spot under the pointer, so it can stay exactly there.
      const pageDiv = pageAt(el, e.clientX, e.clientY);
      const before = pageDiv?.getBoundingClientRect();
      viewer.updateScale({
        scaleFactor: target / viewer.currentScale,
        origin: [e.clientX, e.clientY],
        drawingDelay: 250,
      });
      if (pageDiv && before && before.width) {
        const after = pageDiv.getBoundingClientRect();
        const k = after.width / before.width;
        el.scrollLeft += after.left - (e.clientX - (e.clientX - before.left) * k);
        el.scrollTop += after.top - (e.clientY - (e.clientY - before.top) * k);
      }
      setPopover(null);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [error]);

  // Draw the pages again when they turn dark or light, or the tone changes.
  const pageTheme = darkRef.current;
  const shownTheme = useRef(pageTheme);
  useEffect(() => {
    if (shownTheme.current === pageTheme) return;
    shownTheme.current = pageTheme;
    viewerRef.current?.refresh();
  }, [pageTheme]);

  // Redraw when highlights change.
  useEffect(() => {
    containerRef.current?.querySelectorAll<HTMLDivElement>('.page[data-page-number]').forEach((div) => {
      if (div.querySelector('.canvasWrapper')) {
        drawHighlights(div, Number(div.dataset.pageNumber), props.highlights, props.activeHighlightId);
      }
    });
  }, [props.highlights, props.activeHighlightId]);

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
    const parts = [...byPage.entries()].map(([page, rects]) => ({
      page,
      rects: mergeLineRects(rects),
      color: 'yellow' as HighlightColor,
      text,
      note: '',
    }));
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

  // After a selection, offer colours. A click on a highlight opens its note beside the paper.
  const onMouseUp = (e: React.MouseEvent) => {
    const body = bodyRef.current;
    if (!body || e.button !== 0) return;
    const at = body.getBoundingClientRect();
    setTimeout(() => {
      const parts = selectionParts();
      if (parts.length) {
        setPopover({ x: e.clientX - at.left, y: e.clientY - at.top, parts });
        return;
      }
      const pageDiv = (e.target as HTMLElement).closest<HTMLDivElement>('.page[data-page-number]');
      if (!pageDiv) {
        // A click in the grey space around the pages closes an open note (but not the scrollbar).
        const scroll = containerRef.current!;
        const box = scroll.getBoundingClientRect();
        const onBar = e.clientX - box.left >= scroll.clientWidth || e.clientY - box.top >= scroll.clientHeight;
        if (activeRef.current && !onBar) props.onActivateHighlight(null);
        return;
      }
      const box = pageDiv.getBoundingClientRect();
      const fx = (e.clientX - box.left) / box.width;
      const fy = (e.clientY - box.top) / box.height;
      const page = Number(pageDiv.dataset.pageNumber);
      const hit = highlightsRef.current.find(
        (h) => h.page === page && h.rects.some(([x, y, w, hh]) => fx >= x && fx <= x + w && fy >= y && fy <= y + hh),
      );
      if (hit) props.onActivateHighlight(hit.id);
      else if (activeRef.current) props.onActivateHighlight(null);
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
    revealHighlight: (h) => {
      go(h.page);
      // The page may still be drawing; wait for the highlight to appear, then centre it.
      let tries = 0;
      const tryScroll = () => {
        const mark = containerRef.current?.querySelector(`.hl[data-id="${CSS.escape(h.id)}"]`);
        if (mark) mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
        else if (tries++ < 20) setTimeout(tryScroll, 60);
      };
      tryScroll();
    },
  }));

  return (
    <div
      className={`pdf-pane${props.darkPages ? ' dark-pages' : ''}`}
      style={props.darkPages ? ({ '--dark-paper': darkPageColors(props.tone).paper } as React.CSSProperties) : undefined}
    >
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
        {popover && (
          <div
            className="hl-popover"
            style={{ left: popover.x, top: popover.y + 14 }}
            onMouseDown={(e) => e.preventDefault() /* keep the text selection */}
          >
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                className={`hl-dot hl-${c}`}
                title={`Highlight in ${COLOR_NAMES[c].toLowerCase()}`}
                aria-label={`Highlight in ${COLOR_NAMES[c].toLowerCase()}`}
                onClick={() => addFromSelection(c, popover.parts)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

/** The page at a point on screen, or the nearest one. */
function pageAt(container: HTMLElement, x: number, y: number): HTMLDivElement | null {
  const hit = document.elementFromPoint(x, y)?.closest<HTMLDivElement>('.page[data-page-number]');
  if (hit && container.contains(hit)) return hit;
  let best: HTMLDivElement | null = null;
  let bestGap = Infinity;
  for (const div of container.querySelectorAll<HTMLDivElement>('.page[data-page-number]')) {
    const box = div.getBoundingClientRect();
    const gap = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
    if (gap < bestGap) [best, bestGap] = [div, gap];
    if (!gap) break;
  }
  return best;
}

/** Draws a page's highlights in a layer between the page image and its text. */
function drawHighlights(pageDiv: HTMLDivElement, page: number, highlights: Highlight[], activeId: string | null): void {
  pageDiv.querySelector(':scope > .carrel-highlights')?.remove();
  const mine = highlights.filter((h) => h.page === page);
  if (!mine.length) return;
  const layer = document.createElement('div');
  layer.className = 'carrel-highlights';
  for (const h of mine) {
    // A small dot in the margin marks a highlight that has a note.
    if (h.note.trim() && h.rects.length) {
      const [x, y, , hh] = h.rects[0];
      const dot = document.createElement('div');
      dot.className = `hl-note-dot hl-${h.color}`;
      dot.style.left = `${Math.max(0.005, x - 0.022) * 100}%`;
      dot.style.top = `${(y + hh / 2) * 100}%`;
      layer.appendChild(dot);
    }
    for (const [x, y, w, hh] of h.rects) {
      const mark = document.createElement('div');
      mark.className = `hl hl-${h.color}${h.id === activeId ? ' active' : ''}`;
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
