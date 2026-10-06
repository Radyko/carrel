import { describe, expect, it } from 'vitest';
import { matchesFilter, matchesSearch, searchSnippet, sortPapers } from '../src/shared/libraryView';
import { emptyMeta, type PaperMeta, type PaperSummary } from '../src/shared/paper';

function paper(id: string, meta: Partial<PaperMeta>, searchText = ''): PaperSummary {
  return { id, folder: id, pdfFile: null, meta: { ...emptyMeta(), ...meta }, summaries: {}, searchText, error: null };
}

const papers = [
  paper('a', { title: 'Attention', authors: ['Vaswani'], year: 2017, rating: 5, topics: ['ML'], status: 'read' }),
  paper('b', { title: 'Roofline', authors: ['Williams'], year: 2009, topics: ['GPU', 'perf'], collections: ['CS 6290', 'Thesis'] }, 'Arithmetic intensity bounds'),
  paper('c', { title: 'Dremel', authors: ['Melnik'], nextReview: '2026-10-01', reviewInterval: 7, status: 'read' }),
];

describe('library view', () => {
  it('filters by group, topic and collection', () => {
    const today = '2026-10-03';
    const ids = (f: Parameters<typeof matchesFilter>[1]) => papers.filter((p) => matchesFilter(p, f, today)).map((p) => p.id);
    expect(ids({ kind: 'group', id: 'all' })).toEqual(['a', 'b', 'c']);
    expect(ids({ kind: 'group', id: 'read' })).toEqual(['a', 'c']);
    expect(ids({ kind: 'group', id: 'to-read' })).toEqual(['b']);
    expect(ids({ kind: 'group', id: 'due' })).toEqual(['c']);
    expect(ids({ kind: 'topic', value: 'gpu' })).toEqual(['b']);
    expect(ids({ kind: 'collection', value: 'CS 6290' })).toEqual(['b']);
    expect(ids({ kind: 'collection', value: 'thesis' })).toEqual(['b']);
  });

  it('searches titles, authors and notes', () => {
    const ids = (q: string) => papers.filter((p) => matchesSearch(p, q)).map((p) => p.id);
    expect(ids('roof')).toEqual(['b']);
    expect(ids('MELNIK')).toEqual(['c']);
    expect(ids('arithmetic bounds')).toEqual(['b']);
    expect(ids('arithmetic attention')).toEqual([]);
    expect(ids('  ')).toEqual(['a', 'b', 'c']);
  });

  it('shows where a search matched in the notes', () => {
    const notes = 'We read this for the seminar. The roofline model bounds performance by arithmetic intensity and memory bandwidth, which explains why the kernel stalls.';
    const p = paper('d', { title: 'Roofline', authors: ['Williams'] }, notes);
    expect(searchSnippet(p, 'roofline')).toBeNull();
    expect(searchSnippet(p, 'roofline BANDWIDTH', 60)).toEqual({
      before: '…and memory ',
      match: 'bandwidth',
      after: ', which explains why the kernel…',
    });
    expect(searchSnippet(paper('e', {}, 'short note'), 'note')).toEqual({ before: 'short ', match: 'note', after: '' });
    expect(searchSnippet(p, '')).toBeNull();
  });

  it('sorts by column, keeping empty values last', () => {
    const ids = (key: Parameters<typeof sortPapers>[1]['key'], dir: 'asc' | 'desc') =>
      sortPapers(papers, { key, dir }).map((p) => p.id);
    expect(ids('year', 'asc')).toEqual(['b', 'a', 'c']);
    expect(ids('year', 'desc')).toEqual(['a', 'b', 'c']);
    expect(ids('title', 'asc')).toEqual(['a', 'c', 'b']);
  });
});
