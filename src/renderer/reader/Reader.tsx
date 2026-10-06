import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { MenuAction } from '../../shared/api';
import { allStages, purposeQuestionsField, type Guide } from '../../shared/guide';
import type { PaperDoc, PaperMeta, PaperPatch } from '../../shared/paper';
import { initialStage, progressFromDecision, progressFromEdit } from '../../shared/progress';
import { api } from '../api';
import { HighlightCard } from './HighlightCard';
import { PdfPane, type PdfHandle } from './PdfPane';
import { PassTab, PurposeTab, SharedNotes } from './Stages';
import { formatHighlights, newHighlightId, parseHighlights, type Highlight } from '../../shared/highlights';

export interface ReaderHandle {
  flush(): Promise<void>;
  reload(): Promise<void>;
  menu(action: MenuAction): void;
  /** Opens Find in the PDF; false when the paper has no PDF to search. */
  find(): boolean;
  /** Handles Escape outside a text field; false to let it go back to the library. */
  escape(): boolean;
}

interface Props {
  id: string;
  guide: Guide;
  isMac: boolean;
  today: string;
  onBack: () => void;
  onEdit: () => void;
  onError: (err: unknown) => void;
  onChanged: () => void;
  /** Draw the PDF's pages dark, in the given background tone. */
  darkPages: boolean;
  tone: string;
}

type SaveState = 'saved' | 'pending' | 'saving' | 'error';

const SAVE_DELAY = 600;
const TIMER_SAVE_EVERY = 30_000;

function mergePatch(a: PaperPatch, b: PaperPatch): PaperPatch {
  const answers = { ...(a.answers ?? {}) };
  for (const [s, fields] of Object.entries(b.answers ?? {})) answers[s] = { ...(answers[s] ?? {}), ...fields };
  return {
    meta: a.meta || b.meta ? { ...a.meta, ...b.meta } : undefined,
    answers: Object.keys(answers).length ? answers : undefined,
    notes: b.notes ?? a.notes,
    highlights: b.highlights ?? a.highlights,
    touch: a.touch || b.touch || undefined,
  };
}

function isEmpty(p: PaperPatch): boolean {
  return !p.meta && !p.answers && p.notes === undefined && p.highlights === undefined;
}

function readSplit(): number {
  try {
    const v = Number(localStorage.getItem('carrel.split'));
    return v > 0.2 && v < 0.8 ? v : 0.55;
  } catch {
    return 0.55;
  }
}

