import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import {
  HIGHLIGHT_COLORS,
  mergeLineRects,
  type Highlight,
  type HighlightColor,
  type Rect,
} from '../../shared/highlights';
import type { Landmarks, Region } from '../../shared/landmarks';
import { api, errorText } from '../api';
import { readLandmarks } from '../landmarks';
import { loadPdfJs, loadPdfViewer } from '../pdf';

export interface PdfHandle {
  zoomIn(): void;
  zoomOut(): void;
  fitWidth(): void;
  goToPage(page: number): void;
  /** Highlights the current text selection, if there is one in the PDF. */
  highlightSelection(color?: HighlightColor): void;
  /** Scrolls a highlight into view. */
  revealHighlight(h: Highlight): void;
  /** Brings regions into view: centred if they fit, else from their top. Only the first region's page counts. */
  revealRegions(regions: Region[]): void;
}

/** Parts of the pages to keep lit while everything else is dimmed. */
export interface Spotlight {
  lit: (Region & { tag?: string })[];
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
  spotlight: Spotlight | null;
  /** Called once the paper's landmarks are found. */
  onLandmarks: (landmarks: Landmarks) => void;
  /** Shown floating over the bottom of the PDF. */
  overlay?: ReactNode;
}

/** The colour picker shown under a fresh text selection. */
type Popover = { x: number; y: number; parts: NewHighlight[] };

const COLOR_NAMES: Record<HighlightColor, string> = { yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink' };

export const PdfPane = forwardRef<PdfHandle, Props>(function PdfPane(props, ref) {
  const { paperId, initialPage, onPageChange } = props;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const highlightsRef = useRef(props.highlights);
  highlightsRef.current = props.highlights;
  const activeRef = useRef(props.activeHighlightId);
  activeRef.current = props.activeHighlightId;
  const spotlightRef = useRef(props.spotlight);
  spotlightRef.current = props.spotlight;
  const onLandmarksRef = useRef(props.onLandmarks);
  onLandmarksRef.current = props.onLandmarks;
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
        let looked = false;
        eventBus.on('pagerendered', (e: { pageNumber: number; source: { div: HTMLDivElement } }) => {
          drawHighlights(e.source.div, e.pageNumber, highlightsRef.current, activeRef.current);
          drawSpotlight(e.source.div, e.pageNumber, spotlightRef.current, false);
          // Find the landmarks once the first page is on screen, so they never hold it up.
          if (!looked && viewer?.pdfDocument) {
            looked = true;
            const doc = viewer.pdfDocument;
            readLandmarks(doc).then(
              (found) => !cancelled && onLandmarksRef.current(found),
              // No spotlight for this paper; reading is unaffected.
              (err) => console.warn('Could not find the parts of this PDF:', err),
            );
          }
        });
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
      if (div.querySelector('.canvasWrapper')) {
        drawHighlights(div, Number(div.dataset.pageNumber), props.highlights, props.activeHighlightId);
      }
    });
  }, [props.highlights, props.activeHighlightId]);

  // Redraw when the spotlight changes.
  useEffect(() => {
    containerRef.current?.querySelectorAll<HTMLDivElement>('.page[data-page-number]').forEach((div) => {
      if (div.querySelector('.canvasWrapper')) drawSpotlight(div, Number(div.dataset.pageNumber), props.spotlight, true);
    });
  }, [props.spotlight]);

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
      if (!pageDiv) return;
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
    revealRegions: (regions) => {
      const container = containerRef.current;
      const first = regions[0];
      if (!first) return;
      const pageDiv = container?.querySelector<HTMLDivElement>(`.page[data-page-number="${first.page}"]`);
      if (!container || !pageDiv) return go(first.page);
      // Page boxes are laid out before they are drawn, so this works for any page.
      const onPage = regions.filter((r) => r.page === first.page);
      const h = pageDiv.clientHeight;
      const top = pageDiv.offsetTop + Math.min(...onPage.map((r) => r.rect[1])) * h;
      const bottom = pageDiv.offsetTop + Math.max(...onPage.map((r) => r.rect[1] + r.rect[3])) * h;
      // Leave room at the bottom for the guide card.
      const view = container.clientHeight - 170;
      const target = bottom - top < view - 40 ? (top + bottom) / 2 - view / 2 : top - 40;
      container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    },
  }));

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
        {props.overlay && <div className="pdf-overlay">{props.overlay}</div>}
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

/**
 * Dims a page except for the spotlit regions on it, which get rounded, soft
 * edges and a glow. Drawn between the page image and its text, so selecting
 * and highlighting work as usual. `fresh` fades it in (a new stop, not a
 * page redrawn while scrolling).
 */
function drawSpotlight(pageDiv: HTMLDivElement, page: number, spotlight: Spotlight | null, fresh: boolean): void {
  pageDiv.querySelector(':scope > .carrel-spotlight')?.remove();
  if (!spotlight) return;
  const w = pageDiv.clientWidth;
  const h = pageDiv.clientHeight;
  if (!w || !h) return;
  // A little room around the text, in pixels, so the glow doesn't touch it.
  const grow = Math.max(3, w * 0.006);
  const radius = Math.max(6, w * 0.012);
  const lit = spotlight.lit
    .filter((r) => r.page === page)
    .map((r) => {
      const [x, y, rw, rh] = r.rect;
      const left = Math.max(0, x * w - grow);
      const top = Math.max(0, y * h - grow);
      return { left, top, width: Math.min(w, (x + rw) * w + grow) - left, height: Math.min(h, (y + rh) * h + grow) - top, tag: r.tag };
    });

  const NS = 'http://www.w3.org/2000/svg';
  const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>) => {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
  };
  const layer = document.createElement('div');
  layer.className = `carrel-spotlight${fresh ? ' fresh' : ''}`;
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, 'aria-hidden': 'true' });
  const id = `carrel-spot-${page}`;
  const defs = el('defs', {});
  const soften = el('filter', { id: `${id}-soft`, x: '-10%', y: '-10%', width: '120%', height: '120%' });
  soften.appendChild(el('feGaussianBlur', { stdDeviation: Math.max(2, grow * 0.6) }));
  defs.appendChild(soften);
  const mask = el('mask', { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: w, height: h });
  mask.appendChild(el('rect', { x: 0, y: 0, width: w, height: h, fill: 'white' }));
  const holes = el('g', { filter: `url(#${id}-soft)` });
  for (const r of lit) holes.appendChild(el('rect', { x: r.left, y: r.top, width: r.width, height: r.height, rx: radius, fill: 'black' }));
  mask.appendChild(holes);
  defs.appendChild(mask);
  svg.appendChild(defs);
  svg.appendChild(el('rect', { class: 'spot-dim', x: 0, y: 0, width: w, height: h, mask: `url(#${id})` }));
  for (const r of lit) {
    svg.appendChild(el('rect', { class: 'spot-glow', x: r.left, y: r.top, width: r.width, height: r.height, rx: radius }));
    svg.appendChild(el('rect', { class: 'spot-ring', x: r.left, y: r.top, width: r.width, height: r.height, rx: radius }));
  }
  layer.appendChild(svg);
  // Name the part on the page, just above its top-left corner.
  for (const r of lit) {
    if (!r.tag) continue;
    const tag = document.createElement('span');
    tag.className = 'spot-tag';
    tag.textContent = r.tag;
    tag.style.left = `${r.left + radius * 0.6}px`;
    tag.style.top = `${r.top}px`;
    layer.appendChild(tag);
  }
  const text = pageDiv.querySelector(':scope > .textLayer');
  if (text) text.before(layer);
  else pageDiv.appendChild(layer);
}
