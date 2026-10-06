import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { EventBus, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import {
  HIGHLIGHT_COLORS,
  mergeLineRects,
  type Highlight,
  type HighlightColor,
  type Rect,
} from '../../shared/highlights';
import type { Section } from '../../shared/pdfSections';
import { api, errorText } from '../api';
import { loadPdfJs, loadPdfViewer, pdfSections } from '../pdf';

export interface PdfHandle {
  zoomIn(): void;
  zoomOut(): void;
  fitWidth(): void;
  goToPage(page: number): void;
  /** Highlights the current text selection, if there is one in the PDF. */
  highlightSelection(color?: HighlightColor): void;
  /** Scrolls a highlight into view. */
  revealHighlight(h: Highlight): void;
  /** Opens the find bar, ready to type. */
  openFind(): void;
  /** Goes to the next (or previous) match, or opens the find bar. */
  findAgain(previous: boolean): void;
  toggleContents(): void;
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
}

/** The colour picker shown under a fresh text selection. */
type Popover = { x: number; y: number; parts: NewHighlight[] };

function readContentsOpen(): boolean {
  try {
    return localStorage.getItem('carrel.contents') === 'open';
  } catch {
    return false;
  }
}

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
  const eventBusRef = useRef<EventBus | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(initialPage ?? 1);
  const [pageInput, setPageInput] = useState(String(initialPage ?? 1));
  const [pages, setPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [fit, setFit] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const initialPageRef = useRef(initialPage);
  const [find, setFind] = useState<{ query: string; current: number; total: number; searched: boolean } | null>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const [contentsOpen, setContentsOpen] = useState(readContentsOpen);
  const contentsOpenRef = useRef(contentsOpen);
  contentsOpenRef.current = contentsOpen;
  const [sections, setSections] = useState<Section[] | null>(null);
  /** The page and height (in PDF units) at the top of the view. */
  const [viewTop, setViewTop] = useState({ page: 1, top: Infinity });

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
        const findController = new v.PDFFindController({ eventBus, linkService });
        viewer = new v.PDFViewer({
          container,
          viewer: viewerElRef.current!,
          eventBus,
          linkService,
          findController,
          textLayerMode: 1,
        });
        eventBusRef.current = eventBus;
        linkService.setViewer(viewer);
        viewerRef.current = viewer;
        // pdf.js redraws pages as you scroll and zoom; draw highlights onto each one.
        eventBus.on('pagerendered', (e: { pageNumber: number; source: { div: HTMLDivElement } }) =>
          drawHighlights(e.source.div, e.pageNumber, highlightsRef.current, activeRef.current),
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
        const onMatches = (e: { matchesCount: { current: number; total: number } }) =>
          setFind((f) => f && { ...f, ...e.matchesCount, searched: true });
        eventBus.on('updatefindmatchescount', onMatches);
        eventBus.on('updatefindcontrolstate', (e: { state: number; matchesCount: { current: number; total: number } }) => {
          // Pending searches report nothing yet; wait for the result.
          if (e.state !== v.FindState.PENDING) onMatches(e);
        });
        eventBus.on('updateviewarea', (e: { location?: { pageNumber: number; top: number } }) => {
          // Only the contents list needs this, so don't redraw for it otherwise.
          if (e.location && contentsOpenRef.current) setViewTop({ page: e.location.pageNumber, top: e.location.top });
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
        docRef.current = doc;
        viewer.setDocument(doc);
        linkService.setDocument(doc);
      } catch (err) {
        if (!cancelled) setError(`The PDF could not be opened: ${errorText(err)}`);
      }
    })();
    return () => {
      cancelled = true;
      viewerRef.current = null;
      eventBusRef.current = null;
      docRef.current = null;
      setSections(null);
      setFind(null);
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

  // Sections are found the first time the contents list is open for this paper.
  useEffect(() => {
    const doc = docRef.current;
    if (!contentsOpen || !pages || !doc || sections) return;
    let cancelled = false;
    pdfSections(doc).then(
      (found) => !cancelled && setSections(found),
      () => !cancelled && setSections([]),
    );
    return () => {
      cancelled = true;
    };
  }, [contentsOpen, pages, sections]);

  const toggleContents = () =>
    setContentsOpen((open) => {
      try {
        localStorage.setItem('carrel.contents', open ? 'closed' : 'open');
      } catch {
        /* only a convenience */
      }
      return !open;
    });

  const goToSection = (s: Section) => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.pagesCount) return;
    viewer.scrollPageIntoView({
      pageNumber: s.page,
      destArray: s.y === null ? undefined : [null, { name: 'XYZ' }, null, s.y + 6, null],
      ignoreDestinationZoom: true,
    });
  };
  // The section being read: the last one that starts above the top of the view, or just below it.
  const started = (s: Section) => s.page < viewTop.page || (s.page === viewTop.page && (s.y === null || s.y >= viewTop.top - 60));
  const currentSection = sections ? sections.reduce<Section | null>((cur, s) => (started(s) ? s : cur), null) : null;
  const contentsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    contentsRef.current?.querySelector('.contents-item.current')?.scrollIntoView({ block: 'nearest' });
  }, [currentSection]);

  // ----- Find -----

  const search = (query: string, again = false, previous = false) => {
    eventBusRef.current?.dispatch('find', {
      source: null,
      type: again ? 'again' : '',
      query,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: previous,
      matchDiacritics: false,
    });
  };
  const openFind = () => {
    const sel = window.getSelection();
    const inPdf = !!sel && !sel.isCollapsed && !!containerRef.current?.contains(sel.anchorNode);
    const picked = inPdf ? sel.toString().replace(/\s+/g, ' ').trim() : '';
    if (picked && picked.length <= 80) {
      setFind({ query: picked, current: 0, total: 0, searched: false });
      search(picked);
    } else {
      setFind((f) => f ?? { query: '', current: 0, total: 0, searched: false });
    }
    setTimeout(() => findInputRef.current?.select(), 0);
  };
  const closeFind = () => {
    eventBusRef.current?.dispatch('findbarclose', { source: null });
    setFind(null);
    containerRef.current?.focus();
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
    openFind,
    findAgain: (previous) => {
      if (find?.query) search(find.query, true, previous);
      else openFind();
    },
    toggleContents,
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
    <div className="pdf-pane">
      <div className="pdf-toolbar">
        <button
          className={`btn quiet small${contentsOpen ? ' on' : ''}`}
          onClick={toggleContents}
          title="Show or hide the paper's sections"
          aria-pressed={contentsOpen}
        >
          Contents
        </button>
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
        <button className={`btn quiet icon small${find ? ' on' : ''}`} onClick={() => (find ? closeFind() : openFind())} title="Find in this paper (⌘F)" aria-label="Find in this paper">
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10.3 10.3 15 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {find && (
        <div className="pdf-find">
          <input
            ref={findInputRef}
            className="find-input"
            type="search"
            placeholder="Find in this paper"
            aria-label="Find in this paper"
            value={find.query}
            autoFocus
            onChange={(e) => {
              const query = e.target.value;
              setFind({ query, current: 0, total: 0, searched: false });
              search(query);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (find.query) search(find.query, true, e.shiftKey);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeFind();
              }
            }}
          />
          <span className="find-count muted" aria-live="polite">
            {!find.query.trim() || !find.searched ? '' : find.total ? `${find.current} of ${find.total}` : 'Not found'}
          </span>
          <button className="btn quiet icon small" onClick={() => search(find.query, true, true)} disabled={!find.total} title="Previous match (⇧Return)" aria-label="Previous match">
            ↑
          </button>
          <button className="btn quiet icon small" onClick={() => search(find.query, true)} disabled={!find.total} title="Next match (Return)" aria-label="Next match">
            ↓
          </button>
          <button className="btn quiet small" onClick={closeFind}>
            Done
          </button>
        </div>
      )}
      <div className={`pdf-body${contentsOpen ? ' with-contents' : ''}`} ref={bodyRef}>
        {contentsOpen && (
          <nav className="pdf-contents" aria-label="Sections" ref={contentsRef}>
            {sections === null ? (
              <p className="muted">Finding sections…</p>
            ) : sections.length === 0 ? (
              <p className="muted">Carrel couldn’t find section headings in this PDF.</p>
            ) : (
              sections.map((s, i) => (
                <button
                  key={i}
                  className={`contents-item level-${s.level}${s === currentSection ? ' current' : ''}`}
                  onClick={() => goToSection(s)}
                  title={`${s.title} · page ${s.page}`}
                >
                  {s.title}
                </button>
              ))
            )}
          </nav>
        )}
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