export const Reader = forwardRef<ReaderHandle, Props>(function Reader(props, ref) {
  const { id, guide, today, onError } = props;
  const [doc, setDoc] = useState<PaperDoc | null>(null);
  const docRef = useRef<PaperDoc | null>(null);
  docRef.current = doc;
  const [stageId, setStageId] = useState<string>(guide.purpose.id);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [pdfHidden, setPdfHidden] = useState(false);
  const [split, setSplit] = useState(readSplit);
  const [focus, setFocus] = useState(false);
  const [focusHint, setFocusHint] = useState(false);
  const pdfRef = useRef<PdfHandle>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ----- Loading -----

  useEffect(() => {
    let cancelled = false;
    api.readPaper(id).then(
      (d) => {
        if (cancelled) return;
        setDoc(d);
        setStageId(initialStage(d.meta, guide));
      },
      (err) => {
        onError(err);
        props.onBack();
      },
    );
    return () => {
      cancelled = true;
    };
    // Only when the paper changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ----- Autosave -----

  const pending = useRef<PaperPatch>({});
  const saveTimer = useRef<number | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const flushSaves = useCallback((): Promise<void> => {
    window.clearTimeout(saveTimer.current);
    const patch = pending.current;
    if (isEmpty(patch)) return chain.current;
    pending.current = {};
    setSaveState('saving');
    chain.current = chain.current.then(async () => {
      try {
        const result = await api.updatePaper(id, patch);
        setDoc((d) => (d ? { ...d, other: result.other, reviews: result.reviews, error: result.error } : d));
        setSaveState(isEmpty(pending.current) ? 'saved' : 'pending');
      } catch (err) {
        // Keep the changes so the next save tries again.
        pending.current = mergePatch(patch, pending.current);
        setSaveState('error');
        onError(err);
      }
    });
    return chain.current;
  }, [id, onError]);

  const queue = useCallback(
    (patch: PaperPatch, immediate = false) => {
      pending.current = mergePatch(pending.current, patch);
      setSaveState('pending');
      window.clearTimeout(saveTimer.current);
      if (immediate) void flushSaves();
      else saveTimer.current = window.setTimeout(() => void flushSaves(), SAVE_DELAY);
    },
    [flushSaves],
  );

  /** Updates the paper's details locally and queues them for saving. */
  const changeMeta = useCallback(
    (change: Partial<PaperMeta>, options: { touch?: boolean; immediate?: boolean } = {}) => {
      const d = docRef.current;
      if (!d) return;
      const meta = { ...d.meta, ...change };
      docRef.current = { ...d, meta };
      setDoc(docRef.current);
      queue({ meta: change, touch: options.touch ?? true }, options.immediate);
    },
    [queue],
  );

  const setAnswer = useCallback(
    (stage: string, field: string, value: string) => {
      const d = docRef.current;
      if (!d) return;
      const progress = progressFromEdit(d.meta, guide, stage);
      const next: PaperDoc = {
        ...d,
        meta: { ...d.meta, ...progress },
        answers: { ...d.answers, [stage]: { ...d.answers[stage], [field]: value } },
      };
      docRef.current = next;
      setDoc(next);
      queue({
        answers: { [stage]: { [field]: value } },
        meta: Object.keys(progress).length ? progress : undefined,
        touch: true,
      });
    },
    [guide, queue],
  );

  /** The highlight whose note is open beside the paper. */
  const [active, setActive] = useState<{ id: string; focus: boolean } | null>(null);

  /** Rewrites the paper's highlights through a function of the current list. */
  const changeHighlights = useCallback(
    (change: (items: Highlight[]) => Highlight[]) => {
      const d = docRef.current;
      if (!d) return;
      const parsed = parseHighlights(d.highlights);
      const highlights = formatHighlights({ ...parsed, items: change(parsed.items) });
      const progress = progressFromEdit(d.meta, guide, stageId);
      docRef.current = { ...d, highlights, meta: { ...d.meta, ...progress } };
      setDoc(docRef.current);
      queue({ highlights, meta: Object.keys(progress).length ? progress : undefined, touch: true });
    },
    [guide, queue, stageId],
  );

  const setNotes = useCallback(
    (notes: string) => {
      const d = docRef.current;
      if (!d) return;
      const progress = progressFromEdit(d.meta, guide, stageId);
      docRef.current = { ...d, notes, meta: { ...d.meta, ...progress } };
      setDoc(docRef.current);
      queue({ notes, meta: Object.keys(progress).length ? progress : undefined, touch: true });
    },
    [guide, queue, stageId],
  );

  // ----- Timer -----

  const [running, setRunning] = useState<{ stage: string; since: number } | null>(null);
  const runningRef = useRef(running);
  runningRef.current = running;
  const [, setTick] = useState(0);

  /** Adds the time counted so far to the paper; keeps the timer running if asked. */
  const commitTimer = useCallback(
    (keepRunning: boolean) => {
      const r = runningRef.current;
      const d = docRef.current;
      if (!r || !d) return;
      const seconds = Math.round((Date.now() - r.since) / 1000);
      const next = keepRunning ? { stage: r.stage, since: r.since + seconds * 1000 } : null;
      runningRef.current = next;
      setRunning(next);
      if (seconds <= 0) return;
      const change: Partial<PaperMeta> = {
        timeSpent: { ...d.meta.timeSpent, [r.stage]: (d.meta.timeSpent[r.stage] ?? 0) + seconds },
        ...progressFromEdit(d.meta, guide, r.stage),
      };
      changeMeta(change, { immediate: !keepRunning });
    },
    [changeMeta, guide],
  );

  const toggleTimer = useCallback(
    (stage: string) => {
      const r = runningRef.current;
      if (r) commitTimer(false);
      if (!r || r.stage !== stage) {
        const next = { stage, since: Date.now() };
        runningRef.current = next;
        setRunning(next);
      }
    },
    [commitTimer],
  );

  useEffect(() => {
    if (!running) return;
    const tick = window.setInterval(() => setTick((t) => t + 1), 1000);
    const save = window.setInterval(() => commitTimer(true), TIMER_SAVE_EVERY);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(save);
    };
  }, [running, commitTimer]);

  const elapsed = (stage: string) => {
    const base = doc?.meta.timeSpent[stage] ?? 0;
    return running?.stage === stage ? base + Math.floor((Date.now() - running.since) / 1000) : base;
  };

  // Save everything when leaving the paper.
  const latest = useRef({ commitTimer, flushSaves });
  latest.current = { commitTimer, flushSaves };
  useEffect(
    () => () => {
      latest.current.commitTimer(false);
      void latest.current.flushSaves();
    },
    [],
  );

  // ----- Page tracking -----

  const pageTimer = useRef<number | undefined>(undefined);
  const onPageChange = useCallback(
    (page: number) => {
      window.clearTimeout(pageTimer.current);
      pageTimer.current = window.setTimeout(() => {
        if (docRef.current && docRef.current.meta.lastPage !== page) changeMeta({ lastPage: page }, { touch: false });
      }, 800);
    },
    [changeMeta],
  );

  // ----- Decisions and tabs -----

  const stages = allStages(guide);
  const goTo = useCallback((stage: string) => {
    setStageId(stage);
    scrollRef.current?.scrollTo({ top: 0 });
  }, []);

  const decide = useCallback(
    (stage: string, optionId: string) => {
      const d = docRef.current;
      if (!d) return;
      changeMeta(progressFromDecision(d.meta, guide, stage, optionId, today), { immediate: true });
      const option = guide.passes.find((p) => p.id === stage)?.decisions.find((o) => o.id === optionId);
      if (option?.next) {
        if (runningRef.current?.stage === stage) commitTimer(false);
        goTo(option.next);
      }
      props.onChanged();
    },
    [changeMeta, commitTimer, goTo, guide, props, today],
  );

  // ----- Focus mode -----

  // Hides the toolbars and tabs, leaving the paper and the notes.
  const toggleFocus = useCallback(() => {
    setFocus((on) => {
      setFocusHint(!on);
      return !on;
    });
  }, []);
  // In focus mode a highlight's note floats over the paper, level with the highlight.
  const pdfSideRef = useRef<HTMLDivElement>(null);
  const [cardAt, setCardAt] = useState<{ top: number } | { bottom: number }>({ top: 12 });
  const activeId = active?.id ?? null;
  useEffect(() => {
    const side = pdfSideRef.current;
    if (!focus || !activeId || !side) return;
    const mark = side.querySelector(`.hl[data-id="${CSS.escape(activeId)}"]`)?.getBoundingClientRect();
    const box = side.getBoundingClientRect();
    if (!mark) return setCardAt({ top: 12 });
    // Below the highlight, or above it when it is near the bottom of the window.
    const below = mark.bottom - box.top + 8;
    if (below + 240 <= box.height) setCardAt({ top: Math.max(12, below) });
    else setCardAt({ bottom: Math.max(12, box.bottom - mark.top + 8) });
  }, [focus, activeId]);

  useEffect(() => {
    if (!focusHint) return;
    const t = window.setTimeout(() => setFocusHint(false), 2600);
    return () => window.clearTimeout(t);
  }, [focusHint]);

  // ----- Handle for the app -----

  useImperativeHandle(
    ref,
    () => ({
      flush: async () => {
        commitTimer(runningRef.current !== null);
        window.clearTimeout(pageTimer.current);
        await flushSaves();
      },
      reload: async () => {
        commitTimer(runningRef.current !== null);
        await flushSaves();
        try {
          const fresh = await api.readPaper(id);
          docRef.current = fresh;
          setDoc(fresh);
        } catch (err) {
          onError(err);
        }
      },
      menu: (action: MenuAction) => {
        const tab = /^tab-(\d)$/.exec(action);
        if (tab) {
          const stage = stages[Number(tab[1]) - 1];
          if (stage) goTo(stage.id);
        } else if (action === 'toggle-timer') {
          if (stageId !== guide.purpose.id) toggleTimer(stageId);
        } else if (action === 'toggle-pdf') {
          if (docRef.current?.pdfFile) setPdfHidden((h) => !h);
        } else if (action === 'zoom-in') pdfRef.current?.zoomIn();
        else if (action === 'zoom-out') pdfRef.current?.zoomOut();
        else if (action === 'fit-width') pdfRef.current?.fitWidth();
        else if (action === 'highlight') pdfRef.current?.highlightSelection();
        else if (action === 'find-next' || action === 'find-previous') {
          if (pdfRef.current) pdfRef.current.findAgain(action === 'find-previous');
        } else if (action === 'toggle-contents') {
          if (docRef.current?.pdfFile) {
            setPdfHidden(false);
            setTimeout(() => pdfRef.current?.toggleContents(), 0);
          }
        } else if (action === 'focus') toggleFocus();
      },
      find: () => {
        if (!docRef.current?.pdfFile) return false;
        setPdfHidden(false);
        setTimeout(() => pdfRef.current?.openFind(), 0);
        return true;
      },
      escape: () => {
        if (!focus) return false;
        toggleFocus();
        return true;
      },
    }),
    [commitTimer, flushSaves, focus, goTo, guide.purpose.id, id, onError, stageId, stages, toggleFocus, toggleTimer],
  );

  // ----- Divider -----

  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    const body = bodyRef.current;
    if (!body) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = body.getBoundingClientRect();
    const move = (ev: globalThis.PointerEvent) => {
      const v = Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width));
      setSplit(v);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
      setSplit((v) => {
        try {
          localStorage.setItem('carrel.split', String(v));
        } catch {
          /* only a convenience */
        }
        return v;
      });
    };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Parsed once per change, so the PDF only redraws highlights when they change.
  const highlightsText = doc?.highlights ?? '';
  const highlights = useMemo(() => parseHighlights(highlightsText).items, [highlightsText]);

  if (!doc) return <div className="loading">Opening…</div>;

  const showPdf = !!doc.pdfFile && !pdfHidden;
  // Focus mode with the PDF showing is just the paper; highlight notes float over it.
  const paperOnly = focus && showPdf;
  const activeHighlight = active ? highlights.find((h) => h.id === active.id) : undefined;
  const editHighlight = (id: string, change: Partial<Highlight>) =>
    changeHighlights((items) => items.map((h) => (h.id === id ? { ...h, ...change } : h)));
  const showHighlight = (h: Highlight) => {
    if (pdfHidden) setPdfHidden(false);
    setTimeout(() => pdfRef.current?.revealHighlight(h), pdfHidden ? 400 : 0);
  };
  const card = activeHighlight && (
    <HighlightCard
      key={activeHighlight.id}
      highlight={activeHighlight}
      focusNote={!!active?.focus}
      onNote={(note) => editHighlight(activeHighlight.id, { note })}
      onColor={(color) => editHighlight(activeHighlight.id, { color })}
      onShow={() => showHighlight(activeHighlight)}
      onRemove={() => {
        changeHighlights((items) => items.filter((h) => h.id !== activeHighlight.id));
        setActive(null);
      }}
      onClose={() => setActive(null)}
    />
  );
  const purposeField = purposeQuestionsField(guide);
  const purposeQuestions = purposeField ? doc.answers[guide.purpose.id]?.[purposeField.id] ?? '' : '';
  const stage = stages.find((s) => s.id === stageId) ?? stages[0];
  const saveLabel: Record<SaveState, string> = {
    saved: 'Saved',
    pending: 'Editing',
    saving: 'Saving…',
    error: 'Not saved',
  };

  return (
    <div className={`reader${focus ? ' focus' : ''}`}>
      {focus && props.isMac && <div className="focus-strip" />}
      {focus && (
        <button className="btn focus-exit" onClick={toggleFocus} title={`Leave focus mode (Esc or ${props.isMac ? '⇧⌘F' : 'Ctrl+Shift+F'})`}>
          Exit focus
        </button>
      )}
      {focusHint && (
        <div className="focus-hint" role="status">
          Focus mode. Click Exit focus, or press Esc, to leave.
        </div>
      )}
      <div className={`toolbar${props.isMac ? ' inset' : ''}`}>
        <button className="btn quiet" onClick={props.onBack} title="Back to the library">
          ‹ Library
        </button>
        <span className="title" title={doc.meta.title}>
          {doc.meta.title}
        </span>
        <span className="spacer" />
        <span className={`save-state ${saveState}`} aria-live="polite">
          {saveLabel[saveState]}
        </span>
        <button
          className="btn quiet small"
          onClick={toggleFocus}
          title={`Just the paper, nothing else (${props.isMac ? '⇧⌘F' : 'Ctrl+Shift+F'})`}
        >
          Focus
        </button>
        {doc.pdfFile && (
          <button className="btn quiet small" onClick={() => setPdfHidden((h) => !h)}>
            {pdfHidden ? 'Show PDF' : 'Hide PDF'}
          </button>
        )}
        <button className="btn quiet small" onClick={props.onEdit}>
          Details…
        </button>
      </div>

      {doc.error && <div className="banner">{doc.error} Your notes are shown read-only until it is fixed.</div>}

      <div className="reader-body" ref={bodyRef}>
        {showPdf && (
          <>
            <div className="pdf-side" ref={pdfSideRef} style={{ width: paperOnly ? '100%' : `${split * 100}%` }}>
              <PdfPane
                ref={pdfRef}
                paperId={doc.id}
                initialPage={doc.meta.lastPage}
                onPageChange={onPageChange}
                highlights={highlights}
                onAddHighlights={(parts) => {
                  const added = parts.map((p) => ({ ...p, id: newHighlightId() }));
                  changeHighlights((items) => [...items, ...added]);
                  // Open the note for the new highlight, ready to type.
                  setActive({ id: added[0].id, focus: true });
                }}
                activeHighlightId={active?.id ?? null}
                darkPages={props.darkPages}
                tone={props.tone}
                onActivateHighlight={(id) => setActive(id ? { id, focus: false } : null)}
              />
              {paperOnly && card && (
                <div className="hl-float" style={cardAt}>
                  {card}
                </div>
              )}
            </div>
            {!paperOnly && <div className="divider" onPointerDown={startDrag} role="separator" aria-orientation="vertical" />}
          </>
        )}
        <div className={`notes-side${showPdf ? '' : ' full'}`} hidden={paperOnly}>
          <nav className="tabs" role="tablist">
            {stages.map((s) => {
              // A tick means the stage is finished: a purpose chosen, or a decision that ends the pass.
              const option = s.kind === 'pass' ? s.decisions.find((d) => d.id === doc.meta.decisions[s.id]) : null;
              const decided = s.kind === 'pass' ? !!option && (!!option.next || option.status !== 'in-progress') : !!doc.meta.purpose;
              return (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={s.id === stage.id}
                  className={`tab${s.id === stage.id ? ' active' : ''}`}
                  onClick={() => goTo(s.id)}
                >
                  {s.kind === 'pass' ? <span className="tab-num">Pass {s.pass}</span> : null}
                  <span>{s.title}</span>
                  {decided && <span className="tab-done" aria-label="done">✓</span>}
                  {running?.stage === s.id && <span className="tab-running" aria-label="timer running" />}
                </button>
              );
            })}
          </nav>
          {!paperOnly && card}
          <div className="notes-scroll" ref={scrollRef}>
            <fieldset className="notes-content" disabled={!!doc.error}>
              {stage.kind === 'purpose' ? (
                <PurposeTab
                  stage={stage}
                  guide={guide}
                  meta={doc.meta}
                  answers={doc.answers[stage.id] ?? {}}
                  onPurpose={(purpose) => changeMeta({ purpose, ...progressFromEdit(doc.meta, guide, stage.id) }, { immediate: true })}
                  onAnswer={(field, v) => setAnswer(stage.id, field, v)}
                  onNext={() => goTo(guide.passes[0].id)}
                />
              ) : (
                <PassTab
                  stage={stage}
                  guide={guide}
                  meta={doc.meta}
                  answers={doc.answers[stage.id] ?? {}}
                  purposeQuestions={purposeQuestions}
                  hasPdf={!!doc.pdfFile}
                  pdfHidden={pdfHidden}
                  onTogglePdf={() => setPdfHidden((h) => !h)}
                  elapsed={elapsed(stage.id)}
                  timerRunning={running?.stage === stage.id}
                  onToggleTimer={() => toggleTimer(stage.id)}
                  onCheck={(ids) => changeMeta({ checklist: { ...doc.meta.checklist, [stage.id]: ids }, ...progressFromEdit(doc.meta, guide, stage.id) })}
                  onAnswer={(field, v) => setAnswer(stage.id, field, v)}
                  onDecide={(opt) => decide(stage.id, opt)}
                />
              )}
              <SharedNotes
                guide={guide}
                notes={doc.notes}
                other={doc.other}
                reviews={doc.reviews}
                onNotes={setNotes}
                highlights={highlights}
                activeHighlightId={active?.id ?? null}
                onOpenHighlight={(h) => {
                  setActive({ id: h.id, focus: false });
                  showHighlight(h);
                }}
              />
            </fieldset>
          </div>
        </div>
      </div>
    </div>
  );
});
