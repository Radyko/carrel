import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Guide } from '../../shared/guide';
import {
  GROUPS,
  distinct,
  matchesFilter,
  matchesSearch,
  sortPapers,
  type Filter,
  type Sort,
  type SortKey,
} from '../../shared/libraryView';
import type { PaperSummary } from '../../shared/paper';
import { isDue } from '../../shared/review';
import { friendlyDate, stars } from '../format';
import { Preview } from './Preview';

/** A collection name being typed in the sidebar: a new one, or a rename. */
export type Naming = { mode: 'new'; addPaper?: string } | { mode: 'rename'; from: string };

export const PAPER_DRAG_TYPE = 'application/x-carrel-paper';

export interface LibraryUi {
  filter: Filter;
  search: string;
  sort: Sort;
  selected: string | null;
}

interface Props {
  guide: Guide;
  papers: PaperSummary[];
  collections: string[];
  naming: Naming | null;
  setNaming: (naming: Naming | null) => void;
  onNameCollection: (name: string) => void;
  onCollectionMenu: (name: string) => void;
  onDropOnCollection: (paperId: string, collection: string) => void;
  onPaperCollectionsMenu: (id: string) => void;
  loaded: boolean;
  today: string;
  ui: LibraryUi;
  setUi: (change: Partial<LibraryUi>) => void;
  isMac: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onOpen: (id: string) => void;
  onReview: (ids: string[]) => void;
  onAddPdf: () => void;
  onAddEntry: () => void;
  onEdit: (id: string) => void;
  onReveal: (id: string) => void;
  onTrash: (id: string) => void;
  onContextMenu: (id: string) => void;
  onSettings: () => void;
}

const COLUMNS: { key: SortKey; label: string; width: string; className?: string }[] = [
  { key: 'title', label: 'Title', width: 'auto' },
  { key: 'author', label: 'First author', width: '15%' },
  { key: 'year', label: 'Year', width: '56px', className: 'num' },
  { key: 'topics', label: 'Topics', width: '14%' },
  { key: 'pass', label: 'Pass', width: '54px' },
  { key: 'rating', label: 'Rating', width: '72px' },
  { key: 'lastWorked', label: 'Last worked', width: '108px' },
];

function PassDots({ pass, total }: { pass: number; total: number }) {
  return (
    <span className="dots" title={pass ? `Reached pass ${pass}` : 'Not started'} aria-label={pass ? `Pass ${pass}` : 'Not started'}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < pass ? '' : 'off'}>
          ●
        </span>
      ))}
    </span>
  );
}

