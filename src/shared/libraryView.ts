// Filtering, searching and sorting the library list.

import type { Status } from './guide';
import type { PaperSummary } from './paper';
import { isDue } from './review';

export type GroupId = 'all' | Status | 'due';

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'all', label: 'All papers' },
  { id: 'to-read', label: 'To read' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'read', label: 'Read' },
  { id: 'set-aside', label: 'Set aside' },
  { id: 'due', label: 'Due for review' },
];

export type Filter = { kind: 'group'; id: GroupId } | { kind: 'topic'; value: string } | { kind: 'course'; value: string };

export type SortKey = 'title' | 'author' | 'year' | 'topics' | 'pass' | 'rating' | 'lastWorked';
export interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

export function inGroup(p: PaperSummary, id: GroupId, today: string): boolean {
  if (id === 'all') return true;
  if (id === 'due') return isDue(p.meta, today);
  return p.meta.status === id;
}

export function matchesFilter(p: PaperSummary, filter: Filter, today: string): boolean {
  if (filter.kind === 'group') return inGroup(p, filter.id, today);
  if (filter.kind === 'topic') return p.meta.topics.some((t) => same(t, filter.value));
  return same(p.meta.course, filter.value);
}

function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Every word of the query must appear in the title, authors, details, or notes. */
export function matchesSearch(p: PaperSummary, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const m = p.meta;
  const hay = fold(
    [m.title, m.authors.join(' '), m.venue, m.course, m.topics.join(' '), m.year ?? '', p.searchText].join('\n'),
  );
  return words.every((w) => hay.includes(w));
}

function sortValue(p: PaperSummary, key: SortKey): string | number | null {
  const m = p.meta;
  switch (key) {
    case 'title':
      return m.title || null;
    case 'author':
      return m.authors[0] || null;
    case 'year':
      return m.year;
    case 'topics':
      return m.topics.join(', ') || null;
    case 'pass':
      return m.furthestPass;
    case 'rating':
      return m.rating;
    case 'lastWorked':
      return m.lastWorked ?? m.added;
  }
}

/** Sorts by the chosen column; empty values always go last. Ties fall back to title. */
export function sortPapers(papers: PaperSummary[], sort: Sort): PaperSummary[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  const cmp = (a: string | number, b: string | number) =>
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  return [...papers].sort((pa, pb) => {
    const a = sortValue(pa, sort.key);
    const b = sortValue(pb, sort.key);
    if (a === null && b !== null) return 1;
    if (b === null && a !== null) return -1;
    const c = a === null || b === null ? 0 : cmp(a, b) * dir;
    return c || cmp(pa.meta.title, pb.meta.title);
  });
}

export function distinct(values: string[]): string[] {
  const out: string[] = [];
  for (const v of values.map((s) => s.trim()).filter(Boolean)) {
    if (!out.some((o) => same(o, v))) out.push(v);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
