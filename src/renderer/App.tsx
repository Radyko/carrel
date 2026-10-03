import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, MenuAction } from '../shared/api';
import { localDate } from '../shared/dates';
import { distinct, sortPapers } from '../shared/libraryView';
import type { PaperMeta, PaperSummary } from '../shared/paper';
import { isDue } from '../shared/review';
import { api, errorText } from './api';
import { Library, type LibraryUi } from './library/Library';
import { PaperForm } from './library/PaperForm';
import { pdfTitle } from './pdf';
import { Reader, type ReaderHandle } from './reader/Reader';
import { ReviewScreen } from './review/ReviewScreen';
import { SettingsDialog } from './SettingsDialog';

type View = { screen: 'library' } | { screen: 'reader'; id: string } | { screen: 'review'; ids: string[] };

interface FormState {
  mode: 'new' | 'edit';
  id?: string;
  initial: Partial<PaperMeta>;
  pdfPath?: string;
  pdfName?: string;
}

interface PendingPdf {
  path: string;
  name: string;
  data: Uint8Array;
}

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>({ screen: 'library' });
  const [ui, setUiState] = useState<LibraryUi>({
    filter: { kind: 'group', id: 'all' },
    search: '',
    sort: { key: 'lastWorked', dir: 'desc' },
    selected: null,
  });
  const [form, setForm] = useState<FormState | null>(null);
  const [pdfQueue, setPdfQueue] = useState<PendingPdf[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [today, setToday] = useState(localDate());
  const searchRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<ReaderHandle>(null);

  const isMac = (state?.platform ?? api.platform) === 'darwin';
  const setUi = useCallback((change: Partial<LibraryUi>) => setUiState((u) => ({ ...u, ...change })), []);

  const report = useCallback((err: unknown) => setError(errorText(err)), []);

  const refresh = useCallback(async () => {
    try {
      setPapers(await api.listPapers());
      setLoaded(true);
    } catch (err) {
      report(err);
    }
  }, [report]);

  useEffect(() => {
    api.init().then(setState, report);
    void refresh();
  }, [refresh, report]);

  // Files may change outside the app: rescan whenever the window regains focus.
  useEffect(() => {
    const onFocus = async () => {
      setToday(localDate());
      try {
        const next = await api.reloadGuide();
        setState((s) => (s && JSON.stringify(s) === JSON.stringify(next) ? s : next));
      } catch (err) {
        report(err);
      }
      await readerRef.current?.reload();
      await refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh, report]);

  // Save anything pending before the window closes.
  useEffect(() => api.onFlush(async () => void (await readerRef.current?.flush())), []);

  const topics = useMemo(() => distinct(papers.flatMap((p) => p.meta.topics)), [papers]);
  const courses = useMemo(() => distinct(papers.map((p) => p.meta.course)), [papers]);
  const dueIds = useMemo(
    () => sortPapers(papers.filter((p) => isDue(p.meta, today)), { key: 'lastWorked', dir: 'asc' }).map((p) => p.id),
    [papers, today],
  );

  // ----- Adding papers -----

  const queuePdfs = useCallback((pdfs: PendingPdf[]) => setPdfQueue((q) => [...q, ...pdfs]), []);

  // Show the form for the next PDF in the queue, pre-filled with its title.
  useEffect(() => {
    if (form || pdfQueue.length === 0) return;
    const next = pdfQueue[0];
    let cancelled = false;
    void pdfTitle(next.data).then((title) => {
      if (cancelled) return;
      const course = ui.filter.kind === 'course' ? ui.filter.value : '';
      const topicsPre = ui.filter.kind === 'topic' ? [ui.filter.value] : [];
      setForm({ mode: 'new', initial: { title, course, topics: topicsPre }, pdfPath: next.path, pdfName: next.name });
    });
    return () => {
      cancelled = true;
    };
  }, [form, pdfQueue, ui.filter]);

  const addPdf = useCallback(async () => {
    try {
      const chosen = await api.choosePdf();
      if (chosen) queuePdfs([chosen]);
    } catch (err) {
      report(err);
    }
  }, [queuePdfs, report]);

  const addEntry = useCallback(() => {
    const course = ui.filter.kind === 'course' ? ui.filter.value : '';
    const topicsPre = ui.filter.kind === 'topic' ? [ui.filter.value] : [];
    setForm({ mode: 'new', initial: { course, topics: topicsPre } });
  }, [ui.filter]);

  const closeForm = useCallback(() => {
    setForm((f) => {
      if (f?.pdfPath) setPdfQueue((q) => q.slice(1));
      return null;
    });
  }, []);

  async function saveForm(meta: Partial<PaperMeta>) {
    if (!form) return;
    try {
      if (form.mode === 'edit' && form.id) {
        await api.updatePaper(form.id, { meta });
        await readerRef.current?.reload();
      } else {
        const doc = await api.createPaper({ meta, pdfPath: form.pdfPath ?? null });
        setUi({ selected: doc.id, search: '' });
      }
      await refresh();
      closeForm();
    } catch (err) {
      report(err);
    }
  }

  const editPaper = useCallback(
    async (id: string) => {
      try {
        const doc = await api.readPaper(id);
        setForm({ mode: 'edit', id, initial: doc.meta });
      } catch (err) {
        report(err);
      }
    },
    [report],
  );

  // ----- Drag and drop -----

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      const pdfs = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
      if (files.length && !pdfs.length) {
        setError('Only PDF files can be added. To add a paper without a PDF, use “Add without PDF”.');
        return;
      }
      const pending: PendingPdf[] = [];
      for (const f of pdfs) {
        const path = api.pathForFile(f);
        if (path) pending.push({ path, name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
      }
      queuePdfs(pending);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [queuePdfs]);

  // ----- Paper actions -----

  const openPaper = useCallback((id: string) => {
    setUi({ selected: id });
    setView({ screen: 'reader', id });
  }, [setUi]);

  const backToLibrary = useCallback(async () => {
    await readerRef.current?.flush();
    setView({ screen: 'library' });
    await refresh();
  }, [refresh]);

  const startReview = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      await readerRef.current?.flush();
      setView({ screen: 'review', ids });
    },
    [],
  );

  const reveal = useCallback((id: string) => void api.revealPaper(id).catch(report), [report]);

  const trash = useCallback(
    async (id: string) => {
      try {
        await readerRef.current?.flush();
        if (!(await api.trashPaper(id))) return;
        const list = await api.listPapers();
        setPapers(list);
        setUiState((u) => (u.selected === id ? { ...u, selected: null } : u));
        setView((v) => (v.screen === 'reader' && v.id === id ? { screen: 'library' } : v));
      } catch (err) {
        report(err);
      }
    },
    [report],
  );

  const contextMenu = useCallback(
    async (id: string) => {
      const paper = papers.find((p) => p.id === id);
      const action = await api.paperContextMenu(id, { due: !!paper && isDue(paper.meta, today) });
      if (action === 'open') openPaper(id);
      else if (action === 'review') void startReview([id]);
      else if (action === 'edit') void editPaper(id);
      else if (action === 'reveal') reveal(id);
      else if (action === 'trash') void trash(id);
    },
    [papers, today, openPaper, startReview, editPaper, reveal, trash],
  );

  // ----- Menu and keyboard -----

  const currentId = view.screen === 'reader' ? view.id : ui.selected;
  const menuRef = useRef<(action: MenuAction) => void>(() => {});
  menuRef.current = (action: MenuAction) => {
    if (form || settingsOpen) return;
    switch (action) {
      case 'add-pdf':
        return void addPdf();
      case 'add-entry':
        return addEntry();
      case 'settings':
        return setSettingsOpen(true);
      case 'library':
        return void backToLibrary();
      case 'review':
        return void startReview(dueIds);
      case 'find':
        if (view.screen !== 'library') void backToLibrary();
        setTimeout(() => searchRef.current?.select(), 0);
        return;
      case 'open':
        if (view.screen === 'library' && ui.selected) openPaper(ui.selected);
        return;
      case 'edit':
        if (currentId) void editPaper(currentId);
        return;
      case 'reveal':
        if (currentId) reveal(currentId);
        return;
      case 'trash':
        if (currentId && view.screen !== 'review') void trash(currentId);
        return;
      default:
        readerRef.current?.menu(action);
    }
  };
  useEffect(() => api.onMenu((a) => menuRef.current(a)), []);

  // ----- Guide and settings -----

  async function chooseLibrary() {
    try {
      await readerRef.current?.flush();
      const next = await api.chooseLibrary();
      if (!next) return;
      setState(next);
      setView({ screen: 'library' });
      setUi({ selected: null, filter: { kind: 'group', id: 'all' } });
      await refresh();
    } catch (err) {
      report(err);
    }
  }

  async function restoreGuide() {
    try {
      setState(await api.restoreGuide());
      await refresh();
    } catch (err) {
      report(err);
    }
  }

  if (!state) {
    return (
      <div className="app">
        {error ? <ErrorBanner text={error} onClose={() => setError(null)} /> : <div className="loading">Opening your library…</div>}
      </div>
    );
  }

  return (
    <div className="app">
      {state.guideProblem && (
        <div className="banner" role="status">
          <p>{state.guideProblem}</p>
          {state.guideMissing ? (
            <button className="btn small" onClick={restoreGuide}>
              Restore default guide
            </button>
          ) : (
            <button className="btn small" onClick={() => api.revealGuide()}>
              Show guide file
            </button>
          )}
        </div>
      )}
      {error && <ErrorBanner text={error} onClose={() => setError(null)} />}

      {view.screen === 'library' && (
        <Library
          guide={state.guide}
          papers={papers}
          loaded={loaded}
          today={today}
          ui={ui}
          setUi={setUi}
          isMac={isMac}
          searchRef={searchRef}
          onOpen={openPaper}
          onReview={startReview}
          onAddPdf={addPdf}
          onAddEntry={addEntry}
          onEdit={editPaper}
          onReveal={reveal}
          onTrash={trash}
          onContextMenu={contextMenu}
          onSettings={() => setSettingsOpen(true)}
        />
      )}
      {view.screen === 'reader' && (
        <Reader
          key={view.id}
          ref={readerRef}
          id={view.id}
          guide={state.guide}
          isMac={isMac}
          today={today}
          onBack={backToLibrary}
          onEdit={() => editPaper(view.id)}
          onReveal={() => reveal(view.id)}
          onError={report}
          onChanged={refresh}
        />
      )}
      {view.screen === 'review' && (
        <ReviewScreen
          ids={view.ids}
          guide={state.guide}
          today={today}
          onDone={backToLibrary}
          onError={report}
        />
      )}

      {form && (
        <PaperForm
          key={form.pdfPath ?? form.id ?? 'new'}
          mode={form.mode}
          initial={form.initial}
          pdfName={form.pdfName}
          topics={topics}
          courses={courses}
          onSave={saveForm}
          onCancel={closeForm}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          state={state}
          onChooseLibrary={chooseLibrary}
          onRevealLibrary={() => api.revealLibrary()}
          onRevealGuide={() => api.revealGuide()}
          onRestoreGuide={restoreGuide}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {dragging && <div className="drop-overlay">Drop to add to your library</div>}
    </div>
  );
}

function ErrorBanner({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="banner" role="alert">
      <p>{text}</p>
      <button className="btn small" onClick={onClose}>
        Dismiss
      </button>
    </div>
  );
}
