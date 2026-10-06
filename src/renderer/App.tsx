import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, MenuAction, UpdateStatus } from '../shared/api';
import { localDate } from '../shared/dates';
import { distinct, same, sortPapers } from '../shared/libraryView';
import type { PaperMeta, PaperSummary } from '../shared/paper';
import { isDue } from '../shared/review';
import { api, errorText } from './api';
import { Library, type LibraryUi, type Naming } from './library/Library';
import { PaperForm } from './library/PaperForm';
import { applyLook, rememberLook, useDarkMode } from './look';
import { pagesAreDark } from '../shared/look';
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

const SECOND = 1000;
const MINUTE = 60 * SECOND;

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [collections, setCollections] = useState<string[]>([]);
  const [naming, setNaming] = useState<Naming | null>(null);
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
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem('carrel.sidebar') !== 'closed';
    } catch {
      return true;
    }
  });
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      try {
        localStorage.setItem('carrel.sidebar', open ? 'closed' : 'open');
      } catch {
        /* only a convenience */
      }
      return !open;
    });
  }, []);
  const [today, setToday] = useState(localDate());
  const searchRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<ReaderHandle>(null);

  const isMac = (state?.platform ?? api.platform) === 'darwin';
  const setUi = useCallback((change: Partial<LibraryUi>) => setUiState((u) => ({ ...u, ...change })), []);

  const report = useCallback((err: unknown) => setError(errorText(err)), []);

  const refresh = useCallback(async () => {
    try {
      const [list, names] = await Promise.all([api.listPapers(), api.listCollections().catch(() => [] as string[])]);
      setPapers(list);
      setCollections(names);
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

  useEffect(() => api.onFullScreen(setFullScreen), []);

  // Light or Dark from Settings wins over the system appearance.
  useEffect(() => {
    const theme = state?.appearance;
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [state?.appearance]);

  // The background tone, accent colour and page colour from Settings.
  const tone = state?.look.tone;
  const accent = state?.look.accent;
  const pages = state?.look.pages;
  useEffect(() => {
    if (!tone || !accent || !pages) return;
    applyLook({ tone, accent, pages });
    rememberLook({ tone, accent, pages });
  }, [tone, accent, pages]);
  const darkMode = useDarkMode();

  // Look for a new version at start, every 15 minutes while Carrel is open,
  // and at the big moments: coming back to the window, opening the sidebar,
  // returning to the library, and opening Settings. Each check is one tiny
  // request to the npm registry; quick repeats within 30 seconds are skipped.
  const ready = state !== null;
  const lastCheck = useRef(0);
  const liveRef = useRef(true);
  const checkUpdate = useCallback((minAge: number) => {
    if (Date.now() - lastCheck.current < minAge) return;
    lastCheck.current = Date.now();
    void api
      .checkForUpdate()
      .then((u) => liveRef.current && setUpdate((prev) => (prev?.state === 'available' && u.state === 'offline' ? prev : u)));
  }, []);
  useEffect(() => {
    if (!ready) return;
    liveRef.current = true;
    const onFocus = () => checkUpdate(30 * SECOND);
    const timer = setInterval(() => checkUpdate(0), 15 * MINUTE);
    window.addEventListener('focus', onFocus);
    return () => {
      liveRef.current = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [ready, checkUpdate]);
  const backInLibrary = view.screen === 'library';
  useEffect(() => {
    if (ready) checkUpdate(settingsOpen ? 0 : 30 * SECOND);
  }, [ready, settingsOpen, sidebarOpen, backInLibrary, checkUpdate]);

  // Save anything pending before the window closes.
  useEffect(() => api.onFlush(async () => void (await readerRef.current?.flush())), []);

  const topics = useMemo(() => distinct(papers.flatMap((p) => p.meta.topics)), [papers]);

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
      const inCollection = ui.filter.kind === 'collection' ? [ui.filter.value] : [];
      const topicsPre = ui.filter.kind === 'topic' ? [ui.filter.value] : [];
      setForm({
        mode: 'new',
        initial: { title, collections: inCollection, topics: topicsPre },
        pdfPath: next.path,
        pdfName: next.name,
      });
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
    const inCollection = ui.filter.kind === 'collection' ? [ui.filter.value] : [];
    const topicsPre = ui.filter.kind === 'topic' ? [ui.filter.value] : [];
    setForm({ mode: 'new', initial: { collections: inCollection, topics: topicsPre } });
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

  // ----- Collections -----

  /** Puts a paper in a collection, or takes it out. */
  const setMembership = useCallback(
    async (id: string, name: string, member: boolean) => {
      try {
        const doc = await api.readPaper(id);
        const has = doc.meta.collections.some((c) => same(c, name));
        if (has === member) return;
        const next = member ? [...doc.meta.collections, name] : doc.meta.collections.filter((c) => !same(c, name));
        await api.updatePaper(id, { meta: { collections: next } });
        await readerRef.current?.reload();
        await refresh();
      } catch (err) {
        report(err);
      }
    },
    [refresh, report],
  );

  const menuOptions = useCallback(
    (id: string) => {
      const paper = papers.find((p) => p.id === id);
      return {
        due: !!paper && isDue(paper.meta, today),
        collections,
        member: collections.filter((c) => paper?.meta.collections.some((m) => same(m, c))),
      };
    },
    [papers, collections, today],
  );

  const handleCollectionAction = useCallback(
    (id: string, action: string | null) => {
      if (action === 'new-collection') setNaming({ mode: 'new', addPaper: id });
      else if (action?.startsWith('toggle:')) {
        const name = action.slice('toggle:'.length);
        const paper = papers.find((p) => p.id === id);
        void setMembership(id, name, !paper?.meta.collections.some((c) => same(c, name)));
      }
    },
    [papers, setMembership],
  );

  const paperCollectionsMenu = useCallback(
    async (id: string) => handleCollectionAction(id, await api.paperCollectionsMenu(menuOptions(id))),
    [handleCollectionAction, menuOptions],
  );

  async function nameCollection(name: string) {
    const current = naming;
    setNaming(null);
    if (!current) return;
    try {
      if (current.mode === 'new') {
        await api.createCollection(name);
        if (current.addPaper) await setMembership(current.addPaper, name, true);
      } else {
        await api.renameCollection(current.from, name);
        if (ui.filter.kind === 'collection' && same(ui.filter.value, current.from)) {
          setUi({ filter: { kind: 'collection', value: name } });
        }
      }
      await readerRef.current?.reload();
      await refresh();
    } catch (err) {
      report(err);
    }
  }

  async function collectionMenu(name: string) {
    const action = await api.collectionContextMenu(name);
    if (action === 'rename') setNaming({ mode: 'rename', from: name });
    if (action === 'delete') {
      try {
        if (!(await api.deleteCollection(name))) return;
        if (ui.filter.kind === 'collection' && same(ui.filter.value, name)) setUi({ filter: { kind: 'group', id: 'all' } });
        await refresh();
      } catch (err) {
        report(err);
      }
    }
  }

  const contextMenu = useCallback(
    async (id: string) => {
      const action = await api.paperContextMenu(id, menuOptions(id));
      handleCollectionAction(id, action);
      if (action === 'open') openPaper(id);
      else if (action === 'review') void startReview([id]);
      else if (action === 'edit') void editPaper(id);
      else if (action === 'reveal') reveal(id);
      else if (action === 'trash') void trash(id);
    },
    [menuOptions, handleCollectionAction, openPaper, startReview, editPaper, reveal, trash],
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
      case 'toggle-sidebar':
        if (view.screen === 'library') toggleSidebar();
        return;
      case 'library':
        return void backToLibrary();
      case 'review':
        return void startReview(dueIds);
      case 'find':
        // In a paper with a PDF, Find searches the paper.
        if (view.screen === 'reader' && readerRef.current?.find()) return;
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

  // Escape leaves a text field; from there, it goes back to the library.
  useEffect(() => {
    if (view.screen === 'library' || form || settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key !== 'Escape') return;
      if (typing) t.blur();
      else if (!(view.screen === 'reader' && readerRef.current?.escape())) void backToLibrary();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view.screen, form, settingsOpen, backToLibrary]);

  // The window title follows the open paper.
  useEffect(() => {
    const paper = view.screen === 'reader' ? papers.find((p) => p.id === view.id) : null;
    document.title = paper ? `${paper.meta.title} – Carrel` : view.screen === 'review' ? 'Review – Carrel' : 'Carrel';
  }, [view, papers]);

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
    <div className={`app${isMac && !fullScreen ? ' window-buttons' : ''}`}>
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
          collections={collections}
          naming={naming}
          setNaming={setNaming}
          onNameCollection={nameCollection}
          onCollectionMenu={collectionMenu}
          onDropOnCollection={(id, name) => void setMembership(id, name, true)}
          onPaperCollectionsMenu={paperCollectionsMenu}
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
          updateVersion={update?.state === 'available' && state.install === 'app' ? update.latest : null}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
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
          onError={report}
          onChanged={refresh}
          darkPages={pagesAreDark(
            state.look.pages,
            state.appearance === 'dark' || (state.appearance === 'system' && darkMode),
          )}
          tone={state.look.tone}
        />
      )}
      {view.screen === 'review' && (
        <ReviewScreen
          ids={view.ids}
          guide={state.guide}
          today={today}
          isMac={isMac}
          onDone={backToLibrary}
          onError={report}
        />
      )}

      {form && (
        <PaperForm
          // Prefixed so it never shares a key with the Reader beside it (both use the paper id).
          key={`form:${form.pdfPath ?? form.id ?? 'new'}`}
          mode={form.mode}
          initial={form.initial}
          pdfName={form.pdfName}
          topics={topics}
          collections={collections}
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
          onAppearance={(appearance) => api.setAppearance(appearance).then(setState, report)}
          onLook={(look) => api.setLook(look).then(setState, report)}
          update={update}
          onUpdate={async () => {
            const result = await api.installUpdate();
            return result.ok ? null : result.reason;
          }}
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