export function Library(props: Props) {
  const { guide, papers, today, ui, setUi } = props;
  const tableRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () =>
      sortPapers(
        papers.filter((p) => matchesFilter(p, ui.filter, today) && matchesSearch(p, ui.search)),
        ui.sort,
      ),
    [papers, ui.filter, ui.search, ui.sort, today],
  );
  const selected = papers.find((p) => p.id === ui.selected) ?? null;
  const topics = useMemo(() => distinct(papers.flatMap((p) => p.meta.topics)), [papers]);

  const dueIds = useMemo(
    () => sortPapers(papers.filter((p) => isDue(p.meta, today)), { key: 'lastWorked', dir: 'asc' }).map((p) => p.id),
    [papers, today],
  );

  // Keep the selected row in view.
  useEffect(() => {
    if (!ui.selected) return;
    tableRef.current?.querySelector(`[data-id="${CSS.escape(ui.selected)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [ui.selected]);

  function count(f: Filter): number {
    return papers.filter((p) => matchesFilter(p, f, today)).length;
  }

  function sortBy(key: SortKey) {
    const defaultDir = key === 'title' || key === 'author' || key === 'topics' ? 'asc' : 'desc';
    setUi({ sort: { key, dir: ui.sort.key === key ? (ui.sort.dir === 'asc' ? 'desc' : 'asc') : defaultDir } });
  }

  function onKeyDown(e: KeyboardEvent) {
    const index = visible.findIndex((p) => p.id === ui.selected);
    const mod = props.isMac ? e.metaKey : e.ctrlKey;
    if (e.key === 'ArrowDown' && !mod) {
      e.preventDefault();
      const next = visible[Math.min(visible.length - 1, index + 1)];
      if (next) setUi({ selected: next.id });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = visible[Math.max(0, index - 1)];
      if (prev) setUi({ selected: prev.id });
    } else if ((e.key === 'Enter' || (e.key === 'ArrowDown' && mod)) && ui.selected) {
      e.preventDefault();
      props.onOpen(ui.selected);
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && mod && ui.selected) {
      e.preventDefault();
      props.onTrash(ui.selected);
    }
  }

  const isActive = (f: Filter) =>
    ui.filter.kind === f.kind &&
    (f.kind === 'group' ? ui.filter.kind === 'group' && ui.filter.id === f.id : 'value' in ui.filter && ui.filter.value === f.value);

  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const sideItem = (f: Filter, label: string, n: number, due = false) => (
    <button
      key={`${f.kind}:${f.kind === 'group' ? f.id : f.value}`}
      className={`side-item${isActive(f) ? ' active' : ''}${f.kind === 'collection' && dropTarget === f.value ? ' drop' : ''}`}
      onClick={() => setUi({ filter: f })}
      {...(f.kind === 'collection'
        ? {
            onContextMenu: (e: React.MouseEvent) => {
              e.preventDefault();
              props.onCollectionMenu(f.value);
            },
            onDragOver: (e: React.DragEvent) => {
              if (!e.dataTransfer.types.includes(PAPER_DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              setDropTarget(f.value);
            },
            onDragLeave: () => setDropTarget((t) => (t === f.value ? null : t)),
            onDrop: (e: React.DragEvent) => {
              const id = e.dataTransfer.getData(PAPER_DRAG_TYPE);
              setDropTarget(null);
              if (!id) return;
              e.preventDefault();
              props.onDropOnCollection(id, f.value);
            },
          }
        : {})}
    >
      <span className="name">{label}</span>
      {n > 0 && <span className={`count${due ? ' due' : ''}`}>{n}</span>}
    </button>
  );

  const empty = props.loaded && papers.length === 0;

  return (
    <div className="library">
      <aside className="sidebar">
        <div className="sidebar-top" />
        <nav className="sidebar-scroll" aria-label="Library groups">
          <h3>Library</h3>
          {GROUPS.map((g) => sideItem({ kind: 'group', id: g.id }, g.label, count({ kind: 'group', id: g.id }), g.id === 'due'))}
          <div className="side-heading">
            <h3>Collections</h3>
            <button
              className="side-add"
              title="New collection"
              aria-label="New collection"
              onClick={() => props.setNaming({ mode: 'new' })}
            >
              +
            </button>
          </div>
          {props.collections.map((c) =>
            props.naming?.mode === 'rename' && props.naming.from === c ? (
              <NameField key={c} initial={c} onDone={props.onNameCollection} onCancel={() => props.setNaming(null)} />
            ) : (
              sideItem({ kind: 'collection', value: c }, c, count({ kind: 'collection', value: c }))
            ),
          )}
          {props.naming?.mode === 'new' && (
            <NameField initial="" onDone={props.onNameCollection} onCancel={() => props.setNaming(null)} />
          )}
          {props.collections.length === 0 && props.naming?.mode !== 'new' && (
            <p className="side-hint">Group papers by course or project. Drag a paper onto a collection to add it.</p>
          )}
          {topics.length > 0 && <h3>Topics</h3>}
          {topics.map((t) => sideItem({ kind: 'topic', value: t }, t, count({ kind: 'topic', value: t })))}
        </nav>
        <div className="sidebar-foot">
          <button className="btn quiet small" onClick={props.onSettings}>
            Settings
          </button>
        </div>
      </aside>

      <section className="list-pane">
        <div className="toolbar">
          <button className="btn" onClick={props.onAddPdf} title="Add a PDF (or drop one on the window)">
            Add PDF…
          </button>
          <button className="btn quiet" onClick={props.onAddEntry} title="Add a paper you read in print or elsewhere">
            Add without PDF…
          </button>
          <div className="spacer" />
          {ui.filter.kind === 'group' && ui.filter.id === 'due' && dueIds.length > 0 && (
            <button className="btn primary" onClick={() => props.onReview(dueIds)}>
              Start review
            </button>
          )}
          <input
            ref={props.searchRef}
            className="search"
            type="search"
            placeholder="Search titles, authors, notes"
            value={ui.search}
            onChange={(e) => setUi({ search: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setUi({ search: '' });
              if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault();
                if (!ui.selected && visible[0]) setUi({ selected: visible[0].id });
                tableRef.current?.focus();
              }
            }}
          />
        </div>

        {empty ? (
          <Welcome guide={guide} onAddPdf={props.onAddPdf} onAddEntry={props.onAddEntry} />
        ) : (
          <div className="table-wrap" ref={tableRef} tabIndex={0} onKeyDown={onKeyDown}>
            <table className="papers">
              <colgroup>
                {COLUMNS.map((c) => (
                  <col key={c.key} style={{ width: c.width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => sortBy(c.key)}
                      aria-sort={ui.sort.key === c.key ? (ui.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      {c.label}
                      {ui.sort.key === c.key && <span className="arrow">{ui.sort.dir === 'asc' ? '↑' : '↓'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr
                    key={p.id}
                    data-id={p.id}
                    className={`row${p.id === ui.selected ? ' selected' : ''}`}
                    onMouseDown={() => setUi({ selected: p.id })}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(PAPER_DRAG_TYPE, p.id);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDoubleClick={() => props.onOpen(p.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setUi({ selected: p.id });
                      props.onContextMenu(p.id);
                    }}
                  >
                    <td title={p.meta.title}>{p.meta.title}</td>
                    <td className="muted">{p.meta.authors[0] ?? ''}</td>
                    <td className="num muted">{p.meta.year ?? ''}</td>
                    <td className="muted">{p.meta.topics.join(', ')}</td>
                    <td>
                      <PassDots pass={p.meta.furthestPass} total={guide.passes.length} />
                    </td>
                    <td>
                      <span className="stars">{stars(p.meta.rating)}</span>
                    </td>
                    <td className="muted">{friendlyDate(p.meta.lastWorked ?? p.meta.added)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 && (
              <div className="list-empty">
                {ui.search
                  ? `No papers match “${ui.search}”.`
                  : ui.filter.kind === 'group' && ui.filter.id === 'due'
                    ? 'Nothing is due for review. Papers you finish at pass 2 or 3 come back here after a week, a month, and three months.'
                    : 'No papers here yet.'}
              </div>
            )}
          </div>
        )}
      </section>

      {!empty && (
        <Preview
          paper={selected}
          guide={guide}
          today={today}
          isMac={props.isMac}
          onOpen={props.onOpen}
          onReview={(id) => props.onReview([id])}
          onEdit={props.onEdit}
          onReveal={props.onReveal}
          onTrash={props.onTrash}
          onTopic={(t) => setUi({ filter: { kind: 'topic', value: t } })}
          topics={topics}
          collections={props.collections}
          onCollection={(c) => setUi({ filter: { kind: 'collection', value: c } })}
          onCollectionsMenu={props.onPaperCollectionsMenu}
        />
      )}
    </div>
  );
}

function Welcome({ guide, onAddPdf, onAddEntry }: { guide: Guide; onAddPdf: () => void; onAddEntry: () => void }) {
  return (
    <div className="welcome">
      <h2>Your carrel is empty</h2>
      <p>
        Carrel guides you through a paper in stages of increasing depth. You start by saying why you are reading
        it, then decide after each pass whether to go on. Stopping after the first pass is a normal outcome.
      </p>
      <ol>
        {guide.passes.map((p) => (
          <li key={p.id}>
            <strong>
              Pass {p.pass}: {p.title}
            </strong>
            {p.targetLabel && <span> · {p.targetLabel}</span>}
            <br />
            {p.goal}
          </li>
        ))}
      </ol>
      <p>Drop a PDF anywhere on this window to add your first paper.</p>
      <div className="actions">
        <button className="btn primary" onClick={onAddPdf}>
          Choose a PDF…
        </button>
        <button className="btn" onClick={onAddEntry}>
          Add without PDF…
        </button>
      </div>
    </div>
  );
}

function NameField({ initial, onDone, onCancel }: { initial: string; onDone: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && value.trim() && value.trim() !== initial) onDone(value.trim());
    else onCancel();
  };
  return (
    <input
      className="field side-name"
      autoFocus
      value={value}
      placeholder="Collection name"
      aria-label="Collection name"
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') {
          e.stopPropagation();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}
